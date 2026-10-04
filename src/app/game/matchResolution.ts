import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import type { WorldRepairReport } from '@/domain/repair'
import type { MatchTacticalPlan } from '@/engine/match'
import { createMatchEnginePort, prepareMatchSetupWithReports } from '@/app/matchNext'
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
