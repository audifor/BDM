import type { GameId, PlayerId, TeamId } from '@/domain/ids'
import { getGame, type GameWorld } from '@/domain/world'
import type { RandomSource } from '@/engine/random'

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

const HOME_ADVANTAGE_STRENGTH = 3
const MAX_OVERTIME_PERIODS = 100
/** Prototype value until rebounds become CompetitionRules. */
const OFFENSIVE_REBOUND_PROBABILITY = 0.25
/** Prototype attribution value; assists never affect sporting outcomes. */
const ASSIST_PROBABILITY = 0.6
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

export type MatchEvent =
  | MatchPeriodEvent
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'shotMade'
      readonly teamId: TeamId
      readonly playerId: PlayerId
      readonly points: 2 | 3
      readonly assistPlayerId?: PlayerId
      readonly homeScore: number
      readonly awayScore: number
    }
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'shotMissed' | 'turnover'
      readonly teamId: TeamId
      readonly playerId: PlayerId
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
  readonly lineups: MatchLineups
  readonly random: RandomSource
  readonly actorRandom: RandomSource
}

/** Immutable sporting state for one transient, resumable match. */
export interface MatchSessionState {
  readonly gameId: GameId
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly lineups: MatchLineups
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
  readonly actorRandom: RandomSource
}

export interface MatchSessionStepResult {
  readonly session: MatchSession
  readonly newEvents: readonly MatchEvent[]
}

type PossessionOutcome = 'shootingFoul' | 'made2' | 'made3' | 'missedShot' | 'turnover'

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
      gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, lineups: options.lineups,
      homeStrength: options.homeStrength, awayStrength: options.awayStrength, openingTeamId,
      period: 1, clockSecondsRemaining: MATCH_RULES_V2.periodSeconds, homeScore: 0, awayScore: 0,
      attackingTeamId: openingTeamId, nextSequence: 2, events: [initialEvent], isComplete: false,
    },
    random: options.random,
    actorRandom: options.actorRandom,
  }
}

/** Advances one logical possession or one period transition. RNG streams mutate only inside this runtime. */
export function stepMatchSession(session: MatchSession): MatchSessionStepResult {
  if (session.state.isComplete) throw new MatchSimulationError('Cannot step a completed MatchSession')
  const state = session.state
  const newEvents: MatchEvent[] = []
  const possessionDuration = session.random.nextInt(MATCH_RULES_V2.possessionMinSeconds, MATCH_RULES_V2.possessionMaxSeconds)
  if (possessionDuration > state.clockSecondsRemaining) {
    return finishPeriod(session, { ...state, clockSecondsRemaining: 0 }, newEvents)
  }

  let homeScore = state.homeScore
  let awayScore = state.awayScore
  let sequence = state.nextSequence
  const clockSecondsRemaining = state.clockSecondsRemaining - possessionDuration
  const strength = state.attackingTeamId === state.homeTeamId ? state.homeStrength.value : state.awayStrength.value
  const outcome = choosePossessionOutcome(strength, state.attackingTeamId === state.homeTeamId, session.random)
  const lineup = state.attackingTeamId === state.homeTeamId ? state.lineups.home : state.lineups.away
  const playerId = lineup[session.actorRandom.nextInt(0, lineup.length - 1)]!
  let attackingTeamId = state.attackingTeamId

  if (outcome === 'shootingFoul') {
    const defendingTeamId = otherTeamId(attackingTeamId, state)
    const defendingLineup = defendingTeamId === state.homeTeamId ? state.lineups.home : state.lineups.away
    const foulingPlayerId = defendingLineup[session.actorRandom.nextInt(0, defendingLineup.length - 1)]!
    newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'foul', teamId: defendingTeamId, playerId: foulingPlayerId, foulType: 'shooting', homeScore, awayScore })
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
  } else if (outcome === 'made2' || outcome === 'made3') {
    const points = Number(outcome.at(-1)) as 2 | 3
    const assistPlayerId = !session.actorRandom.chance(ASSIST_PROBABILITY) ? undefined : selectAssister(lineup, playerId, session.actorRandom)
    if (attackingTeamId === state.homeTeamId) homeScore += points
    else awayScore += points
    newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'shotMade', teamId: attackingTeamId, playerId, ...(assistPlayerId === undefined ? {} : { assistPlayerId }), points, homeScore, awayScore })
    attackingTeamId = otherTeamId(attackingTeamId, state)
  } else {
    newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: outcome === 'missedShot' ? 'shotMissed' : 'turnover', teamId: attackingTeamId, playerId, homeScore, awayScore })
    if (outcome === 'missedShot') {
      const reboundType = session.random.chance(OFFENSIVE_REBOUND_PROBABILITY) ? 'offensive' : 'defensive'
      const reboundTeamId = reboundType === 'offensive' ? attackingTeamId : otherTeamId(attackingTeamId, state)
      const reboundLineup = reboundTeamId === state.homeTeamId ? state.lineups.home : state.lineups.away
      const reboundPlayerId = reboundLineup[session.actorRandom.nextInt(0, reboundLineup.length - 1)]!
      newEvents.push({ sequence: sequence++, period: state.period, clockSecondsRemaining, type: 'rebound', teamId: reboundTeamId, playerId: reboundPlayerId, reboundType, homeScore, awayScore })
      attackingTeamId = reboundTeamId
    } else {
      attackingTeamId = otherTeamId(attackingTeamId, state)
    }
  }

  const stateAfterPossession = { ...state, clockSecondsRemaining, homeScore, awayScore, attackingTeamId, nextSequence: sequence }
  if (clockSecondsRemaining === 0) return finishPeriod(session, stateAfterPossession, newEvents)
  const nextState = { ...stateAfterPossession, events: [...state.events, ...newEvents] }
  return { session: { ...session, state: nextState }, newEvents }
}

/** Converts a completed transient session into the existing MatchSimulation contract. */
export function toMatchSimulation(session: MatchSession): MatchSimulation {
  const state = session.state
  if (!state.isComplete) throw new MatchSimulationError('Cannot convert an incomplete MatchSession to MatchSimulation')
  return { gameId: state.gameId, homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId, lineups: state.lineups, events: state.events, finalScore: { home: state.homeScore, away: state.awayScore } }
}

/** Runs the single incremental MatchSession engine through completion. */
export function simulateMatchDetailed(options: SimulateMatchOptions): MatchSimulation {
  let session = createMatchSession(options)
  while (!session.state.isComplete) session = stepMatchSession(session).session
  return toMatchSimulation(session)
}

function selectAssister(lineup: readonly PlayerId[], scorerId: PlayerId, random: RandomSource): PlayerId {
  const eligiblePlayers = lineup.filter((playerId) => playerId !== scorerId)
  return eligiblePlayers[random.nextInt(0, eligiblePlayers.length - 1)]!
}

function finishPeriod(session: MatchSession, state: MatchSessionState, newEvents: MatchEvent[]): MatchSessionStepResult {
  let sequence = state.nextSequence
  const events = [...state.events, ...newEvents]
  const periodEnd: MatchEvent = { sequence: sequence++, period: state.period, clockSecondsRemaining: 0, type: 'periodEnd', homeScore: state.homeScore, awayScore: state.awayScore }
  newEvents.push(periodEnd)

  if (state.period >= MATCH_RULES_V2.periodCount && state.homeScore !== state.awayScore) {
    const gameEnd: MatchEvent = { sequence, period: state.period, clockSecondsRemaining: 0, type: 'gameEnd', homeScore: state.homeScore, awayScore: state.awayScore }
    newEvents.push(gameEnd)
    const completeState = { ...state, nextSequence: sequence + 1, events: [...events, ...newEvents], isComplete: true }
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
  const nextState = { ...state, period, clockSecondsRemaining, attackingTeamId, nextSequence: sequence, events: [...events, ...newEvents] }
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
  validateLineups(options.lineups)
  return game
}

function choosePossessionOutcome(strength: number, isHomeTeam: boolean, random: RandomSource): PossessionOutcome {
  const effectiveStrength = strength + (isHomeTeam ? HOME_ADVANTAGE_STRENGTH : 0)
  const adjustment = (effectiveStrength - 50) * 0.0015
  const turnover = 0.13 - adjustment * 0.25
  const made3 = 0.18 + adjustment * 0.7
  const made2 = 0.3 + adjustment
  const roll = random.next()

  if (roll < SHOOTING_FOUL_PROBABILITY) return 'shootingFoul'
  if (roll < SHOOTING_FOUL_PROBABILITY + turnover) return 'turnover'
  if (roll < SHOOTING_FOUL_PROBABILITY + turnover + made3) return 'made3'
  if (roll < SHOOTING_FOUL_PROBABILITY + turnover + made3 + made2) return 'made2'
  return 'missedShot'
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
