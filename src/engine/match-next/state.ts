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
import type { CoachRotationPlan } from '@/engine/tactics/CoachRotationEngine'
import type { PlayCall } from './tactics/PlayCalling'
import type { TacticsState } from './tactics/MatchMemory'

export type DefensiveAssignmentSource = 'INITIAL' | 'OVERRIDE' | 'STRUCTURAL_REASSIGNMENT' | 'SWITCH'

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
  /** BT2M: the weak-side defender who keeps a foot in the paint while his man is far from the ball. */
  readonly rimProtectorPlayerId?: PlayerId | null
}

export interface DefensiveHelpDecision {
  readonly status: 'NOT_NEEDED' | 'TRIGGERED'
  readonly ballHandlerPlayerId: PlayerId | null
  readonly sourceActionId?: string
  readonly reason: string
  readonly helperPlayerId?: PlayerId
  readonly helperKind?: 'HELP' | 'LOW_MAN'
  /** BT6.26: tick the help was triggered (the rotations behind it start after the team's communication delay). */
  readonly triggeredT?: number
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
  | 'screenSet' | 'screenUsed' | 'screenEnded' | 'offBallMove'
  | 'contact' | 'foul' | 'freeThrowSequenceStarted' | 'freeThrowMade' | 'freeThrowMissed' | 'shotBlocked' | 'steal' | 'deflection' | 'stealAttempt'
  | 'turnover' | 'outOfBounds' | 'assist' | 'playStateChanged' | 'foulOut'
  | 'reboundResponsibilitiesAssigned' | 'transitionStarted' | 'transitionAdvantageChanged' | 'transitionResolved'
  | 'shotClockViolation' | 'ballDead'
  | 'substitution'
  | 'playCalled' | 'tacticalAdjustment'
  | 'dribblePickedUp'

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
  readonly points?: 1 | 2 | 3
  readonly startReason?: PossessionStartReason
  readonly endReason?: PossessionEndReason
  readonly phase?: PossessionPhase
  readonly ballReason?: string
  readonly acquisitionDistanceMeters?: number
  readonly responsibilityKind?: 'ON_BALL' | 'GAP' | 'HELP' | 'LOW_MAN' | 'ROTATE' | 'X_OUT' | 'RECOVER' | 'TAG' | 'DIG'
  readonly decisionId?: string
  readonly decisionKind?: string
  /** Expected points of each option when a decision was selected (BT2G/H: shot opportunity vs attempt). */
  readonly utility?: { readonly shoot: number; readonly drive: number; readonly pass: number; readonly hold: number; readonly screen?: number }
  /** BT3 contact / rules payload (all optional, only set by the event kinds that need them). */
  readonly contactKind?: ContactKind
  readonly severity?: number
  /** Distance from the shooter to the basket when a shot is released (audit / presentation). */
  readonly shotDistanceMeters?: number
  readonly victimPlayerId?: PlayerId
  readonly foulType?: FoulType
  readonly foulResolution?: FoulResolution
  readonly freeThrowsAwarded?: number
  readonly freeThrowIndex?: number
  readonly freeThrowTotal?: number
  readonly turnoverType?: TurnoverType
  readonly stealKind?: StealKind
  readonly blockOutcome?: BlockOutcome
  readonly assistPlayerId?: PlayerId
  readonly playPhase?: PlayPhase
  readonly previousPlayPhase?: PlayPhase
  readonly personalFouls?: number
  readonly teamFouls?: number
  readonly actionId?: string
  readonly actionKind?: string
  readonly actionOutcome?: string
  readonly shotProbability?: number
  /** BT4E/F: derived labels of a released shot (see stats/ShotEcology). */
  readonly shotZone?: string
  readonly shotCreation?: string
  readonly contestScore?: number
  readonly passQuality?: number
  readonly reboundRole?: ReboundResponsibilityKind
  readonly transitionRole?: TransitionRoleKind
  readonly transitionTrigger?: TransitionTrigger
  readonly transitionAdvantage?: TransitionAdvantage
  readonly outgoingPlayerId?: PlayerId
  readonly substitutionReason?: string
  readonly expectedMinutes?: number
  /** BT5 tactical payload: the play called (family, location, spacing), the ball-screen coverage, and why. */
  readonly playFamily?: string
  readonly playLocation?: string
  readonly spacing?: string
  readonly screenCoverage?: string
  readonly tacticalReason?: string
}

