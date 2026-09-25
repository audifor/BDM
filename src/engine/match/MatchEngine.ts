import type { GameId, PlayerId, TeamId } from '@/domain/ids'
import { distanceBetween } from '@/domain/court'
import { getEcosystemForCompetition, getGame, resolveGameClockRulesForGame, type GameWorld, type ResolvedGameClockRules } from '@/domain/world'
import type { RandomSource } from '@/engine/random'
import { advanceFatigue, createInitialFatigue, type FatigueByPlayerId } from './Fatigue'
import { calculateAssistProbability, selectAssister } from './AssistResolution'
import { calculateDefensiveAssignments } from './Matchups'
import type { DefensiveMatchupOverride } from './Matchups'
import type { MatchPlayerProfile, MatchPlayerProfiles } from './MatchPlayerProfile'
import { calculateOffensiveReboundProbability, selectRebounder } from './ReboundResolution'
import { calculatePassActionProbability, calculatePassCompletionProbability, calculatePassingLaneContext, type PassingLaneDefender } from './PassingResolution'
import { calculateShotLocation, calculateShotMakeProbability, calculateShotZoneWeights, pointsForShotZone, type ShotZone } from './ShotResolution'
import { calculateTurnoverProbability } from './TurnoverResolution'
import { chooseWeighted } from './WeightedChoice'
import { createDefaultTacticalPlan, validateTacticalPlan, type MatchTacticalPlan } from './tactics/MatchTacticalPlan'
import { applyPaceToPossessionDuration, spatialShotAttemptWeight, calculateTacticalDefenseModifier, tacticalUsageWeight } from './tactics/TacticalEffects'
import { clonePlan, type MatchCoachingState } from './coaching/MatchCoachingState'
import { calculateBlockCreditProbability, calculateStealCreditProbability } from './DefensiveAttribution'
import { applySpatialSubstitution, controlBallByPlayer, createInitialSpatialState, getSpatialPossessionView, releaseSpatialBall, type SpatialState } from './SpatialState'
import { assignBaseSpatialTargets, stepPlayersTowardBaseSpacing } from './BaseSpacing'
import { stepPlayersTowardTransitionTargets, type TransitionIntent } from './TransitionSpatial'
import { createOffBallCutIntent, selectOffBallCutter, updateOffBallCutIntent, type OffBallCutIntent } from './OffBallMovement'
import { advanceScreenIntent, createPostScreenIntent, createScreenIntent, reduceScreenedDefenderMovement, screenIntersectsDefenderRoute, selectScreenScreener, type ScreenIntent } from './ScreenInteractions'
import { advanceDriveIntent, reduceDriveHandlerMovement, selectDriveIntent, type DriveIntent } from './DribbleDrives'
import { createOffensiveAction, type OffensiveAction } from './OffensiveActions'
import { selectIsolationContinuation, type IsolationContinuation } from './IsolationOffense'
import { selectPostUpContinuation, type PostUpContinuation } from './PostUpOffense'
import { isPostUpContextValid } from './PostUpMovement'
import { decidePickAndRollScreenUse, selectPickAndRollHandlerContinuation, selectPickAndRollScreenerContinuation, type PickAndRollHandlerContinuation } from './PickAndRollOffense'
import { detectDefensiveThreat, resolveDefensiveReaction, type DefensiveReaction } from './DefensiveReactions'
import { coverageForCurrentScreen } from './DefensiveCoverages'
import { handoffApproachTarget, isHandoffTransferReady, selectHandoffContinuation, transferHandoffBall, validateHandoff, type HandoffContinuation } from './HandoffOffense'

/**
 * Default game-clock rules, used only as the fallback when a game's actual competition cannot
 * be resolved (e.g. legacy/test fixtures). Real matches resolve their period count/length and
 * overtime length from the specific Game's own competition via resolveGameClockRulesForGame —
 * see domain/world/queries.ts. This constant must never be treated as a universal/ecosystem rule.
 */
export const MATCH_RULES_V2 = {
  periodCount: 4,
  periodSeconds: 600,
  overtimeSeconds: 300,
  possessionMinSeconds: 12,
  possessionMaxSeconds: 24,
} as const

/** Compatibility exports for the initial prototype's normal-period rules. */
export const PROTOTYPE_PERIOD_COUNT = MATCH_RULES_V2.periodCount
export const PROTOTYPE_PERIOD_SECONDS = MATCH_RULES_V2.periodSeconds
/** The application must supply at least a legal five-player squad per team. */
export const MINIMUM_MATCH_SQUAD_SIZE = 5

const MAX_OVERTIME_PERIODS = 100
/** Prototype value until shooting fouls become CompetitionRules. */
const SHOOTING_FOUL_PROBABILITY = 0.1
/** Prototype value; free throws do not yet use player ratings. */
const FREE_THROW_MADE_PROBABILITY = 0.75

export interface TeamStrength {
  readonly teamId: TeamId
  readonly value: number
}

export interface MatchSimulationResult {
  readonly gameId: GameId
  /** Transient replay/debug seed; GameWorld persists only the final score. */
  readonly matchSeed?: number
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly homeScore: number
  readonly awayScore: number
}
export interface MatchLineups {
  readonly home: readonly PlayerId[]
  readonly away: readonly PlayerId[]
}

/** Eligible players prepared by Application; MatchEngine never reads team rosters. */
export interface MatchSquads {
  readonly home: readonly PlayerId[]
  readonly away: readonly PlayerId[]
}

export type MatchEvent =
  | MatchPeriodEvent
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'shotMade'
      readonly teamId: TeamId
      readonly playerId: PlayerId
      readonly defenderPlayerId: PlayerId
      readonly points: 2 | 3
      readonly shotZone: ShotZone
      readonly assistPlayerId?: PlayerId
      readonly homeScore: number
      readonly awayScore: number
    }
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'shotMissed'
      readonly teamId: TeamId
      readonly playerId: PlayerId
      readonly defenderPlayerId: PlayerId
      readonly blockedByPlayerId?: PlayerId
      readonly shotZone: ShotZone
      readonly homeScore: number
      readonly awayScore: number
    }
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'turnover'
      readonly teamId: TeamId
      readonly playerId: PlayerId
      readonly turnoverType?: 'failedPass'
      readonly passTargetPlayerId?: PlayerId
      readonly stealPlayerId?: PlayerId
      readonly homeScore: number
      readonly awayScore: number
    }
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'passCompleted'
      readonly teamId: TeamId
      readonly passerPlayerId: PlayerId
      readonly receiverPlayerId: PlayerId
      readonly homeScore: number
      readonly awayScore: number
    }
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'foul'
      readonly teamId: TeamId
      readonly playerId: PlayerId
      readonly foulType: 'shooting'
      readonly homeScore: number
      readonly awayScore: number
    }
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'freeThrowMade' | 'freeThrowMissed'
      readonly teamId: TeamId
      readonly playerId: PlayerId
      readonly homeScore: number
      readonly awayScore: number
    }
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'rebound'
      readonly teamId: TeamId
      readonly playerId: PlayerId
      readonly reboundType: 'offensive' | 'defensive'
      readonly homeScore: number
      readonly awayScore: number
    }
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'substitution'
      readonly teamId: TeamId
      readonly playerOutId: PlayerId
      readonly playerInId: PlayerId
      readonly source?: SubstitutionSource
      readonly homeScore: number
      readonly awayScore: number
    }
  | { readonly sequence: number; readonly period: number; readonly clockSecondsRemaining: number; readonly type: 'tacticalChange'; readonly teamId: TeamId; readonly previousPlan: MatchTacticalPlan; readonly newPlan: MatchTacticalPlan; readonly homeScore: number; readonly awayScore: number }
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: 0
      readonly type: 'gameEnd'
      readonly homeScore: number
      readonly awayScore: number
    }

interface MatchPeriodEvent {
  readonly sequence: number
  readonly period: number
  readonly clockSecondsRemaining: number
  readonly type: 'periodStart' | 'periodEnd'
  readonly homeScore: number
  readonly awayScore: number
}

export interface MatchSimulation {
  readonly gameId: GameId
  /** Transient replay/debug seed; GameWorld persists only the final score. */
  readonly matchSeed?: number
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly lineups: MatchLineups
  readonly squads: MatchSquads
  readonly events: readonly MatchEvent[]
  readonly finalScore: {
    readonly home: number
    readonly away: number
  }
}

