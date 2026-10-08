import type { SimulationResolutionContext } from '@/app/worldSim/SimulationResolutionPolicy'
import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { GameId } from '@/domain/ids'
import { withSingleWorldValidation, type GameWorld } from '@/domain/world'
import { repairWorldAtLifecycleBoundary } from '@/app/repair'

import { advanceGameDay, simulateRemainingGamesToday, type WorldDayAdvanceObserver } from './advanceGameDay'
import { getContinueStopReason, getExplicitAdvanceStopReason, type ContinueStopReason } from './ContinueFlow'
import { createMatchSeed, type MatchSeedFactory } from './playUserGame'
import { getScheduledGamesToday } from '@/engine/calendar'
import { advanceCompetitionLifecycles, type UnsupportedLifecycleDiagnostic } from './CompetitionLifecycleCoordinator'
import type { CompetitionSeasonTransitionResult } from './startNextSeason'

export type SimulateUntilStopReason = ContinueStopReason | { readonly type: 'arrived' } | { readonly type: 'unsupportedLifecycle'; readonly diagnostic: UnsupportedLifecycleDiagnostic }

export interface SimulateUntilResult {
  readonly world: GameWorld
  readonly daysAdvanced: number
  readonly finalDate: GameWorld['currentDate']
  readonly stopReason: SimulateUntilStopReason
  readonly seasonTransitions: readonly CompetitionSeasonTransitionResult[]
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
  | { readonly type: 'seasonRolledOver'; readonly previousSeasonId: GameWorld['currentSeasonId']; readonly nextSeasonId: GameWorld['currentSeasonId']; readonly transitions: readonly CompetitionSeasonTransitionResult[] }
  | { readonly type: 'finished'; readonly stopReason: SimulateUntilStopReason; readonly transitions?: readonly CompetitionSeasonTransitionResult[] }

export interface SimulateUntilTick {
  readonly world: GameWorld
  readonly event: SimulateUntilEvent
}

/** Optional transient timings for certification and diagnostics; it does not affect lifecycle order. */
export interface SimulateUntilObserver {
  readonly simulationContext?: SimulationResolutionContext
  readonly onDayAdvance?: WorldDayAdvanceObserver
  readonly onSeasonLifecycle?: (elapsedMs: number, transitionCount: number) => void
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
export function tickSimulateUntilDate(world: GameWorld, targetDate: GameDate, createSeed: MatchSeedFactory = createMatchSeed, observer?: SimulateUntilObserver): SimulateUntilTick {
  const target = parseGameDate(targetDate)
  if (compareGameDates(world.currentDate, target) >= 0) {
    return { world, event: { type: 'finished', stopReason: getContinueStopReason(world) ?? { type: 'arrived' } } }
  }

  const interruption = getContinueStopReason(world)
  const advanceStop = getExplicitAdvanceStopReason(world)
  if (advanceStop !== undefined && advanceStop.type !== 'seasonComplete') {
    return { world, event: { type: 'finished', stopReason: advanceStop } }
  }

  // Checked every tick, not only when the primary (user-facing) competition happens to be
  // complete: a background competition (e.g. an NCAA-like season with no future-season
  // support) can complete independently while the primary is still mid-season, and its
  // orphaned fixtures must be caught here -- as an explicit diagnostic -- before `advanceGameDay`
  // ever reaches a date past them and throws its "scheduled game in the past" integrity guard.
  // `startNextSeasonFor` never moves `currentDate` (see startNextSeason.ts), so a rollover here
  // can never overshoot `target` the way an eager clock jump could.
  const seasonLifecycleStarted = performance.now()
  const advanced = advanceCompetitionLifecycles(world)
  observer?.onSeasonLifecycle?.(performance.now() - seasonLifecycleStarted, advanced.transitions.length)
  if (advanced.blockedOn !== undefined) {
    return { world: advanced.world, event: { type: 'finished', stopReason: getContinueStopReason(advanced.world) ?? { type: 'unsupportedLifecycle', diagnostic: advanced.blockedOn }, transitions: advanced.transitions } }
  }
  if (advanced.world !== world) {
    return { world: advanced.world, event: { type: 'seasonRolledOver', previousSeasonId: world.currentSeasonId, nextSeasonId: advanced.world.currentSeasonId, transitions: advanced.transitions } }
  }

  if (interruption?.type === 'seasonComplete') {
    // The primary's next edition already exists (rolled above, if it was FULLY_SUPPORTED) with a
    // future `startDate`; keep advancing one day at a time until the world clock reaches it and
    // `currentSeasonId` migrates naturally (see CalendarEngine.migrateCurrentSeasonIfElapsed).
    return { world: advanceGameDay(world, createSeed, ['seasonComplete'], observer?.onDayAdvance, observer?.simulationContext), event: { type: 'dayAdvanced' } }
  }
  if (advanceStop !== undefined) return { world, event: { type: 'finished', stopReason: advanceStop } }

  return { world: advanceGameDay(world, createSeed, ['userGame'], observer?.onDayAdvance, observer?.simulationContext), event: { type: 'dayAdvanced' } }
}

/** Advances the canonical daily pipeline until the chosen morning, simulating every pending event on the way. */
export function simulateUntilDate(world: GameWorld, targetDate: GameDate, createSeed: MatchSeedFactory = createMatchSeed, observer?: SimulateUntilObserver): SimulateUntilResult {
  const target = parseGameDate(targetDate)
  if (compareGameDates(target, world.currentDate) <= 0) {
    throw new RangeError('Simulate-until date must be after the current game date')
  }

  let current = world
  let daysAdvanced = 0
  const seasonTransitions: CompetitionSeasonTransitionResult[] = []
  const maxDays = Math.max(1, calendarDaysBetween(world.currentDate, target))
  let iterations = 0
  const maxIterations = maxDays * 8 + 16

  while (compareGameDates(current.currentDate, target) < 0) {
    iterations += 1
    if (iterations > maxIterations || daysAdvanced >= maxDays) {
      return result(current, daysAdvanced, { type: 'safetyLimit' }, seasonTransitions)
    }

    const tick = tickSimulateUntilDate(current, target, createSeed, observer)
    if (tick.event.type === 'seasonRolledOver') seasonTransitions.push(...tick.event.transitions)
    if (tick.event.type === 'finished' && tick.event.transitions !== undefined) seasonTransitions.push(...tick.event.transitions)
    if (tick.event.type === 'finished') {
      return result(tick.world, daysAdvanced, tick.event.stopReason, seasonTransitions)
    }

    current = tick.world
    if (tick.event.type === 'dayAdvanced') {
      daysAdvanced += 1
    }
  }

  if (getExplicitAdvanceStopReason(current) === undefined && getScheduledGamesToday(current).length > 0) {
    // Arriving at the requested morning resolves its fixtures too. Apply the
    // same pre-match repair as a daily advance, without advancing the date.
    current = withSingleWorldValidation(current, initial => {
      const teams = [...new Set(getScheduledGamesToday(initial).flatMap(game => [game.homeTeamId, game.awayTeamId]))].sort((a, b) => a.localeCompare(b))
      const repair = repairWorldAtLifecycleBoundary(initial, teams)
      const invalid = repair.reports.find(report => report.classification === 'UNRECOVERABLE' && report.sourceDomain === 'MARKET_ROSTER_CONTRACT')
      if (invalid) throw new Error(invalid.diagnostics[0]?.message ?? 'Roster/contract integrity could not be reconciled.')
      return simulateRemainingGamesToday(repair.world, createSeed, ['userGame'], [...repair.reports], observer?.simulationContext)
    })
  }
  return result(current, daysAdvanced, getExplicitAdvanceStopReason(current) ?? { type: 'arrived' }, seasonTransitions)
}

function result(world: GameWorld, daysAdvanced: number, stopReason: SimulateUntilStopReason, seasonTransitions: readonly CompetitionSeasonTransitionResult[] = []): SimulateUntilResult {
  return { world, daysAdvanced, finalDate: world.currentDate, stopReason, seasonTransitions: Object.freeze([...seasonTransitions]) }
}

function calendarDaysBetween(from: GameDate, to: GameDate): number {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  const start = Date.UTC(fromYear!, fromMonth! - 1, fromDay!)
  const end = Date.UTC(toYear!, toMonth! - 1, toDay!)
  return Math.round((end - start) / 86_400_000)
}