export type ScreenPhase = 'APPROACH' | 'SET' | 'USED'
export type ScreenCoverage = 'switch' | 'drop' | 'hedge' | 'blitz'

/** BT2E/F: a ball screen with real geometry: who sets it, where, for whom, against which defenders, and how it is covered. */
export interface ScreenState {
  readonly id: string
  readonly possessionId: string
  readonly teamId: TeamId
  readonly handlerId: PlayerId
  readonly screenerId: PlayerId
  readonly handlerDefenderId: PlayerId
  readonly screenerDefenderId: PlayerId
  readonly phase: ScreenPhase
  readonly startedT: number
  readonly setAtT: number | null
  readonly usedAtT: number | null
  /** Where the screener plants himself: beside the handler's defender, on the side the handler attacks. */
  readonly location: CourtPosition
  /** The far shoulder of the screener: the handler brushes past it on the way to the basket. */
  readonly waypoint: CourtPosition
  readonly side: 1 | -1
  readonly coverage: ScreenCoverage
  /** What the screener does after the handler uses the screen. */
  readonly exit: 'ROLL' | 'POP'
  readonly actionId: string
  readonly switched: boolean
  /** BT3B/C: closest approach of the handler's defender to the screener, judged once for a moving (illegal) screen. */
  readonly contact?: { readonly minGap: number; readonly defenderClosing: number; readonly screenerSpeed: number; readonly atT: number }
  readonly contactAssessed?: boolean
  /** BT5.13: why this coverage was chosen for this screen, how deep a drop sits (0..1), and the ticks the defenders need to agree on it. */
  readonly coverageReason?: string
  readonly dropDepth?: number
  readonly communicationTicks?: number
  /** BT5.7: where on the floor the screen is set (from the play call). */
  readonly locationKind?: string
}

/** BT3B: what kind of physical interaction two players had. Not every contact is a foul. */
export type ContactKind = 'INCIDENTAL' | 'LEGAL_DEFENSIVE' | 'SCREEN' | 'DRIVE' | 'SHOOTING' | 'REBOUNDING' | 'ILLEGAL_DISPLACEMENT'
/** Expected points per shot a team starts a game believing (about a league-average shot). */
export const INITIAL_SHOT_VALUE_MEMORY = 1.05

export interface ContactEpisode {
  readonly attackerId: PlayerId
  readonly defenderId: PlayerId
  readonly minGap: number
  /** Closing speeds at the closest approach (m/s): who was moving into whom. */
  readonly attackerClosing: number
  readonly defenderClosing: number
  readonly established: boolean
  readonly inPath: boolean
  readonly startedT: number
  readonly lastT: number
}

export type FoulType = 'SHOOTING' | 'REACH' | 'BLOCKING' | 'CHARGING' | 'ILLEGAL_SCREEN' | 'LOOSE_BALL' | 'REBOUNDING'
export type FoulResolution = 'INBOUND' | 'FREE_THROWS' | 'BONUS_FREE_THROWS' | 'AND_ONE' | 'OFFENSIVE_TURNOVER'
export type TurnoverType = 'BAD_PASS' | 'INTERCEPTION' | 'LOST_DRIBBLE' | 'OFFENSIVE_FOUL' | 'STEPPED_OUT' | 'SHOT_CLOCK' | 'EIGHT_SECOND' | 'OUT_OF_BOUNDS'
export type StealKind = 'CLEAN_STEAL' | 'PASS_INTERCEPTION' | 'DEFLECTION' | 'POKE_LOOSE' | 'FAILED_ATTEMPT' | 'REACH_FOUL'
export type BlockOutcome = 'BLOCKED_LOOSE' | 'BLOCKED_OUT_OF_BOUNDS' | 'BLOCKED_RECOVERED_OFFENSE' | 'BLOCKED_RECOVERED_DEFENSE'
export type PlayPhase = 'LIVE' | 'WHISTLE' | 'DEAD' | 'RESOLUTION' | 'INBOUND' | 'FREE_THROW' | 'READY'

