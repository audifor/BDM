import type { MatchPlayerProfile } from './MatchPlayerProfile'

export type ShotZone = 'rim' | 'midRange' | 'threePoint'

export interface ShotAttemptContext {
  readonly shotZone: ShotZone
  readonly shooterProfile: MatchPlayerProfile
  readonly shooterFatigue: number
  readonly opponentDefenseProxy: number
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
  defenseAdjustmentPerPoint: 0.002,
  maximumFatiguePenalty: 0.08,
} as const

export function calculateShotZoneWeights(profile: MatchPlayerProfile): Readonly<Record<ShotZone, number>> {
  return Object.fromEntries((['rim', 'midRange', 'threePoint'] as const).map((zone) => {
    const weights = SHOT_RESOLUTION_V1.zoneWeights[zone]
    return [zone, weights.base + profile.offense.rimAttack * weights.rimAttack + profile.offense.shooting * weights.shooting + profile.offense.creation * weights.creation]
  })) as Record<ShotZone, number>
}

export function calculateShotMakeProbability(context: ShotAttemptContext): number {
  const execution = calculateExecution(context.shotZone, context.shooterProfile)
  const probability = SHOT_RESOLUTION_V1.baseProbability[context.shotZone]
    + (execution - 50) * SHOT_RESOLUTION_V1.skillAdjustmentPerPoint
    - (context.opponentDefenseProxy - 50) * SHOT_RESOLUTION_V1.defenseAdjustmentPerPoint
    - (clamp(context.shooterFatigue, 0, 100) / 100) * SHOT_RESOLUTION_V1.maximumFatiguePenalty
  const [minimum, maximum] = SHOT_RESOLUTION_V1.probabilityClamp[context.shotZone]
  return clamp(probability, minimum, maximum)
}

export function pointsForShotZone(shotZone: ShotZone): 2 | 3 { return shotZone === 'threePoint' ? 3 : 2 }

function calculateExecution(shotZone: ShotZone, profile: MatchPlayerProfile): number {
  if (shotZone === 'rim') return profile.offense.rimAttack * 0.85 + profile.offense.creation * 0.15
  if (shotZone === 'midRange') return profile.offense.shooting * 0.85 + profile.offense.creation * 0.15
  return profile.offense.shooting * 0.90 + profile.offense.creation * 0.10
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }
