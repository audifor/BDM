import type { GameId, TeamId } from '@/domain/ids'
import { getGame, type GameWorld } from '@/domain/world'
import type { RandomSource } from '@/engine/random'

const BASE_SCORE = 78
const STRENGTH_SCORE_RANGE = 24
const HOME_ADVANTAGE = 4
const RANDOM_VARIATION = 8

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

export const PROTOTYPE_PERIOD_COUNT = 4
export const PROTOTYPE_PERIOD_SECONDS = 600

export type MatchEvent =
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'periodStart' | 'periodEnd'
      readonly homeScore: number
      readonly awayScore: number
    }
  | {
      readonly sequence: number
      readonly period: number
      readonly clockSecondsRemaining: number
      readonly type: 'score'
      readonly teamId: TeamId
      readonly points: 1 | 2 | 3
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

export interface MatchSimulation {
  readonly gameId: GameId
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
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
  readonly random: RandomSource
}

export class MatchSimulationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'MatchSimulationError'
  }
}

/**
 * Simulates a final score only. State transition is intentionally handled outside
 * MatchEngine, so this function does not change Game or GameWorld.
 */
export function simulateMatch(options: SimulateMatchOptions): MatchSimulationResult {
  const game = getGame(options.world, options.gameId)
  if (game.status !== 'scheduled') {
    throw new MatchSimulationError(`Cannot simulate completed Game ${game.id}`)
  }

  validateStrength(options.homeStrength, game.homeTeamId, 'Home')
  validateStrength(options.awayStrength, game.awayTeamId, 'Away')

  let homeScore = calculateScore(options.homeStrength.value, HOME_ADVANTAGE, options.random)
  let awayScore = calculateScore(options.awayStrength.value, 0, options.random)

  if (homeScore === awayScore) {
    if (options.random.chance(0.5)) {
      homeScore += 1
    } else {
      awayScore += 1
    }
  }

  return {
    gameId: game.id,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore,
    awayScore,
  }
}

/**
 * Produces the complete deterministic event stream immediately. Playback belongs
 * to MatchViewer; this engine never waits, schedules timers, or changes the world.
 */
export function simulateMatchDetailed(options: SimulateMatchOptions): MatchSimulation {
  const finalResult = simulateMatch(options)
  const events = createMatchEvents(finalResult, options.random)

  return {
    gameId: finalResult.gameId,
    homeTeamId: finalResult.homeTeamId,
    awayTeamId: finalResult.awayTeamId,
    events,
    finalScore: {
      home: finalResult.homeScore,
      away: finalResult.awayScore,
    },
  }
}

function createMatchEvents(result: MatchSimulationResult, random: RandomSource): MatchEvent[] {
  const actions = [
    ...createScoreActions(result.homeTeamId, result.homeScore, random),
    ...createScoreActions(result.awayTeamId, result.awayScore, random),
  ].map((action) => ({ ...action, period: random.nextInt(1, PROTOTYPE_PERIOD_COUNT) }))
  const events: MatchEvent[] = []
  let sequence = 1
  let homeScore = 0
  let awayScore = 0

  for (let period = 1; period <= PROTOTYPE_PERIOD_COUNT; period += 1) {
    events.push({
      sequence: sequence++,
      period,
      clockSecondsRemaining: PROTOTYPE_PERIOD_SECONDS,
      type: 'periodStart',
      homeScore,
      awayScore,
    })

    const periodActions = shuffle(actions.filter((action) => action.period === period), random)
    for (let index = 0; index < periodActions.length; index += 1) {
      const action = periodActions[index]!
      if (action.teamId === result.homeTeamId) {
        homeScore += action.points
      } else {
        awayScore += action.points
      }
      events.push({
        sequence: sequence++,
        period,
        clockSecondsRemaining: clockForAction(index, periodActions.length),
        type: 'score',
        teamId: action.teamId,
        points: action.points,
        homeScore,
        awayScore,
      })
    }

    events.push({
      sequence: sequence++,
      period,
      clockSecondsRemaining: 0,
      type: 'periodEnd',
      homeScore,
      awayScore,
    })
  }

  events.push({
    sequence,
    period: PROTOTYPE_PERIOD_COUNT,
    clockSecondsRemaining: 0,
    type: 'gameEnd',
    homeScore,
    awayScore,
  })

  if (homeScore !== result.homeScore || awayScore !== result.awayScore) {
    throw new MatchSimulationError('Match events do not match the simulated final score')
  }

  return events
}

function createScoreActions(teamId: TeamId, score: number, random: RandomSource): Array<{ teamId: TeamId; points: 1 | 2 | 3 }> {
  const actions: Array<{ teamId: TeamId; points: 1 | 2 | 3 }> = []
  let remaining = score

  while (remaining > 0) {
    const points = Math.min(remaining, random.nextInt(1, 3)) as 1 | 2 | 3
    actions.push({ teamId, points })
    remaining -= points
  }

  return actions
}

function shuffle<Item>(items: readonly Item[], random: RandomSource): Item[] {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextInt(0, index)
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!]
  }

  return shuffled
}

function clockForAction(index: number, count: number): number {
  return PROTOTYPE_PERIOD_SECONDS - Math.ceil(((index + 1) * PROTOTYPE_PERIOD_SECONDS) / (count + 1))
}

function calculateScore(strength: number, homeAdvantage: number, random: RandomSource): number {
  const strengthScore = ((strength - 50) / 100) * STRENGTH_SCORE_RANGE
  const variation = random.nextInt(-RANDOM_VARIATION, RANDOM_VARIATION)

  return Math.max(0, Math.round(BASE_SCORE + strengthScore + homeAdvantage + variation))
}

function validateStrength(strength: TeamStrength, expectedTeamId: TeamId, side: string): void {
  if (strength.teamId !== expectedTeamId) {
    throw new MatchSimulationError(
      `${side} strength belongs to Team ${strength.teamId} but Game team is ${expectedTeamId}`,
    )
  }
  if (!Number.isFinite(strength.value) || strength.value < 0 || strength.value > 100) {
    throw new MatchSimulationError(`${side} strength must be a finite number from 0 to 100`)
  }
}
