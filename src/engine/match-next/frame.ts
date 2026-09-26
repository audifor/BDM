import type { CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { activePossession, type MatchNextEvent, type MatchState, type PossessionPhase, type PossessionStartReason } from './state'
import type { MovementIntent } from './movement/MovementIntent'
import type { PlayerResponsibility, StructuralDecision } from './responsibility/Responsibility'
import type { OffensiveStructureState } from './structure/FiveOutStructure'
import type { DefensiveAssignment, DefensiveStructureState } from './state'

export interface MatchFramePlayer {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly position: CourtPosition
  readonly velocity: CourtPosition
  readonly facing: CourtPosition
  readonly kinematics: MatchState['players'][number]['kinematics']
  readonly role?: string | null
  readonly slot?: string | number | null
  readonly responsibility: PlayerResponsibility | null
  readonly decision: StructuralDecision | null
  readonly intent: MovementIntent | null
  readonly assignment: DefensiveAssignment | null
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
  readonly court: MatchState['court']
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
  readonly responsibilities: MatchState['responsibilities']
  readonly decisions: MatchState['decisions']
  readonly movementIntents: MatchState['movementIntents']
  readonly events: readonly MatchNextEvent[]
  readonly actions: readonly []
  readonly offensiveStructure: OffensiveStructureState | null
  readonly defensiveStructure: DefensiveStructureState | null
}

export function toFrame(state: MatchState): MatchFrame {
  const possession = activePossession(state)
  const ball = state.ball
  return {
    t: state.t,
    period: state.period,
    court: { ...state.court, baskets: { left: { ...state.court.baskets.left }, right: { ...state.court.baskets.right } }, threePointLine: { ...state.court.threePointLine } },
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
    players: state.players.map((player) => {
      const responsibility = state.responsibilities.find((item) => item.playerId === player.playerId)
      const decision = state.decisions.find((item) => item.playerId === player.playerId)
      const intent = state.movementIntents.find((item) => item.playerId === player.playerId)
      const assignment = state.defensiveStructure?.assignments.find((item) => item.defenderPlayerId === player.playerId) ?? null
      const ballRelation = assignment === null ? null
        : state.defensiveStructure?.onBallDefenderPlayerId === player.playerId ? 'ON_BALL'
          : responsibility?.kind === 'HELP' ? 'TWO_PLUS_PASSES_AWAY'
            : responsibility?.kind === 'GAP' ? 'ONE_PASS_AWAY' : 'ASSIGNED'
      return {
        ...player,
        position: { ...player.position },
        velocity: { ...player.velocity },
        facing: { ...player.facing },
        kinematics: { ...player.kinematics },
        responsibility: responsibility ? { ...responsibility, endCondition: { ...responsibility.endCondition } } : null,
        decision: decision ? { ...decision } : null,
        intent: intent ? { ...intent, target: { ...intent.target }, facing: intent.facing.kind === 'POINT' ? { ...intent.facing, position: { ...intent.facing.position } } : { ...intent.facing }, provenance: { ...intent.provenance } } : null,
        assignment: assignment === null ? null : { ...assignment },
        ballRelation,
      }
    }),
    responsibilities: state.responsibilities.map((item) => ({ ...item, endCondition: { ...item.endCondition } })),
    decisions: state.decisions.map((item) => ({ ...item })),
    movementIntents: state.movementIntents.map((item) => ({ ...item, target: { ...item.target }, facing: item.facing.kind === 'POINT' ? { ...item.facing, position: { ...item.facing.position } } : { ...item.facing }, provenance: { ...item.provenance } })),
    events: state.events.map((event) => ({ ...event })),
    actions: [],
    offensiveStructure: state.offensiveStructure === null ? null : {
      ...state.offensiveStructure,
      attackingBasket: { ...state.offensiveStructure.attackingBasket },
      slots: state.offensiveStructure.slots.map((slot) => ({ ...slot, position: { ...slot.position } })),
      assignments: state.offensiveStructure.assignments.map((item) => ({ ...item })),
    },
    defensiveStructure: state.defensiveStructure === null ? null : {
      ...state.defensiveStructure,
      defendedBasket: { ...state.defensiveStructure.defendedBasket },
      assignments: state.defensiveStructure.assignments.map((item) => ({ ...item })),
      helpDefenderPlayerIds: [...state.defensiveStructure.helpDefenderPlayerIds],
    },
  }
}
