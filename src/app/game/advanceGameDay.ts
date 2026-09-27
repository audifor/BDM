import { compareGameDates } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { advanceDay, getScheduledGamesToday } from '@/engine/calendar'
import { createPreMatchMediaOpportunity } from '@/engine/media'
import { getUserTeam } from '@/engine/calendar'

import { createMatchSeed, simulateAndApplyGame, type MatchSeedFactory } from './playUserGame'
import { evaluateSimulationBreakpoints, type SimulationBreakpointResult } from './SimulationBreakpoints'

export class SimulationAdvanceBlockedError extends Error {
  constructor(readonly decision: SimulationBreakpointResult) {
    super(decision.breakpoint?.diagnostic ?? 'Simulation cannot advance in the current state')
    this.name = 'SimulationAdvanceBlockedError'
  }
}

/** Direct day commands may explicitly quick-sim today's user game; all other reasons need resolution first. */
export function assertSimulationMayAdvance(world: GameWorld, allowedRequiredReasons: readonly string[] = ['userGame']): SimulationBreakpointResult {
  const decision = evaluateSimulationBreakpoints(world)
  const unhandled = decision.candidates.find((candidate) =>
    (candidate.level === 'ACTION_REQUIRED' || candidate.level === 'BLOCKING') && !allowedRequiredReasons.includes(candidate.reason),
  )
  if (unhandled !== undefined) throw new SimulationAdvanceBlockedError({ ...decision, breakpoint: unhandled, level: unhandled.level, mayAdvance: false })
  return decision.mayAdvance ? decision : { ...decision, mayAdvance: true }
}

/** Resolves every remaining game today without changing the calendar date. */
export function simulateRemainingGamesToday(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame']): GameWorld {
  assertSimulationMayAdvance(world, allowedRequiredReasons)
  return getScheduledGamesToday(world).reduce(
    (updatedWorld, game) => simulateAndApplyGame(updatedWorld, game, createSeed()),
    world,
  )
}

/** Resolves today's pending games, then advances the game calendar by one day. */
export function advanceGameDay(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame']): GameWorld {
  assertSimulationMayAdvance(world, allowedRequiredReasons)
  const resolvedWorld = simulateRemainingGamesToday(world, createSeed, allowedRequiredReasons)
  const advancedWorld = advanceDay(resolvedWorld)

  const pastScheduledGame = Object.values(advancedWorld.games).find(
    (game) => game.status === 'scheduled' && compareGameDates(game.date, advancedWorld.currentDate) < 0,
  )
  if (pastScheduledGame !== undefined) {
    throw new Error(`Cannot advance with scheduled Game ${pastScheduledGame.id} in the past`)
  }

  const userTeam = getUserTeam(advancedWorld)
  const userGame = userTeam === undefined ? undefined : getScheduledGamesToday(advancedWorld).find((game) => game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id)
  return userGame === undefined ? advancedWorld : createPreMatchMediaOpportunity(advancedWorld, userGame.id)
}