export interface SimulateMatchOptions {
  readonly world: GameWorld
  readonly gameId: GameId
  readonly matchSeed?: number
  readonly homeStrength: TeamStrength
  readonly awayStrength: TeamStrength
  readonly squads: MatchSquads
  readonly playerProfiles: MatchPlayerProfiles
  readonly lineups: MatchLineups
  readonly random: RandomSource
  readonly decisionRandom: RandomSource
  readonly actorRandom: RandomSource
  readonly tacticalPlans?: { readonly home: MatchTacticalPlan; readonly away: MatchTacticalPlan }
  readonly defensiveMatchups?: { readonly home:readonly DefensiveMatchupOverride[]; readonly away:readonly DefensiveMatchupOverride[] }
}

/** Immutable sporting state for one transient, resumable match. */
export interface MatchSessionState {
  readonly gameId: GameId
  readonly matchSeed?: number
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  /** Historical starting-five snapshot retained in the completed MatchSimulation. */
  readonly initialLineups: MatchLineups
  /** Current five for each team; substitutions are the only operation that changes it. */
  readonly activeLineups: MatchLineups
  readonly squads: MatchSquads
  readonly fatigueByPlayerId: FatigueByPlayerId
  readonly playerProfiles: MatchPlayerProfiles
  readonly spatial: SpatialState
  readonly offBallCut?: OffBallCutIntent
  readonly screenIntent?: ScreenIntent
  readonly driveIntent?: DriveIntent
  readonly offensiveAction?: OffensiveAction
  readonly defensiveReaction?: DefensiveReaction
  readonly transitionIntent?: TransitionIntent
  readonly coachingState: MatchCoachingState
  readonly defensiveMatchups?: { readonly home:readonly DefensiveMatchupOverride[]; readonly away:readonly DefensiveMatchupOverride[] }
  readonly homeStrength: TeamStrength
  readonly awayStrength: TeamStrength
  /** Resolved from this game's actual competition; see resolveGameClockRulesForGame. Never a global/brand constant. */
  readonly clockRules: ResolvedGameClockRules
  readonly openingTeamId: TeamId
  readonly period: number
  readonly clockSecondsRemaining: number
  readonly homeScore: number
  readonly awayScore: number
  readonly attackingTeamId: TeamId
  readonly passesThisPossession?: number
  readonly nextSequence: number
  readonly events: readonly MatchEvent[]
  readonly isComplete: boolean
}

/** Transient runtime retaining the externally supplied mutable RNG streams between steps. */
export interface MatchSession {
  readonly state: MatchSessionState
  readonly random: RandomSource
  readonly decisionRandom: RandomSource
  readonly actorRandom: RandomSource
}

export interface MatchSessionStepResult {
  readonly session: MatchSession
  readonly newEvents: readonly MatchEvent[]
}

export interface SubstitutePlayerOptions {
  readonly teamId: TeamId
  readonly playerOutId: PlayerId
  readonly playerInId: PlayerId
  readonly source?: SubstitutionSource
}
export type SubstitutionSource = 'automatic' | 'manual'

type PossessionOutcome = 'shootingFoul' | 'fieldGoalAttempt' | 'passAttempt' | 'turnover' | 'handoff' | 'handoffApproach'

export class MatchSimulationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'MatchSimulationError'
  }
}

/** Returns the final projection of the same possession simulation used by MatchViewer. */
export function simulateMatch(options: SimulateMatchOptions): MatchSimulationResult {
  const simulation = simulateMatchDetailed(options)
  return {
    gameId: simulation.gameId,
    ...(simulation.matchSeed === undefined ? {} : { matchSeed: simulation.matchSeed }),
    homeTeamId: simulation.homeTeamId,
    awayTeamId: simulation.awayTeamId,
    homeScore: simulation.finalScore.home,
    awayScore: simulation.finalScore.away,
  }
}

/** Creates a transitory session without resolving a possession. */
export function createMatchSession(options: SimulateMatchOptions): MatchSession {
  const game = validateOptions(options)
  const clockRules = resolveGameClockRulesForGame(options.world, game)
  const ecosystem = getEcosystemForCompetition(options.world, game.competitionId)
  const openingTeamId = options.random.chance(0.5) ? game.homeTeamId : game.awayTeamId
  const spatial = createInitialSpatialState({
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    lineups: options.lineups,
    playerProfiles: options.playerProfiles,
    ecosystemKind: ecosystem.kind,
    category: ecosystem.category,
  })
  const initialEvent: MatchEvent = { sequence: 1, period: 1, clockSecondsRemaining: clockRules.periodSeconds, type: 'periodStart', homeScore: 0, awayScore: 0 }
  return {
    state: {
      gameId: game.id, ...(options.matchSeed === undefined ? {} : { matchSeed: options.matchSeed }), homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId,
      initialLineups: options.lineups, activeLineups: options.lineups, squads: options.squads,
      fatigueByPlayerId: createInitialFatigue(options.squads),
      playerProfiles: options.playerProfiles, spatial, coachingState: { home: { currentTacticalPlan: clonePlan(options.tacticalPlans?.home ?? createDefaultTacticalPlan()) }, away: { currentTacticalPlan: clonePlan(options.tacticalPlans?.away ?? createDefaultTacticalPlan()) } }, defensiveMatchups:options.defensiveMatchups??{home:[],away:[]},
      homeStrength: options.homeStrength, awayStrength: options.awayStrength, clockRules, openingTeamId,
      period: 1, clockSecondsRemaining: clockRules.periodSeconds, homeScore: 0, awayScore: 0,
      attackingTeamId: openingTeamId, passesThisPossession: 0, nextSequence: 2, events: [initialEvent], isComplete: false,
    },
    random: options.random,
    decisionRandom: options.decisionRandom,
    actorRandom: options.actorRandom,
  }
}

/** Records a between-steps substitution without advancing time, score, or either RNG stream. */
export function substitutePlayer(session: MatchSession, substitution: SubstitutePlayerOptions): MatchSession {
  const state = session.state
  if (state.isComplete) throw new MatchSimulationError('Cannot substitute in a completed MatchSession')
  const activeLineups = applySubstitution(state.activeLineups, state.homeTeamId, state.awayTeamId, state.squads, substitution)
  const spatial = applySpatialSubstitution(state.spatial, substitution.teamId, substitution.playerOutId, substitution.playerInId)
  const event: MatchEvent = {
    sequence: state.nextSequence,
    period: state.period,
    clockSecondsRemaining: state.clockSecondsRemaining,
    type: 'substitution',
    teamId: substitution.teamId,
    playerOutId: substitution.playerOutId,
    playerInId: substitution.playerInId,
    source: substitution.source ?? 'manual',
    homeScore: state.homeScore,
    awayScore: state.awayScore,
  }
  const screen = state.screenIntent
  const removesScreenParticipant = screen !== undefined && [screen.screenerId, screen.ballHandlerId, screen.defenderId, screen.screenerDefenderId].includes(substitution.playerOutId)
  const drive = state.driveIntent
  const removesDriveParticipant = drive !== undefined && [drive.handlerId, drive.defenderId].includes(substitution.playerOutId)
  const reaction = state.defensiveReaction
  const removesReactionParticipant = reaction !== undefined && [reaction.defenderId, reaction.protectedPlayerId, reaction.threatPlayerId, reaction.rotationDefenderId, reaction.rotationProtectedPlayerId].includes(substitution.playerOutId)
  const removesActionParticipant = state.offensiveAction?.participantIds.includes(substitution.playerOutId) ?? false
  return { ...session, state: { ...state, activeLineups, spatial, ...(state.offBallCut?.playerId === substitution.playerOutId ? { offBallCut: undefined } : {}), ...(removesScreenParticipant ? { screenIntent: undefined } : {}), ...(removesDriveParticipant ? { driveIntent: undefined } : {}), ...(removesReactionParticipant ? { defensiveReaction: undefined } : {}), ...(removesActionParticipant ? { offensiveAction: undefined } : {}), nextSequence: state.nextSequence + 1, events: [...state.events, event] } }
}

