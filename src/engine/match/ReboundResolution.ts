import type { RandomSource } from '@/engine/random'

import type { MatchPlayerProfile } from './MatchPlayerProfile'
import { chooseWeighted } from './WeightedChoice'

export interface ReboundContext {
  readonly offensiveProfiles: readonly MatchPlayerProfile[]
  readonly defensiveProfiles: readonly MatchPlayerProfile[]
  readonly distanceToBasketMetersByPlayerId?: Readonly<Record<string, number>>
}

export type ReboundSpatialContext = Pick<ReboundContext, 'distanceToBasketMetersByPlayerId'>

export const REBOUND_RESOLUTION_V1 = {
  offensiveReboundBaseline: 0.25,
  adjustmentPerPoint: 0.0025,
  standingReachAdvantageLimitCm: 30,
  standingReachAdjustmentPerCm: 0.15,
  spatialAdvantageLimit: 0.06,
  spatialContextDistanceMeters: 8,
  rebounderSpatialWeightMinimum: 0.75,
  rebounderSpatialWeightMaximum: 1.25,
  minimumProbability: 0.12,
  maximumProbability: 0.40,
} as const

export function calculateOffensiveReboundProbability(context: ReboundContext): number {
  const reboundSkillAdvantage = averageReboundImpact(context.offensiveProfiles) - averageReboundImpact(context.defensiveProfiles)
  const standingReachAdvantage = clamp(averageStandingReach(context.offensiveProfiles) - averageStandingReach(context.defensiveProfiles), -REBOUND_RESOLUTION_V1.standingReachAdvantageLimitCm, REBOUND_RESOLUTION_V1.standingReachAdvantageLimitCm)
  const spatialAdvantage = averageSpatialContext(context.offensiveProfiles, context.distanceToBasketMetersByPlayerId) - averageSpatialContext(context.defensiveProfiles, context.distanceToBasketMetersByPlayerId)
  const contestAdvantage = reboundSkillAdvantage + standingReachAdvantage * REBOUND_RESOLUTION_V1.standingReachAdjustmentPerCm
  const probability = REBOUND_RESOLUTION_V1.offensiveReboundBaseline + contestAdvantage * REBOUND_RESOLUTION_V1.adjustmentPerPoint + clamp(spatialAdvantage, -1, 1) * REBOUND_RESOLUTION_V1.spatialAdvantageLimit
  return clamp(probability, REBOUND_RESOLUTION_V1.minimumProbability, REBOUND_RESOLUTION_V1.maximumProbability)
}

export function selectRebounder(candidates: readonly MatchPlayerProfile[], random: RandomSource, spatialContext?: ReboundSpatialContext): MatchPlayerProfile {
  return chooseWeighted(candidates.map((profile) => {
    const distance = spatialContext?.distanceToBasketMetersByPlayerId?.[profile.playerId]
    const spatialWeight = distance === undefined ? 1 : rebounderSpatialWeight(distance)
    const skillWeight = distance === undefined ? profile.rebounding.impact : profile.rebounding.impact + 1
    return { item: profile, weight: skillWeight * spatialWeight }
  }), random)
}

function averageReboundImpact(profiles: readonly MatchPlayerProfile[]): number { return profiles.reduce((total, profile) => total + profile.rebounding.impact, 0) / profiles.length }
function averageStandingReach(profiles: readonly MatchPlayerProfile[]): number { return profiles.reduce((total, profile) => total + profile.physical.standingReachCm, 0) / profiles.length }
function averageSpatialContext(profiles: readonly MatchPlayerProfile[], distances: ReboundSpatialContext['distanceToBasketMetersByPlayerId']): number {
  const candidates = profiles.flatMap(({ playerId }) => {
    const distance = distances?.[playerId]
    return distance === undefined || !Number.isFinite(distance) ? [] : [spatialProximity(distance)]
  })
  return candidates.length === 0 ? 0 : candidates.reduce((sum, proximity) => sum + proximity, 0) / candidates.length
}
function spatialProximity(distanceMeters: number): number { return 1 - clamp(distanceMeters, 0, REBOUND_RESOLUTION_V1.spatialContextDistanceMeters) / REBOUND_RESOLUTION_V1.spatialContextDistanceMeters }
function rebounderSpatialWeight(distanceMeters: number): number {
  const range = REBOUND_RESOLUTION_V1.rebounderSpatialWeightMaximum - REBOUND_RESOLUTION_V1.rebounderSpatialWeightMinimum
  return REBOUND_RESOLUTION_V1.rebounderSpatialWeightMinimum + spatialProximity(distanceMeters) * range
}
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }
