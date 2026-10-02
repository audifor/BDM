import type { GameId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { advanceGameDay } from './advanceGameDay'
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

export function getContinueStopReason(world: GameWorld, autoSimulatedRequiredReasons: readonly string[] = []): ContinueStopReason | undefined {
  const decision = evaluateSimulationBreakpoints(world)
  const primary = decision.breakpoint
  if (primary === undefined || (primary.level !== 'ACTION_REQUIRED' && primary.level !== 'BLOCKING')) return undefined
  const breakpoint = autoSimulatedRequiredReasons.includes(primary.reason)
    ? decision.candidates.find((candidate) => candidate !== primary
      && (candidate.level === 'ACTION_REQUIRED' || candidate.level === 'BLOCKING')
      && !autoSimulatedRequiredReasons.includes(candidate.reason))
    : primary
  if (breakpoint === undefined) return undefined
  if (breakpoint.reason === 'userGame') return { type: 'userGame', gameId: breakpoint.sourceId as GameId, breakpoint }
  if (breakpoint.reason === 'mediaOpportunity') return { type: 'mediaOpportunity', opportunityId: breakpoint.sourceId, breakpoint }
  if (breakpoint.reason === 'seasonComplete') return { type: 'seasonComplete', breakpoint }
  return { type: 'breakpoint', breakpoint }
}

/** Repeats the canonical daily application flow until a supported interruption. */
export function continueGame(world: GameWorld, dayLimit = DEFAULT_CONTINUE_DAY_LIMIT): ContinueResult {
  if (!Number.isInteger(dayLimit) || dayLimit < 1) throw new RangeError('Continue day limit must be a positive integer')
  let current = world; let daysAdvanced = 0
  while (daysAdvanced < dayLimit) {
    const interruption = getContinueStopReason(current, ['userGame'])
    if (interruption !== undefined) return result(current, daysAdvanced, interruption)
    current = advanceGameDay(current)
    daysAdvanced += 1
  }
  return result(current, daysAdvanced, getContinueStopReason(current) ?? { type: 'safetyLimit' })
}

export function getNextKnownEvent(world: GameWorld): NextKnownEvent | undefined {
  const team = getUserTeam(world); const game = getNextUserGame(world)
  if (team === undefined || game === undefined) return undefined
  return { type: 'userGame', gameId: game.id, date: game.date, opponentTeamId: game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId }
}
function result(world: GameWorld, daysAdvanced: number, stopReason: ContinueStopReason): ContinueResult { return { world, daysAdvanced, finalDate: world.currentDate, stopReason } }
