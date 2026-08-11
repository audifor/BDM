import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import { getGamesToday, getUserTeam } from '@/engine/calendar'
import {
  applyMatchResult,
  createDefaultRotationPlan,
  createMatchPlayerProfile,
  simulateMatchWithRotations,
  createDefaultTacticalPlan,
  type MatchTacticalPlan,
  type MatchSimulation,
} from '@/engine/match'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { calculateTeamStrength } from '@/engine/team'
import { selectStartingFive } from '@/engine/team'
import { LiveMatchController } from './LiveMatchController'

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
export function prepareUserMatch(world: GameWorld, userTacticalPlan: MatchTacticalPlan = createDefaultTacticalPlan()): MatchSimulation {
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

  return prepareMatch(world, game, userTeam.id === game.homeTeamId ? { home: userTacticalPlan, away: createDefaultTacticalPlan() } : { home: createDefaultTacticalPlan(), away: userTacticalPlan })
}

export function createLiveUserMatch(world: GameWorld, userTacticalPlan: MatchTacticalPlan = createDefaultTacticalPlan()): LiveMatchController {
  const userTeam = getUserTeam(world)
  if (userTeam === undefined) throw new PlayUserGameError('The user coach is not assigned to a Team')
  const game = getGamesToday(world).find((candidate) => candidate.homeTeamId === userTeam.id || candidate.awayTeamId === userTeam.id)
  if (game === undefined || game.status !== 'scheduled') throw new PlayUserGameError('The user Team has no scheduled Game today')
  const lineups = { home: selectStartingFive(world, game.homeTeamId), away: selectStartingFive(world, game.awayTeamId) }
  const squads = { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds }
  const tacticalPlans = userTeam.id === game.homeTeamId ? { home: userTacticalPlan, away: createDefaultTacticalPlan() } : { home: createDefaultTacticalPlan(), away: userTacticalPlan }
  return new LiveMatchController({ world, gameId: game.id, homeStrength: calculateTeamStrength(world, game.homeTeamId), awayStrength: calculateTeamStrength(world, game.awayTeamId), lineups, squads, playerProfiles: { home: squads.home.map((id) => createMatchPlayerProfile(world.players[id]!)), away: squads.away.map((id) => createMatchPlayerProfile(world.players[id]!)) }, homeRotationPlan: createDefaultRotationPlan({ teamId: game.homeTeamId, squad: squads.home, initialLineup: lineups.home, players: world.players }), awayRotationPlan: createDefaultRotationPlan({ teamId: game.awayTeamId, squad: squads.away, initialLineup: lineups.away, players: world.players }), random: createPrototypeGameRandom(game.id), decisionRandom: new SeededRandomSource(hashStringToSeed(`match-decisions-v1:${game.id}`)), actorRandom: new SeededRandomSource(hashStringToSeed(`match-actors-v1:${game.id}`)), tacticalPlans })
}

export function prepareMatch(world: GameWorld, game: Game, tacticalPlans = { home: createDefaultTacticalPlan(), away: createDefaultTacticalPlan() }): MatchSimulation {
  const lineups = { home: selectStartingFive(world, game.homeTeamId), away: selectStartingFive(world, game.awayTeamId) }
  const squads = { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds }
  const playerProfiles = { home: squads.home.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)), away: squads.away.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)) }
  return simulateMatchWithRotations({
    world,
    gameId: game.id,
    homeStrength: calculateTeamStrength(world, game.homeTeamId),
    awayStrength: calculateTeamStrength(world, game.awayTeamId),
    lineups,
    squads,
    playerProfiles,
    homeRotationPlan: createDefaultRotationPlan({ teamId: game.homeTeamId, squad: squads.home, initialLineup: lineups.home, players: world.players }),
    awayRotationPlan: createDefaultRotationPlan({ teamId: game.awayTeamId, squad: squads.away, initialLineup: lineups.away, players: world.players }),
    random: createPrototypeGameRandom(game.id),
    decisionRandom: new SeededRandomSource(hashStringToSeed(`match-decisions-v1:${game.id}`)),
    actorRandom: new SeededRandomSource(hashStringToSeed(`match-actors-v1:${game.id}`)),
    tacticalPlans,
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
export function instantResult(world: GameWorld, tacticalPlan?: MatchTacticalPlan): GameWorld {
  return completeMatch(world, prepareUserMatch(world, tacticalPlan))
}

/** Retained application alias for existing instant-result callers. */
export function playUserGame(world: GameWorld): GameWorld {
  return instantResult(world)
}

export function simulateAndApplyGame(world: GameWorld, game: Game): GameWorld {
  return completeMatch(world, prepareMatch(world, game))
}
