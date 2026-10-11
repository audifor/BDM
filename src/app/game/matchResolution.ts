import type { DevelopmentStimulusEvent } from '@/domain/development/DevelopmentStimulusEvent'
import type { Game } from '@/domain/game'
import { updateGameWorld, withDailyResultBatch, withSingleWorldValidation, type GameWorld } from '@/domain/world'
import type { WorldRepairReport } from '@/domain/repair'
import type { MatchTacticalPlan } from '@/engine/match'
import { createMatchEnginePort, prepareMatchSetupWithReports, type MatchNextResult } from '@/app/matchNext'
import type { MatchSetup } from '@/engine/match-next'
import type { MatchSimulationRunner } from '@/app/matchNext/MatchSimulationRunner'
import { simulateBackgroundMatch, type BackgroundMatchResult } from '@/engine/world-sim/background/BackgroundMatchModel'
import { completeBackgroundMatch } from '@/app/worldSim/BackgroundMatchCompletion'
import { decideResolutions, DEFAULT_SIMULATION_DETAIL, type SimulationDetailSettings, type SimulationResolutionContext } from '@/app/worldSim/SimulationResolutionPolicy'
import { requireUserGameToday, userMatchTacticalPlans } from './playUserGame'

/**
 * ME-LOCK1: the one production authority that resolves a basketball Game without a viewer. WSR1: each Game is resolved at the
 * resolution the SimulationResolutionPolicy assigns: exact Match Next FAST (the same engine, rules, rotation, fatigue and result contract
 * as the Live match, with no presentation work) or the World Simulation BACKGROUND tier; both reach the world through the same
 * canonical completion chain. The legacy MatchEngine is not a production route (see the production guard test).
 */

/** The resolutions a world day can use for Games nobody is watching. */
export type DayResolution = 'FULL' | 'FAST' | 'BACKGROUND'

/** WSR1 seam for the user's simulation-detail setting (persisted settings will be read here; until then the default). */
export function simulationDetailFor(_world: GameWorld): SimulationDetailSettings {
  return DEFAULT_SIMULATION_DETAIL
}

/** Resolves one scheduled Game (FAST unless told otherwise) and applies its result exactly once (fails closed on a second application). */
export function simulateAndApplyGame(world: GameWorld, game: Game, matchSeed?: number, repairReports?: WorldRepairReport[], resolution: DayResolution = 'FAST', pendingEvidence?: DevelopmentStimulusEvent[]): GameWorld {
  const prepared = prepareMatchSetupWithReports(world, game, matchSeed)
  repairReports?.push(...prepared.repairReports)
  return applyDayOutcome(world, simulateDayGameInline({ game, setup: prepared.setup, resolution }), pendingEvidence)
}

/**
 * ME-LOCK1.1: a day's Games in three explicit phases, so the simulation phase can run anywhere (inline, or in parallel workers) while
 * preparation and application stay on the canonical world in a stable order:
 *   1. prepare every Game from the start-of-day world, drawing seeds in schedule order (WSR1: and decide its resolution);
 *   2. simulate each prepared setup (pure: setup -> result) at its resolution;
 *   3. apply the results in schedule order through the one result boundary.
 * Phase 1 from the start-of-day world equals preparing each Game after the previous ones were applied only while the day's Games are
 * independent: no Team plays twice on the same day (each preparation reads only its two Teams' Players, coaches, availability and
 * fatigue, and an application only writes those). `dayGamesAreIndependent` checks that, and the day falls back to strict sequence
 * otherwise. Equality with the sequential resolution is certified by test (matchResolution.test.ts, "day phases").
 */
export interface PreparedDayGame {
  readonly game: Game
  readonly setup: MatchSetup
  /** WSR1: omitted means FAST (callers from before resolution policy). */
  readonly resolution?: DayResolution
}

export type DayOutcome =
  | { readonly resolution: 'FULL' | 'FAST'; readonly result: MatchNextResult }
  | { readonly resolution: 'BACKGROUND'; readonly result: BackgroundMatchResult }

