import type { MatchPlayerProfile } from './MatchPlayerProfile'

export interface TurnoverContext {
  readonly ballHandlerProfile: MatchPlayerProfile
  readonly ballHandlerFatigue: number
  readonly defenderProfile: MatchPlayerProfile
  readonly defenderFatigue: number
}

export const TURNOVER_RESOLUTION_V1 = {
  baseProbability: 0.12,
  adjustmentPerPoint: 0.0015,
  minimumProbability: 0.04,
  maximumProbability: 0.24,
  maximumBallHandlerFatiguePenalty: 10,
  maximumDefenderFatiguePenalty: 10,
} as const

export function calculateTurnoverProbability(context: TurnoverContext): number {
  const effectivePressure = clamp(calculateDefensivePressure(context.defenderProfile) - fatiguePenalty(context.defenderFatigue, TURNOVER_RESOLUTION_V1.maximumDefenderFatiguePenalty), 0, 100)
  const effectiveBallSecurity = clamp(context.ballHandlerProfile.offense.ballSecurity - fatiguePenalty(context.ballHandlerFatigue, TURNOVER_RESOLUTION_V1.maximumBallHandlerFatiguePenalty), 0, 100)
  return clamp(TURNOVER_RESOLUTION_V1.baseProbability + (effectivePressure - 50) * TURNOVER_RESOLUTION_V1.adjustmentPerPoint - (effectiveBallSecurity - 50) * TURNOVER_RESOLUTION_V1.adjustmentPerPoint, TURNOVER_RESOLUTION_V1.minimumProbability, TURNOVER_RESOLUTION_V1.maximumProbability)
}

export function calculateDefensivePressure(profile: MatchPlayerProfile): number {
  return profile.defense.pointOfAttack * 0.70 + profile.defense.mobility * 0.30
}

function fatiguePenalty(fatigue: number, maximumPenalty: number): number { return (clamp(fatigue, 0, 100) / 100) * maximumPenalty }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }
