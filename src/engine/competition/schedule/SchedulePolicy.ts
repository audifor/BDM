import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import type { CompetitionCalendarPolicy } from '@/domain/season'

export type SchedulePolicy = (
  roundCount: number,
  regularSeasonStart: GameDate,
  regularSeasonEnd: GameDate,
  calendarPolicy?: CompetitionCalendarPolicy,
) => readonly GameDate[]

/** Schedules rounds on configured league days, respecting event windows, breaks and rest. */
export const scheduleRoundsByCalendar: SchedulePolicy = (
  roundCount,
  startDate,
  endDate,
  calendarPolicy,
) => {
  if (!Number.isInteger(roundCount) || roundCount < 1) throw new RangeError('Schedule round count must be a positive integer')
  if (compareGameDates(startDate, endDate) > 0) throw new RangeError('Schedule start date must not be after its end date')

  const windowStart = calendarPolicy?.regularSeasonWindow.startDate ?? startDate
  const windowEnd = calendarPolicy?.regularSeasonWindow.endDate ?? endDate
  const cadence = calendarPolicy?.regularSeasonCadence
  const weeklyCadenceDays = cadence?.weeklyCadenceDays ?? 7
  const minimumRestDays = cadence?.minimumRestDays ?? 3
  const preferredWeekdays = cadence?.preferredWeekdays ?? [weekday(windowStart)]
  const midweekWeekdays = cadence?.midweekWeekdays ?? []
  const midweekRoundNumbers = new Set(cadence?.midweekRoundNumbers ?? [])
  const blackouts = calendarPolicy?.specialCompetitionWindows ?? []
  const dates: GameDate[] = []

  for (let roundNumber = 1; roundNumber <= roundCount; roundNumber += 1) {
    const previous = dates.at(-1)
    const isMidweek = midweekRoundNumbers.has(roundNumber)
    let target = previous === undefined
      ? windowStart
      : addDays(previous, isMidweek || midweekRoundNumbers.has(roundNumber - 1)
        ? minimumRestDays
        : weeklyCadenceDays + (cadence?.breakDaysAfterRound[roundNumber - 1] ?? 0))
    const matchdays = isMidweek && midweekWeekdays.length > 0 ? midweekWeekdays : preferredWeekdays
    let found: GameDate | undefined

    while (compareGameDates(target, windowEnd) <= 0) {
      if (matchdays.includes(weekday(target)) && !blackouts.some((window) => target >= window.startDate && target <= window.endDate)) {
        found = target
        break
      }
      target = addDays(target, 1)
    }

    if (found === undefined) throw new RangeError(`Regular-season calendar cannot place round ${roundNumber} before ${windowEnd}`)
    dates.push(found)
  }

  return Object.freeze(dates)
}

/** Compatibility export; dates now follow cadence and configured event windows. */
export const distributeRoundsAcrossSeason = scheduleRoundsByCalendar

function weekday(date: GameDate): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay()
}
