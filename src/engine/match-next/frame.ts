import type { CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { activePossession, type MatchNextEvent, type MatchState, type PossessionPhase, type PossessionStartReason } from './state'
import type { MovementIntent } from './movement/MovementIntent'
import type { PlayerResponsibility, StructuralDecision } from './responsibility/Responsibility'
import type { OffensiveStructureState } from './structure/FiveOutStructure'
import type { DefensiveAssignment, DefensiveStructureState, MatchReboundState, MatchTransitionState, ReboundResponsibility, TransitionRole } from './state'
import type { MatchActionState } from './actions/ActionState'

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
  readonly reboundResponsibility: ReboundResponsibility | null
  readonly transitionRole: TransitionRole | null
}

export type MatchFrameBallKind = 'HELD' | 'PASS_IN_FLIGHT' | 'SHOT_IN_FLIGHT' | 'REBOUNDABLE' | 'LOOSE' | 'DEAD' | 'INBOUND' | 'JUMP_BALL'

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
  readonly passQuality?: number
  readonly shotValue?: 2 | 3
  readonly shotProbability?: number
  readonly contestScore?: number
  readonly contestDefenderPlayerId?: PlayerId
  readonly actionId?: string
}

export interface MatchFramePossession {
  readonly id: string
  readonly teamId: TeamId
  readonly phase: PossessionPhase
  readonly startReason: PossessionStartReason
  readonly shotClock: number | null
}

export interface MatchFrameRotationPlayer {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly started: boolean
  readonly active: boolean
  readonly courtTimeTenths: number
  readonly matchSessionFatigue: number
  readonly preMatchCareerFatigue: number
  readonly targetMinutes: number | null
  readonly stats: { readonly points: number; readonly rebounds: number; readonly steals: number; readonly fieldGoalsMade: number; readonly fieldGoalsAttempted: number }
}

export interface MatchFrame {
  readonly t: number
  readonly period: number
  readonly court: MatchState['court']
  readonly clockRules: MatchState['clockRules']
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
  readonly currentDecision: MatchState['currentDecision']
  readonly actions: readonly MatchActionState[]
  readonly offensiveStructure: OffensiveStructureState | null
  readonly defensiveStructure: DefensiveStructureState | null
  readonly reboundState: MatchReboundState | null
  readonly transition: MatchTransitionState | null
  /** Read-only Match-state projection for validating BS8 rotation behavior. */
  readonly rotationPlayers: readonly MatchFrameRotationPlayer[]
}

