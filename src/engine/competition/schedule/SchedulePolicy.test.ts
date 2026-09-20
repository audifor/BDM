import { describe, expect, it } from 'vitest'

import { addDays, parseGameDate } from '@/domain/date'
import { distributeRoundsAcrossSeason } from './SchedulePolicy'

describe('SchedulePolicy', () => {
  it('spreads rounds deterministically across the inclusive window', () => {
    const start = parseGameDate('2025-10-01')
    const end = parseGameDate('2026-06-30')
    const first = distributeRoundsAcrossSeason(34, start, end)
    const second = distributeRoundsAcrossSeason(34, start, end)

    expect(first).toEqual(second)
    expect(first).toHaveLength(34)
    expect(first[0]).toBe(start)
    expect(first.at(-1)).toBe(end)
    expect(new Set(first).size).toBe(34)
    expect(first.some((date) => date.startsWith('2026-03-'))).toBe(true)
    expect(first.some((date) => date.startsWith('2026-04-'))).toBe(true)
    expect(first.every((date) => date >= start && date <= end)).toBe(true)
  })

  it('rejects a window that cannot give every round a distinct date', () => {
    const start = parseGameDate('2026-01-01')

    expect(() => distributeRoundsAcrossSeason(3, start, addDays(start, 1))).toThrow(RangeError)
  })
})
