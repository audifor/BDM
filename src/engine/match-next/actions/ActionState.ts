import type { CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'

export type MatchDecisionKind = 'PASS' | 'SHOOT' | 'DRIVE' | 'KICK_OUT' | 'CATCH_AND_SHOOT'
export type MatchActionKind = MatchDecisionKind | 'CLOSEOUT'
export type MatchActionStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type MatchActionOutcome = 'CAUGHT' | 'BAD_PASS' | 'MAKE' | 'MISS' | 'ADVANTAGE' | 'CONTAINED' | 'FINISH' | 'ARRIVED' | 'CONTESTED' | 'CANCELLED'

export interface MatchDecision {
  readonly id: string
  readonly kind: MatchDecisionKind
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly decidedT: number
  readonly reason: string
  readonly targetPlayerId?: PlayerId
}

export interface MatchActionState {
  readonly id: string
  readonly kind: MatchActionKind
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly startedT: number
  readonly status: MatchActionStatus
  readonly phase?: 'DRIVING' | 'PASS_IN_FLIGHT' | 'GATHER' | 'SHOT_IN_FLIGHT' | 'CLOSING_OUT'
  readonly decisionId?: string
  readonly sourceActionId?: string
  readonly targetPlayerId?: PlayerId
  readonly target?: CourtPosition
  readonly targetBasket?: CourtPosition
  readonly startPosition?: CourtPosition
  readonly releaseAtT?: number
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
