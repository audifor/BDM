import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import { getGamesToday, getUserTeam } from '@/engine/calendar'
import { applyMatchResult, simulateMatch, type TeamStrength } from '@/engine/match'
import { SeededRandomSource } from '@/engine/random'

const PROTOTYPE_TEAM_STRENGTH = 50

export class PlayUserGameError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'PlayUserGameError'
  }
}

/** Temporary bridge until the ratings system provides actual team strengths. */
export function getPrototypeTeamStrength(teamId: TeamStrength['teamId']): TeamStrength {
  return { teamId, value: PROTOTYPE_TEAM_STRENGTH }
}

/**
 * Produces a stable 32-bit seed from a GameId. This is provisional until career
 * RNG state is persisted, but makes a game's instant result reproducible.
 */
export function createPrototypeGameRandom(gameId: Game['id']): SeededRandomSource {
  let hash = 0x811c_9dc5

  for (let index = 0; index < gameId.length; index += 1) {
    hash ^= gameId.charCodeAt(index)
    hash = Math.imul(hash, 0x0100_0193) >>> 0
  }

  return new SeededRandomSource(hash)
}

/** Simulates and applies only the user's scheduled game on the current date. */
export function playUserGame(world: GameWorld): GameWorld {
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

  return simulateAndApplyGame(world, game)
}

export function simulateAndApplyGame(world: GameWorld, game: Game): GameWorld {
  const result = simulateMatch({
    world,
    gameId: game.id,
    homeStrength: getPrototypeTeamStrength(game.homeTeamId),
    awayStrength: getPrototypeTeamStrength(game.awayTeamId),
    random: createPrototypeGameRandom(game.id),
  })

  return applyMatchResult(world, result)
}
