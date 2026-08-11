declare const gameDateBrand: unique symbol

/** A calendar-only ISO date (`YYYY-MM-DD`) in the game's proleptic Gregorian calendar. */
export type GameDate = string & {
  readonly [gameDateBrand]: 'GameDate'
}

interface GameDateParts {
  year: number
  month: number
  day: number
}

const GAME_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function createGameDate(year: number, month: number, day: number): GameDate {
  validateParts(year, month, day)

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}` as GameDate
}

export function parseGameDate(value: string): GameDate {
  const match = GAME_DATE_PATTERN.exec(value)
  if (match === null) {
    throw new TypeError('GameDate must use YYYY-MM-DD format')
  }

  return createGameDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

export function formatGameDate(date: GameDate): string {
  return date
}

export function addDays(date: GameDate, amount: number): GameDate {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError('GameDate day offset must be a safe integer')
  }

  const parts = partsFromGameDate(date)
  const utcDate = new Date(0)
  utcDate.setUTCFullYear(parts.year, parts.month - 1, parts.day)
  utcDate.setUTCHours(0, 0, 0, 0)
  utcDate.setUTCDate(utcDate.getUTCDate() + amount)

  return createGameDate(utcDate.getUTCFullYear(), utcDate.getUTCMonth() + 1, utcDate.getUTCDate())
}

export function compareGameDates(a: GameDate, b: GameDate): -1 | 0 | 1 {
  if (a === b) {
    return 0
  }

  return a < b ? -1 : 1
}

export const isBeforeGameDate = (a: GameDate, b: GameDate): boolean => compareGameDates(a, b) < 0
export const isAfterGameDate = (a: GameDate, b: GameDate): boolean => compareGameDates(a, b) > 0
export const isSameGameDate = (a: GameDate, b: GameDate): boolean => compareGameDates(a, b) === 0

function partsFromGameDate(date: GameDate): GameDateParts {
  const [year, month, day] = date.split('-').map(Number)
  return { year: year!, month: month!, day: day! }
}

function validateParts(year: number, month: number, day: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError('GameDate year must be an integer from 1 to 9999')
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('GameDate month must be an integer from 1 to 12')
  }

  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError('GameDate day is invalid for its month and year')
  }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}
