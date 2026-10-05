import type { CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { DriveContactTrack } from '../contact/ContactModel'

export type MatchDecisionKind = 'PASS' | 'SHOOT' | 'DRIVE' | 'KICK_OUT' | 'CATCH_AND_SHOOT' | 'SCREEN'
export type MatchActionKind = MatchDecisionKind | 'CLOSEOUT'
export type MatchActionStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type MatchActionOutcome = 'CAUGHT' | 'BAD_PASS' | 'MAKE' | 'MISS' | 'ADVANTAGE' | 'CONTAINED' | 'FINISH' | 'STOPPED' | 'ARRIVED' | 'CONTESTED' | 'CANCELLED' | 'FOULED' | 'BLOCKED'

export interface MatchDecision {
  readonly id: string
  readonly kind: MatchDecisionKind
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly decidedT: number
  readonly reason: string
  readonly targetPlayerId?: PlayerId
  /** Expected points of each option at the moment of the read (BT2G): shot opportunity vs the alternatives. */
  readonly utility?: { readonly shoot: number; readonly drive: number; readonly pass: number; readonly hold: number; readonly screen?: number }
}

export interface MatchActionState {
  readonly id: string
  readonly kind: MatchActionKind
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly startedT: number
  readonly status: MatchActionStatus
  readonly phase?: 'DRIVING' | 'PASS_IN_FLIGHT' | 'GATHER' | 'SHOT_IN_FLIGHT' | 'CLOSING_OUT' | 'SCREEN_APPROACH'
  readonly decisionId?: string
  readonly sourceActionId?: string
  readonly targetPlayerId?: PlayerId
  readonly target?: CourtPosition
  readonly targetBasket?: CourtPosition
  readonly startPosition?: CourtPosition
  /** A drive first goes around this point (the screener's far shoulder) before attacking the basket. */
  readonly waypoint?: CourtPosition
  /** BT3B: closest approach between the driver and his on-ball defender, and whether it has been judged already. */
  readonly contact?: DriveContactTrack
  readonly contactAssessed?: boolean
  /** BT4G/H: a shot taken after stopping a drive (pull-up or floater) rather than after a catch. */
  readonly shotStop?: 'PULL_UP' | 'FLOATER'
  /** Which decision windows of a drive have already been evaluated (BT4G): once each, never every tick. */
  readonly stopWindows?: readonly ('FAR' | 'NEAR')[]
  /** BT4H: when help came to a driver who got past his man, whether he keeps going to finish or kicks it out (decided once). */
  readonly advantageChoice?: 'FINISH' | 'KICK'
  readonly screenId?: string
  readonly releaseAtT?: number
  /** BT6.1: the shooter's velocity when he started the shot: a driver carries it into whoever is in front of him as he goes up. */
  readonly gatherVelocity?: CourtPosition
  readonly resolvedT?: number
  readonly outcome?: MatchActionOutcome
  readonly progressMeters?: number
  readonly passQuality?: number
  readonly shotValue?: 2 | 3
  readonly shotProbability?: number
  readonly contestScore?: number
  readonly contestDefenderPlayerId?: PlayerId
  readonly closestDefenderDistanceMeters?: number
  readonly helpDefenderPlayerId?: PlayerId
}