/** Advances one possession action or one period transition. RNG streams mutate only inside this runtime. */
export function stepMatchSession(session: MatchSession): MatchSessionStepResult {
  if (session.state.isComplete) throw new MatchSimulationError('Cannot step a completed MatchSession')
  const state = session.state
  const transitionActive = state.transitionIntent?.attackingTeamId === state.attackingTeamId
  const newEvents: MatchEvent[] = []
  const attackingPlan = state.attackingTeamId === state.homeTeamId ? state.coachingState.home.currentTacticalPlan : state.coachingState.away.currentTacticalPlan
  const possessionDuration = applyPaceToPossessionDuration(session.random.nextInt(MATCH_RULES_V2.possessionMinSeconds, MATCH_RULES_V2.possessionMaxSeconds), attackingPlan.pace)
  if (possessionDuration > state.clockSecondsRemaining) {
    const fatiguedSession = updateSessionFatigue(session, state, state.clockSecondsRemaining)
    return finishPeriod(fatiguedSession, { ...fatiguedSession.state, clockSecondsRemaining: 0 }, newEvents)
  }

  let homeScore = state.homeScore
  let awayScore = state.awayScore
  let sequence = state.nextSequence
  const clockSecondsRemaining = state.clockSecondsRemaining - possessionDuration
  const lineup = state.attackingTeamId === state.homeTeamId ? state.activeLineups.home : state.activeLineups.away
  const profiles = state.attackingTeamId === state.homeTeamId ? state.playerProfiles.home : state.playerProfiles.away
  const controlledBall = state.spatial.ball
  const currentHandler = controlledBall.kind === 'playerControlled' && controlledBall.teamId === state.attackingTeamId && lineup.includes(controlledBall.playerId)
    ? profiles.find((profile) => profile.playerId === controlledBall.playerId)
    : undefined
  const offensiveActor = currentHandler ?? chooseWeighted(lineup.map((playerId) => ({ item: profileForPlayer(profiles, playerId), weight: tacticalUsageWeight(playerId, profileForPlayer(profiles, playerId).offense.usage, lineup, attackingPlan) })), session.decisionRandom)
  const playerId = offensiveActor.playerId
  const defendingTeamId = otherTeamId(state.attackingTeamId, state)
  const defendingLineup = defendingTeamId === state.homeTeamId ? state.activeLineups.home : state.activeLineups.away
  const defendingProfiles = defendingTeamId === state.homeTeamId ? state.playerProfiles.home : state.playerProfiles.away
  const defendingPlan = defendingTeamId === state.homeTeamId ? state.coachingState.home.currentTacticalPlan : state.coachingState.away.currentTacticalPlan
  const matchupOverrides = defendingTeamId === state.homeTeamId ? (state.defensiveMatchups?.home ?? []) : (state.defensiveMatchups?.away ?? [])
  const matchups = calculateDefensiveAssignments(lineup, defendingLineup, [...profiles, ...defendingProfiles], matchupOverrides)
  const assignedPrimaryDefenderId = matchups.find((matchup) => matchup.offensivePlayerId === playerId)?.defensivePlayerId
  if (assignedPrimaryDefenderId === undefined) throw new MatchSimulationError(`Active Player ${playerId} has no primary defender`)
  const handlerId = currentHandler?.playerId
  const assignedHandlerDefenderId = handlerId === undefined ? undefined : matchups.find((matchup) => matchup.offensivePlayerId === handlerId)?.defensivePlayerId
  const savedAction = state.offensiveAction
  const existingCut = state.offBallCut
  const activeCut = existingCut !== undefined
    && !transitionActive
    && existingCut.teamId === state.attackingTeamId
    && existingCut.playerId !== playerId
    && lineup.includes(existingCut.playerId)
    && state.spatial.players.some((player) => player.playerId === existingCut.playerId && player.teamId === state.attackingTeamId)
    && (savedAction?.kind === 'CUT'
      ? savedAction.participantIds.includes(existingCut.playerId)
      : !savedAction?.participantIds.includes(existingCut.playerId))
    ? existingCut
    : undefined
  const activeIsolation = savedAction?.kind === 'ISOLATION'
    && savedAction.teamId === state.attackingTeamId
    && handlerId === savedAction.initiatorId
    && savedAction.participantIds.includes(savedAction.initiatorId)
    && savedAction.participantIds.every((participantId) => lineup.includes(participantId))
    ? savedAction
    : undefined
  const possessionView = getSpatialPossessionView({ homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId, attackingTeamId: state.attackingTeamId, period: state.period, spatial: state.spatial })
  const attackingBasket = possessionView.attackingBasket
  const activePostUp = savedAction?.kind === 'POST_UP'
    && savedAction.teamId === state.attackingTeamId
    && handlerId === savedAction.initiatorId
    && savedAction.participantIds.includes(savedAction.initiatorId)
    && savedAction.participantIds.every((participantId) => lineup.includes(participantId))
    && assignedHandlerDefenderId !== undefined
    && isPostUpContextValid({ postPlayerId: savedAction.initiatorId, defenderId: assignedHandlerDefenderId, spatial: state.spatial, attackingBasket })
    ? savedAction
    : undefined
  const handoff = !transitionActive && state.screenIntent === undefined
    ? validateHandoff({ action: savedAction, teamId: state.attackingTeamId, activeLineup: lineup, spatial: state.spatial })
    : undefined
  const handoffConflictsWithCut = handoff !== undefined && (existingCut?.playerId === handoff.giverId || existingCut?.playerId === handoff.receiverId)
  const handoffConflictsWithDrive = handoff !== undefined && (state.driveIntent?.handlerId === handoff.giverId || state.driveIntent?.handlerId === handoff.receiverId)
  const activeHandoff = handoffConflictsWithCut || handoffConflictsWithDrive ? undefined : handoff
  const savedScreen = state.screenIntent
  const activeScreen = savedScreen !== undefined
    && !transitionActive
    && state.offensiveAction?.kind === 'PICK_AND_ROLL'
    && state.offensiveAction.teamId === state.attackingTeamId
    && state.offensiveAction.initiatorId === savedScreen.ballHandlerId
    && state.offensiveAction.participantIds.includes(savedScreen.screenerId)
    && handlerId === savedScreen.ballHandlerId
    && savedScreen.defenderId === assignedHandlerDefenderId
    && (savedScreen.screenerDefenderId === undefined || savedScreen.screenerDefenderId === matchups.find((matchup) => matchup.offensivePlayerId === savedScreen.screenerId)?.defensivePlayerId)
    && lineup.includes(savedScreen.screenerId)
    && defendingLineup.includes(savedScreen.defenderId)
    ? savedScreen
    : undefined
  let screenForMovement: ScreenIntent | undefined = activeScreen
  let cutForMovement = activeCut
  const canStartOffBallAction = !transitionActive && activeIsolation === undefined && activePostUp === undefined && activeHandoff === undefined && state.screenIntent === undefined && state.offBallCut === undefined
  let offensiveAction = activeIsolation ?? activePostUp ?? (activeHandoff === undefined ? state.offensiveAction : savedAction)
  if (screenForMovement !== undefined && (offensiveAction?.kind !== 'PICK_AND_ROLL' || offensiveAction.teamId !== state.attackingTeamId || offensiveAction.initiatorId !== screenForMovement.ballHandlerId || !offensiveAction.participantIds.includes(screenForMovement.screenerId))) {
    offensiveAction = createOffensiveAction({ kind: 'PICK_AND_ROLL', teamId: state.attackingTeamId, initiatorId: screenForMovement.ballHandlerId, participantIds: [screenForMovement.ballHandlerId, screenForMovement.screenerId], activeLineup: lineup })
  }
  if (screenForMovement === undefined && cutForMovement === undefined && canStartOffBallAction && handlerId !== undefined && assignedHandlerDefenderId !== undefined) {
    const screenerId = selectScreenScreener(lineup, profiles, handlerId, existingCut?.playerId, session.decisionRandom)
    if (screenerId !== undefined) {
      offensiveAction = createOffensiveAction({ kind: 'PICK_AND_ROLL', teamId: state.attackingTeamId, initiatorId: handlerId, participantIds: [handlerId, screenerId], activeLineup: lineup })
      if (offensiveAction.kind === 'PICK_AND_ROLL') screenForMovement = createScreenIntent({ screenerId, ballHandlerId: offensiveAction.initiatorId, defenderId: assignedHandlerDefenderId, screenerDefenderId: matchups.find((matchup) => matchup.offensivePlayerId === screenerId)?.defensivePlayerId, spatial: state.spatial, attackingBasket })
    }
  }
  if (screenForMovement === undefined && cutForMovement === undefined && canStartOffBallAction) {
    const cutPlayerId = selectOffBallCutter({ teamId: state.attackingTeamId, lineup, profiles, ballHandlerId: playerId, matchups, spatial: state.spatial, attackingBasket, random: session.decisionRandom })
    if (cutPlayerId !== undefined) {
      offensiveAction = createOffensiveAction({ kind: 'CUT', teamId: state.attackingTeamId, initiatorId: cutPlayerId, participantIds: [cutPlayerId, playerId], activeLineup: lineup })
      if (offensiveAction.kind === 'CUT') cutForMovement = createOffBallCutIntent({ teamId: offensiveAction.teamId, playerId: cutPlayerId, spatial: state.spatial, attackingBasket })
    }
  }
  const canAddSecondaryCut = !transitionActive
    && cutForMovement === undefined
    && existingCut === undefined
    && handlerId !== undefined
    && ((screenForMovement !== undefined && offensiveAction?.kind === 'PICK_AND_ROLL')
      || (activeIsolation !== undefined && offensiveAction?.kind === 'ISOLATION')
      || (activePostUp !== undefined && offensiveAction?.kind === 'POST_UP')
      || (activeHandoff !== undefined && !activeHandoff.transferred && offensiveAction?.kind === 'HANDOFF'))
  if (canAddSecondaryCut && offensiveAction !== undefined) {
    const cutPlayerId = selectOffBallCutter({ teamId: state.attackingTeamId, lineup, profiles, ballHandlerId: playerId, excludedPlayerIds: offensiveAction.participantIds, matchups, spatial: state.spatial, attackingBasket, random: session.decisionRandom })
    if (cutPlayerId !== undefined) cutForMovement = createOffBallCutIntent({ teamId: state.attackingTeamId, playerId: cutPlayerId, spatial: state.spatial, attackingBasket })
  }
  const baseInput = {
    homeTeamId: state.homeTeamId,
    awayTeamId: state.awayTeamId,
    attackingTeamId: state.attackingTeamId,
    period: state.period,
    activeLineups: state.activeLineups,
    playerProfiles: state.playerProfiles,
    spatial: controlBallByPlayer(state.spatial, playerId),
    ballHandlerId: playerId,
  }
  const baseTargets = assignBaseSpatialTargets(baseInput)
  const candidateCoverage = coverageForCurrentScreen({ plan: defendingPlan, screen: screenForMovement, offensiveLineup: lineup, defensiveLineup: defendingLineup, assignments: matchups, spatial: state.spatial, attackingBasket })
  const screenRouteDefenderId = candidateCoverage?.state.type === 'switch'
    ? candidateCoverage.assignments.find((matchup) => matchup.offensivePlayerId === handlerId)?.defensivePlayerId
    : screenForMovement?.defenderId
  const defenderTarget = candidateCoverage?.targetOverrides.find((target) => target.playerId === screenRouteDefenderId)?.position
    ?? baseTargets.defensive.find((target) => target.playerId === screenRouteDefenderId)?.position
  let screenAffectsDefender = screenForMovement?.phase === 'set'
    && screenRouteDefenderId !== undefined
    && screenIntersectsDefenderRoute({ screen: { ...screenForMovement, defenderId: screenRouteDefenderId }, spatial: baseInput.spatial, defenderTarget })
  const screenDecision = screenForMovement === undefined ? undefined : decidePickAndRollScreenUse({ screen: screenForMovement, screenAffectsDefender })
  if (screenDecision === 'REJECT_SCREEN') {
    screenForMovement = undefined
    offensiveAction = undefined
    screenAffectsDefender = false
  }
  let coverage = screenForMovement === undefined ? undefined : candidateCoverage
  let effectiveMatchups = coverage?.assignments ?? matchups
  let primaryDefenderId = effectiveMatchups.find((matchup) => matchup.offensivePlayerId === playerId)?.defensivePlayerId
  let handlerDefenderId = handlerId === undefined ? undefined : effectiveMatchups.find((matchup) => matchup.offensivePlayerId === handlerId)?.defensivePlayerId
  if (primaryDefenderId === undefined) throw new MatchSimulationError(`Active Player ${playerId} has no primary defender`)
  const savedDrive = state.driveIntent
  let driveForMovement: DriveIntent | undefined = savedDrive !== undefined
    && !transitionActive
    && handlerId === savedDrive.handlerId
    && handlerDefenderId === savedDrive.defenderId
    && lineup.includes(savedDrive.handlerId)
    && defendingLineup.includes(savedDrive.defenderId)
    ? savedDrive
    : undefined
  if (!transitionActive && activeIsolation === undefined && activePostUp === undefined && activeHandoff === undefined && savedDrive === undefined && handlerId !== undefined && handlerDefenderId !== undefined) {
    const handler = profiles.find((profile) => profile.playerId === handlerId)
    if (handler !== undefined) driveForMovement = selectDriveIntent({ handler, defenderId: handlerDefenderId, spatial: state.spatial, attackingBasket, random: session.decisionRandom })
  }
  let pickAndRollContinuation: PickAndRollHandlerContinuation | undefined
  if (screenForMovement !== undefined && screenForMovement.phase !== 'approach' && offensiveAction?.kind === 'PICK_AND_ROLL' && handlerId !== undefined) {
    const handler = profiles.find((profile) => profile.playerId === handlerId)
    if (handler !== undefined) {
      pickAndRollContinuation = selectPickAndRollHandlerContinuation({ handler, screen: screenForMovement, coverage: coverage?.state.type, driveAvailable: driveForMovement !== undefined, passesThisPossession: state.passesThisPossession ?? 0, activeLineup: lineup, spatial: baseInput.spatial, random: session.decisionRandom })
      if (pickAndRollContinuation !== 'HANDLER_DRIVE') driveForMovement = undefined
      if (pickAndRollContinuation === 'RESET') {
        screenForMovement = undefined
        offensiveAction = undefined
        coverage = undefined
        effectiveMatchups = matchups
        primaryDefenderId = effectiveMatchups.find((matchup) => matchup.offensivePlayerId === playerId)?.defensivePlayerId
        handlerDefenderId = effectiveMatchups.find((matchup) => matchup.offensivePlayerId === handlerId)?.defensivePlayerId
        screenAffectsDefender = false
      }
    }
  }
  let isolationContinuation: IsolationContinuation | undefined
  if (activeIsolation !== undefined && handlerId !== undefined && handlerDefenderId !== undefined) {
    if (driveForMovement !== undefined && driveForMovement.handlerId === handlerId) {
      isolationContinuation = 'DRIVE'
    } else {
      const handler = profiles.find((profile) => profile.playerId === handlerId)
      if (handler !== undefined) {
        const read = selectIsolationContinuation({ handler, teamId: state.attackingTeamId, defenderId: handlerDefenderId, activeLineup: lineup, spatial: baseInput.spatial, attackingBasket, passesThisPossession: state.passesThisPossession ?? 0, random: session.decisionRandom })
        isolationContinuation = read.continuation
        driveForMovement = read.driveIntent
        if (read.continuation === 'RESET') offensiveAction = undefined
      }
    }
  }
  let handoffContinuation: HandoffContinuation | undefined
  if (activeHandoff?.transferred && handlerId === activeHandoff.receiverId && handlerDefenderId !== undefined) {
    const handler = profiles.find((profile) => profile.playerId === handlerId)
    if (handler !== undefined) {
      const read = selectHandoffContinuation({ handler, teamId: state.attackingTeamId, defenderId: handlerDefenderId, activeLineup: lineup, spatial: baseInput.spatial, attackingBasket, passesThisPossession: state.passesThisPossession ?? 0, random: session.decisionRandom })
      handoffContinuation = read.continuation
      if (read.continuation === 'DRIVE') driveForMovement = read.driveIntent
      offensiveAction = undefined
    }
  }
  let postUpContinuation: PostUpContinuation | undefined
  let postUpTarget: { readonly playerId: PlayerId; readonly position: { readonly x: number; readonly y: number } } | undefined
  if (activePostUp !== undefined && handlerId !== undefined && handlerDefenderId !== undefined) {
    const postPlayer = profiles.find((profile) => profile.playerId === handlerId)
    const defender = defendingProfiles.find((profile) => profile.playerId === handlerDefenderId)
    if (postPlayer !== undefined && defender !== undefined) {
      const read = selectPostUpContinuation({ postPlayer, defender, teamId: state.attackingTeamId, activeLineup: lineup, spatial: baseInput.spatial, attackingBasket, passesThisPossession: state.passesThisPossession ?? 0, random: session.decisionRandom })
      postUpContinuation = read.continuation
      driveForMovement = undefined
      if (read.continuation === 'BACK_DOWN' && read.backDownTarget !== undefined) {
        postUpTarget = { playerId: handlerId, position: read.backDownTarget }
      } else if (read.continuation === 'POST_SHOT') {
        const position = baseInput.spatial.players.find((player) => player.playerId === handlerId)?.position
        if (position !== undefined) postUpTarget = { playerId: handlerId, position }
      }
      if (read.continuation === 'RESET') offensiveAction = undefined
    }
  }
  if (primaryDefenderId === undefined) throw new MatchSimulationError(`Active Player ${playerId} has no primary defender`)
  const screenScreenerPosition = screenForMovement?.phase === 'set' ? baseInput.spatial.players.find((player) => player.playerId === screenForMovement.screenerId)?.position : undefined
  const screenTarget = screenForMovement?.phase === 'postScreen' ? screenForMovement.postScreenTarget : screenForMovement?.target
  const screenOverride = screenForMovement === undefined ? [] : [{ playerId: screenForMovement.screenerId, position: screenScreenerPosition ?? screenTarget ?? screenForMovement.target }]
  let movementProfiles = screenAffectsDefender && screenRouteDefenderId !== undefined ? reduceScreenedDefenderMovement(state.playerProfiles, screenRouteDefenderId) : state.playerProfiles
  if (driveForMovement !== undefined) movementProfiles = reduceDriveHandlerMovement(movementProfiles, driveForMovement.handlerId)
  const movementThreat = detectDefensiveThreat({
    drive: driveForMovement === undefined ? undefined : { playerId: driveForMovement.handlerId, target: driveForMovement.target },
    cut: cutForMovement === undefined ? undefined : { playerId: cutForMovement.playerId, type: cutForMovement.type, target: cutForMovement.target },
    roll: screenForMovement?.phase === 'postScreen' && screenForMovement.postScreenAction !== undefined && screenForMovement.postScreenTarget !== undefined ? { playerId: screenForMovement.screenerId, action: screenForMovement.postScreenAction, target: screenForMovement.postScreenTarget } : undefined,
    spatial: baseInput.spatial,
    attackingBasket,
  })
  const movementReaction = transitionActive
    ? { targetOverrides: [] }
    : resolveDefensiveReaction({ threat: movementThreat, previous: state.defensiveReaction, assignments: effectiveMatchups, defensiveLineup: defendingLineup, excludedDefenderIds: coverage?.committedDefenderIds, baseTargets, spatial: baseInput.spatial, attackingBasket })
  const handoffApproachPosition = activeHandoff === undefined || activeHandoff.transferred ? undefined : handoffApproachTarget(baseInput.spatial, activeHandoff.giverId)
  const targetOverrides = [
    ...(cutForMovement === undefined ? [] : [{ playerId: cutForMovement.playerId, position: cutForMovement.target }]),
    ...(activeHandoff === undefined || activeHandoff.transferred || handoffApproachPosition === undefined ? [] : [{ playerId: activeHandoff.giverId, position: handoffApproachPosition }]),
    ...(activeHandoff === undefined || activeHandoff.transferred || handoffApproachPosition === undefined ? [] : [{ playerId: activeHandoff.receiverId, position: handoffApproachPosition }]),
    ...screenOverride,
    ...(driveForMovement === undefined ? [] : [{ playerId: driveForMovement.handlerId, position: driveForMovement.target }]),
    ...(postUpTarget === undefined ? [] : [postUpTarget]),
    ...movementReaction.targetOverrides,
    ...(coverage?.state.phase === 'ACTIVE' ? coverage.targetOverrides : []),
  ]
  let spatial = transitionActive
    ? stepPlayersTowardTransitionTargets({ ...baseInput, attackingTeamId: state.attackingTeamId }, possessionDuration)
    : stepPlayersTowardBaseSpacing({ ...baseInput, playerProfiles: movementProfiles }, possessionDuration, targetOverrides)
  const cutReceiver = cutForMovement === undefined ? undefined : spatial.players.find((player) => player.playerId === cutForMovement?.playerId)
  const cutterIsAvailableReceiver = cutForMovement !== undefined
    && cutReceiver !== undefined
    && distanceBetween(cutReceiver.position, cutForMovement.target) <= 0.75
  const progressedCut = updateOffBallCutIntent(cutForMovement, { teamId: state.attackingTeamId, lineup, ballHandlerId: playerId, spatial })
  const progressedDrive = advanceDriveIntent(driveForMovement, spatial)
  let progressedScreen = advanceScreenIntent(screenForMovement, spatial)
  if (progressedScreen === undefined && screenForMovement?.phase === 'set' && screenForMovement.stepsRemaining <= 1) {
    const screener = profiles.find((profile) => profile.playerId === screenForMovement.screenerId)
    if (screener !== undefined) {
      const action = selectPickAndRollScreenerContinuation(screener, session.decisionRandom)
      progressedScreen = createPostScreenIntent({ intent: screenForMovement, spatial, attackingBasket, action })
    }
  }
  const primaryDefender = profileForPlayer(defendingProfiles, primaryDefenderId)
  const shooterSpatial = spatial.players.find((player) => player.playerId === playerId)
  if (shooterSpatial === undefined) throw new MatchSimulationError(`Active shooter ${playerId} is missing from SpatialState`)
  const shotLocation = calculateShotLocation(shooterSpatial.position, attackingBasket, spatial.court)
  const shotZone = shotLocation.shotZone
  const shotAttemptWeight = spatialShotAttemptWeight(calculateShotZoneWeights(offensiveActor), attackingPlan, shotZone)
  const turnoverProbability = calculateTurnoverProbability({ ballHandlerProfile: offensiveActor, ballHandlerFatigue: state.fatigueByPlayerId[playerId] ?? 0, defenderProfile: primaryDefender, defenderFatigue: state.fatigueByPlayerId[primaryDefenderId] ?? 0 })
  const handoffTransferReady = activeHandoff !== undefined && !activeHandoff.transferred
    && isHandoffTransferReady(spatial, activeHandoff.giverId, activeHandoff.receiverId)
  const passActionProbability = postUpContinuation === 'PASS_OUT' || isolationContinuation === 'PASS' || handoffContinuation === 'PASS' || pickAndRollContinuation === 'PASS_TO_ROLLER' || pickAndRollContinuation === 'PASS_TO_POPPER'
    ? 1
    : postUpContinuation === 'POST_SHOT' || isolationContinuation === 'DRIVE' || isolationContinuation === 'SHOT' || handoffContinuation === 'DRIVE' || handoffContinuation === 'SHOT' || pickAndRollContinuation === 'HANDLER_DRIVE' || pickAndRollContinuation === 'HANDLER_SHOT'
      ? 0
      : calculatePassActionProbability(offensiveActor.tendencies.PASS_FIRST_BIAS ?? 0, state.passesThisPossession ?? 0)
  const selectedShotWeight = postUpContinuation === 'POST_SHOT' || isolationContinuation === 'SHOT' || handoffContinuation === 'SHOT' || pickAndRollContinuation === 'HANDLER_SHOT' ? Math.max(shotAttemptWeight, 1) : shotAttemptWeight
  const outcome = activeHandoff !== undefined && !activeHandoff.transferred
    ? handoffTransferReady ? 'handoff' : 'handoffApproach'
    : choosePossessionOutcome(turnoverProbability, passActionProbability, selectedShotWeight, session.random)
  let attackingTeamId = state.attackingTeamId
  let passesThisPossession = state.passesThisPossession ?? 0

  if (outcome === 'handoff') {
    const transferred = activeHandoff === undefined ? undefined : transferHandoffBall({ spatial, teamId: state.attackingTeamId, giverId: activeHandoff.giverId, receiverId: activeHandoff.receiverId, activeLineup: lineup })
    if (transferred === undefined) throw new MatchSimulationError('A ready handoff failed canonical ball transfer validation')
    spatial = transferred
  } else if (outcome === 'handoffApproach') {
    // Keep the handoff primary while MG6 advances the receiver toward the giver.
  } else if (outcome === 'shootingFoul') {
    newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'foul', teamId: defendingTeamId, playerId: primaryDefenderId, foulType: 'shooting', homeScore, awayScore })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (session.random.chance(FREE_THROW_MADE_PROBABILITY)) {
        if (attackingTeamId === state.homeTeamId) homeScore += 1
        else awayScore += 1
        newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'freeThrowMade', teamId: attackingTeamId, playerId, homeScore, awayScore })
      } else {
        newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'freeThrowMissed', teamId: attackingTeamId, playerId, homeScore, awayScore })
      }
    }
    attackingTeamId = defendingTeamId
    spatial = releaseSpatialBall(spatial)
    passesThisPossession = 0
  } else if (outcome === 'passAttempt') {
    const receiverCandidates = lineup.filter((candidateId) => candidateId !== playerId)
    const receiverPlayerId = pickAndRollContinuation === 'PASS_TO_ROLLER' || pickAndRollContinuation === 'PASS_TO_POPPER'
      ? screenForMovement?.screenerId
      : cutterIsAvailableReceiver && cutForMovement !== undefined && receiverCandidates.includes(cutForMovement.playerId)
        ? cutForMovement.playerId
        : session.decisionRandom.pick(receiverCandidates)
    if (receiverPlayerId === undefined || !receiverCandidates.includes(receiverPlayerId)) throw new MatchSimulationError('Selected pass target must be an active teammate')
    const passerSpatial = spatial.players.find((player) => player.playerId === playerId)
    const receiverSpatial = spatial.players.find((player) => player.playerId === receiverPlayerId)
    if (passerSpatial === undefined || receiverSpatial === undefined) throw new MatchSimulationError('Pass actors must both have active SpatialState positions')
    const laneDefenders: PassingLaneDefender[] = spatial.players
      .filter((player) => player.teamId === defendingTeamId)
      .map((player) => {
        const defenderProfile = profileForPlayer(defendingProfiles, player.playerId)
        return { playerId: player.playerId, position: player.position, stealAbility: defenderProfile.defense.steal ?? defenderProfile.defense.pointOfAttack }
      })
    const laneContext = calculatePassingLaneContext(passerSpatial.position, receiverSpatial.position, laneDefenders)
    const completionProbability = calculatePassCompletionProbability({ passer: offensiveActor, passLengthMeters: laneContext.passLengthMeters, lanePressure: laneContext.lanePressure })
    if (session.random.chance(completionProbability)) {
      newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'passCompleted', teamId: attackingTeamId, passerPlayerId: playerId, receiverPlayerId, homeScore, awayScore })
      spatial = controlBallByPlayer(spatial, receiverPlayerId)
      passesThisPossession += 1
    } else {
      const interceptorId = laneContext.mostDangerousDefenderId
      const stealPlayerId = interceptorId !== undefined && session.decisionRandom.chance(calculateStealCreditProbability(profileForPlayer(defendingProfiles, interceptorId)))
        ? interceptorId
        : undefined
      newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'turnover', teamId: attackingTeamId, playerId, turnoverType: 'failedPass', passTargetPlayerId: receiverPlayerId, ...(stealPlayerId === undefined ? {} : { stealPlayerId }), homeScore, awayScore })
      attackingTeamId = defendingTeamId
      spatial = stealPlayerId === undefined ? releaseSpatialBall(spatial) : controlBallByPlayer(spatial, stealPlayerId)
      passesThisPossession = 0
    }
  } else if (outcome === 'fieldGoalAttempt') {
    const defenderSpatial = spatial.players.find((player) => player.playerId === primaryDefenderId)
    const defenderDistanceMeters = defenderSpatial === undefined ? undefined : distanceBetween(shooterSpatial.position, defenderSpatial.position)
    const made = session.random.chance(calculateShotMakeProbability({ shotZone, shotDistanceMeters: shotLocation.distanceMeters, defenderDistanceMeters, shooterProfile: offensiveActor, shooterFatigue: state.fatigueByPlayerId[playerId] ?? 0, defenderProfile: primaryDefender, defenderFatigue: state.fatigueByPlayerId[primaryDefenderId] ?? 0, tacticalDefenseModifier: calculateTacticalDefenseModifier(defendingPlan, shotZone) }))
    const points = pointsForShotZone(shotZone)
    if (made) {
      const assistCandidates = lineup.filter((candidateId) => candidateId !== playerId).map((candidateId) => profileForPlayer(profiles, candidateId))
      const assistPlayerId = !session.actorRandom.chance(calculateAssistProbability({ shotZone, teammateProfiles: assistCandidates })) ? undefined : selectAssister(assistCandidates, session.actorRandom).playerId
      if (attackingTeamId === state.homeTeamId) homeScore += points
      else awayScore += points
      newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'shotMade', teamId: attackingTeamId, playerId, defenderPlayerId: primaryDefenderId, ...(assistPlayerId === undefined ? {} : { assistPlayerId }), points, shotZone, homeScore, awayScore })
      attackingTeamId = otherTeamId(attackingTeamId, state)
      spatial = releaseSpatialBall(spatial)
      passesThisPossession = 0
    } else {
      const blockedByPlayerId = session.actorRandom.chance(calculateBlockCreditProbability(primaryDefender, shotZone)) ? primaryDefenderId : undefined
      newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'shotMissed', teamId: attackingTeamId, playerId, defenderPlayerId: primaryDefenderId, ...(blockedByPlayerId === undefined ? {} : { blockedByPlayerId }), shotZone, homeScore, awayScore })
      const distanceToBasketMetersByPlayerId = Object.fromEntries(spatial.players.map((player) => [player.playerId, distanceBetween(player.position, attackingBasket)]))
      const reboundSpatialContext = { distanceToBasketMetersByPlayerId }
      const offensiveReboundProbability = calculateOffensiveReboundProbability({ offensiveProfiles: lineup.map((candidateId) => profileForPlayer(profiles, candidateId)), defensiveProfiles: defendingLineup.map((candidateId) => profileForPlayer(defendingProfiles, candidateId)), ...reboundSpatialContext })
      const reboundType = session.random.chance(offensiveReboundProbability) ? 'offensive' : 'defensive'
      const reboundTeamId = reboundType === 'offensive' ? attackingTeamId : otherTeamId(attackingTeamId, state)
      const reboundLineup = reboundTeamId === state.homeTeamId ? state.activeLineups.home : state.activeLineups.away
      const reboundProfiles = reboundTeamId === state.homeTeamId ? state.playerProfiles.home : state.playerProfiles.away
      // The rebounder becomes the spatial ball owner, so selecting one belongs to the decision
      // stream; stat attribution draws must not alter possession geometry or match outcomes.
      const reboundPlayerId = selectRebounder(reboundLineup.map((candidateId) => profileForPlayer(reboundProfiles, candidateId)), session.decisionRandom, reboundSpatialContext).playerId
      newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'rebound', teamId: reboundTeamId, playerId: reboundPlayerId, reboundType, homeScore, awayScore })
      attackingTeamId = reboundTeamId
      spatial = controlBallByPlayer(spatial, reboundPlayerId)
      if (reboundTeamId !== state.attackingTeamId) passesThisPossession = 0
    }
  } else {
    const stealPlayerId = session.decisionRandom.chance(calculateStealCreditProbability(primaryDefender)) ? primaryDefenderId : undefined
    newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'turnover', teamId: attackingTeamId, playerId, ...(stealPlayerId === undefined ? {} : { stealPlayerId }), homeScore, awayScore })
    attackingTeamId = otherTeamId(attackingTeamId, state)
    spatial = stealPlayerId === undefined ? releaseSpatialBall(spatial) : controlBallByPlayer(spatial, stealPlayerId)
    passesThisPossession = 0
  }

  const cutRemainsOffBall = spatial.ball.kind !== 'playerControlled' || spatial.ball.playerId !== progressedCut?.playerId
  const offBallCut = attackingTeamId === state.attackingTeamId && cutRemainsOffBall ? progressedCut : undefined
  const screenRetainsHandler = spatial.ball.kind === 'playerControlled' && spatial.ball.teamId === state.attackingTeamId && spatial.ball.playerId === progressedScreen?.ballHandlerId
  const screenIntent = attackingTeamId === state.attackingTeamId && screenRetainsHandler ? progressedScreen : undefined
  const driveRetainsHandler = spatial.ball.kind === 'playerControlled' && spatial.ball.teamId === state.attackingTeamId && spatial.ball.playerId === progressedDrive?.handlerId
  const driveIntent = attackingTeamId === state.attackingTeamId && driveRetainsHandler ? progressedDrive : undefined
  const possessionFlipped = attackingTeamId !== state.attackingTeamId
  const nextHandlerId = spatial.ball.kind === 'playerControlled' && spatial.ball.teamId === attackingTeamId ? spatial.ball.playerId : undefined
  const secondaryCutRetainsPrimaryAction = offBallCut !== undefined
    && offensiveAction !== undefined
    && offensiveAction.teamId === attackingTeamId
    && offensiveAction.initiatorId === nextHandlerId
    && offensiveAction.participantIds.every((participantId) => lineup.includes(participantId))
    && (offensiveAction.kind === 'PICK_AND_ROLL' || offensiveAction.kind === 'ISOLATION' || offensiveAction.kind === 'POST_UP' || (offensiveAction.kind === 'HANDOFF' && handoffContinuation === undefined))
  const activeOffensiveAction = attackingTeamId === state.attackingTeamId
    && ((screenIntent !== undefined && offensiveAction?.kind === 'PICK_AND_ROLL')
      || (offBallCut !== undefined && offensiveAction?.kind === 'CUT' && offensiveAction.participantIds.includes(offBallCut.playerId))
      || (offensiveAction?.kind === 'HANDOFF' && handoffContinuation === undefined && activeHandoff !== undefined)
      || secondaryCutRetainsPrimaryAction)
    ? offensiveAction
    : undefined
  const nextThreat = possessionFlipped ? undefined : detectDefensiveThreat({
    drive: driveIntent === undefined ? undefined : { playerId: driveIntent.handlerId, target: driveIntent.target },
    cut: offBallCut === undefined ? undefined : { playerId: offBallCut.playerId, type: offBallCut.type, target: offBallCut.target },
    roll: screenIntent?.phase === 'postScreen' && screenIntent.postScreenAction !== undefined && screenIntent.postScreenTarget !== undefined ? { playerId: screenIntent.screenerId, action: screenIntent.postScreenAction, target: screenIntent.postScreenTarget } : undefined,
    spatial,
    attackingBasket,
  })
  const nextBaseTargets = possessionFlipped ? baseTargets : assignBaseSpatialTargets({ ...baseInput, spatial, ballHandlerId: nextHandlerId })
  let defensiveReaction: DefensiveReaction | undefined
  if (!possessionFlipped && !transitionActive) {
    if (nextThreat !== undefined) {
      defensiveReaction = resolveDefensiveReaction({ threat: nextThreat, previous: movementReaction.reaction ?? state.defensiveReaction, assignments: effectiveMatchups, defensiveLineup: defendingLineup, excludedDefenderIds: coverage?.committedDefenderIds, baseTargets: nextBaseTargets, spatial, attackingBasket }).reaction
    } else if (movementReaction.reaction?.phase === 'RECOVER') {
      defensiveReaction = movementReaction.reaction
    } else {
      defensiveReaction = resolveDefensiveReaction({ previous: movementReaction.reaction ?? state.defensiveReaction, assignments: effectiveMatchups, defensiveLineup: defendingLineup, excludedDefenderIds: coverage?.committedDefenderIds, baseTargets: nextBaseTargets, spatial, attackingBasket }).reaction
    }
  }
  const transitionIntent = possessionFlipped ? { attackingTeamId } : undefined
  const stateAfterAction = { ...state, clockSecondsRemaining, homeScore, awayScore, attackingTeamId, spatial, offBallCut, screenIntent, driveIntent, offensiveAction: activeOffensiveAction, defensiveReaction, transitionIntent, passesThisPossession, nextSequence: sequence }
  const fatiguedSession = updateSessionFatigue(session, stateAfterAction, possessionDuration)
  if (clockSecondsRemaining === 0) return finishPeriod(fatiguedSession, fatiguedSession.state, newEvents)
  const nextState = { ...fatiguedSession.state, events: [...state.events, ...newEvents] }
  return { session: { ...fatiguedSession, state: nextState }, newEvents }
}

