import type { RandomSource } from '@/engine/random'

import type { MatchPlayerProfile } from './MatchPlayerProfile'
import { chooseWeighted } from './WeightedChoice'

export interface ReboundContext {
  readonly offensiveProfiles: readonly MatchPlayerProfile[]
  readonly defensiveProfiles: readonly MatchPlayerProfile[]
}

export const REBOUND_RESOLUTION_V1 = {
  offensiveReboundBaseline: 0.25,
  adjustmentPerPoint: 0.0025,
  standingReachAdvantageLimitCm: 30,
  standingReachAdjustmentPerCm: 0.15,
  minimumProbability: 0.12,
  maximumProbability: 0.40,
} as const

export function calculateOffensiveReboundProbability(context: ReboundContext): number {
  const reboundSkillAdvantage = averageReboundImpact(context.offensiveProfiles) - averageReboundImpact(context.defensiveProfiles)
  const standingReachAdvantage = clamp(averageStandingReach(context.offensiveProfiles) - averageStandingReach(context.defensiveProfiles), -REBOUND_RESOLUTION_V1.standingReachAdvantageLimitCm, REBOUND_RESOLUTION_V1.standingReachAdvantageLimitCm)
  const contestAdvantage = reboundSkillAdvantage + standingReachAdvantage * REBOUND_RESOLUTION_V1.standingReachAdjustmentPerCm
  return clamp(REBOUND_RESOLUTION_V1.offensiveReboundBaseline + contestAdvantage * REBOUND_RESOLUTION_V1.adjustmentPerPoint, REBOUND_RESOLUTION_V1.minimumProbability, REBOUND_RESOLUTION_V1.maximumProbability)
}

export function selectRebounder(candidates: readonly MatchPlayerProfile[], random: RandomSource): MatchPlayerProfile {
  return chooseWeighted(candidates.map((profile) => ({ item: profile, weight: profile.rebounding.impact })), random)
}

function averageReboundImpact(profiles: readonly MatchPlayerProfile[]): number { return profiles.reduce((total, profile) => total + profile.rebounding.impact, 0) / profiles.length }
function averageStandingReach(profiles: readonly MatchPlayerProfile[]): number { return profiles.reduce((total, profile) => total + profile.physical.standingReachCm, 0) / profiles.length }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }
