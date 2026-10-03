import type { CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'

export type BallPassKind = 'chest' | 'bounce' | 'lob'
export type BallDeadReason = 'madeBasket' | 'outOfBounds' | 'shotClockViolation' | 'periodEnd' | 'foundation' | 'other' | 'foul' | 'freeThrow'
export type LooseBallCause = 'badPass' | 'deflection' | 'lostDribble' | 'rebound' | 'block' | 'pokeLoose' | 'other'

export type PlannedShotOutcome =
  | { readonly kind: 'MAKE'; readonly points: 1 | 2 | 3 }
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
  readonly catchRadiusMeters?: number
  readonly actionId?: string
  readonly passQuality?: number
  /** BT3I/BT4.5: a defender who can be on the line first goes for the ball; whether he gets there is decided by where he is when the ball passes him. */
  readonly contest?: { readonly defenderId: PlayerId; readonly kind: 'INTERCEPTION' | 'DEFLECTION'; /** BT4.5: the point of the line where the defender goes to meet the ball. */ readonly point?: CourtPosition }
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
  readonly actionId?: string
  readonly shotValue?: 2 | 3
  readonly shotProbability?: number
  readonly contestScore?: number
  readonly contestDefenderPlayerId?: PlayerId
  /** BT3E: this flight is a free throw of a canonical sequence. */
  readonly freeThrow?: { readonly sequenceId: string; readonly index: number; readonly last: boolean }
  /** BT3D: the shooter was fouled in the act; the foul is resolved when the shot arrives (AND-ONE if it goes in). */
  readonly foul?: { readonly foulId: string; readonly freeThrows: number; readonly points: 2 | 3 }
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
  /** Who touched it last decides who gets it when it leaves the court (BT3K). */
  readonly lastTouchTeamId?: TeamId
  readonly lastTouchPlayerId?: PlayerId
  readonly previousPosition: CourtPosition
}

export interface DeadBallState {
  readonly kind: 'DEAD'
  readonly reason: BallDeadReason
  readonly position: CourtPosition
  readonly heightMeters: number
  readonly restartTeamId?: TeamId
  readonly restartSpot?: CourtPosition
  readonly foulId?: string
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

export interface JumpBallState {
  readonly kind: 'JUMP_BALL'
  readonly homeJumperPlayerId: PlayerId
  readonly awayJumperPlayerId: PlayerId
  readonly tippedByPlayerId: PlayerId
  readonly receiverPlayerId: PlayerId
  readonly winningTeamId: TeamId
  readonly position: CourtPosition
  readonly heightMeters: number
  readonly startedT: number
  readonly resolvesAtT: number
}

export type BallState =
  | HeldBallState
  | PassInFlightBallState
  | ShotInFlightBallState
  | ReboundableBallState
  | LooseBallState
  | DeadBallState
  | InboundBallState
  | JumpBallState

export const BALL_ACQUISITION_RADIUS_METERS = 1
/** Upper bound of a rebounder reach at the ball; each player own reach is smaller (see ReboundTransition). */
export const REBOUND_ACQUISITION_RADIUS_METERS = 1.2
export const HELD_BALL_HEIGHT_METERS = 0.6
