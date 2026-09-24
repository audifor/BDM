import type { MatchPlayerProfile } from './MatchPlayerProfile'
import { distanceFromBasket, isBeyondThreePointLine, type CourtGeometry, type CourtPosition } from '@/domain/court'

export type ShotZone = 'rim' | 'midRange' | 'threePoint'

export interface ShotAttemptContext {
  readonly shotZone: ShotZone
  readonly shooterProfile: MatchPlayerProfile
  readonly shooterFatigue: number
  readonly defenderProfile: MatchPlayerProfile
  readonly defenderFatigue: number
  readonly tacticalDefenseModifier?: number
  readonly shotDistanceMeters?: number
  readonly defenderDistanceMeters?: number
}

export interface ShotLocation {
  readonly shotZone: ShotZone
  readonly distanceMeters: number
}

export const SHOT_RESOLUTION_V1 = {
  zoneWeights: {
    rim: { base: 20, rimAttack: 0.70, shooting: 0, creation: 0.15 },
    midRange: { base: 10, rimAttack: 0, shooting: 0.45, creation: 0.15 },
    threePoint: { base: 15, rimAttack: 0, shooting: 0.70, creation: 0.10 },
  },
  baseProbability: { rim: 0.58, midRange: 0.40, threePoint: 0.35 },
  probabilityClamp: { rim: [0.25, 0.85], midRange: [0.15, 0.70], threePoint: [0.12, 0.65] },
  skillAdjustmentPerPoint: 0.004,
  defenseAdjustmentPerPoint: 0.003,
  maximumFatiguePenalty: 0.08,
  defenderFatiguePenaltyAtMaximum: 12,
  rimDistanceMeters: 1.5,
  distanceAdjustmentPerMeter: 0.008,
  maximumDistanceAdjustment: 0.04,
} as const

export const SPATIAL_CONTEST_V1 = {
  fullContestDistanceMeters: 1,
  noContestDistanceMeters: 4,
  maximumDefenseBonusPoints: 12,
} as const

export function calculateShotLocation(position: CourtPosition, attackingBasket: CourtPosition, court: CourtGeometry): ShotLocation {
  const distanceMeters = distanceFromBasket(position, attackingBasket)
  const shotZone = distanceMeters <= SHOT_RESOLUTION_V1.rimDistanceMeters
    ? 'rim'
    : isBeyondThreePointLine(position, attackingBasket, court) ? 'threePoint' : 'midRange'
  return { shotZone, distanceMeters }
}

export function calculateShotZoneWeights(profile: MatchPlayerProfile): Readonly<Record<ShotZone, number>> {
  return Object.fromEntries((['rim', 'midRange', 'threePoint'] as const).map((zone) => {
    const weights = SHOT_RESOLUTION_V1.zoneWeights[zone]
    const naturalWeight = weights.base + profile.offense.rimAttack * weights.rimAttack + profile.offense.shooting * weights.shooting + profile.offense.creation * weights.creation
    const tendency = zone === 'rim'
      ? profile.tendencies.RIM_ATTEMPT_FREQUENCY
      : zone === 'midRange'
        ? profile.tendencies.MIDRANGE_FREQUENCY
        : profile.tendencies.THREE_POINT_FREQUENCY
    return [zone, naturalWeight * shotTendencyFactor(tendency)]
  })) as Record<ShotZone, number>
}

export function calculateShotMakeProbability(context: ShotAttemptContext): number {
  const execution = calculateExecution(context.shotZone, context.shooterProfile)
  const effectiveDefense = calculateEffectiveDefense(context.shotZone, context.defenderProfile, context.defenderFatigue)
  const probability = SHOT_RESOLUTION_V1.baseProbability[context.shotZone]
    + (execution - 50) * SHOT_RESOLUTION_V1.skillAdjustmentPerPoint
    - (clamp(effectiveDefense + calculateSpatialContestBonus(effectiveDefense, context.defenderDistanceMeters) + (context.tacticalDefenseModifier ?? 0), 0, 100) - 50) * SHOT_RESOLUTION_V1.defenseAdjustmentPerPoint
    - (clamp(context.shooterFatigue, 0, 100) / 100) * SHOT_RESOLUTION_V1.maximumFatiguePenalty
    + calculateDistanceAdjustment(context.shotZone, context.shotDistanceMeters)
  const [minimum, maximum] = SHOT_RESOLUTION_V1.probabilityClamp[context.shotZone]
  return clamp(probability, minimum, maximum)
}

export function calculateDefenseExecution(shotZone: ShotZone, profile: MatchPlayerProfile): number {
  if (shotZone === 'rim') return profile.defense.interior * 0.80 + profile.defense.mobility * 0.20
  if (shotZone === 'midRange') return profile.defense.pointOfAttack * 0.65 + profile.defense.mobility * 0.35
  return profile.defense.pointOfAttack * 0.75 + profile.defense.mobility * 0.25
}

export function calculateEffectiveDefense(shotZone: ShotZone, profile: MatchPlayerProfile, fatigue: number): number {
  return clamp(calculateDefenseExecution(shotZone, profile) - (clamp(fatigue, 0, 100) / 100) * SHOT_RESOLUTION_V1.defenderFatiguePenaltyAtMaximum, 0, 100)
}

export function calculateSpatialContestBonus(effectiveDefense: number, defenderDistanceMeters: number | undefined): number {
  if (defenderDistanceMeters === undefined || !Number.isFinite(defenderDistanceMeters)) return 0
  const proximity = clamp(
    (SPATIAL_CONTEST_V1.noContestDistanceMeters - defenderDistanceMeters)
      / (SPATIAL_CONTEST_V1.noContestDistanceMeters - SPATIAL_CONTEST_V1.fullContestDistanceMeters),
    0,
    1,
  )
  return proximity * (clamp(effectiveDefense, 0, 100) / 100) * SPATIAL_CONTEST_V1.maximumDefenseBonusPoints
}

export function pointsForShotZone(shotZone: ShotZone): 2 | 3 { return shotZone === 'threePoint' ? 3 : 2 }

function calculateExecution(shotZone: ShotZone, profile: MatchPlayerProfile): number {
  if (shotZone === 'rim') return profile.offense.rimAttack * 0.85 + profile.offense.creation * 0.15
  if (shotZone === 'midRange') return profile.offense.shooting * 0.85 + profile.offense.creation * 0.15
  return profile.offense.shooting * 0.90 + profile.offense.creation * 0.10
}

function shotTendencyFactor(value: number): number { return 0.5 + value / 100 }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }

function calculateDistanceAdjustment(shotZone: ShotZone, distanceMeters: number | undefined): number {
  if (distanceMeters === undefined || !Number.isFinite(distanceMeters)) return 0
  const referenceDistance = shotZone === 'rim' ? 1 : shotZone === 'midRange' ? 4.5 : 7.5
  return clamp((referenceDistance - distanceMeters) * SHOT_RESOLUTION_V1.distanceAdjustmentPerMeter, -SHOT_RESOLUTION_V1.maximumDistanceAdjustment, SHOT_RESOLUTION_V1.maximumDistanceAdjustment)
}
