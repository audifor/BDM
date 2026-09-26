import type { CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'

export type BallPassKind = 'chest' | 'bounce' | 'lob'
export type BallDeadReason = 'madeBasket' | 'outOfBounds' | 'shotClockViolation' | 'periodEnd' | 'foundation' | 'other'
export type LooseBallCause = 'badPass' | 'deflection' | 'lostDribble' | 'rebound' | 'other'

export type PlannedShotOutcome =
  | { readonly kind: 'MAKE'; readonly points: 2 | 3 }
  | { readonly kind: 'MISS'; readonly reboundTarget: CourtPosition; readonly reboundAvailableT: number }

export interface HeldBallState {
  readonly kind: 'HELD'
  readonly ownerPlayerId: PlayerId
  readonly ownerTeamId: TeamId
  readonly position: CourtPosition
  readonly heightMeters: number
  readonly dribble: 'live' | 'picked' | 'none'
}

export interface PassInFlightBallState {
  readonly kind: 'PASS_IN_FLIGHT'
  readonly passerPlayerId: PlayerId
  readonly passerTeamId: TeamId
  readonly intendedReceiverPlayerId: PlayerId
  readonly passKind: BallPassKind
  readonly from: CourtPosition
  readonly target: CourtPosition
  readonly releaseT: number
  readonly arrivalT: number
  readonly position: CourtPosition
  readonly heightMeters: number
  readonly previousPosition: CourtPosition
  readonly isInbound: boolean
}

export interface ShotInFlightBallState {
  readonly kind: 'SHOT_IN_FLIGHT'
  readonly shooterPlayerId: PlayerId
  readonly shooterTeamId: TeamId
  readonly from: CourtPosition
  readonly targetBasket: CourtPosition
  readonly releaseT: number
  readonly arrivalT: number
  readonly position: CourtPosition
  readonly heightMeters: number
  readonly previousPosition: CourtPosition
  readonly plannedOutcome: PlannedShotOutcome
}

export interface ReboundableBallState {
  readonly kind: 'REBOUNDABLE'
  readonly shotByPlayerId: PlayerId
  readonly shootingTeamId: TeamId
  readonly position: CourtPosition
  readonly heightMeters: number
  readonly landingFrom: CourtPosition
  readonly landingStartedT: number
  readonly landingTarget: CourtPosition
  readonly availableAtT: number
  readonly previousPosition: CourtPosition
}

export interface LooseBallState {
  readonly kind: 'LOOSE'
  readonly position: CourtPosition
  readonly heightMeters: number
  readonly velocity: CourtPosition
  readonly cause: LooseBallCause
  readonly previousPosition: CourtPosition
}

export interface DeadBallState {
  readonly kind: 'DEAD'
  readonly reason: BallDeadReason
  readonly position: CourtPosition
  readonly heightMeters: number
  readonly restartTeamId?: TeamId
  readonly restartSpot?: CourtPosition
}

export interface InboundBallState {
  readonly kind: 'INBOUND'
  readonly teamId: TeamId
  readonly inbounderPlayerId: PlayerId
  readonly spot: CourtPosition
  readonly position: CourtPosition
  readonly heightMeters: number
  readonly startedT: number
  /** Inbound timing limits are not modeled until a competition rule supplies them. */
  readonly deadlineT: null
}

export type BallState =
  | HeldBallState
  | PassInFlightBallState
  | ShotInFlightBallState
  | ReboundableBallState
  | LooseBallState
  | DeadBallState
  | InboundBallState

export const BALL_ACQUISITION_RADIUS_METERS = 1
export const HELD_BALL_HEIGHT_METERS = 0.6
