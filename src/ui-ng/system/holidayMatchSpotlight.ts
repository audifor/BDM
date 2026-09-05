import { addDays, compareGameDates, type GameDate } from '@/domain/date'

/** A holiday result stays on screen for the match morning and the next day. */
export const HOLIDAY_RESULT_HOLD_DAYS = 1

export function holidayResultStillVisible(matchDate: GameDate, liveDate: GameDate): boolean {
  return compareGameDates(liveDate, addDays(matchDate, HOLIDAY_RESULT_HOLD_DAYS)) <= 0
}
