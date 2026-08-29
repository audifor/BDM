import type { PlayerId } from '@/domain/ids'
import {
  CANONICAL_RATING_KEYS,
  createDevelopmentProfile,
  type CanonicalRatingKey,
  type PlayerDevelopmentProfile,
  type PlayerRatings,
} from '@/domain/player'
import type { BasketballPosition } from '@/domain/primitives'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

const positionBias: Readonly<Record<BasketballPosition, Partial<Record<CanonicalRatingKey, number>>>> = {
  PG: { ballHandling: 12, passing: 13, courtVision: 13, firstStep: 6, threePointShooting: 5, perimeterDefense: 3, interiorDefense: -10, rimProtection: -13, offensiveRebounding: -10, defensiveRebounding: -7, strength: -5 },
  SG: { threePointShooting: 11, midRangeShooting: 8, ballHandling: 5, perimeterDefense: 4, interiorDefense: -7, rimProtection: -10, offensiveRebounding: -6 },
  SF: { rimFinishing: 5, perimeterDefense: 6, defensiveRebounding: 5, strength: 4, threePointShooting: 3 },
  PF: { postScoring: 9, interiorDefense: 10, defensiveRebounding: 10, offensiveRebounding: 9, strength: 10, rimProtection: 7, perimeterDefense: -5, ballHandling: -6 },
  C: { postScoring: 12, interiorDefense: 14, rimProtection: 14, shotContest: 11, defensiveRebounding: 13, offensiveRebounding: 12, strength: 13, perimeterDefense: -10, ballHandling: -12, threePointShooting: -10, speed: -8 },
}

/** New-player factory support. It never passes through the seven-signal bootstrap model. */
export function generateCanonicalRatings(seed: number, playerId: PlayerId, position: BasketballPosition, minimum = 35, maximum = 82): PlayerRatings {
  const random = new SeededRandomSource(hashStringToSeed(`canonical-player-truth-v2:${seed}:${playerId}`))
  const center = random.nextInt(minimum, maximum)
  const bias = positionBias[position]
  return Object.fromEntries(CANONICAL_RATING_KEYS.map((key) => [key, clamp(center + (bias[key] ?? 0) + random.nextInt(-9, 9))])) as PlayerRatings
}

export function generateCanonicalDevelopmentProfile(seed: number, playerId: PlayerId, ratings: PlayerRatings, age: number): PlayerDevelopmentProfile {
  const random = new SeededRandomSource(hashStringToSeed(`canonical-development-v2:${seed}:${playerId}`))
  const average = CANONICAL_RATING_KEYS.reduce((sum, key) => sum + ratings[key], 0) / CANONICAL_RATING_KEYS.length
  const stage = age <= 20 ? 'early' : age <= 24 ? 'developing' : age <= 30 ? 'prime' : 'declining'
  const headroom = stage === 'early' ? random.nextInt(12, 25) : stage === 'developing' ? random.nextInt(6, 18) : stage === 'prime' ? random.nextInt(1, 8) : 0
  const ceiling = clamp(average + headroom)
  return createDevelopmentProfile({ developmentStage: stage, growthRate: stage === 'declining' ? 15 : random.nextInt(45, 85), declineSensitivity: stage === 'declining' ? random.nextInt(55, 90) : random.nextInt(20, 60), ceilings: { shooting: ceiling, finishing: ceiling, creation: ceiling, passing: ceiling, defense: ceiling, rebounding: ceiling, physical: ceiling, mental: ceiling } })
}

function clamp(value: number): number { return Math.max(1, Math.min(100, value)) }
