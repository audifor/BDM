import type { Game } from '@/domain/game'
import { withSingleWorldValidation, type GameWorld } from '@/domain/world'
import type { WorldRepairReport } from '@/domain/repair'
import type { MatchTacticalPlan } from '@/engine/match'
import { createMatchEnginePort, prepareMatchSetupWithReports, type MatchNextResult } from '@/app/matchNext'
import type { MatchSetup } from '@/engine/match-next'
import type { MatchSimulationRunner } from '@/app/matchNext/MatchSimulationRunner'
import { requireUserGameToday, userMatchTacticalPlans } from './playUserGame'

/**
 * ME-LOCK1: the one production authority that resolves a basketball Game without a viewer: Match Next in FAST mode (the same engine,
 * rules, rotation, fatigue and result contract as the Live match, with no presentation work). World advancement (advance day, continue,
 * simulate until a date, World DB daily lifecycle) and the user's Instant result both come through here; the legacy MatchEngine is
 * not a production route any more (see the production guard test).
 */

/** Resolves one scheduled Game through Match Next FAST and applies its result exactly once (fails closed on a second application). */
export function simulateAndApplyGame(world: GameWorld, game: Game, matchSeed?: number, repairReports?: WorldRepairReport[]): GameWorld {
  const port = createMatchEnginePort('match-next')
  const prepared = prepareMatchSetupWithReports(world, game, matchSeed)
  repairReports?.push(...prepared.repairReports)
  return port.complete(world, port.simulate(prepared.setup, 'FAST'))
}

/**
 * ME-LOCK1.1: a day's Games in three explicit phases, so the simulation phase can run anywhere (inline, or in parallel workers) while
 * preparation and application stay on the canonical world in a stable order:
 *   1. prepare every Game from the start-of-day world, drawing seeds in schedule order;
 *   2. simulate each prepared setup (pure: setup -> result);
 *   3. apply the results in schedule order through the one result boundary.
 * Phase 1 from the start-of-day world equals preparing each Game after the previous ones were applied only while the day's Games are
 * independent: no Team plays twice on the same day (each preparation reads only its two Teams' Players, coaches, availability and
 * fatigue, and an application only writes those). `dayGamesAreIndependent` checks that, and the day falls back to strict sequence
 * otherwise. Equality with the sequential resolution is certified by test (matchResolution.test.ts, "day phases").
 */
export interface PreparedDayGame {
  readonly game: Game
  readonly setup: MatchSetup
}

export function dayGamesAreIndependent(games: readonly Game[]): boolean {
  const teams = games.flatMap((game) => [game.homeTeamId, game.awayTeamId])
  return new Set(teams).size === teams.length
}

/** Phase 1: prepare the day's Games from one world, seeds drawn in the given order. */
export function prepareDayGames(world: GameWorld, games: readonly Game[], createSeed: () => number, repairReports?: WorldRepairReport[]): PreparedDayGame[] {
  return games.map((game) => {
    const prepared = prepareMatchSetupWithReports(world, game, createSeed())
    repairReports?.push(...prepared.repairReports)
    return { game, setup: prepared.setup }
  })
}

/** Phase 2 (inline): simulate each prepared Game in FAST mode. A parallel runner replaces exactly this step. */
export function simulateDayGamesInline(prepared: readonly PreparedDayGame[]): MatchNextResult[] {
  const port = createMatchEnginePort('match-next')
  return prepared.map((item) => port.simulate(item.setup, 'FAST'))
}

/** Phase 3: apply the results in the order of `prepared` (schedule order), each exactly once. */
export function applyDayResults(world: GameWorld, prepared: readonly PreparedDayGame[], results: readonly MatchNextResult[]): GameWorld {
  if (results.length !== prepared.length) throw new Error(`Expected ${prepared.length} match results, received ${results.length}`)
  const port = createMatchEnginePort('match-next')
  // One day's applications are one operation: the whole world is validated once, on the day's final world (fails closed as a whole).
  return withSingleWorldValidation(world, (start) => prepared.reduce((current, item, index) => {
    const result = results[index]!
    if (result.gameId !== item.game.id) throw new Error(`Match result ${result.gameId} does not belong to Game ${item.game.id}`)
    return port.complete(current, result)
  }, start))
}

/** `resolveDayGames` with the simulation phase on `runner`; the same world for the same seeds. */
export async function resolveDayGamesAsync(world: GameWorld, games: readonly Game[], createSeed: () => number, runner: MatchSimulationRunner, repairReports?: WorldRepairReport[]): Promise<GameWorld> {
  if (!dayGamesAreIndependent(games)) return resolveDayGames(world, games, createSeed, repairReports)
  const prepared = prepareDayGames(world, games, createSeed, repairReports)
  const results = prepared.length === 0 ? [] : await runner.simulate(prepared.map((item) => item.setup))
  return applyDayResults(world, prepared, results)
}

/** Resolves the given Games of one day: phased when they are independent, strictly sequential otherwise. */
export function resolveDayGames(world: GameWorld, games: readonly Game[], createSeed: () => number, repairReports?: WorldRepairReport[]): GameWorld {
  if (!dayGamesAreIndependent(games)) return games.reduce((current, game) => simulateAndApplyGame(current, game, createSeed(), repairReports), world)
  const prepared = prepareDayGames(world, games, createSeed, repairReports)
  return applyDayResults(world, prepared, simulateDayGamesInline(prepared))
}

/** The user's Game today as an Instant result: Match Next FAST with the user's tactical plan, applied at once. */
export function instantResult(world: GameWorld, tacticalPlan?: MatchTacticalPlan, matchSeed?: number): GameWorld {
  const { game, userTeamId } = requireUserGameToday(world)
  const port = createMatchEnginePort('match-next')
  const setup = port.prepare(world, game, matchSeed, userMatchTacticalPlans(game, userTeamId, tacticalPlan))
  return port.complete(world, port.simulate(setup, 'FAST'))
}

/** Retained application alias for existing instant-result callers. */
export function playUserGame(world: GameWorld, matchSeed?: number): GameWorld {
  return instantResult(world, undefined, matchSeed)
}
