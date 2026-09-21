import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { GameId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { skipMediaOpportunity } from '@/engine/media'

import { advanceGameDay } from './advanceGameDay'
import { getContinueStopReason, type ContinueStopReason } from './ContinueFlow'
import { instantResult } from './playUserGame'
import { advanceCompetitionLifecycles, type UnsupportedLifecycleDiagnostic } from './CompetitionLifecycleCoordinator'

export type SimulateUntilStopReason = ContinueStopReason | { readonly type: 'arrived' } | { readonly type: 'unsupportedLifecycle'; readonly diagnostic: UnsupportedLifecycleDiagnostic }

export interface SimulateUntilResult {
  readonly world: GameWorld
  readonly daysAdvanced: number
  readonly finalDate: GameWorld['currentDate']
  readonly stopReason: SimulateUntilStopReason
}

export interface UserMatchSummary {
  readonly gameId: GameId
  readonly date: GameDate
  readonly homeName: string
  readonly awayName: string
  readonly homeScore: number
  readonly awayScore: number
  readonly userSide: 'home' | 'away'
  readonly outcome: 'win' | 'loss' | 'draw'
}

export type SimulateUntilEvent =
  | { readonly type: 'mediaSkipped' }
  | { readonly type: 'userMatch'; readonly match: UserMatchSummary }
  | { readonly type: 'dayAdvanced' }
  | { readonly type: 'seasonRolledOver'; readonly previousSeasonId: GameWorld['currentSeasonId']; readonly nextSeasonId: GameWorld['currentSeasonId'] }
  | { readonly type: 'finished'; readonly stopReason: SimulateUntilStopReason }

export interface SimulateUntilTick {
  readonly world: GameWorld
  readonly event: SimulateUntilEvent
}

/**
 * One canonical holiday step so the UI can paint the date and user results as they happen.
 *
 * Unlike `continueGame` (which stops and hands control back to the UI on `seasonComplete` so
 * the player can choose when to roll over), a "simulate until date" order is an explicit
 * instruction to reach `targetDate` regardless of competition lifecycle: any completed,
 * FULLY_SUPPORTED competition (see CompetitionLifecycleCoordinator) is resolved automatically
 * here via the same canonical `startNextSeason` transition the UI's manual button uses, so the
 * world clock never stops before `targetDate` merely because a season finished along the way.
 * If a competition without future-season support (UNSUPPORTED_FUTURE_LIFECYCLE) also completes,
 * that is reported as an explicit `unsupportedLifecycle` stop rather than silently skipped,
 * silently deleting its orphaned fixtures, or moving their dates -- see Paso 10.
 */
export function tickSimulateUntilDate(world: GameWorld, targetDate: GameDate): SimulateUntilTick {
  const target = parseGameDate(targetDate)
  if (compareGameDates(world.currentDate, target) >= 0) {
    return { world, event: { type: 'finished', stopReason: getContinueStopReason(world) ?? { type: 'arrived' } } }
  }

  // Checked every tick, not only when the primary (user-facing) competition happens to be
  // complete: a background competition (e.g. an NCAA-like season with no future-season
  // support) can complete independently while the primary is still mid-season, and its
  // orphaned fixtures must be caught here -- as an explicit diagnostic -- before `advanceGameDay`
  // ever reaches a date past them and throws its "scheduled game in the past" integrity guard.
  // `startNextSeasonFor` never moves `currentDate` (see startNextSeason.ts), so a rollover here
  // can never overshoot `target` the way an eager clock jump could.
  const advanced = advanceCompetitionLifecycles(world)
  if (advanced.blockedOn !== undefined) {
    return { world: advanced.world, event: { type: 'finished', stopReason: { type: 'unsupportedLifecycle', diagnostic: advanced.blockedOn } } }
  }
  if (advanced.world !== world) {
    return { world: advanced.world, event: { type: 'seasonRolledOver', previousSeasonId: world.currentSeasonId, nextSeasonId: advanced.world.currentSeasonId } }
  }

  const interruption = getContinueStopReason(world)
  if (interruption?.type === 'seasonComplete') {
    // The primary's next edition already exists (rolled above, if it was FULLY_SUPPORTED) with a
    // future `startDate`; keep advancing one day at a time until the world clock reaches it and
    // `currentSeasonId` migrates naturally (see CalendarEngine.migrateCurrentSeasonIfElapsed).
    return { world: advanceGameDay(world), event: { type: 'dayAdvanced' } }
  }
  if (interruption?.type === 'mediaOpportunity') {
    return { world: skipMediaOpportunity(world, interruption.opportunityId), event: { type: 'mediaSkipped' } }
  }
  if (interruption?.type === 'userGame') {
    const next = instantResult(world)
    const match = summarizeResolvedUserMatch(world, next)
    return match === undefined
      ? { world: next, event: { type: 'mediaSkipped' } }
      : { world: next, event: { type: 'userMatch', match } }
  }

  return { world: advanceGameDay(world), event: { type: 'dayAdvanced' } }
}

/** Advances the canonical daily pipeline until the chosen morning, simulating every pending event on the way. */
export function simulateUntilDate(world: GameWorld, targetDate: GameDate): SimulateUntilResult {
  const target = parseGameDate(targetDate)
  if (compareGameDates(target, world.currentDate) <= 0) {
    throw new RangeError('Simulate-until date must be after the current game date')
  }

  let current = world
  let daysAdvanced = 0
  const maxDays = Math.max(1, calendarDaysBetween(world.currentDate, target))
  let iterations = 0
  const maxIterations = maxDays * 8 + 16

  while (compareGameDates(current.currentDate, target) < 0) {
    iterations += 1
    if (iterations > maxIterations || daysAdvanced >= maxDays) {
      return result(current, daysAdvanced, { type: 'safetyLimit' })
    }

    const tick = tickSimulateUntilDate(current, target)
    if (tick.event.type === 'finished') {
      return result(tick.world, daysAdvanced, tick.event.stopReason)
    }

    current = tick.world
    if (tick.event.type === 'dayAdvanced') {
      daysAdvanced += 1
    }
  }

  return result(current, daysAdvanced, getContinueStopReason(current) ?? { type: 'arrived' })
}

function summarizeResolvedUserMatch(before: GameWorld, after: GameWorld): UserMatchSummary | undefined {
  const team = getUserTeam(after)
  if (team === undefined) return undefined

  const resolved = Object.values(after.games).find((game) => {
    const previous = before.games[game.id]
    return (
      game.status === 'completed' &&
      previous?.status === 'scheduled' &&
      (game.homeTeamId === team.id || game.awayTeamId === team.id)
    )
  })
  if (resolved === undefined || resolved.status !== 'completed') return undefined

  const userIsHome = resolved.homeTeamId === team.id
  const userScore = userIsHome ? resolved.result.homeScore : resolved.result.awayScore
  const oppScore = userIsHome ? resolved.result.awayScore : resolved.result.homeScore

  return {
    gameId: resolved.id,
    date: resolved.date,
    homeName: after.teams[resolved.homeTeamId]?.name ?? resolved.homeTeamId,
    awayName: after.teams[resolved.awayTeamId]?.name ?? resolved.awayTeamId,
    homeScore: resolved.result.homeScore,
    awayScore: resolved.result.awayScore,
    userSide: userIsHome ? 'home' : 'away',
    outcome: userScore === oppScore ? 'draw' : userScore > oppScore ? 'win' : 'loss',
  }
}

function result(world: GameWorld, daysAdvanced: number, stopReason: SimulateUntilStopReason): SimulateUntilResult {
  return { world, daysAdvanced, finalDate: world.currentDate, stopReason }
}

function calendarDaysBetween(from: GameDate, to: GameDate): number {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  const start = Date.UTC(fromYear!, fromMonth! - 1, fromDay!)
  const end = Date.UTC(toYear!, toMonth! - 1, toDay!)
  return Math.round((end - start) / 86_400_000)
}