/** BT3L: where the game is in the regulatory lifecycle LIVE -> WHISTLE -> DEAD -> RESOLUTION -> INBOUND / FREE_THROW -> READY -> LIVE. */
export interface PlayState {
  readonly phase: PlayPhase
  readonly sinceT: number
  readonly cause: 'NONE' | 'FOUL' | 'FREE_THROWS' | 'MADE_BASKET' | 'OUT_OF_BOUNDS' | 'VIOLATION' | 'PERIOD_END' | 'OPENING'
}

/** One personal foul, with everything needed to audit it: who, on whom, what kind, from what contact, and what followed. */
export interface FoulRecord {
  readonly id: string
  readonly t: number
  readonly period: number
  readonly possessionId?: string
  readonly offenderId: PlayerId
  readonly victimId: PlayerId
  readonly offenderTeamId: TeamId
  readonly type: FoulType
  readonly contact: ContactKind
  readonly severity: number
  readonly offensive: boolean
  readonly resolution: FoulResolution
  readonly freeThrows: number
  readonly bonus: 'NONE' | 'ONE_AND_ONE' | 'PENALTY'
  readonly teamFoulsAfter: number
  readonly personalFoulsAfter: number
}

export interface FoulState {
  readonly personal: Readonly<Record<string, number>>
  /** Team fouls in the current period, reset when a regulation period starts. */
  readonly teamPeriod: Readonly<Record<string, number>>
  readonly fouledOut: readonly PlayerId[]
  readonly nextSequence: number
}

/** A canonical free-throw sequence: it is part of the game lifecycle, never an instant sum on the scoreboard. */
export interface FreeThrowSequence {
  readonly id: string
  readonly foulId: string
  readonly shooterId: PlayerId
  readonly shooterTeamId: TeamId
  readonly total: number
  readonly taken: number
  readonly made: number
  readonly phase: 'FORMATION' | 'READY' | 'IN_FLIGHT'
  readonly reason: 'SHOOTING' | 'PENALTY' | 'ONE_AND_ONE' | 'AND_ONE'
  readonly oneAndOne: boolean
  readonly startedT: number
  readonly readyAtT: number | null
  readonly possessionId?: string
}

export type OffBallMoveKind = 'BASKET_CUT' | 'BACKDOOR_CUT' | 'DRIFT' | 'OFFER' | 'PIN_DOWN' | 'COME_OFF'

/** BT2D: a purposeful off-ball movement with a reason and an end, layered over the 5-out zones. */
export interface OffBallMove {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly kind: OffBallMoveKind
  readonly target: CourtPosition
  readonly startedT: number
  readonly endsT: number
  readonly reason: string
  /** BT5.10: an off-ball screen pairs two moves, the screener (PIN_DOWN) and the shooter he frees (COME_OFF). */
  readonly partnerId?: PlayerId
  readonly screenPoint?: CourtPosition
}

/** BT2B: the offense's possession phase authority. Each stage limits which decisions are legitimate. */
export type OffenseStage = 'EARLY' | 'HALF_COURT' | 'ACTION' | 'ADVANTAGE' | 'RESET'

