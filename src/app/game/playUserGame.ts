import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import { getGamesToday, getUserTeam } from '@/engine/calendar'
import {
  applyMatchResult,
  simulateMatchDetailed,
  type MatchSimulation,
} from '@/engine/match'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { calculateTeamStrength } from '@/engine/team'
import { selectStartingFive } from '@/engine/team'

export class PlayUserGameError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'PlayUserGameError'
  }
}


/**
 * Produces a stable 32-bit seed from a GameId. This is provisional until career
 * RNG state is persisted, but makes a game's instant result reproducible.
 */
export function createPrototypeGameRandom(gameId: Game['id']): SeededRandomSource {
  return new SeededRandomSource(hashStringToSeed(gameId))
}

/** Prepares the user's current game for a viewer without changing GameWorld. */
export function prepareUserMatch(world: GameWorld): MatchSimulation {
  const userTeam = getUserTeam(world)
  if (userTeam === undefined) {
    throw new PlayUserGameError('The user coach is not assigned to a Team')
  }

  const game = getGamesToday(world).find(
    (candidate) => candidate.homeTeamId === userTeam.id || candidate.awayTeamId === userTeam.id,
  )
  if (game === undefined) {
    throw new PlayUserGameError(`The user Team has no Game on ${world.currentDate}`)
  }
  if (game.status !== 'scheduled') {
    throw new PlayUserGameError(`The user Game ${game.id} is already completed`)
  }

  return prepareMatch(world, game)
}

export function prepareMatch(world: GameWorld, game: Game): MatchSimulation {
  return simulateMatchDetailed({
    world,
    gameId: game.id,
    homeStrength: calculateTeamStrength(world, game.homeTeamId),
    awayStrength: calculateTeamStrength(world, game.awayTeamId),
    lineups: { home: selectStartingFive(world, game.homeTeamId), away: selectStartingFive(world, game.awayTeamId) },
    squads: { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds },
    random: createPrototypeGameRandom(game.id),
    actorRandom: new SeededRandomSource(hashStringToSeed(`match-actors-v1:${game.id}`)),
  })

}

/** Applies a completed viewer simulation to GameWorld exactly through the result boundary. */
export function completeMatch(world: GameWorld, simulation: MatchSimulation): GameWorld {
  return applyMatchResult(world, {
    gameId: simulation.gameId,
    homeTeamId: simulation.homeTeamId,
    awayTeamId: simulation.awayTeamId,
    homeScore: simulation.finalScore.home,
    awayScore: simulation.finalScore.away,
  })
}

/** Instant Result uses the same detailed simulation as MatchViewer, then applies it immediately. */
export function instantResult(world: GameWorld): GameWorld {
  return completeMatch(world, prepareUserMatch(world))
}

/** Retained application alias for existing instant-result callers. */
export function playUserGame(world: GameWorld): GameWorld {
  return instantResult(world)
}

export function simulateAndApplyGame(world: GameWorld, game: Game): GameWorld {
  return completeMatch(world, prepareMatch(world, game))
}
