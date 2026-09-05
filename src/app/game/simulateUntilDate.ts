import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { GameId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { skipMediaOpportunity } from '@/engine/media'

import { advanceGameDay } from './advanceGameDay'
import { getContinueStopReason, type ContinueStopReason } from './ContinueFlow'
import { instantResult } from './playUserGame'

export type SimulateUntilStopReason = ContinueStopReason | { readonly type: 'arrived' }

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
  | { readonly type: 'finished'; readonly stopReason: SimulateUntilStopReason }

export interface SimulateUntilTick {
  readonly world: GameWorld
  readonly event: SimulateUntilEvent
}

/** One canonical holiday step so the UI can paint the date and user results as they happen. */
export function tickSimulateUntilDate(world: GameWorld, targetDate: GameDate): SimulateUntilTick {
  const target = parseGameDate(targetDate)
  if (compareGameDates(world.currentDate, target) >= 0) {
    return { world, event: { type: 'finished', stopReason: getContinueStopReason(world) ?? { type: 'arrived' } } }
  }

  const interruption = getContinueStopReason(world)
  if (interruption?.type === 'seasonComplete') {
    return { world, event: { type: 'finished', stopReason: interruption } }
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