export interface OffenseFlowState {
  readonly possessionId: string
  readonly teamId: TeamId
  readonly stage: OffenseStage
  readonly stageStartedT: number
  readonly holderPlayerId: PlayerId | null
  readonly holderSinceT: number
  readonly caughtFromPass: boolean
  /** No decision by the ball handler before this tick: he is still gathering / reading the floor. */
  readonly readyAtT: number
  readonly halfCourtSinceT: number | null
  /** Tick at which enough off-ball players occupied their zones for the half court to count as set. */
  readonly settledAtT: number | null
  readonly offensiveRebounds: number
  readonly lastResolvedT: number
  /** True from an offensive rebound until the first decision after it. */
  readonly resetPending: boolean
  readonly reads: number
  readonly moves: readonly OffBallMove[]
  /** BT4.1: while the handler keeps reading he works the ball (a probing dribble) instead of standing still. */
  readonly probe?: { readonly playerId: PlayerId; readonly target: CourtPosition; readonly endsT: number } | null
  /** BT5: the play this half court runs (called once when the half court starts, again after an offensive rebound). */
  readonly call?: PlayCall | null
}

export interface MatchPlayerState {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly active: boolean
  readonly started?: boolean
  /** Transient fatigue: session baseline and current value, separate from Player Truth. */
  readonly preMatchCareerFatigue: number
  readonly initialFatigue: number
  readonly fatigue: number
  readonly position: CourtPosition
  readonly velocity: CourtPosition
  readonly facing: CourtPosition
  readonly primaryPosition: MatchSetup['players'][number]['primaryPosition']
  readonly secondaryPositions?: MatchSetup['players'][number]['secondaryPositions']
  readonly heightCm: number
  readonly weightKg: number
  readonly wingspanCm: number
  readonly standingReachCm: number
  readonly reboundingImpact: number
  readonly defensiveMobility: number
  readonly offense: MatchSetup['players'][number]['offense']
  readonly passing: Required<NonNullable<MatchSetup['players'][number]['passing']>>
  readonly defense: MatchSetup['players'][number]['defense']
  readonly kinematics: { readonly maxSpeedMps: number; readonly accelerationMps2: number; readonly brakingMps2: number; readonly lateralGripMps2?: number; readonly backpedalFactor?: number }
  /** BT6: a defender who reached for the ball and missed is off balance (late to the handler's next step) until this tick. */
  readonly offBalanceUntilT?: number
}

export interface MatchState {
  readonly version: 5
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
  readonly coachingPlans?: { readonly home: CoachRotationPlan; readonly away: CoachRotationPlan }
  /** Actual court time in tenths of seconds, updated only while the game clock runs. */
  readonly courtTimeTenthsByPlayerId?: Readonly<Record<PlayerId, number>>
  readonly periodCourtTimeTenthsByPlayerId?: Readonly<Record<PlayerId, number>>
  readonly responsibilities: readonly PlayerResponsibility[]
  readonly decisions: readonly StructuralDecision[]
  readonly movementIntents: readonly MovementIntent[]
  readonly offensiveStructure: OffensiveStructureState | null
  readonly defensiveStructure: DefensiveStructureState | null
  readonly reboundState: MatchReboundState | null
  readonly transition: MatchTransitionState | null
  readonly currentDecision: MatchDecision | null
  readonly offenseFlow: OffenseFlowState | null
  readonly screen: ScreenState | null
  readonly fouls: FoulState
  /** BT4J: guarding bodies currently within reach of each other, judged once when they part. */
  readonly contactEpisodes: readonly ContactEpisode[]
  /**
   * BT4: what a team's shots have been worth lately (running mean of the expected points of the shots it took). It is what the team
   * expects a possession to yield if it keeps working: the value of holding the ball is measured against it instead of a constant.
   */
  readonly shotValueMemory: { readonly home: number; readonly away: number }
  /** Backcourt clock of the open possession (FIBA 28): control time in the backcourt, and whether the ball has already reached the frontcourt. */
  readonly backcourtControl?: { readonly possessionId: string; readonly ticks: number; readonly done: boolean } | null
  readonly freeThrows: FreeThrowSequence | null
  readonly playState: PlayState
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
  /** BT5.27: the benches' memory of this game (outcomes per family and coverage, recent initiators, in-game adjustment). */
  readonly tactics?: TacticsState
}

export function activePossession(state: MatchState): PossessionState | undefined {
  return state.activePossessionId === null ? undefined : state.possessions.find((possession) => possession.id === state.activePossessionId)
}

