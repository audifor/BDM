import type { CourtGeometry, CourtPosition } from '@/domain/court'
import type { GameId, PlayerId, TeamId } from '@/domain/ids'
import { neutralFoundationPosition, type MatchSetup } from './setup'
import { createRngState } from './rng'
import { HELD_BALL_HEIGHT_METERS, type BallState } from './ball/BallState'
import type { MovementIntent } from './movement/MovementIntent'
import type { PlayerResponsibility, StructuralDecision } from './responsibility/Responsibility'
import { attackingBasketForTeam, type OffensiveStructureState } from './structure/FiveOutStructure'
import type { DefensiveMatchupOverride } from './setup'
import type { MatchActionState, MatchDecision } from './actions/ActionState'
import { careerFatigueToMatchSession } from './playerDynamicState'

export type DefensiveAssignmentSource = 'INITIAL' | 'OVERRIDE' | 'STRUCTURAL_REASSIGNMENT'

export interface DefensiveAssignment {
  readonly defenderPlayerId: PlayerId
  readonly attackerPlayerId: PlayerId
  readonly teamId: TeamId
  readonly startedT: number
  readonly source: DefensiveAssignmentSource
}

export interface DefensiveStructureState {
  readonly teamId: TeamId
  readonly scheme: 'MAN'
  readonly defendedBasket: CourtPosition
  readonly assignments: readonly DefensiveAssignment[]
  readonly onBallDefenderPlayerId: PlayerId | null
  readonly helpDefenderPlayerIds: readonly PlayerId[]
  readonly helpDecision: DefensiveHelpDecision
}

export interface DefensiveHelpDecision {
  readonly status: 'NOT_NEEDED' | 'TRIGGERED'
  readonly ballHandlerPlayerId: PlayerId | null
  readonly sourceActionId?: string
  readonly reason: string
  readonly helperPlayerId?: PlayerId
  readonly helperKind?: 'HELP' | 'LOW_MAN'
  readonly rotations: readonly {
    readonly playerId: PlayerId
    readonly kind: 'ROTATE' | 'X_OUT'
    readonly targetAttackerPlayerId: PlayerId
    readonly secondaryAttackerPlayerId?: PlayerId
  }[]
}

export type ReboundResponsibilityKind = 'BOX_OUT' | 'CRASH_REBOUND' | 'PURSUE_REBOUND' | 'RETREAT'
export interface ReboundResponsibility {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly kind: ReboundResponsibilityKind
  readonly target: CourtPosition
  readonly boxOutTarget?: CourtPosition
  readonly responsibilityId: string
  readonly decisionId: string
}
export interface MatchReboundState {
  readonly phase: 'SHOT_FLIGHT' | 'LIVE'
  readonly shootingTeamId: TeamId
  readonly startedT: number
  readonly availableAtT: number
  /** Fixed physical landing point for this rebound; it is not a winner position. */
  readonly target: CourtPosition
  readonly responsibilities: readonly ReboundResponsibility[]
}

export type TransitionTrigger = 'openingJumpBall' | 'madeBasketInbound' | 'defensiveRebound' | 'turnover' | 'looseBallRecovery'
export type TransitionAdvantage = 'ADVANTAGE' | 'NEUTRAL' | 'STOPPED'
export type TransitionRoleKind = 'BALL_ADVANCE' | 'LANE_LEFT' | 'LANE_RIGHT' | 'RIM_RUN' | 'TRAIL'
  | 'STOP_BALL' | 'PROTECT_RIM' | 'MATCH'
export interface TransitionRole {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly kind: TransitionRoleKind
  readonly target: CourtPosition
  readonly matchLaneY?: number
  readonly responsibilityId: string
  readonly decisionId: string
}
export interface MatchTransitionState {
  readonly teamId: TeamId
  readonly ballHandlerPlayerId: PlayerId
  readonly trigger: TransitionTrigger
  readonly startedT: number
  readonly advantage: TransitionAdvantage
  readonly roles: readonly TransitionRole[]
}

