import { PLAYER_TRUTH_RATING_KEYS } from '@/domain/player'
import { placeIdFromString, playerIdFromString } from '@/domain/ids'
import type { BasketballPosition } from '@/domain/primitives'
import { SeededRandomSource, hashStringToSeed } from '@/engine/random'
import { createTalentCohort, talentCandidateKey } from '@/domain/talent'
import { generateCanonicalRatings } from './CanonicalPlayerTruthGenerator'

const POSITIONS: readonly BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']

export interface TalentQualityAudit {
  readonly sampleCount: number
  /** Audit-only mean of canonical Player Truth keys; not a persisted Overall or gameplay authority. */
  readonly percentiles: Readonly<Record<'P50' | 'P75' | 'P90' | 'P95' | 'P99' | 'P99_9', number>>
  readonly qualityBands: Readonly<Record<'ordinary' | 'useful' | 'strong' | 'elite' | 'generational', number>>
  readonly positionCounts: Readonly<Record<BasketballPosition, number>>
  readonly checksum: string
}

export function auditTalentQualityDistribution(sampleCount = 20_000, seed = 1): TalentQualityAudit {
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1) throw new RangeError('Talent audit sampleCount must be positive')
  const indicators: number[] = []
  const positionCounts: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 }
  const qualityBands: Record<'ordinary' | 'useful' | 'strong' | 'elite' | 'generational', number> = { ordinary: 0, useful: 0, strong: 0, elite: 0, generational: 0 }
  let checksum = 0x811c9dc5
  for (let index = 1; index <= sampleCount; index += 1) {
    const candidateKey = `audit:${seed}:${index}`
    const random = new SeededRandomSource(hashStringToSeed(candidateKey))
    const position = random.pick(POSITIONS)
    const ratings = generateCanonicalRatings(seed, playerIdFromString(`audit-player-${index}`), position, 35, 82, 'globalTalentRareTailV1')
    const indicator = Math.round(PLAYER_TRUTH_RATING_KEYS.reduce((sum, key) => sum + ratings[key], 0) / PLAYER_TRUTH_RATING_KEYS.length * 100) / 100
    indicators.push(indicator)
    qualityBands[indicator < 60 ? 'ordinary' : indicator < 70 ? 'useful' : indicator < 80 ? 'strong' : indicator < 90 ? 'elite' : 'generational'] += 1
    positionCounts[position] += 1
    checksum = hashUpdate(checksum, `${candidateKey}:${position}:${indicator};`)
  }
  indicators.sort((left, right) => left - right)
  return Object.freeze({
    sampleCount,
    percentiles: Object.freeze({
      P50: percentile(indicators, .5), P75: percentile(indicators, .75), P90: percentile(indicators, .9),
      P95: percentile(indicators, .95), P99: percentile(indicators, .99), P99_9: percentile(indicators, .999),
    }),
    qualityBands: Object.freeze(qualityBands),
    positionCounts: Object.freeze(positionCounts),
    checksum: checksum.toString(16).padStart(8, '0'),
  })
}

export interface TalentGenerationRunSummary {
  readonly generationCount: number
  readonly suppliedCandidates: number
  readonly sampledCandidates: number
  readonly quality: TalentQualityAudit['percentiles']
  readonly duplicateCandidateKeys: number
  readonly elapsedMs: number
  readonly checksum: string
}

/** Repeated-cohort diagnostic that never creates Players or a GameWorld. */
export function runTalentGenerationDiagnostic(generationCount = 30, samplesPerGeneration = 1_000, seed = 1): TalentGenerationRunSummary {
  if (!Number.isSafeInteger(generationCount) || generationCount < 1) throw new RangeError('Talent generationCount must be positive')
  if (!Number.isSafeInteger(samplesPerGeneration) || samplesPerGeneration < 1) throw new RangeError('Talent samplesPerGeneration must be positive')
  const startedAt = performance.now()
  const cohorts = Array.from({ length: generationCount }, (_, index) => createTalentCohort({
    id: `talent-audit:${seed}:${index + 1}`,
    placeId: placeIdFromString(`talent-audit-place:${index % 3}`),
    birthYear: 2000 + index,
    generationYear: 2030 + index,
    gender: index % 2 === 0 ? 'male' : 'female',
    seed: (seed + index) >>> 0,
    inputVersion: 'fixture-v1',
    inputs: { ageCohortPopulation: 100_000, basketballParticipationPerThousand: 45, accessOpportunityBasisPoints: 8000 },
  }))
  const candidateKeys = new Set<string>()
  for (const cohort of cohorts) {
    for (let index = 1; index <= Math.min(samplesPerGeneration, cohort.candidateCapacity); index += 1) candidateKeys.add(talentCandidateKey(cohort.id, index))
  }
  const summaries = cohorts.map((cohort, index) => auditTalentQualityDistribution(Math.min(samplesPerGeneration, cohort.candidateCapacity), seed + index))
  const duplicateCandidateKeys = cohorts.reduce((sum, cohort) => sum + Math.min(samplesPerGeneration, cohort.candidateCapacity), 0) - candidateKeys.size
  const percentileKeys = ['P50', 'P75', 'P90', 'P95', 'P99', 'P99_9'] as const
  const quality = Object.fromEntries(percentileKeys.map((key) => [key, median(summaries.map((summary) => summary.percentiles[key]))])) as TalentQualityAudit['percentiles']
  const checksum = summaries.reduce((hash, summary) => hashUpdate(hash, summary.checksum), 0x811c9dc5).toString(16).padStart(8, '0')
  return Object.freeze({ generationCount, suppliedCandidates: cohorts.reduce((sum, cohort) => sum + cohort.candidateCapacity, 0), sampledCandidates: candidateKeys.size, quality: Object.freeze(quality), duplicateCandidateKeys, elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100, checksum })
}

function percentile(sorted: readonly number[], quantile: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)]!
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor((sorted.length - 1) / 2)]!
}

function hashUpdate(start: number, value: string): number {
  let hash = start >>> 0
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0
  return hash
}