export function createInitialMatchState(setup: MatchSetup): MatchState {
  const initialPositions = setup.initialPlayerPositions ?? []
  const initialPosition = (playerId: PlayerId) => initialPositions.find((entry) => entry.playerId === playerId)?.position
  const startingIds = new Set([...setup.initialLineups.home, ...setup.initialLineups.away])
  const players = [
    ...setup.homeSquad.map((playerId, slot) => createMatchPlayer(setup, playerId, setup.homeTeamId, startingIds.has(playerId), 'home', slot, initialPosition(playerId))),
    ...setup.awaySquad.map((playerId, slot) => createMatchPlayer(setup, playerId, setup.awayTeamId, startingIds.has(playerId), 'away', slot, initialPosition(playerId))),
  ]
  const playerIds = [...setup.homeSquad, ...setup.awaySquad]
  const position = { x: setup.court.lengthMeters / 2, y: setup.court.widthMeters / 2 }
  const gameClockTenths = setup.clockRules.periodSeconds * 10
  const initial: MatchNextEvent = { sequence: 1, t: 0, period: 1, gameClockTenths, type: 'periodStart' }
  return {
    version: 5,
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
    ...(setup.coachingPlans === undefined ? {} : { coachingPlans: setup.coachingPlans }),
    courtTimeTenthsByPlayerId: Object.fromEntries(playerIds.map((playerId) => [playerId, 0])),
    periodCourtTimeTenthsByPlayerId: Object.fromEntries(playerIds.map((playerId) => [playerId, 0])),
    responsibilities: [],
    decisions: [],
    movementIntents: [],
    offensiveStructure: null,
    defensiveStructure: null,
    reboundState: null,
    transition: null,
    currentDecision: null,
    offenseFlow: null,
    screen: null,
    fouls: { personal: {}, teamPeriod: {}, fouledOut: [], nextSequence: 1 },
    contactEpisodes: [],
    shotValueMemory: { home: INITIAL_SHOT_VALUE_MEMORY, away: INITIAL_SHOT_VALUE_MEMORY },
    freeThrows: null,
    playState: { phase: 'DEAD', sinceT: 0, cause: 'OPENING' },
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

function createMatchPlayer(setup: MatchSetup, playerId: PlayerId, teamId: TeamId, active: boolean, side: 'home' | 'away', slot: number, providedPosition?: CourtPosition): MatchPlayerState {
  const profile = setup.players.find((entry) => entry.playerId === playerId)!
  const position = { ...(providedPosition ?? neutralFoundationPosition(side, slot, setup.court)) }
  const basket = attackingBasketForTeam(teamId, setup.homeTeamId, 1, setup.court)
  const preMatchCareerFatigue = profile.dynamicState?.careerFatigue ?? 0
  const initialFatigue = careerFatigueToMatchSession(preMatchCareerFatigue)
  return {
    playerId, teamId, active, started: active, preMatchCareerFatigue, initialFatigue, fatigue: initialFatigue,
    position, velocity: { x: 0, y: 0 }, facing: unitVector({ x: basket.x - position.x, y: basket.y - position.y }),
    primaryPosition: profile.primaryPosition,
    ...(profile.secondaryPositions === undefined ? {} : { secondaryPositions: [...profile.secondaryPositions] }),
    heightCm: profile.physical.heightCm, weightKg: profile.physical.weightKg, wingspanCm: profile.physical.wingspanCm, standingReachCm: profile.physical.standingReachCm,
    reboundingImpact: profile.rebounding.impact, defensiveMobility: profile.defense.mobility,
    offense: { ...profile.offense }, passing: { accuracy: profile.passing?.accuracy ?? 50, vision: profile.passing?.vision ?? 50, timing: profile.passing?.timing ?? 50 },
    defense: { ...profile.defense }, kinematics: { ...profile.kinematics },
  }
}

function unitVector(value: CourtPosition): CourtPosition {
  const length = Math.hypot(value.x, value.y)
  return length > 1e-9 ? { x: value.x / length, y: value.y / length } : { x: 1, y: 0 }
}