export type PossessionStartReason = 'periodStart' | 'openingJumpBall' | 'madeBasketInbound' | 'defensiveRebound' | 'steal' | 'turnoverInbound' | 'shotClockViolation' | 'other'
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
  | 'jumpBallStarted' | 'jumpBallResolved'
  | 'possessionStart' | 'possessionPhaseChanged' | 'possessionEnd'
  | 'inboundStarted' | 'inboundReleased'
  | 'passReleased' | 'passReceived' | 'passBecameLoose' | 'passIntercepted'
  | 'shotReleased' | 'shotMade' | 'shotMissed'
  | 'reboundBecameAvailable' | 'reboundSecured'
  | 'looseBallCreated' | 'looseBallRecovered'
  | 'defensiveAssignmentsEstablished' | 'defensiveResponsibilityChanged'
  | 'decisionSelected' | 'actionStarted' | 'actionResolved'
  | 'reboundResponsibilitiesAssigned' | 'transitionStarted' | 'transitionAdvantageChanged' | 'transitionResolved'
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
  readonly shootingTeamId?: TeamId
  readonly reboundType?: 'offensive' | 'defensive'
  readonly points?: 2 | 3
  readonly startReason?: PossessionStartReason
  readonly endReason?: PossessionEndReason
  readonly phase?: PossessionPhase
  readonly ballReason?: string
  readonly acquisitionDistanceMeters?: number
  readonly responsibilityKind?: 'ON_BALL' | 'GAP' | 'HELP' | 'LOW_MAN' | 'ROTATE' | 'X_OUT' | 'RECOVER'
  readonly decisionId?: string
  readonly decisionKind?: string
  readonly actionId?: string
  readonly actionKind?: string
  readonly actionOutcome?: string
  readonly shotProbability?: number
  readonly contestScore?: number
  readonly passQuality?: number
  readonly reboundRole?: ReboundResponsibilityKind
  readonly transitionRole?: TransitionRoleKind
  readonly transitionTrigger?: TransitionTrigger
  readonly transitionAdvantage?: TransitionAdvantage
}

export interface MatchPlayerState {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly active: true
  /** Transient fatigue: session baseline and current value, separate from Player Truth. */
  readonly preMatchCareerFatigue: number
  readonly initialFatigue: number
  readonly fatigue: number
  readonly position: CourtPosition
  readonly velocity: CourtPosition
  readonly facing: CourtPosition
  readonly primaryPosition: MatchSetup['players'][number]['primaryPosition']
  readonly heightCm: number
  readonly standingReachCm: number
  readonly reboundingImpact: number
  readonly defensiveMobility: number
  readonly offense: MatchSetup['players'][number]['offense']
  readonly passing: Required<NonNullable<MatchSetup['players'][number]['passing']>>
  readonly defense: MatchSetup['players'][number]['defense']
  readonly kinematics: { readonly maxSpeedMps: number; readonly accelerationMps2: number; readonly brakingMps2: number }
}

