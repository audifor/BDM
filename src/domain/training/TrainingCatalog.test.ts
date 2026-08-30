import { describe, expect, it } from 'vitest'
import { CANONICAL_RATING_KEYS } from '@/domain/player'
import { isPositionEligible, TRAINING_CATALOG, trainingDefinitionById } from './TrainingCatalog'

describe('TRAINING_CATALOG', () => {
  it('is a substantial built-in catalog covering all required categories', () => {
    expect(TRAINING_CATALOG.length).toBeGreaterThanOrEqual(40)
    const categories = new Set(TRAINING_CATALOG.map((entry) => entry.category))
    for (const category of ['shooting', 'finishing', 'ballHandling', 'playmaking', 'defense', 'rebounding', 'physical', 'recovery', 'tactical']) {
      expect(categories.has(category as never)).toBe(true)
    }
  })

  it('has unique ids and only targets real canonical rating keys', () => {
    const ids = TRAINING_CATALOG.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of TRAINING_CATALOG) {
      for (const rating of entry.effects.targetRatings) {
        expect(CANONICAL_RATING_KEYS).toContain(rating)
      }
    }
  })

  it('bounds every effect profile to sane, non-arbitrary ranges', () => {
    for (const entry of TRAINING_CATALOG) {
      expect(entry.effects.developmentWeight).toBeGreaterThanOrEqual(0)
      expect(entry.effects.developmentWeight).toBeLessThanOrEqual(2)
      expect(entry.effects.fatigueMultiplier).toBeGreaterThanOrEqual(-1)
      expect(entry.effects.fatigueMultiplier).toBeLessThanOrEqual(2)
      expect(Math.abs(entry.effects.moraleDelta)).toBeLessThanOrEqual(5)
      expect(Math.abs(entry.effects.cohesionDelta)).toBeLessThanOrEqual(5)
      expect(entry.durationMinutes).toBeGreaterThan(0)
      expect(entry.durationMinutes).toBeLessThanOrEqual(240)
    }
  })

  it('looks up a known definition and throws for an unknown id', () => {
    expect(trainingDefinitionById('threePoint').category).toBe('shooting')
    expect(() => trainingDefinitionById('not-real')).toThrow(RangeError)
  })

  it('isPositionEligible enforces eligiblePositions, and allows any position when unrestricted', () => {
    const postScoring = trainingDefinitionById('postScoring')
    expect(isPositionEligible(postScoring, 'PF')).toBe(true)
    expect(isPositionEligible(postScoring, 'C')).toBe(true)
    expect(isPositionEligible(postScoring, 'PG')).toBe(false)
    expect(isPositionEligible(postScoring, 'SG')).toBe(false)
    expect(isPositionEligible(postScoring, 'SF')).toBe(false)

    const threePoint = trainingDefinitionById('threePoint')
    expect(threePoint.eligiblePositions).toBeUndefined()
    for (const position of ['PG', 'SG', 'SF', 'PF', 'C'] as const) {
      expect(isPositionEligible(threePoint, position)).toBe(true)
    }
  })
})