function updateSessionFatigue(session: MatchSession, state: MatchSessionState, elapsedSeconds: number): MatchSession {
  return { ...session, state: { ...state, fatigueByPlayerId: advanceFatigue(state.fatigueByPlayerId, state.squads, state.activeLineups, elapsedSeconds) } }
}

/** Converts a completed transient session into the existing MatchSimulation contract. */
export function toMatchSimulation(session: MatchSession): MatchSimulation {
  const state = session.state
  if (!state.isComplete) throw new MatchSimulationError('Cannot convert an incomplete MatchSession to MatchSimulation')
  return { gameId: state.gameId, ...(state.matchSeed === undefined ? {} : { matchSeed: state.matchSeed }), homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId, lineups: state.initialLineups, squads: state.squads, events: state.events, finalScore: { home: state.homeScore, away: state.awayScore } }
}

/** Runs the single incremental MatchSession engine through completion. */
export function simulateMatchDetailed(options: SimulateMatchOptions): MatchSimulation {
  let session = createMatchSession(options)
  while (!session.state.isComplete) session = stepMatchSession(session).session
  return toMatchSimulation(session)
}

function finishPeriod(session: MatchSession, state: MatchSessionState, newEvents: MatchEvent[]): MatchSessionStepResult {
  let sequence = state.nextSequence
  const periodEnd: MatchEvent = { sequence: sequence++, period: state.period, clockSecondsRemaining: 0, type: 'periodEnd', homeScore: state.homeScore, awayScore: state.awayScore }
  newEvents.push(periodEnd)

  if (state.period >= state.clockRules.periodCount && state.homeScore !== state.awayScore) {
    const gameEnd: MatchEvent = { sequence, period: state.period, clockSecondsRemaining: 0, type: 'gameEnd', homeScore: state.homeScore, awayScore: state.awayScore }
    newEvents.push(gameEnd)
    const completeState = { ...state, spatial: releaseSpatialBall(state.spatial), offBallCut: undefined, screenIntent: undefined, driveIntent: undefined, offensiveAction: undefined, defensiveReaction: undefined, transitionIntent: undefined, passesThisPossession: 0, nextSequence: sequence + 1, events: [...state.events, ...newEvents], isComplete: true }
    return { session: { ...session, state: completeState }, newEvents }
  }
  if (state.period >= state.clockRules.periodCount + MAX_OVERTIME_PERIODS) {
    throw new MatchSimulationError('Match did not resolve after the maximum overtime protection')
  }

  const period = state.period + 1
  const clockSecondsRemaining = secondsForPeriod(period, state.clockRules)
  const attackingTeamId = period % 2 === 1 ? state.openingTeamId : otherTeamId(state.openingTeamId, state)
  const periodStart: MatchEvent = { sequence: sequence++, period, clockSecondsRemaining, type: 'periodStart', homeScore: state.homeScore, awayScore: state.awayScore }
  newEvents.push(periodStart)
  const nextState = { ...state, period, clockSecondsRemaining, attackingTeamId, offBallCut: undefined, screenIntent: undefined, driveIntent: undefined, offensiveAction: undefined, defensiveReaction: undefined, transitionIntent: undefined, passesThisPossession: 0, spatial: releaseSpatialBall(state.spatial), nextSequence: sequence, events: [...state.events, ...newEvents] }
  return { session: { ...session, state: nextState }, newEvents }
}