export interface MatchState {
  readonly version: 4
  readonly gameId: GameId
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  /** Monotonic simulation ticks; one tick is 0.1 seconds. */
  readonly t: number
  readonly period: number
  readonly court: CourtGeometry
  readonly clockRules: MatchSetup['clockRules']
  readonly tacticalPlans: MatchSetup['tacticalPlans']
  readonly defensiveMatchupOverrides: MatchSetup['defensiveMatchupOverrides']
  readonly autonomousActions: boolean
  readonly clock: { readonly gameRunning: boolean; readonly shotRunning: boolean }
  readonly gameClockTenths: number
  readonly shotClockTenths: number | null
  readonly score: { readonly home: number; readonly away: number }
  readonly players: readonly MatchPlayerState[]
  readonly responsibilities: readonly PlayerResponsibility[]
  readonly decisions: readonly StructuralDecision[]
  readonly movementIntents: readonly MovementIntent[]
  readonly offensiveStructure: OffensiveStructureState | null
  readonly defensiveStructure: DefensiveStructureState | null
  readonly reboundState: MatchReboundState | null
  readonly transition: MatchTransitionState | null
  readonly currentDecision: MatchDecision | null
  readonly actions: readonly MatchActionState[]
  readonly nextMatchDecisionSequence: number
  readonly nextActionSequence: number
  readonly nextResponsibilitySequence: number
  readonly nextDecisionSequence: number
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
    ...setup.initialLineups.home.map((playerId, slot) => {
      const position = { ...(initialPosition(playerId) ?? neutralFoundationPosition('home', slot, setup.court)) }
      const basket = attackingBasketForTeam(setup.homeTeamId, setup.homeTeamId, 1, setup.court)
      const profile = setup.players.find((entry) => entry.playerId === playerId)!
      const preMatchCareerFatigue = profile.dynamicState?.careerFatigue ?? 0
      const initialFatigue = careerFatigueToMatchSession(preMatchCareerFatigue)
      return { playerId, teamId: setup.homeTeamId, active: true as const, preMatchCareerFatigue, initialFatigue, fatigue: initialFatigue, position, velocity: { x: 0, y: 0 }, facing: unitVector({ x: basket.x - position.x, y: basket.y - position.y }), primaryPosition: profile.primaryPosition, heightCm: profile.physical.heightCm, standingReachCm: profile.physical.standingReachCm, reboundingImpact: profile.rebounding.impact, defensiveMobility: profile.defense.mobility, offense: { ...profile.offense }, passing: { accuracy: profile.passing?.accuracy ?? 50, vision: profile.passing?.vision ?? 50, timing: profile.passing?.timing ?? 50 }, defense: { ...profile.defense }, kinematics: { ...profile.kinematics } }
    }),
    ...setup.initialLineups.away.map((playerId, slot) => {
      const position = { ...(initialPosition(playerId) ?? neutralFoundationPosition('away', slot, setup.court)) }
      const basket = attackingBasketForTeam(setup.awayTeamId, setup.homeTeamId, 1, setup.court)
      const profile = setup.players.find((entry) => entry.playerId === playerId)!
      const preMatchCareerFatigue = profile.dynamicState?.careerFatigue ?? 0
      const initialFatigue = careerFatigueToMatchSession(preMatchCareerFatigue)
      return { playerId, teamId: setup.awayTeamId, active: true as const, preMatchCareerFatigue, initialFatigue, fatigue: initialFatigue, position, velocity: { x: 0, y: 0 }, facing: unitVector({ x: basket.x - position.x, y: basket.y - position.y }), primaryPosition: profile.primaryPosition, heightCm: profile.physical.heightCm, standingReachCm: profile.physical.standingReachCm, reboundingImpact: profile.rebounding.impact, defensiveMobility: profile.defense.mobility, offense: { ...profile.offense }, passing: { accuracy: profile.passing?.accuracy ?? 50, vision: profile.passing?.vision ?? 50, timing: profile.passing?.timing ?? 50 }, defense: { ...profile.defense }, kinematics: { ...profile.kinematics } }
    }),
  ]
  const position = { x: setup.court.lengthMeters / 2, y: setup.court.widthMeters / 2 }
  const gameClockTenths = setup.clockRules.periodSeconds * 10
  const initial: MatchNextEvent = { sequence: 1, t: 0, period: 1, gameClockTenths, type: 'periodStart' }
  return {
    version: 4,
    gameId: setup.gameId,
    homeTeamId: setup.homeTeamId,
    awayTeamId: setup.awayTeamId,
    t: 0,
    period: 1,
    court: { ...setup.court, baskets: { left: { ...setup.court.baskets.left }, right: { ...setup.court.baskets.right } } },
    clockRules: { ...setup.clockRules },
    tacticalPlans: {
      home: { ...setup.tacticalPlans.home, shotProfile: { ...setup.tacticalPlans.home.shotProfile }, defense: { ...setup.tacticalPlans.home.defense } },
      away: { ...setup.tacticalPlans.away, shotProfile: { ...setup.tacticalPlans.away.shotProfile }, defense: { ...setup.tacticalPlans.away.defense } },
    },
    defensiveMatchupOverrides: {
      home: setup.defensiveMatchupOverrides.home.map((item) => ({ ...item })),
      away: setup.defensiveMatchupOverrides.away.map((item) => ({ ...item })),
    },
    autonomousActions: setup.autonomousActions ?? false,
    clock: { gameRunning: false, shotRunning: false },
    gameClockTenths,
    shotClockTenths: null,
    score: { home: 0, away: 0 },
    players,
    responsibilities: [],
    decisions: [],
    movementIntents: [],
    offensiveStructure: null,
    defensiveStructure: null,
    reboundState: null,
    transition: null,
    currentDecision: null,
    actions: [],
    nextMatchDecisionSequence: 1,
    nextActionSequence: 1,
    nextResponsibilitySequence: 1,
    nextDecisionSequence: 1,
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

function unitVector(value: CourtPosition): CourtPosition {
  const length = Math.hypot(value.x, value.y)
  return length > 1e-9 ? { x: value.x / length, y: value.y / length } : { x: 1, y: 0 }
}
