import { describe, expect, it } from 'vitest'
import { delegatedStimulusMultiplier } from './DelegatedTraining'

const MULTIPLIER_FLOOR = 0.85
const MULTIPLIER_CEILING = 1.15

describe('delegatedStimulusMultiplier', () => {
  it('is deterministic: same qualityScore + same seed produces the same multiplier across repeated calls', () => {
    const first = delegatedStimulusMultiplier(72, 'staff-training-stimulus-v1:responsibility:team-1:createTeamTrainingPlan:s1:player-1:2032-10-01')
    const second = delegatedStimulusMultiplier(72, 'staff-training-stimulus-v1:responsibility:team-1:createTeamTrainingPlan:s1:player-1:2032-10-01')
    expect(second).toBe(first)
  })

  it('always stays within the documented [0.85, 1.15] range, across the full quality spectrum and many seeds', () => {
    for (const qualityScore of [0, 10, 25, 40, 55, 70, 85, 100]) {
      for (let index = 0; index < 20; index += 1) {
        const multiplier = delegatedStimulusMultiplier(qualityScore, `range-check-seed-${qualityScore}-${index}`)
        expect(multiplier).toBeGreaterThanOrEqual(MULTIPLIER_FLOOR)
        expect(multiplier).toBeLessThanOrEqual(MULTIPLIER_CEILING)
      }
    }
  })

  it('high quality produces a narrower band around 1.0 than low quality', () => {
    const seeds = Array.from({ length: 40 }, (_, index) => `band-width-seed-${index}`)
    const highQualityDeviations = seeds.map((seed) => Math.abs(delegatedStimulusMultiplier(95, seed) - 1))
    const lowQualityDeviations = seeds.map((seed) => Math.abs(delegatedStimulusMultiplier(5, seed) - 1))
    const maxHighDeviation = Math.max(...highQualityDeviations)
    const maxLowDeviation = Math.max(...lowQualityDeviations)
    expect(maxHighDeviation).toBeLessThan(maxLowDeviation)
  })

  it('different seeds can produce different multipliers at the same quality (not a constant)', () => {
    const values = new Set(Array.from({ length: 10 }, (_, index) => delegatedStimulusMultiplier(20, `distinct-seed-${index}`)))
    expect(values.size).toBeGreaterThan(1)
  })
})