function validateLineups(lineups: MatchLineups): void {
  validateLineup(lineups.home, 'Home')
  validateLineup(lineups.away, 'Away')

  const homePlayers = new Set(lineups.home)
  if (lineups.away.some((playerId) => homePlayers.has(playerId))) {
    throw new MatchSimulationError('Home and away lineups cannot share players')
  }
}

function validateSquads(squads: MatchSquads): void {
  validateSquad(squads.home, 'Home')
  validateSquad(squads.away, 'Away')
  const homePlayers = new Set(squads.home)
  if (squads.away.some((playerId) => homePlayers.has(playerId))) throw new MatchSimulationError('Home and away squads cannot share players')
}

function validateSquad(squad: readonly PlayerId[], side: string): void {
  if (squad.length < MINIMUM_MATCH_SQUAD_SIZE) throw new MatchSimulationError(`${side} squad must contain at least ${MINIMUM_MATCH_SQUAD_SIZE} players`)
  if (new Set(squad).size !== squad.length) throw new MatchSimulationError(`${side} squad cannot contain duplicate players`)
}

function validateLineupsBelongToSquads(lineups: MatchLineups, squads: MatchSquads): void {
  if (lineups.home.some((playerId) => !squads.home.includes(playerId))) throw new MatchSimulationError('Home lineup players must belong to the home squad')
  if (lineups.away.some((playerId) => !squads.away.includes(playerId))) throw new MatchSimulationError('Away lineup players must belong to the away squad')
}

function validatePlayerProfiles(playerProfiles: MatchPlayerProfiles, squads: MatchSquads): void {
  validateProfilesForSquad(playerProfiles.home, squads.home, 'Home')
  validateProfilesForSquad(playerProfiles.away, squads.away, 'Away')
  const homeProfiles = new Set(playerProfiles.home.map((profile) => profile.playerId))
  if (playerProfiles.away.some((profile) => homeProfiles.has(profile.playerId))) throw new MatchSimulationError('Home and away player profiles cannot share players')
}

function validateProfilesForSquad(profiles: readonly MatchPlayerProfile[], squad: readonly PlayerId[], side: string): void {
  if (profiles.length !== squad.length) throw new MatchSimulationError(`${side} player profiles must contain exactly one profile per squad player`)
  const profileIds = new Set(profiles.map((profile) => profile.playerId))
  if (profileIds.size !== profiles.length) throw new MatchSimulationError(`${side} player profiles cannot contain duplicates`)
  if (squad.some((playerId) => !profileIds.has(playerId)) || profiles.some((profile) => !squad.includes(profile.playerId))) throw new MatchSimulationError(`${side} player profiles must match the squad exactly`)
}

function profileForPlayer(profiles: readonly MatchPlayerProfile[], playerId: PlayerId): MatchPlayerProfile {
  const profile = profiles.find((candidate) => candidate.playerId === playerId)
  if (profile === undefined) throw new MatchSimulationError(`Active Player ${playerId} has no MatchPlayerProfile`)
  return profile
}

