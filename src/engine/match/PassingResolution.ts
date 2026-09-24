import type { PlayerId } from '@/domain/ids'
import { distanceBetween, type CourtPosition } from '@/domain/court'

import type { MatchPlayerProfile } from './MatchPlayerProfile'

export interface PassingLaneDefender {
  readonly playerId: PlayerId
  readonly position: CourtPosition
  readonly stealAbility: number
}

export interface PassingLaneContext {
  readonly passLengthMeters: number
  readonly lanePressure: number
  readonly mostDangerousDefenderId?: PlayerId
}

export const PASS_RESOLUTION_V1 = {
  baseCompletionProbability: 0.78,
  passingSkillAdjustmentPerPoint: 0.002,
  lengthPenaltyPerMeter: 0.002,
  maximumLengthPenalty: 0.06,
  lanePressurePenalty: 0.18,
  minimumCompletionProbability: 0.35,
  maximumCompletionProbability: 0.97,
  laneFullPressureDistanceMeters: 0.5,
  laneNoPressureDistanceMeters: 2,
  passSelectionBaseProbability: 0.05,
  passFirstBiasAdjustment: 0.20,
  maximumPassesPerPossession: 1,
} as const

export function calculatePassingLaneContext(
  passerPosition: CourtPosition,
  receiverPosition: CourtPosition,
  defenders: readonly PassingLaneDefender[],
): PassingLaneContext {
  const passLengthMeters = distanceBetween(passerPosition, receiverPosition)
  if (passLengthMeters === 0) return { passLengthMeters, lanePressure: 0 }

  let lanePressure = 0
  let mostDangerousDefenderId: PlayerId | undefined
  for (const defender of defenders) {
    const laneDistance = distanceFromPointToSegment(defender.position, passerPosition, receiverPosition)
    if (laneDistance === undefined) continue
    const proximity = clamp(
      (PASS_RESOLUTION_V1.laneNoPressureDistanceMeters - laneDistance)
        / (PASS_RESOLUTION_V1.laneNoPressureDistanceMeters - PASS_RESOLUTION_V1.laneFullPressureDistanceMeters),
      0,
      1,
    )
    const pressure = proximity * clamp(defender.stealAbility, 0, 100) / 100
    if (pressure > lanePressure) {
      lanePressure = pressure
      mostDangerousDefenderId = defender.playerId
    }
  }

  return {
    passLengthMeters,
    lanePressure,
    ...(mostDangerousDefenderId === undefined ? {} : { mostDangerousDefenderId }),
  }
}

/** Returns undefined when the point projects behind the passer or beyond the receiver. */
export function distanceFromPointToSegment(
  point: CourtPosition,
  start: CourtPosition,
  end: CourtPosition,
): number | undefined {
  const segmentX = end.x - start.x
  const segmentY = end.y - start.y
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY
  if (segmentLengthSquared === 0) return undefined

  const projection = ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSquared
  if (projection < 0 || projection > 1) return undefined

  const closestPoint = { x: start.x + projection * segmentX, y: start.y + projection * segmentY }
  return distanceBetween(point, closestPoint)
}

export function calculatePassCompletionProbability(input: {
  readonly passer: MatchPlayerProfile
  readonly passLengthMeters: number
  readonly lanePressure: number
}): number {
  const passing = input.passer.passing ?? { accuracy: input.passer.offense.creation, vision: input.passer.offense.creation, timing: input.passer.offense.creation }
  const passingSkill = passing.accuracy * 0.5 + passing.vision * 0.25 + passing.timing * 0.25
  const lengthPenalty = clamp(
    Math.max(0, input.passLengthMeters - 5) * PASS_RESOLUTION_V1.lengthPenaltyPerMeter,
    0,
    PASS_RESOLUTION_V1.maximumLengthPenalty,
  )
  const probability = PASS_RESOLUTION_V1.baseCompletionProbability
    + (passingSkill - 50) * PASS_RESOLUTION_V1.passingSkillAdjustmentPerPoint
    - lengthPenalty
    - clamp(input.lanePressure, 0, 1) * PASS_RESOLUTION_V1.lanePressurePenalty
  return clamp(probability, PASS_RESOLUTION_V1.minimumCompletionProbability, PASS_RESOLUTION_V1.maximumCompletionProbability)
}

export function calculatePassActionProbability(passFirstBias: number, passesThisPossession: number): number {
  if (passesThisPossession >= PASS_RESOLUTION_V1.maximumPassesPerPossession) return 0
  return PASS_RESOLUTION_V1.passSelectionBaseProbability
    + clamp(passFirstBias, 0, 100) / 100 * PASS_RESOLUTION_V1.passFirstBiasAdjustment
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
