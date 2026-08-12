import { describe, expect, it } from 'vitest'

import { parseGameDate } from '@/domain/date'

import { calculateAge } from './PlayerAge'

describe('calculateAge', () => {
  it('changes exactly on the birthday', () => {
    const birth = parseGameDate('2000-10-02')
    expect(calculateAge(birth, parseGameDate('2032-10-01'))).toBe(31)
    expect(calculateAge(birth, parseGameDate('2032-10-02'))).toBe(32)
  })

  it('uses calendar dates without timezone approximation', () => {
    expect(calculateAge(parseGameDate('2004-02-29'), parseGameDate('2032-02-28'))).toBe(27)
    expect(calculateAge(parseGameDate('2004-02-29'), parseGameDate('2032-02-29'))).toBe(28)
  })
})