/** Reconstructs current five from an initial snapshot and an ordered event subset. */
export function calculateActiveLineups(
  initialLineups: MatchLineups,
  homeTeamId: TeamId,
  awayTeamId: TeamId,
  events: readonly MatchEvent[],
): MatchLineups {
  validateLineups(initialLineups)
  let activeLineups = initialLineups
  for (const event of events) {
    if (event.type !== 'substitution') continue
    activeLineups = applySubstitution(activeLineups, homeTeamId, awayTeamId, undefined, event)
  }
  return activeLineups
}

function applySubstitution(
  activeLineups: MatchLineups,
  homeTeamId: TeamId,
  awayTeamId: TeamId,
  squads: MatchSquads | undefined,
  substitution: SubstitutePlayerOptions,
): MatchLineups {
  if (substitution.teamId !== homeTeamId && substitution.teamId !== awayTeamId) throw new MatchSimulationError(`Substitution Team ${substitution.teamId} is not in this Game`)
  if (substitution.playerOutId === substitution.playerInId) throw new MatchSimulationError('Substitution player out and player in must differ')
  const isHome = substitution.teamId === homeTeamId
  const lineup = isHome ? activeLineups.home : activeLineups.away
  const opponentLineup = isHome ? activeLineups.away : activeLineups.home
  if (!lineup.includes(substitution.playerOutId)) throw new MatchSimulationError('Substitution player out must be active for that team')
  if (lineup.includes(substitution.playerInId)) throw new MatchSimulationError('Substitution player in is already active')
  if (opponentLineup.includes(substitution.playerInId)) throw new MatchSimulationError('Substitution player in belongs to the opposing team')
  const squad = isHome ? squads?.home : squads?.away
  const opponentSquad = isHome ? squads?.away : squads?.home
  if (opponentSquad?.includes(substitution.playerInId)) throw new MatchSimulationError('Substitution player in belongs to the opposing team')
  if (squad !== undefined && !squad.includes(substitution.playerInId)) throw new MatchSimulationError('Substitution player in must belong to that team squad')
  const nextLineup = lineup.map((playerId) => playerId === substitution.playerOutId ? substitution.playerInId : playerId)
  return isHome ? { home: nextLineup, away: activeLineups.away } : { home: activeLineups.home, away: nextLineup }
}

