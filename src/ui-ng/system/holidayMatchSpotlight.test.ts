import { describe, expect, it } from 'vitest'

import { addDays, parseGameDate } from '@/domain/date'

import { holidayResultStillVisible } from './holidayMatchSpotlight'

describe('holiday match spotlight', () => {
  it('keeps a result for two calendar days and hides it afterwards', () => {
    const matchDate = parseGameDate('2026-09-26')

    expect(holidayResultStillVisible(matchDate, matchDate)).toBe(true)
    expect(holidayResultStillVisible(matchDate, addDays(matchDate, 1))).toBe(true)
    expect(holidayResultStillVisible(matchDate, addDays(matchDate, 2))).toBe(false)
  })
})
