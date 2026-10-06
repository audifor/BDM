import type { GameId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { advanceGameDay, advanceGameDayAsync } from './advanceGameDay'
import type { MatchSimulationRunner } from '@/app/matchNext/MatchSimulationRunner'
import { createMatchSeed, type MatchSeedFactory } from './playUserGame'
import { evaluateSimulationBreakpoints, type SimulationBreakpoint } from './SimulationBreakpoints'

export type ContinueStopReason =
  | { readonly type: 'userGame'; readonly gameId: GameId; readonly breakpoint: SimulationBreakpoint }
  | { readonly type: 'mediaOpportunity'; readonly opportunityId: string; readonly breakpoint: SimulationBreakpoint }
  | { readonly type: 'seasonComplete'; readonly breakpoint: SimulationBreakpoint }
  | { readonly type: 'breakpoint'; readonly breakpoint: SimulationBreakpoint }
  | { readonly type: 'safetyLimit' }
  | { readonly type: 'noProgress'; readonly diagnostic: string }

export interface ContinueResult { readonly world: GameWorld; readonly daysAdvanced: number; readonly finalDate: GameWorld['currentDate']; readonly stopReason: ContinueStopReason }
export interface NextKnownEvent { readonly type: 'userGame'; readonly gameId: GameId; readonly date: GameWorld['currentDate']; readonly opponentTeamId: TeamId }
export const DEFAULT_CONTINUE_DAY_LIMIT = 366

/**
 * The canonical Continue interruption: the highest-priority ACTION_REQUIRED/BLOCKING breakpoint on the current date.
 * A user game is a deliberate stop, so Continue never simulates the user's own matches (the UI opens the match instead).
 */
export function getContinueStopReason(world: GameWorld): ContinueStopReason | undefined {
  const breakpoint = evaluateSimulationBreakpoints(world).breakpoint
  if (breakpoint === undefined || (breakpoint.level !== 'ACTION_REQUIRED' && breakpoint.level !== 'BLOCKING')) return undefined
  if (breakpoint.reason === 'userGame') return { type: 'userGame', gameId: breakpoint.sourceId as GameId, breakpoint }
  if (breakpoint.reason === 'mediaOpportunity') return { type: 'mediaOpportunity', opportunityId: breakpoint.sourceId, breakpoint }
  if (breakpoint.reason === 'seasonComplete') return { type: 'seasonComplete', breakpoint }
  return { type: 'breakpoint', breakpoint }
}

/**
 * The interruption policy for an explicit date order (`simulateUntilDate`): the user asked to reach a date, so
 * today's user game may be quick-simulated, but every other required decision still blocks the order.
 * `continueGame` deliberately does not use this policy — see `getContinueStopReason`.
 */
export function getExplicitAdvanceStopReason(world: GameWorld): ContinueStopReason | undefined {
  const decision = evaluateSimulationBreakpoints(world)
  const required = decision.candidates.filter((candidate) => candidate.level === 'ACTION_REQUIRED' || candidate.level === 'BLOCKING')
  const nonGame = required.find((candidate) => candidate.reason !== 'userGame')
  if (nonGame === undefined) return undefined
  if (nonGame.reason === 'mediaOpportunity') return { type: 'mediaOpportunity', opportunityId: nonGame.sourceId, breakpoint: nonGame }
  if (nonGame.reason === 'seasonComplete') return { type: 'seasonComplete', breakpoint: nonGame }
  return { type: 'breakpoint', breakpoint: nonGame }
}

/**
 * Repeats the canonical daily application flow until the canonical Continue interruption.
 * Stops before simulating the user's own match day so the player can play or instant-result it;
 * the explicit "advance one day" path keeps its quick-simulation allowance.
 * Every iteration either advances `currentDate` or returns an explicit stop reason — never a silent no-op.
 */
export function continueGame(world: GameWorld, dayLimit = DEFAULT_CONTINUE_DAY_LIMIT, createSeed: MatchSeedFactory = createMatchSeed): ContinueResult {
  if (!Number.isInteger(dayLimit) || dayLimit < 1) throw new RangeError('Continue day limit must be a positive integer')
  let current = world; let daysAdvanced = 0
  while (daysAdvanced < dayLimit) {
    const interruption = getContinueStopReason(current)
    if (interruption !== undefined) return result(current, daysAdvanced, interruption)
    const next = advanceGameDay(current, createSeed)
    const stalled = noProgressStop(current, next)
    if (stalled !== undefined) return result(next, daysAdvanced, stalled)
    current = next
    daysAdvanced += 1
  }
  return result(current, daysAdvanced, getContinueStopReason(current) ?? { type: 'safetyLimit' })
}

/** ME-LOCK1.1: `continueGame` with each day's match simulations on `runner` (parallel workers in the app); the same world. */
export async function continueGameAsync(world: GameWorld, runner: MatchSimulationRunner, dayLimit = DEFAULT_CONTINUE_DAY_LIMIT, createSeed: MatchSeedFactory = createMatchSeed): Promise<ContinueResult> {
  if (!Number.isInteger(dayLimit) || dayLimit < 1) throw new RangeError('Continue day limit must be a positive integer')
  let current = world; let daysAdvanced = 0
  while (daysAdvanced < dayLimit) {
    const interruption = getContinueStopReason(current)
    if (interruption !== undefined) return result(current, daysAdvanced, interruption)
    const next = await advanceGameDayAsync(current, runner, createSeed)
    const stalled = noProgressStop(current, next)
    if (stalled !== undefined) return result(next, daysAdvanced, stalled)
    current = next
    daysAdvanced += 1
  }
  return result(current, daysAdvanced, getContinueStopReason(current) ?? { type: 'safetyLimit' })
}

export function getNextKnownEvent(world: GameWorld): NextKnownEvent | undefined {
  const team = getUserTeam(world); const game = getNextUserGame(world)
  if (team === undefined || game === undefined) return undefined
  return { type: 'userGame', gameId: game.id, date: game.date, opponentTeamId: game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId }
}

/** Loop guard: a day transition that leaves the clock on the same date is a lifecycle defect, never a silent no-op. */
export function noProgressStop(previous: GameWorld, next: GameWorld): ContinueStopReason | undefined {
  if (next.currentDate !== previous.currentDate) return undefined
  return { type: 'noProgress', diagnostic: `NO_PROGRESS_INVARIANT: the day transition from ${previous.currentDate} did not advance the world clock.` }
}

function result(world: GameWorld, daysAdvanced: number, stopReason: ContinueStopReason): ContinueResult { return { world, daysAdvanced, finalDate: world.currentDate, stopReason } }
