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