export function dayGamesAreIndependent(games: readonly Game[]): boolean {
  const teams = games.flatMap((game) => [game.homeTeamId, game.awayTeamId])
  return new Set(teams).size === teams.length
}

/** Phase 1: prepare the day's Games from one world, seeds drawn in the given order, each with its policy resolution. */
export function prepareDayGames(world: GameWorld, games: readonly Game[], createSeed: () => number, repairReports?: WorldRepairReport[], settings: SimulationDetailSettings = simulationDetailFor(world), context: SimulationResolutionContext = {}): PreparedDayGame[] {
  const decisions = decideResolutions(world, games, settings, context)
  return games.map((game, index) => {
    const prepared = prepareMatchSetupWithReports(world, game, createSeed())
    repairReports?.push(...prepared.repairReports)
    return { game, setup: prepared.setup, resolution: decisions[index]!.resolution }
  })
}

function simulateDayGameInline(item: PreparedDayGame): DayOutcome {
  return (item.resolution ?? 'FAST') === 'BACKGROUND'
    ? { resolution: 'BACKGROUND', result: simulateBackgroundMatch(item.setup) }
    : { resolution: item.resolution === 'FULL' ? 'FULL' : 'FAST', result: createMatchEnginePort('match-next').simulate(item.setup, item.resolution === 'FULL' ? 'FULL' : 'FAST') }
}

/** Phase 2 (inline): every prepared Game at its resolution. */
export function simulateDayOutcomesInline(prepared: readonly PreparedDayGame[]): DayOutcome[] {
  return prepared.map(simulateDayGameInline)
}

/**
 * Phase 2 with exact Games on `runner` (parallel workers in the app) and BACKGROUND Games inline (a fraction of a millisecond each, so
 * they need no worker). The outcomes are in schedule order whatever order the runner finishes in.
 */
export async function simulateDayOutcomes(prepared: readonly PreparedDayGame[], runner: MatchSimulationRunner): Promise<DayOutcome[]> {
  const exact = prepared.map((item, index) => ({ item, index })).filter(({ item }) => (item.resolution ?? 'FAST') === 'FAST')
  const pending = exact.length === 0 ? Promise.resolve([] as MatchNextResult[]) : runner.simulate(exact.map(({ item }) => item.setup))
  const outcomes: (DayOutcome | undefined)[] = prepared.map((item) => item.resolution === 'BACKGROUND' ? { resolution: 'BACKGROUND', result: simulateBackgroundMatch(item.setup) } : item.resolution === 'FULL' ? simulateDayGameInline(item) : undefined)
  const results = await pending
  exact.forEach(({ index }, at) => { outcomes[index] = { resolution: 'FAST', result: results[at]! } })
  return outcomes as DayOutcome[]
}

/** Phase 2 (inline), FAST only: kept for callers that prepare exact Games themselves. */
export function simulateDayGamesInline(prepared: readonly PreparedDayGame[]): MatchNextResult[] {
  const port = createMatchEnginePort('match-next')
  return prepared.map((item) => {
    if (item.resolution === 'BACKGROUND') throw new Error(`Game ${item.game.id} is a BACKGROUND Game: use simulateDayOutcomesInline`)
    return port.simulate(item.setup, 'FAST')
  })
}

function applyDayOutcome(world: GameWorld, outcome: DayOutcome, pendingEvidence?: DevelopmentStimulusEvent[]): GameWorld {
  return outcome.resolution === 'BACKGROUND' ? completeBackgroundMatch(world, outcome.result, pendingEvidence) : completeMatchNextExact(world, outcome.result, outcome.resolution, pendingEvidence)
}

function completeMatchNextExact(world: GameWorld, result: MatchNextResult, resolution: 'FULL' | 'FAST', pendingEvidence?: DevelopmentStimulusEvent[]): GameWorld {
  return createMatchEnginePort('match-next').complete(world, result, resolution, pendingEvidence)
}

