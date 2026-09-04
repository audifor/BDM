import type { GameDate } from '@/domain/date'

/** Canonical Staff weekly checkpoint: ISO Monday, derived from game-calendar time only. */
export function isStaffWeeklyCheckpoint(date: GameDate): boolean {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()
  return (weekday === 0 ? 7 : weekday) === 1
}