export function toFrame(state: MatchState): MatchFrame {
  const possession = activePossession(state)
  const ball = state.ball
  const statsByPlayer = new Map<PlayerId, MatchFrameRotationPlayer['stats']>()
  for (const event of state.events) {
    const playerId = event.shooterPlayerId ?? (event.type === 'reboundSecured' || event.type === 'passIntercepted' ? event.playerId : undefined)
    if (playerId === undefined) continue
    const current = statsByPlayer.get(playerId) ?? { points: 0, rebounds: 0, steals: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0 }
    if (event.type === 'shotMade') statsByPlayer.set(playerId, { ...current, points: current.points + (event.points ?? 0), fieldGoalsMade: current.fieldGoalsMade + 1 })
    else if (event.type === 'shotReleased') statsByPlayer.set(playerId, { ...current, fieldGoalsAttempted: current.fieldGoalsAttempted + 1 })
    else if (event.type === 'reboundSecured') statsByPlayer.set(playerId, { ...current, rebounds: current.rebounds + 1 })
    else if (event.type === 'passIntercepted') statsByPlayer.set(playerId, { ...current, steals: current.steals + 1 })
  }
  return {
    t: state.t,
    period: state.period,
    court: { ...state.court, baskets: { left: { ...state.court.baskets.left }, right: { ...state.court.baskets.right } }, threePointLine: { ...state.court.threePointLine } },
    clockRules: { ...state.clockRules, ...(state.clockRules.clockStopReasons ? { clockStopReasons: [...state.clockRules.clockStopReasons] } : {}), ...(state.clockRules.substitutionOpportunityReasons ? { substitutionOpportunityReasons: [...state.clockRules.substitutionOpportunityReasons] } : {}) },
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
      ...(ball.kind === 'PASS_IN_FLIGHT' && ball.passQuality !== undefined ? { passQuality: ball.passQuality, actionId: ball.actionId } : {}),
      ...(ball.kind === 'SHOT_IN_FLIGHT' ? {
        ...(ball.shotValue === undefined ? {} : { shotValue: ball.shotValue }),
        ...(ball.shotProbability === undefined ? {} : { shotProbability: ball.shotProbability }),
        ...(ball.contestScore === undefined ? {} : { contestScore: ball.contestScore }),
        ...(ball.contestDefenderPlayerId === undefined ? {} : { contestDefenderPlayerId: ball.contestDefenderPlayerId }),
        ...(ball.actionId === undefined ? {} : { actionId: ball.actionId }),
      } : {}),
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
    players: state.players.filter((player) => player.active).map((player) => {
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
        reboundResponsibility: state.reboundState?.responsibilities.find((item) => item.playerId === player.playerId) ?? null,
        transitionRole: state.transition?.roles.find((item) => item.playerId === player.playerId) ?? null,
      }
    }),
    responsibilities: state.responsibilities.map((item) => ({ ...item, endCondition: { ...item.endCondition } })),
    decisions: state.decisions.map((item) => ({ ...item })),
    movementIntents: state.movementIntents.map((item) => ({ ...item, target: { ...item.target }, facing: item.facing.kind === 'POINT' ? { ...item.facing, position: { ...item.facing.position } } : { ...item.facing }, provenance: { ...item.provenance } })),
    events: state.events.map((event) => ({ ...event })),
    currentDecision: state.currentDecision === null ? null : { ...state.currentDecision },
    actions: state.actions.map((action) => ({
      ...action,
      ...(action.target === undefined ? {} : { target: { ...action.target } }),
      ...(action.targetBasket === undefined ? {} : { targetBasket: { ...action.targetBasket } }),
      ...(action.startPosition === undefined ? {} : { startPosition: { ...action.startPosition } }),
    })),
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
      helpDecision: {
        ...state.defensiveStructure.helpDecision,
        rotations: state.defensiveStructure.helpDecision.rotations.map((item) => ({ ...item })),
      },
    },
    reboundState: state.reboundState === null ? null : {
      ...state.reboundState,
      target: { ...state.reboundState.target },
      responsibilities: state.reboundState.responsibilities.map((item) => ({
        ...item,
        target: { ...item.target },
        ...(item.boxOutTarget === undefined ? {} : { boxOutTarget: { ...item.boxOutTarget } }),
      })),
    },
    transition: state.transition === null ? null : {
      ...state.transition,
      roles: state.transition.roles.map((role) => ({ ...role, target: { ...role.target } })),
    },
    rotationPlayers: state.players.map((player) => {
      const plan = player.teamId === state.homeTeamId ? state.coachingPlans?.home : state.coachingPlans?.away
      const periodTargets = plan?.minutesByPeriod[player.playerId]
      return {
        playerId: player.playerId,
        teamId: player.teamId,
        started: player.started === true,
        active: player.active,
        courtTimeTenths: state.courtTimeTenthsByPlayerId?.[player.playerId] ?? 0,
        matchSessionFatigue: player.fatigue,
        preMatchCareerFatigue: player.preMatchCareerFatigue,
        targetMinutes: periodTargets === undefined ? null : periodTargets.reduce((sum, minutes) => sum + minutes, 0),
        stats: statsByPlayer.get(player.playerId) ?? { points: 0, rebounds: 0, steals: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0 },
      }
    }),
  }
}
