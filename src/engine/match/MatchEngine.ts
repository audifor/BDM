import type { GameId, PlayerId, TeamId } from '@/domain/ids'
import { getGame, type GameWorld } from '@/domain/world'
import type { RandomSource } from '@/engine/random'
import { advanceFatigue, createInitialFatigue, type FatigueByPlayerId } from './Fatigue'
import { calculateAssistProbability, selectAssister } from './AssistResolution'
import { calculateDefensiveAssignments } from './Matchups'
import type { MatchPlayerProfile, MatchPlayerProfiles } from './MatchPlayerProfile'
import { calculateOffensiveReboundProbability, selectRebounder } from './ReboundResolution'
import { calculateShotMakeProbability, calculateShotZoneWeights, pointsForShotZone, type ShotZone } from './ShotResolution'
import { calculateTurnoverProbability } from './TurnoverResolution'
import { chooseWeighted } from './WeightedChoice'
import { createDefaultTacticalPlan, validateTacticalPlan, type MatchTacticalPlan } from './tactics/MatchTacticalPlan'
import { applyPaceToPossessionDuration, applyShotProfile, calculateTacticalDefenseModifier, tacticalUsageWeight } from './tactics/TacticalEffects'
import { clonePlan, type MatchCoachingState } from './coaching/MatchCoachingState'
import { calculateBlockCreditProbability, calculateStealCreditProbability } from './DefensiveAttribution'

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
      readonly stealPlayerId?: PlayerId
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
  readonly homeStrength: TeamStrength
  readonly awayStrength: TeamStrength
  readonly squads: MatchSquads
  readonly playerProfiles: MatchPlayerProfiles
  readonly lineups: MatchLineups
  readonly random: RandomSource
  readonly decisionRandom: RandomSource
  readonly actorRandom: RandomSource
  readonly tacticalPlans?: { readonly home: MatchTacticalPlan; readonly away: MatchTacticalPlan }
}

/** Immutable sporting state for one transient, resumable match. */
export interface MatchSessionState {
  readonly gameId: GameId
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  /** Historical starting-five snapshot retained in the completed MatchSimulation. */
  readonly initialLineups: MatchLineups
  /** Current five for each team; substitutions are the only operation that changes it. */
  readonly activeLineups: MatchLineups
  readonly squads: MatchSquads
  readonly fatigueByPlayerId: FatigueByPlayerId
  readonly playerProfiles: MatchPlayerProfiles
  readonly coachingState: MatchCoachingState
  readonly homeStrength: TeamStrength
  readonly awayStrength: TeamStrength
  readonly openingTeamId: TeamId
  readonly period: number
  readonly clockSecondsRemaining: number
  readonly homeScore: number
  readonly awayScore: number
  readonly attackingTeamId: TeamId
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

type PossessionOutcome = 'shootingFoul' | 'fieldGoalAttempt' | 'turnover'

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
    homeTeamId: simulation.homeTeamId,
    awayTeamId: simulation.awayTeamId,
    homeScore: simulation.finalScore.home,
    awayScore: simulation.finalScore.away,
  }
}

