import type { CourtGeometry, CourtPosition } from '@/domain/court'
import type { GameId, PlayerId, TeamId } from '@/domain/ids'
import { neutralFoundationPosition, type MatchSetup } from './setup'
import { createRngState } from './rng'
import { HELD_BALL_HEIGHT_METERS, type BallState } from './ball/BallState'

export type PossessionStartReason = 'periodStart' | 'madeBasketInbound' | 'defensiveRebound' | 'steal' | 'turnoverInbound' | 'shotClockViolation' | 'other'
export type PossessionEndReason = 'made' | 'defensiveRebound' | 'turnover' | 'shotClock' | 'periodEnd'
export type PossessionPhase = 'INBOUND' | 'ADVANCE' | 'SETUP' | 'ACTION' | 'SHOT' | 'LIVE_REBOUND'

export interface PossessionState {
  readonly id: string
  readonly teamId: TeamId
  readonly startedT: number
  readonly startReason: PossessionStartReason
  readonly phase: PossessionPhase
  readonly shotClockStartedT?: number
  readonly offensiveRebounds: number
  readonly endReason?: PossessionEndReason
  readonly endedT?: number
}

export type MatchNextEventType =
  | 'periodStart' | 'periodEnd' | 'gameEnd'
  | 'possessionStart' | 'possessionPhaseChanged' | 'possessionEnd'
  | 'inboundStarted' | 'inboundReleased'
  | 'passReleased' | 'passReceived' | 'passBecameLoose' | 'passIntercepted'
  | 'shotReleased' | 'shotMade' | 'shotMissed'
  | 'reboundBecameAvailable' | 'reboundSecured'
  | 'looseBallCreated' | 'looseBallRecovered'
  | 'shotClockViolation' | 'ballDead'

export interface MatchNextEvent {
  readonly sequence: number
  /** Simulation time in fixed 0.1-second ticks. */
  readonly t: number
  readonly period: number
  readonly gameClockTenths: number
  readonly type: MatchNextEventType
  readonly possessionId?: string
  readonly teamId?: TeamId
  readonly playerId?: PlayerId
  readonly passerPlayerId?: PlayerId
  readonly receiverPlayerId?: PlayerId
  readonly shooterPlayerId?: PlayerId
  readonly points?: 2 | 3
  readonly startReason?: PossessionStartReason
  readonly endReason?: PossessionEndReason
  readonly phase?: PossessionPhase
  readonly ballReason?: string
  readonly acquisitionDistanceMeters?: number
}

export interface MatchPlayerState {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly active: true
  readonly position: CourtPosition
  readonly velocity: CourtPosition
}

export interface MatchState {
  readonly version: 2
  readonly gameId: GameId
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  /** Monotonic simulation ticks; one tick is 0.1 seconds. */
  readonly t: number
  readonly period: number
  readonly court: CourtGeometry
  readonly clockRules: MatchSetup['clockRules']
  readonly clock: { readonly gameRunning: boolean; readonly shotRunning: boolean }
  readonly gameClockTenths: number
  readonly shotClockTenths: number | null
  readonly score: { readonly home: number; readonly away: number }
  readonly players: readonly MatchPlayerState[]
  readonly ball: BallState
  readonly possessions: readonly PossessionState[]
  readonly activePossessionId: string | null
  readonly nextPossessionSequence: number
  readonly rng: ReturnType<typeof createRngState>
  readonly nextEventSequence: number
  readonly events: readonly MatchNextEvent[]
  readonly isComplete: boolean
}

export function activePossession(state: MatchState): PossessionState | undefined {
  return state.activePossessionId === null ? undefined : state.possessions.find((possession) => possession.id === state.activePossessionId)
}

export function createInitialMatchState(setup: MatchSetup): MatchState {
  const initialPositions = setup.initialPlayerPositions ?? []
  const initialPosition = (playerId: PlayerId) => initialPositions.find((entry) => entry.playerId === playerId)?.position
  const players: MatchPlayerState[] = [
    ...setup.initialLineups.home.map((playerId, slot) => ({ playerId, teamId: setup.homeTeamId, active: true as const, position: { ...(initialPosition(playerId) ?? neutralFoundationPosition('home', slot, setup.court)) }, velocity: { x: 0, y: 0 } })),
    ...setup.initialLineups.away.map((playerId, slot) => ({ playerId, teamId: setup.awayTeamId, active: true as const, position: { ...(initialPosition(playerId) ?? neutralFoundationPosition('away', slot, setup.court)) }, velocity: { x: 0, y: 0 } })),
  ]
  const position = { x: setup.court.lengthMeters / 2, y: setup.court.widthMeters / 2 }
  const gameClockTenths = setup.clockRules.periodSeconds * 10
  const initial: MatchNextEvent = { sequence: 1, t: 0, period: 1, gameClockTenths, type: 'periodStart' }
  return {
    version: 2,
    gameId: setup.gameId,
    homeTeamId: setup.homeTeamId,
    awayTeamId: setup.awayTeamId,
    t: 0,
    period: 1,
    court: { ...setup.court, baskets: { left: { ...setup.court.baskets.left }, right: { ...setup.court.baskets.right } } },
    clockRules: { ...setup.clockRules },
    clock: { gameRunning: false, shotRunning: false },
    gameClockTenths,
    shotClockTenths: null,
    score: { home: 0, away: 0 },
    players,
    ball: { kind: 'DEAD', reason: 'foundation', position, heightMeters: HELD_BALL_HEIGHT_METERS },
    possessions: [],
    activePossessionId: null,
    nextPossessionSequence: 1,
    rng: createRngState(setup.matchSeed),
    nextEventSequence: 2,
    events: [initial],
    isComplete: false,
  }
}
