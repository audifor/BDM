import { describe, expect, it } from 'vitest'
import { classifyDailyLoad, dailyWorkloadScore } from './TrainingLoad'

describe('classifyDailyLoad', () => {
  it('classifies OK, HIGH and VERY_HIGH thresholds deterministically', () => {
    expect(classifyDailyLoad(0)).toBe('OK')
    expect(classifyDailyLoad(79)).toBe('OK')
    expect(classifyDailyLoad(80)).toBe('HIGH')
    expect(classifyDailyLoad(119)).toBe('HIGH')
    expect(classifyDailyLoad(120)).toBe('VERY_HIGH')
    expect(classifyDailyLoad(500)).toBe('VERY_HIGH')
  })
})

describe('dailyWorkloadScore', () => {
  it('one medium 60-minute session stays OK', () => {
    expect(classifyDailyLoad(dailyWorkloadScore('normal', 60, 1))).toBe('OK')
  })

  it('two medium 60-minute sessions become HIGH', () => {
    const total = dailyWorkloadScore('normal', 60, 1) * 2
    expect(classifyDailyLoad(total)).toBe('HIGH')
  })

  it('three medium 60-minute sessions become VERY_HIGH', () => {
    const total = dailyWorkloadScore('normal', 60, 1) * 3
    expect(classifyDailyLoad(total)).toBe('VERY_HIGH')
  })

  it('a high-intensity 90-minute session scores more than a medium 60-minute session', () => {
    expect(dailyWorkloadScore('high', 90, 1)).toBeGreaterThan(dailyWorkloadScore('normal', 60, 1))
  })

  it('recovery (negative fatigueMultiplier) contributes materially less than high physical work', () => {
    const recovery = dailyWorkloadScore('light', 45, -0.6)
    const highPhysical = dailyWorkloadScore('high', 60, 1.3)
    expect(recovery).toBeLessThan(highPhysical * 0.25)
  })
})
