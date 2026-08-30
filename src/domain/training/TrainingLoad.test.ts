import { describe, expect, it } from 'vitest'
import { classifyDailyLoad } from './TrainingLoad'

describe('classifyDailyLoad', () => {
  it('classifies OK, HIGH and VERY_HIGH thresholds deterministically', () => {
    expect(classifyDailyLoad(0)).toBe('OK')
    expect(classifyDailyLoad(89)).toBe('OK')
    expect(classifyDailyLoad(90)).toBe('HIGH')
    expect(classifyDailyLoad(149)).toBe('HIGH')
    expect(classifyDailyLoad(150)).toBe('VERY_HIGH')
    expect(classifyDailyLoad(500)).toBe('VERY_HIGH')
  })
})
