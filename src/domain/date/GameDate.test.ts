import { describe, expect, it } from 'vitest'

import {
  addDays,
  addYears,
  compareGameDates,
  createGameDate,
  formatGameDate,
  isAfterGameDate,
  isBeforeGameDate,
  isSameGameDate,
  parseGameDate,
} from './index'

describe('GameDate', () => {
  it('creates and formats a valid calendar date', () => {
    const date = createGameDate(2032, 10, 1)

    expect(date).toBe('2032-10-01')
    expect(formatGameDate(date)).toBe('2032-10-01')
    expect(JSON.stringify({ date })).toBe('{"date":"2032-10-01"}')
  })

  it('rejects invalid calendar dates and formats', () => {
    expect(() => createGameDate(2032, 2, 30)).toThrow(RangeError)
    expect(() => parseGameDate('2032-2-01')).toThrow(TypeError)
    expect(() => parseGameDate('2032-02-30')).toThrow(RangeError)
    expect(() => parseGameDate('2032-10-01T00:00:00Z')).toThrow(TypeError)
  })

  it('handles leap years correctly', () => {
    expect(parseGameDate('2032-02-29')).toBe('2032-02-29')
    expect(() => parseGameDate('2031-02-29')).toThrow(RangeError)
  })

  it('adds days within and across calendar boundaries', () => {
    expect(addDays(parseGameDate('2032-10-01'), 4)).toBe('2032-10-05')
    expect(addDays(parseGameDate('2032-01-30'), 3)).toBe('2032-02-02')
    expect(addDays(parseGameDate('2032-12-31'), 1)).toBe('2033-01-01')
    expect(addDays(parseGameDate('2032-01-01'), -1)).toBe('2031-12-31')
  })

  it('adds calendar years without using local time', () => {
    expect(addYears(parseGameDate('2032-10-01'), 1)).toBe('2033-10-01')
  })

  it('compares calendar dates', () => {
    const earlier = parseGameDate('2032-10-01')
    const later = parseGameDate('2032-10-02')

    expect(compareGameDates(earlier, later)).toBe(-1)
    expect(compareGameDates(later, earlier)).toBe(1)
    expect(compareGameDates(earlier, earlier)).toBe(0)
    expect(isBeforeGameDate(earlier, later)).toBe(true)
    expect(isAfterGameDate(later, earlier)).toBe(true)
    expect(isSameGameDate(earlier, earlier)).toBe(true)
  })
})
