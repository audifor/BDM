import type { GameId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { advanceGameDay, advanceGameDayAsync } from './advanceGameDay'
import type { MatchSimulationRunner } from '@/app/matchNext/MatchSimulationRunner'
import { evaluateSimulationBreakpoints, type SimulationBreakpoint } from './SimulationBreakpoints'

export type ContinueStopReason =
  | { readonly type: 'userGame'; readonly gameId: GameId; readonly breakpoint: SimulationBreakpoint }
  | { readonly type: 'mediaOpportunity'; readonly opportunityId: string; readonly breakpoint: SimulationBreakpoint }
  | { readonly type: 'seasonComplete'; readonly breakpoint: SimulationBreakpoint }
  | { readonly type: 'breakpoint'; readonly breakpoint: SimulationBreakpoint }
  | { readonly type: 'safetyLimit' }

export interface ContinueResult { readonly world: GameWorld; readonly daysAdvanced: number; readonly finalDate: GameWorld['currentDate']; readonly stopReason: ContinueStopReason }
export interface NextKnownEvent { readonly type: 'userGame'; readonly gameId: GameId; readonly date: GameWorld['currentDate']; readonly opponentTeamId: TeamId }
export const DEFAULT_CONTINUE_DAY_LIMIT = 366

export function getContinueStopReason(world: GameWorld): ContinueStopReason | undefined {
  const breakpoint = evaluateSimulationBreakpoints(world).breakpoint
  if (breakpoint === undefined || (breakpoint.level !== 'ACTION_REQUIRED' && breakpoint.level !== 'BLOCKING')) return undefined
  if (breakpoint.reason === 'userGame') return { type: 'userGame', gameId: breakpoint.sourceId as GameId, breakpoint }
  if (breakpoint.reason === 'mediaOpportunity') return { type: 'mediaOpportunity', opportunityId: breakpoint.sourceId, breakpoint }
  if (breakpoint.reason === 'seasonComplete') return { type: 'seasonComplete', breakpoint }
  return { type: 'breakpoint', breakpoint }
}

/** Explicit date advancement auto-resolves user games, but keeps every other required decision blocking. */
export function getExplicitAdvanceStopReason(world: GameWorld): ContinueStopReason | undefined {
  const decision = evaluateSimulationBreakpoints(world)
  const required = decision.candidates.filter((candidate) => candidate.level === 'ACTION_REQUIRED' || candidate.level === 'BLOCKING')
  const nonGame = required.find((candidate) => candidate.reason !== 'userGame')
  if (nonGame === undefined) return undefined
  if (nonGame.reason === 'mediaOpportunity') return { type: 'mediaOpportunity', opportunityId: nonGame.sourceId, breakpoint: nonGame }
  if (nonGame.reason === 'seasonComplete') return { type: 'seasonComplete', breakpoint: nonGame }
  return { type: 'breakpoint', breakpoint: nonGame }
}

/** Repeats the canonical daily application flow until a supported interruption. */
export function continueGame(world: GameWorld, dayLimit = DEFAULT_CONTINUE_DAY_LIMIT): ContinueResult {
  if (!Number.isInteger(dayLimit) || dayLimit < 1) throw new RangeError('Continue day limit must be a positive integer')
  let current = world; let daysAdvanced = 0
  while (daysAdvanced < dayLimit) {
    const interruption = getExplicitAdvanceStopReason(current)
    if (interruption !== undefined) return result(current, daysAdvanced, interruption)
    current = advanceGameDay(current)
    daysAdvanced += 1
  }
  return result(current, daysAdvanced, getExplicitAdvanceStopReason(current) ?? { type: 'safetyLimit' })
}

/** ME-LOCK1.1: `continueGame` with each day's match simulations on `runner` (parallel workers in the app); the same world. */
export async function continueGameAsync(world: GameWorld, runner: MatchSimulationRunner, dayLimit = DEFAULT_CONTINUE_DAY_LIMIT): Promise<ContinueResult> {
  if (!Number.isInteger(dayLimit) || dayLimit < 1) throw new RangeError('Continue day limit must be a positive integer')
  let current = world; let daysAdvanced = 0
  while (daysAdvanced < dayLimit) {
    const interruption = getExplicitAdvanceStopReason(current)
    if (interruption !== undefined) return result(current, daysAdvanced, interruption)
    current = await advanceGameDayAsync(current, runner)
    daysAdvanced += 1
  }
  return result(current, daysAdvanced, getExplicitAdvanceStopReason(current) ?? { type: 'safetyLimit' })
}

export function getNextKnownEvent(world: GameWorld): NextKnownEvent | undefined {
  const team = getUserTeam(world); const game = getNextUserGame(world)
  if (team === undefined || game === undefined) return undefined
  return { type: 'userGame', gameId: game.id, date: game.date, opponentTeamId: game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId }
}
function result(world: GameWorld, daysAdvanced: number, stopReason: ContinueStopReason): ContinueResult { return { world, daysAdvanced, finalDate: world.currentDate, stopReason } }
