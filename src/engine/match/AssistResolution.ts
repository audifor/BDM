import type { RandomSource } from '@/engine/random'

import type { MatchPlayerProfile } from './MatchPlayerProfile'
import type { ShotZone } from './ShotResolution'
import { chooseWeighted } from './WeightedChoice'

export interface AssistContext {
  readonly shotZone: ShotZone
  readonly teammateProfiles: readonly MatchPlayerProfile[]
}

export const ASSIST_RESOLUTION_V1 = {
  zoneBaseline: { rim: 0.58, midRange: 0.45, threePoint: 0.68 },
  creationAdjustmentPerPoint: 0.003,
  minimumProbability: 0.25,
  maximumProbability: 0.85,
} as const

export function calculateAssistProbability(context: AssistContext): number {
  const averageCreation = context.teammateProfiles.reduce((total, profile) => total + profile.offense.creation, 0) / context.teammateProfiles.length
  return clamp(ASSIST_RESOLUTION_V1.zoneBaseline[context.shotZone] + (averageCreation - 50) * ASSIST_RESOLUTION_V1.creationAdjustmentPerPoint, ASSIST_RESOLUTION_V1.minimumProbability, ASSIST_RESOLUTION_V1.maximumProbability)
}

export function selectAssister(candidates: readonly MatchPlayerProfile[], random: RandomSource): MatchPlayerProfile {
  return chooseWeighted(candidates.map((profile) => ({ item: profile, weight: profile.offense.creation })), random)
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }
