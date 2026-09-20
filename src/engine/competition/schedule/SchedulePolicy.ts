import { addDays, compareGameDates, type GameDate } from '@/domain/date'

export type SchedulePolicy = (
  roundCount: number,
  regularSeasonStart: GameDate,
  regularSeasonEnd: GameDate,
) => readonly GameDate[]

/** Distributes logical competition rounds across their regular-season calendar window. */
export const distributeRoundsAcrossSeason: SchedulePolicy = (
  roundCount: number,
  startDate: GameDate,
  endDate: GameDate,
) => {
  if (!Number.isInteger(roundCount) || roundCount < 1) {
    throw new RangeError('Schedule round count must be a positive integer')
  }
  if (compareGameDates(startDate, endDate) > 0) {
    throw new RangeError('Schedule start date must not be after its end date')
  }

  const availableDates = [startDate]
  while (compareGameDates(availableDates.at(-1)!, endDate) < 0) {
    availableDates.push(addDays(availableDates.at(-1)!, 1))
  }
  if (roundCount > availableDates.length) {
    throw new RangeError('Schedule window must have at least one date per round')
  }
  if (roundCount === 1) return Object.freeze([startDate])

  const lastIndex = availableDates.length - 1
  return Object.freeze(Array.from({ length: roundCount }, (_, index) =>
    availableDates[Math.floor(index * lastIndex / (roundCount - 1))]!,
  ))
}
