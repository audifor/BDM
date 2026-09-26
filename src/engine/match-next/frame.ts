import type { CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { activePossession, type MatchNextEvent, type MatchState, type PossessionPhase, type PossessionStartReason } from './state'

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

export type MatchFrameBallKind = 'HELD' | 'PASS_IN_FLIGHT' | 'SHOT_IN_FLIGHT' | 'REBOUNDABLE' | 'LOOSE' | 'DEAD' | 'INBOUND'

export interface MatchFrameBall {
  readonly kind: MatchFrameBallKind
  readonly position: CourtPosition
  readonly heightMeters: number
  readonly velocity?: CourtPosition
  readonly ownerPlayerId?: PlayerId
  readonly ownerTeamId?: TeamId
  readonly teamId?: TeamId
  readonly flight?: {
    readonly kind: 'pass' | 'shot' | 'rebound'
    readonly from: CourtPosition
    readonly target: CourtPosition
    readonly releaseT: number
    readonly arrivalT: number
  }
  readonly deadReason?: string
  readonly inboundTeamId?: TeamId
}

export interface MatchFramePossession {
  readonly id: string
  readonly teamId: TeamId
  readonly phase: PossessionPhase
  readonly startReason: PossessionStartReason
  readonly shotClock: number | null
}

export interface MatchFrame {
  readonly t: number
  readonly period: number
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly gameClock: number
  readonly shotClock: number | null
  readonly clock: MatchState['clock']
  readonly score: { readonly home: number; readonly away: number }
  readonly ball: MatchFrameBall
  readonly possession: MatchFramePossession | null
  readonly possessionHistory: MatchState['possessions']
  readonly activePossessionId: string | null
  readonly players: readonly MatchFramePlayer[]
  readonly events: readonly MatchNextEvent[]
  readonly actions: readonly []
  readonly offensiveStructure: null
  readonly defensiveStructure: null
}

export function toFrame(state: MatchState): MatchFrame {
  const possession = activePossession(state)
  const ball = state.ball
  return {
    t: state.t,
    period: state.period,
    homeTeamId: state.homeTeamId,
    awayTeamId: state.awayTeamId,
    gameClock: state.gameClockTenths,
    shotClock: state.shotClockTenths,
    clock: { ...state.clock },
    score: { ...state.score },
    ball: {
      kind: ball.kind,
      position: { ...ball.position },
      heightMeters: ball.heightMeters,
      ...(ball.kind === 'LOOSE' ? { velocity: { ...ball.velocity } } : {}),
      ...(ball.kind === 'HELD' ? { ownerPlayerId: ball.ownerPlayerId, ownerTeamId: ball.ownerTeamId } : {}),
      ...(ball.kind === 'PASS_IN_FLIGHT' ? { teamId: ball.passerTeamId } : {}),
      ...(ball.kind === 'SHOT_IN_FLIGHT' ? { teamId: ball.shooterTeamId } : {}),
      ...(ball.kind === 'REBOUNDABLE' ? { teamId: ball.shootingTeamId } : {}),
      ...(ball.kind === 'PASS_IN_FLIGHT' ? { flight: { kind: 'pass' as const, from: { ...ball.from }, target: { ...ball.target }, releaseT: ball.releaseT, arrivalT: ball.arrivalT } } : {}),
      ...(ball.kind === 'SHOT_IN_FLIGHT' ? { flight: { kind: 'shot' as const, from: { ...ball.from }, target: { ...ball.targetBasket }, releaseT: ball.releaseT, arrivalT: ball.arrivalT } } : {}),
      ...(ball.kind === 'REBOUNDABLE' ? { flight: { kind: 'rebound' as const, from: { ...ball.landingFrom }, target: { ...ball.landingTarget }, releaseT: ball.landingStartedT, arrivalT: ball.availableAtT } } : {}),
      ...(ball.kind === 'DEAD' ? { deadReason: ball.reason } : {}),
      ...(ball.kind === 'INBOUND' ? { inboundTeamId: ball.teamId, teamId: ball.teamId } : {}),
    },
    possession: possession ? { id: possession.id, teamId: possession.teamId, phase: possession.phase, startReason: possession.startReason, shotClock: state.shotClockTenths } : null,
    possessionHistory: state.possessions.map((item) => ({ ...item })),
    activePossessionId: state.activePossessionId,
    players: state.players.map((player) => ({ ...player, position: { ...player.position }, velocity: { ...player.velocity } })),
    events: state.events.map((event) => ({ ...event })),
    actions: [],
    offensiveStructure: null,
    defensiveStructure: null,
  }
}
