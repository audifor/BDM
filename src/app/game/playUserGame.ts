import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import { getTeamLineup } from '@/domain/world'
import { BENCH_SLOTS, getLineupAssignments, PLAYERS_ON_COURT } from '@/domain/tactics'
import { BASKETBALL_POSITIONS } from '@/domain/primitives'
import type { PlayerId, TeamId } from '@/domain/ids'
import { getGamesToday, getUserTeam } from '@/engine/calendar'
import {
  applyCompletedMatch,
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
import { applyPostMatchInjuries } from '@/engine/injury'
import { getAvailablePlayersForCompetition } from '@/engine/eligibility'
import { MINIMUM_MATCH_SQUAD_SIZE } from '@/engine/match'
import { LiveMatchController } from './LiveMatchController'
import { getEffectiveTacticalPlan, getGamePlan } from './TacticalPlanning'

/**
 * Resolves the actual match-starting five for `teamId`. The team's configured
 * canonical `TeamLineup` (domain/tactics/TeamLineup.ts) is authoritative whenever
 * it names exactly PLAYERS_ON_COURT distinct starters who are all present in
 * `availableSquad` (this game's eligible+available player pool). Any other case —
 * no lineup configured, fewer/more than five starters, or a starter unavailable
 * for this specific game (injury/suspension/ineligibility) — falls back to the
 * existing algorithmic `selectStartingFive`, which remains the only mechanism for
 * AI-controlled teams (they are never given a configured TeamLineup).
 */
function resolveStartingFive(world: GameWorld, teamId: TeamId, onDate: Game['date'], availableSquad: readonly PlayerId[]): readonly PlayerId[] {
  const lineup = getTeamLineup(world, teamId)
  const starterIds = getLineupAssignments(lineup)
    .filter((assignment) => (BASKETBALL_POSITIONS as readonly string[]).includes(assignment.slot))
    .map((assignment) => assignment.playerId)
  const availableSet = new Set(availableSquad)
  const isValidConfiguredLineup = starterIds.length === PLAYERS_ON_COURT && new Set(starterIds).size === PLAYERS_ON_COURT && starterIds.every((playerId) => availableSet.has(playerId))
  return isValidConfiguredLineup ? starterIds : selectStartingFive(world, teamId, onDate, availableSquad)
}

/**
 * The team's configured bench priority (TeamLineup B1..B7 order), when one exists
 * (MG2C / MG1 BUG-4): this is the only signal RotationPlan's default-rotation
 * builder uses to break ties among an already-eligible bench pool. It never
 * ranks player quality — an unconfigured team (including every AI team) simply
 * has no priority list, and the rotation builder falls back to stable squad
 * order on its own.
 */
function resolveBenchPriorityOrder(world: GameWorld, teamId: TeamId): readonly PlayerId[] {
  const lineup = getTeamLineup(world, teamId)
  return getLineupAssignments(lineup)
    .filter((assignment) => (BENCH_SLOTS as readonly string[]).includes(assignment.slot))
    .map((assignment) => assignment.playerId)
}

export class PlayUserGameError extends Error {
  public constructor(message: string, public readonly code: 'INSUFFICIENT_AVAILABLE_PLAYERS' | 'INVALID_MATCH_CONTEXT' = 'INVALID_MATCH_CONTEXT') {
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
  const squads = availableSquads(world, game)
  const lineups = { home: resolveStartingFive(world, game.homeTeamId, game.date, squads.home), away: resolveStartingFive(world, game.awayTeamId, game.date, squads.away) }
  const tacticalPlans = userTeam.id === game.homeTeamId ? { home: userTacticalPlan, away: createDefaultTacticalPlan() } : { home: createDefaultTacticalPlan(), away: userTacticalPlan }
  return new LiveMatchController({ world, gameId: game.id, homeStrength: calculateTeamStrength(world, game.homeTeamId, game.date, squads.home), awayStrength: calculateTeamStrength(world, game.awayTeamId, game.date, squads.away), lineups, squads, playerProfiles: { home: squads.home.map((id) => createMatchPlayerProfile(world.players[id]!)), away: squads.away.map((id) => createMatchPlayerProfile(world.players[id]!)) }, homeRotationPlan: createDefaultRotationPlan({ teamId: game.homeTeamId, squad: squads.home, initialLineup: lineups.home, players: world.players, benchPriorityOrder: resolveBenchPriorityOrder(world, game.homeTeamId) }), awayRotationPlan: createDefaultRotationPlan({ teamId: game.awayTeamId, squad: squads.away, initialLineup: lineups.away, players: world.players, benchPriorityOrder: resolveBenchPriorityOrder(world, game.awayTeamId) }), random: createPrototypeGameRandom(game.id), decisionRandom: new SeededRandomSource(hashStringToSeed(`match-decisions-v1:${game.id}`)), actorRandom: new SeededRandomSource(hashStringToSeed(`match-actors-v1:${game.id}`)), tacticalPlans })
}

export function prepareMatch(world: GameWorld, game: Game, tacticalPlans?: { home: MatchTacticalPlan; away: MatchTacticalPlan }): MatchSimulation {
  const squads = availableSquads(world, game)
  const lineups = { home: resolveStartingFive(world, game.homeTeamId, game.date, squads.home), away: resolveStartingFive(world, game.awayTeamId, game.date, squads.away) }
  const playerProfiles = { home: squads.home.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)), away: squads.away.map((playerId) => createMatchPlayerProfile(world.players[playerId]!)) }
  const resolvedTactics=tacticalPlans??{home:getEffectiveTacticalPlan(world,game.id,game.homeTeamId),away:getEffectiveTacticalPlan(world,game.id,game.awayTeamId)}
  const homeGamePlan=getGamePlan(world,game.id,game.homeTeamId);const awayGamePlan=getGamePlan(world,game.id,game.awayTeamId)
  return simulateMatchWithRotations({
    world,
    gameId: game.id,
    homeStrength: calculateTeamStrength(world, game.homeTeamId, game.date, squads.home),
    awayStrength: calculateTeamStrength(world, game.awayTeamId, game.date, squads.away),
    lineups,
    squads,
    playerProfiles,
    homeRotationPlan: homeGamePlan?.rotationOverride??world.rotationPlansByTeamId[game.homeTeamId]??createDefaultRotationPlan({ teamId: game.homeTeamId, squad: squads.home, initialLineup: lineups.home, players: world.players, benchPriorityOrder: resolveBenchPriorityOrder(world, game.homeTeamId) }),
    awayRotationPlan: awayGamePlan?.rotationOverride??world.rotationPlansByTeamId[game.awayTeamId]??createDefaultRotationPlan({ teamId: game.awayTeamId, squad: squads.away, initialLineup: lineups.away, players: world.players, benchPriorityOrder: resolveBenchPriorityOrder(world, game.awayTeamId) }),
    random: createPrototypeGameRandom(game.id),
    decisionRandom: new SeededRandomSource(hashStringToSeed(`match-decisions-v1:${game.id}`)),
    actorRandom: new SeededRandomSource(hashStringToSeed(`match-actors-v1:${game.id}`)),
    tacticalPlans:resolvedTactics, defensiveMatchups:{home:homeGamePlan?.matchups??[],away:awayGamePlan?.matchups??[]},
  })

}

function availableSquads(world: GameWorld, game: Game) {
  const home = getAvailablePlayersForCompetition(world, game.homeTeamId, game.competitionId, game.seasonId, game.date)
  const away = getAvailablePlayersForCompetition(world, game.awayTeamId, game.competitionId, game.seasonId, game.date)
  for (const [side, players] of Object.entries({ home, away })) if (players.length < MINIMUM_MATCH_SQUAD_SIZE) throw new PlayUserGameError(`${side} team has ${players.length} available players; ${MINIMUM_MATCH_SQUAD_SIZE} are required`, 'INSUFFICIENT_AVAILABLE_PLAYERS')
  return { home, away }
}


/** Applies a completed viewer simulation to GameWorld exactly through the result boundary. */
export function completeMatch(world: GameWorld, simulation: MatchSimulation): GameWorld {
  return applyPostMatchInjuries(applyCompletedMatch(world, simulation), simulation.gameId)
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
