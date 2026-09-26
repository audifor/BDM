import type { CourtPosition } from '@/domain/court'
import type { GameId, PlayerId, TeamId } from '@/domain/ids'
import { neutralFoundationPosition, type MatchSetup } from './setup'
import { createRngState } from './rng'

export interface FoundationEvent {
  readonly sequence: number
  readonly t: number
  readonly period: number
  readonly gameClockTenths: number
  readonly type: 'periodStart' | 'periodEnd' | 'foundationEnd'
}
export interface MatchPlayerState { readonly playerId: PlayerId; readonly teamId: TeamId; readonly position: CourtPosition; readonly velocity: CourtPosition }
export type FoundationBallState = { readonly kind: 'HELD'; readonly playerId: PlayerId; readonly position: CourtPosition } | { readonly kind: 'DEAD'; readonly position: CourtPosition }
export interface FoundationPossessionState { readonly kind: 'FOUNDATION_UNASSIGNED' }
export interface MatchState {
  readonly version: 1
  readonly gameId: GameId
  readonly t: number
  readonly period: number
  readonly clockRules: MatchSetup['clockRules']
  readonly gameClockTenths: number
  readonly shotClockTenths: number | null
  readonly score: { readonly home: number; readonly away: number }
  readonly players: readonly MatchPlayerState[]
  readonly ball: FoundationBallState
  readonly possession: FoundationPossessionState
  readonly rng: ReturnType<typeof createRngState>
  readonly nextEventSequence: number
  readonly events: readonly FoundationEvent[]
  readonly isComplete: boolean
  readonly foundationOnly: true
}

export function createInitialMatchState(setup: MatchSetup): MatchState {
  const players = [
    ...setup.initialLineups.home.map((playerId, slot) => ({ playerId, teamId: setup.homeTeamId, position: neutralFoundationPosition('home', slot, setup.court), velocity: { x: 0, y: 0 } })),
    ...setup.initialLineups.away.map((playerId, slot) => ({ playerId, teamId: setup.awayTeamId, position: neutralFoundationPosition('away', slot, setup.court), velocity: { x: 0, y: 0 } })),
  ]
  const firstPlayerId = setup.initialLineups.home[0]!
  const position = neutralFoundationPosition('home', 0, setup.court)
  return {
    version: 1, gameId: setup.gameId, t: 0, period: 1, clockRules: { ...setup.clockRules },
    gameClockTenths: setup.clockRules.periodSeconds * 10,
    shotClockTenths: null, score: { home: 0, away: 0 }, players,
    ball: { kind: 'HELD', playerId: firstPlayerId, position },
    possession: { kind: 'FOUNDATION_UNASSIGNED' }, rng: createRngState(setup.matchSeed),
    nextEventSequence: 2,
    events: [{ sequence: 1, t: 0, period: 1, gameClockTenths: setup.clockRules.periodSeconds * 10, type: 'periodStart' }],
    isComplete: false, foundationOnly: true,
  }
}