/** Phase 3: apply the outcomes in the order of `prepared` (schedule order), each exactly once. */
export function applyDayOutcomes(world: GameWorld, prepared: readonly PreparedDayGame[], outcomes: readonly DayOutcome[]): GameWorld {
  if (outcomes.length !== prepared.length) throw new Error(`Expected ${prepared.length} match results, received ${outcomes.length}`)
  // One day's applications are one operation: the whole world is validated once, on the day's final world (fails closed as a whole).
  // WSR2.1: and one result batch (`withDailyResultBatch`): every result still runs the canonical chain in schedule order on the world the
  // previous one left, while the world-sized records the chain rewrites are copied once per day instead of once per result. Outcomes are
  // indexed by `prepared` (schedule order), never by the order simulations finished.
  return withDailyResultBatch(() => withSingleWorldValidation(world, (start) => {
    const pendingEvidence: DevelopmentStimulusEvent[] = []
    const resolved = prepared.reduce((current, item, index) => {
      const outcome = outcomes[index]!
      if (outcome.result.gameId !== item.game.id) throw new Error(`Match result ${outcome.result.gameId} does not belong to Game ${item.game.id}`)
      if (outcome.resolution !== (item.resolution ?? 'FAST')) throw new Error(`Game ${item.game.id} was prepared for ${item.resolution ?? 'FAST'} but resolved ${outcome.resolution}`)
      return applyDayOutcome(current, outcome, pendingEvidence)
    }, start)
    return pendingEvidence.length === 0 ? resolved : updateGameWorld(resolved, { developmentStimulusEventAdditions: pendingEvidence })
  }))
}

/** Phase 3 for FAST results only (callers that simulate exact Games themselves). */
export function applyDayResults(world: GameWorld, prepared: readonly PreparedDayGame[], results: readonly MatchNextResult[]): GameWorld {
  return applyDayOutcomes(world, prepared, results.map((result) => ({ resolution: 'FAST' as const, result })))
}

/** `resolveDayGames` with exact simulations on `runner`; the same world for the same seeds. */
export async function resolveDayGamesAsync(world: GameWorld, games: readonly Game[], createSeed: () => number, runner: MatchSimulationRunner, repairReports?: WorldRepairReport[], settings: SimulationDetailSettings = simulationDetailFor(world), context: SimulationResolutionContext = {}): Promise<GameWorld> {
  if (!dayGamesAreIndependent(games)) return resolveDayGames(world, games, createSeed, repairReports, settings, context)
  const prepared = prepareDayGames(world, games, createSeed, repairReports, settings, context)
  const outcomes = prepared.length === 0 ? [] : await simulateDayOutcomes(prepared, runner)
  return applyDayOutcomes(world, prepared, outcomes)
}

/** Resolves the given Games of one day: phased when they are independent, strictly sequential otherwise. */
export function resolveDayGames(world: GameWorld, games: readonly Game[], createSeed: () => number, repairReports?: WorldRepairReport[], settings: SimulationDetailSettings = simulationDetailFor(world), context: SimulationResolutionContext = {}): GameWorld {
  if (!dayGamesAreIndependent(games)) {
    // The day's resolutions are decided once, on the start-of-day world; each Game is then prepared on the world before it.
    const decisions = decideResolutions(world, games, settings, context)
    return withDailyResultBatch(() => withSingleWorldValidation(world, initial => {
      const pendingEvidence: DevelopmentStimulusEvent[] = []
      const resolved = games.reduce((current, game, index) => simulateAndApplyGame(current, game, createSeed(), repairReports, decisions[index]!.resolution, pendingEvidence), initial)
      return pendingEvidence.length === 0 ? resolved : updateGameWorld(resolved, { developmentStimulusEventAdditions: pendingEvidence })
    }))
  }
  const prepared = prepareDayGames(world, games, createSeed, repairReports, settings, context)
  return applyDayOutcomes(world, prepared, simulateDayOutcomesInline(prepared))
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
