import { describe, expect, it } from 'vitest'

import { addDays, parseGameDate } from '@/domain/date'
import { SPAIN_ACB_2025_26_CALENDAR } from '@/data/worldCompetitionCalendars'
import { scheduleRoundsByCalendar } from './SchedulePolicy'

describe('SchedulePolicy', () => {
  it('uses the configured weekly cadence, Cup blackout and explicit midweek round', () => {
    const start = parseGameDate('2025-10-01')
    const end = parseGameDate('2026-06-30')
    const first = scheduleRoundsByCalendar(34, start, end, SPAIN_ACB_2025_26_CALENDAR)
    const second = scheduleRoundsByCalendar(34, start, end, SPAIN_ACB_2025_26_CALENDAR)

    expect(first).toEqual(second)
    expect(first).toHaveLength(34)
    expect(first[0]).toBe('2025-10-04')
    expect(first[16]).toBe('2026-01-24')
    expect(first[19]).toBe('2026-02-14')
    expect(first[20]).toBe('2026-03-07')
    expect(first[30]).toBe('2026-05-12')
    expect(first.at(-1)).toBe('2026-05-30')
    expect(new Set(first).size).toBe(34)
    expect(first.some((date) => date >= '2026-02-19' && date <= '2026-02-22')).toBe(false)
    expect(first.every((date) => date >= start && date <= end)).toBe(true)
  })

  it('rejects a window that cannot give every round a distinct date', () => {
    const start = parseGameDate('2026-01-01')

    expect(() => scheduleRoundsByCalendar(3, start, addDays(start, 1))).toThrow(RangeError)
  })
})
