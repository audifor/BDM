import type { CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { MatchState } from './state'

export interface MatchFramePlayer {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly position: CourtPosition
  readonly velocity: CourtPosition
  readonly role?: string | null
  readonly slot?: string | number | null
  readonly responsibility?: Readonly<Record<string, unknown>> | null
  readonly decision?: Readonly<Record<string, unknown>> | null
  readonly intent?: Readonly<Record<string, unknown>> | null
  readonly assignment?: Readonly<Record<string, unknown>> | null
  readonly ballRelation?: string | null
}
export interface MatchFrame {
  readonly t: number
  readonly period: number
  readonly gameClock: number
  readonly shotClock: number | null
  readonly score: { readonly home: number; readonly away: number }
  readonly ball: MatchState['ball']
  readonly possession: MatchState['possession']
  readonly players: readonly MatchFramePlayer[]
  readonly actions: readonly []
  readonly offensiveStructure: null
  readonly defensiveStructure: null
}

export function toFrame(state: MatchState): MatchFrame {
  return {
    t: state.t, period: state.period, gameClock: state.gameClockTenths,
    shotClock: state.shotClockTenths, score: { ...state.score }, ball: { ...state.ball, position: { ...state.ball.position } },
    possession: { ...state.possession }, players: state.players.map((player) => ({ ...player, position: { ...player.position }, velocity: { ...player.velocity } })),
    actions: [], offensiveStructure: null, defensiveStructure: null,
  }
}