function validateLineup(lineup: readonly PlayerId[], side: string): void {
  if (lineup.length !== 5) {
    throw new MatchSimulationError(`${side} lineup must contain exactly 5 players`)
  }
  if (new Set(lineup).size !== lineup.length) {
    throw new MatchSimulationError(`${side} lineup cannot contain duplicate players`)
  }
}

function validateOptions(options: SimulateMatchOptions) {
  const game = getGame(options.world, options.gameId)
  if (game.status !== 'scheduled') throw new MatchSimulationError(`Cannot simulate completed Game ${game.id}`)
  validateStrength(options.homeStrength, game.homeTeamId, 'Home')
  validateStrength(options.awayStrength, game.awayTeamId, 'Away')
  validateSquads(options.squads)
  validateLineups(options.lineups)
  validateLineupsBelongToSquads(options.lineups, options.squads)
  validatePlayerProfiles(options.playerProfiles, options.squads)
  const tacticalPlans = options.tacticalPlans ?? { home: createDefaultTacticalPlan(), away: createDefaultTacticalPlan() }
  validateTacticalPlan(tacticalPlans.home, options.squads.home)
  validateTacticalPlan(tacticalPlans.away, options.squads.away)
  return game
}

export function choosePossessionOutcome(turnoverProbability: number, passProbability: number, shotAttemptWeight: number, random: RandomSource): PossessionOutcome {
  const baseShotWeight = Math.max(0, 1 - turnoverProbability - SHOOTING_FOUL_PROBABILITY - passProbability)
  const shotWeight = baseShotWeight * Math.max(0, shotAttemptWeight)
  const totalWeight = turnoverProbability + SHOOTING_FOUL_PROBABILITY + passProbability + shotWeight
  const roll = random.next() * totalWeight

  if (roll < turnoverProbability) return 'turnover'
  if (roll < turnoverProbability + SHOOTING_FOUL_PROBABILITY) return 'shootingFoul'
  if (roll < turnoverProbability + SHOOTING_FOUL_PROBABILITY + passProbability) return 'passAttempt'
  return 'fieldGoalAttempt'
}

function secondsForPeriod(period: number, clockRules: ResolvedGameClockRules): number {
  return period <= clockRules.periodCount ? clockRules.periodSeconds : clockRules.overtimeSeconds
}

function otherTeamId(teamId: TeamId, game: { readonly homeTeamId: TeamId; readonly awayTeamId: TeamId }): TeamId {
  return teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId
}

function validateStrength(strength: TeamStrength, expectedTeamId: TeamId, side: string): void {
  if (strength.teamId !== expectedTeamId) {
    throw new MatchSimulationError(`${side} strength belongs to Team ${strength.teamId} but Game team is ${expectedTeamId}`)
  }
  if (!Number.isFinite(strength.value) || strength.value < 0 || strength.value > 100) {
    throw new MatchSimulationError(`${side} strength must be a finite number from 0 to 100`)
  }
}
