import { createGame } from '@/domain/game'
import { createGameWorld, type GameWorld } from '@/domain/world'

import type { MatchSimulationResult } from './MatchEngine'

export class MatchResultApplicationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'MatchResultApplicationError'
  }
}

/**
 * Applies a transient simulation result by creating a newly validated GameWorld.
 * Rebuilding through the canonical factory favors correctness over premature
 * structural-sharing optimization.
 */
export function applyMatchResult(world: GameWorld, result: MatchSimulationResult): GameWorld {
  const originalGame = world.games[result.gameId]
  if (originalGame === undefined) {
    throw new MatchResultApplicationError(`Cannot apply result to missing Game ${result.gameId}`)
  }
  if (originalGame.status !== 'scheduled') {
    throw new MatchResultApplicationError(`Cannot apply result to completed Game ${originalGame.id}`)
  }
  if (result.homeTeamId !== originalGame.homeTeamId) {
    throw new MatchResultApplicationError(
      `Result home Team ${result.homeTeamId} does not match Game home Team ${originalGame.homeTeamId}`,
    )
  }
  if (result.awayTeamId !== originalGame.awayTeamId) {
    throw new MatchResultApplicationError(
      `Result away Team ${result.awayTeamId} does not match Game away Team ${originalGame.awayTeamId}`,
    )
  }

  validateScore(result.homeScore, 'Home')
  validateScore(result.awayScore, 'Away')
  if (result.homeScore === result.awayScore) {
    throw new MatchResultApplicationError('Match results must not end in a tie')
  }

  const completedGame = createGame({
    ...originalGame,
    status: 'completed',
    result: {
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    },
  })
  const games = Object.values(world.games).map((game) => (game.id === completedGame.id ? completedGame : game))

  return createGameWorld({
    currentDate: world.currentDate,
    userCoachId: world.userCoachId,
    countries: Object.values(world.countries),
    coaches: Object.values(world.coaches),
    players: Object.values(world.players),
    teams: Object.values(world.teams),
    competitions: Object.values(world.competitions),
    seasons: Object.values(world.seasons),
    games,
  })
}

function validateScore(value: number, side: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new MatchResultApplicationError(`${side} score must be a non-negative finite integer`)
  }
}
