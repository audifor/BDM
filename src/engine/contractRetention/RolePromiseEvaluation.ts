import type { RolePromise } from '@/domain/market'
import type { RolePromiseUsageWindow } from './RolePromiseUsage'

export type RolePromiseEvaluationStatus = 'INSUFFICIENT_EVIDENCE' | 'REASONABLE' | 'AT_RISK' | 'SUSTAINED_BREACH'

/** Provisional gameplay calibration, not a historical or competition rule. Keep all balance values here. */
export const ROLE_PROMISE_EVALUATION_CALIBRATION = Object.freeze({
  version: 'PROVISIONAL_V1',
  minimumMeasuredGames: 10,
  maximumUnknownGameRate: 0.2,
  STAR: Object.freeze({ topThreeMinuteRate: 0.6, appearanceRate: 0.75, regulationTimeShare: 0.3,
    breachTopThreeMinuteRateBelow: 0.25, breachAppearanceRateBelow: 0.5, breachRegulationTimeShareBelow: 0.2 }),
  STARTER: Object.freeze({ startRate: 0.6, appearanceRate: 0.7, regulationTimeShare: 0.18, breachStartRateBelow: 0.25 }),
  ROTATION: Object.freeze({ appearanceRate: 0.6, regulationTimeShare: 0.18,
    breachAppearanceRateBelow: 0.25, breachRegulationTimeShareBelow: 0.1 }),
})

export interface RolePromiseEvaluation {
  readonly rolePromiseId: RolePromise['id']
  readonly competitionId: RolePromiseUsageWindow['competitionId']
  readonly seasonId: RolePromiseUsageWindow['seasonId']
  readonly status: RolePromiseEvaluationStatus
  readonly measuredGames: number
  readonly unknownGames: number
  readonly availableGames: number
  readonly startRate: number | null
  readonly appearanceRate: number | null
  readonly regulationTimeShare: number | null
  readonly topThreeMinuteRate: number | null
  readonly calibrationVersion: typeof ROLE_PROMISE_EVALUATION_CALIBRATION.version
  readonly rationale: string
}

/** Evaluates a single competition-season window. Inputs remain derived match evidence. */
export function evaluateRolePromiseUsage(promise: RolePromise, window: RolePromiseUsageWindow): RolePromiseEvaluation {
  const unknownGames = window.evidence.filter((item) => item.status === 'MISSING_MATCH_LOG' || item.status === 'INCOMPLETE_MATCH_LOG').length
  const unknownRate = window.availableGames === 0 ? 1 : unknownGames / window.availableGames
  const enoughEvidence = window.measuredGames >= ROLE_PROMISE_EVALUATION_CALIBRATION.minimumMeasuredGames
    && unknownRate <= ROLE_PROMISE_EVALUATION_CALIBRATION.maximumUnknownGameRate
  const startRate = window.measuredGames === 0 ? null : window.starts / window.measuredGames
  const appearanceRate = window.measuredGames === 0 ? null : window.appearances / window.measuredGames
  const regulationTimeShare = window.playingTimeShare
  const topThreeMinuteRate = window.topThreeMinuteRate
  let status: RolePromiseEvaluationStatus
  let rationale: string

  if (!enoughEvidence || startRate === null || appearanceRate === null || regulationTimeShare === null) {
    status = 'INSUFFICIENT_EVIDENCE'
    rationale = `Only ${window.measuredGames} complete available games; at least ${ROLE_PROMISE_EVALUATION_CALIBRATION.minimumMeasuredGames} are required by the provisional review.`
  } else if (promise.role === 'DEPTH') {
    status = 'REASONABLE'
    rationale = 'DEPTH is an availability role and does not guarantee regular participation.'
  } else if (promise.role === 'STAR') {
    const policy = ROLE_PROMISE_EVALUATION_CALIBRATION.STAR
    if (topThreeMinuteRate !== null && topThreeMinuteRate >= policy.topThreeMinuteRate
      && appearanceRate >= policy.appearanceRate && regulationTimeShare >= policy.regulationTimeShare) {
      status = 'REASONABLE'
      rationale = 'The player is a recurring team minutes leader, appears regularly, and receives a substantial share of regulation time.'
    } else if (topThreeMinuteRate !== null && topThreeMinuteRate < policy.breachTopThreeMinuteRateBelow
      && appearanceRate < policy.breachAppearanceRateBelow && regulationTimeShare < policy.breachRegulationTimeShareBelow) {
      status = 'SUSTAINED_BREACH'
      rationale = 'Across the evidence window, the player is rarely among the team minutes leaders, rarely appears, and receives little regulation time.'
    } else {
      status = 'AT_RISK'
      rationale = 'At least one part of the provisional STAR expectation is not consistently supported by the evidence.'
    }
  } else if (promise.role === 'STARTER') {
    const policy = ROLE_PROMISE_EVALUATION_CALIBRATION.STARTER
    if (startRate >= policy.startRate && appearanceRate >= policy.appearanceRate && regulationTimeShare >= policy.regulationTimeShare) {
      status = 'REASONABLE'
      rationale = 'The player starts habitually, remains available for regular participation, and receives meaningful minutes.'
    } else if (startRate < policy.breachStartRateBelow) {
      status = 'SUSTAINED_BREACH'
      rationale = 'Across the evidence window, the player has lost the promised starting place in nearly all available games.'
    } else {
      status = 'AT_RISK'
      rationale = 'Starting frequency or supporting participation evidence has drifted below the provisional STARTER expectation.'
    }
  } else {
    const policy = ROLE_PROMISE_EVALUATION_CALIBRATION.ROTATION
    if (appearanceRate >= policy.appearanceRate && regulationTimeShare >= policy.regulationTimeShare) {
      status = 'REASONABLE'
      rationale = 'The player appears regularly and receives meaningful minutes when available.'
    } else if (appearanceRate < policy.breachAppearanceRateBelow && regulationTimeShare < policy.breachRegulationTimeShareBelow) {
      status = 'SUSTAINED_BREACH'
      rationale = 'Across the evidence window, the available player has almost stopped participating and receives little regulation time.'
    } else {
      status = 'AT_RISK'
      rationale = 'Participation or minutes have drifted below the provisional ROTATION expectation.'
    }
  }

  return { rolePromiseId: promise.id, competitionId: window.competitionId, seasonId: window.seasonId,
    status, measuredGames: window.measuredGames, unknownGames, availableGames: window.availableGames,
    startRate, appearanceRate, regulationTimeShare, topThreeMinuteRate,
    calibrationVersion: ROLE_PROMISE_EVALUATION_CALIBRATION.version, rationale }
}