/** Creates a transitory session without resolving a possession. */
export function createMatchSession(options: SimulateMatchOptions): MatchSession {
  const game = validateOptions(options)
  const openingTeamId = options.random.chance(0.5) ? game.homeTeamId : game.awayTeamId
  const initialEvent: MatchEvent = { sequence: 1, period: 1, clockSecondsRemaining: MATCH_RULES_V2.periodSeconds, type: 'periodStart', homeScore: 0, awayScore: 0 }
  return {
    state: {
      gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId,
      initialLineups: options.lineups, activeLineups: options.lineups, squads: options.squads,
      fatigueByPlayerId: createInitialFatigue(options.squads),
      playerProfiles: options.playerProfiles, coachingState: { home: { currentTacticalPlan: clonePlan(options.tacticalPlans?.home ?? createDefaultTacticalPlan()) }, away: { currentTacticalPlan: clonePlan(options.tacticalPlans?.away ?? createDefaultTacticalPlan()) } },
      homeStrength: options.homeStrength, awayStrength: options.awayStrength, openingTeamId,
      period: 1, clockSecondsRemaining: MATCH_RULES_V2.periodSeconds, homeScore: 0, awayScore: 0,
      attackingTeamId: openingTeamId, nextSequence: 2, events: [initialEvent], isComplete: false,
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
  return { ...session, state: { ...state, activeLineups, nextSequence: state.nextSequence + 1, events: [...state.events, event] } }
}

/** Advances one logical possession or one period transition. RNG streams mutate only inside this runtime. */
export function stepMatchSession(session: MatchSession): MatchSessionStepResult {
  if (session.state.isComplete) throw new MatchSimulationError('Cannot step a completed MatchSession')
  const state = session.state
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
  const offensiveActor = chooseWeighted(lineup.map((playerId) => ({ item: profileForPlayer(profiles, playerId), weight: tacticalUsageWeight(playerId, profileForPlayer(profiles, playerId).offense.usage, lineup, attackingPlan) })), session.decisionRandom)
  const playerId = offensiveActor.playerId
  const defendingTeamId = otherTeamId(state.attackingTeamId, state)
  const defendingLineup = defendingTeamId === state.homeTeamId ? state.activeLineups.home : state.activeLineups.away
  const defendingProfiles = defendingTeamId === state.homeTeamId ? state.playerProfiles.home : state.playerProfiles.away
  const primaryDefenderId = calculateDefensiveAssignments(lineup, defendingLineup, [...profiles, ...defendingProfiles]).find((matchup) => matchup.offensivePlayerId === playerId)?.defensivePlayerId
  if (primaryDefenderId === undefined) throw new MatchSimulationError(`Active Player ${playerId} has no primary defender`)
  const primaryDefender = profileForPlayer(defendingProfiles, primaryDefenderId)
  const turnoverProbability = calculateTurnoverProbability({ ballHandlerProfile: offensiveActor, ballHandlerFatigue: state.fatigueByPlayerId[playerId] ?? 0, defenderProfile: primaryDefender, defenderFatigue: state.fatigueByPlayerId[primaryDefenderId] ?? 0 })
  const outcome = choosePossessionOutcome(turnoverProbability, session.random)
  let attackingTeamId = state.attackingTeamId

  if (outcome === 'shootingFoul') {
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
  } else if (outcome === 'fieldGoalAttempt') {
    const shotWeights = applyShotProfile(calculateShotZoneWeights(offensiveActor), attackingPlan)
    const shotZone = chooseWeighted((['rim', 'midRange', 'threePoint'] as const).map((zone) => ({ item: zone, weight: shotWeights[zone] })), session.decisionRandom)
    const defendingPlan = defendingTeamId === state.homeTeamId ? state.coachingState.home.currentTacticalPlan : state.coachingState.away.currentTacticalPlan
    const made = session.random.chance(calculateShotMakeProbability({ shotZone, shooterProfile: offensiveActor, shooterFatigue: state.fatigueByPlayerId[playerId] ?? 0, defenderProfile: primaryDefender, defenderFatigue: state.fatigueByPlayerId[primaryDefenderId] ?? 0, tacticalDefenseModifier: calculateTacticalDefenseModifier(defendingPlan, shotZone) }))
    const points = pointsForShotZone(shotZone)
    if (made) {
      const assistCandidates = lineup.filter((candidateId) => candidateId !== playerId).map((candidateId) => profileForPlayer(profiles, candidateId))
      const assistPlayerId = !session.actorRandom.chance(calculateAssistProbability({ shotZone, teammateProfiles: assistCandidates })) ? undefined : selectAssister(assistCandidates, session.actorRandom).playerId
      if (attackingTeamId === state.homeTeamId) homeScore += points
      else awayScore += points
      newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'shotMade', teamId: attackingTeamId, playerId, defenderPlayerId: primaryDefenderId, ...(assistPlayerId === undefined ? {} : { assistPlayerId }), points, shotZone, homeScore, awayScore })
      attackingTeamId = otherTeamId(attackingTeamId, state)
    } else {
      const blockedByPlayerId = session.actorRandom.chance(calculateBlockCreditProbability(primaryDefender, shotZone)) ? primaryDefenderId : undefined
      newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'shotMissed', teamId: attackingTeamId, playerId, defenderPlayerId: primaryDefenderId, ...(blockedByPlayerId === undefined ? {} : { blockedByPlayerId }), shotZone, homeScore, awayScore })
      const offensiveReboundProbability = calculateOffensiveReboundProbability({ offensiveProfiles: lineup.map((candidateId) => profileForPlayer(profiles, candidateId)), defensiveProfiles: defendingLineup.map((candidateId) => profileForPlayer(defendingProfiles, candidateId)) })
      const reboundType = session.random.chance(offensiveReboundProbability) ? 'offensive' : 'defensive'
      const reboundTeamId = reboundType === 'offensive' ? attackingTeamId : otherTeamId(attackingTeamId, state)
      const reboundLineup = reboundTeamId === state.homeTeamId ? state.activeLineups.home : state.activeLineups.away
      const reboundProfiles = reboundTeamId === state.homeTeamId ? state.playerProfiles.home : state.playerProfiles.away
      const reboundPlayerId = selectRebounder(reboundLineup.map((candidateId) => profileForPlayer(reboundProfiles, candidateId)), session.actorRandom).playerId
      newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'rebound', teamId: reboundTeamId, playerId: reboundPlayerId, reboundType, homeScore, awayScore })
      attackingTeamId = reboundTeamId
    }
  } else {
    const stealPlayerId = session.actorRandom.chance(calculateStealCreditProbability(primaryDefender)) ? primaryDefenderId : undefined
    newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'turnover', teamId: attackingTeamId, playerId, ...(stealPlayerId === undefined ? {} : { stealPlayerId }), homeScore, awayScore })
    attackingTeamId = otherTeamId(attackingTeamId, state)
  }

  const stateAfterPossession = { ...state, clockSecondsRemaining, homeScore, awayScore, attackingTeamId, nextSequence: sequence }
  const fatiguedSession = updateSessionFatigue(session, stateAfterPossession, possessionDuration)
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
  return { gameId: state.gameId, homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId, lineups: state.initialLineups, squads: state.squads, events: state.events, finalScore: { home: state.homeScore, away: state.awayScore } }
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

  if (state.period >= MATCH_RULES_V2.periodCount && state.homeScore !== state.awayScore) {
    const gameEnd: MatchEvent = { sequence, period: state.period, clockSecondsRemaining: 0, type: 'gameEnd', homeScore: state.homeScore, awayScore: state.awayScore }
    newEvents.push(gameEnd)
    const completeState = { ...state, nextSequence: sequence + 1, events: [...state.events, ...newEvents], isComplete: true }
    return { session: { ...session, state: completeState }, newEvents }
  }
  if (state.period >= MATCH_RULES_V2.periodCount + MAX_OVERTIME_PERIODS) {
    throw new MatchSimulationError('Match did not resolve after the maximum overtime protection')
  }

  const period = state.period + 1
  const clockSecondsRemaining = secondsForPeriod(period)
  const attackingTeamId = period % 2 === 1 ? state.openingTeamId : otherTeamId(state.openingTeamId, state)
  const periodStart: MatchEvent = { sequence: sequence++, period, clockSecondsRemaining, type: 'periodStart', homeScore: state.homeScore, awayScore: state.awayScore }
  newEvents.push(periodStart)
  const nextState = { ...state, period, clockSecondsRemaining, attackingTeamId, nextSequence: sequence, events: [...state.events, ...newEvents] }
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
  if (squad.length < 5) throw new MatchSimulationError(`${side} squad must contain at least 5 players`)
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

function choosePossessionOutcome(turnoverProbability: number, random: RandomSource): PossessionOutcome {
  const roll = random.next()

  if (roll < turnoverProbability) return 'turnover'
  if (roll < turnoverProbability + SHOOTING_FOUL_PROBABILITY) return 'shootingFoul'
  return 'fieldGoalAttempt'
}

function secondsForPeriod(period: number): number {
  return period <= MATCH_RULES_V2.periodCount ? MATCH_RULES_V2.periodSeconds : MATCH_RULES_V2.overtimeSeconds
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
