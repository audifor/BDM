import { describe, expect, it } from 'vitest'

import { PERSONALITY_DIMENSIONS } from '@/domain/personality'
import { RELATIONSHIP_DIMENSION_KEYS } from '@/domain/relationships'
import { STAFF_HUMAN_STATE_DIMENSIONS } from '@/domain/staffHumanState'

import {
  clampCultureValue,
  createStaffCultureState,
  neutralCultureValues,
  STAFF_CULTURE_DIMENSIONS,
} from './StaffCulture'

describe('StaffCulture domain', () => {
  it('defines exactly 14 unique culture dimensions', () => {
    expect(STAFF_CULTURE_DIMENSIONS).toHaveLength(14)
    expect(new Set(STAFF_CULTURE_DIMENSIONS).size).toBe(14)
  })

  it('is a distinct vocabulary from Personality, Human State and Relationship facets', () => {
    for (const dimension of STAFF_CULTURE_DIMENSIONS) {
      expect(PERSONALITY_DIMENSIONS as readonly string[]).not.toContain(dimension)
      expect(STAFF_HUMAN_STATE_DIMENSIONS as readonly string[]).not.toContain(dimension)
      expect(RELATIONSHIP_DIMENSION_KEYS as readonly string[]).not.toContain(dimension)
    }
  })

  it('clamps to integer 0-100 and defaults non-finite input to neutral 50', () => {
    expect(clampCultureValue(-40)).toBe(0)
    expect(clampCultureValue(180)).toBe(100)
    expect(clampCultureValue(61.6)).toBe(62)
    expect(clampCultureValue(Number.NaN)).toBe(50)
    expect(clampCultureValue(Number.POSITIVE_INFINITY)).toBe(50)
  })

  it('neutral values are 50 across all 14 dimensions', () => {
    const neutral = neutralCultureValues()
    for (const dimension of STAFF_CULTURE_DIMENSIONS) expect(neutral[dimension]).toBe(50)
  })

  it('createStaffCultureState clamps both target and current and validates the scope key', () => {
    const raw = Object.fromEntries(STAFF_CULTURE_DIMENSIONS.map((dimension) => [dimension, 400])) as never
    const state = createStaffCultureState({ scopeKey: 'team-1', target: raw, current: raw, lastEvaluatedOn: '2030-01-07' as never })
    for (const dimension of STAFF_CULTURE_DIMENSIONS) {
      expect(state.target[dimension]).toBe(100)
      expect(state.current[dimension]).toBe(100)
    }
    expect(() => createStaffCultureState({ scopeKey: '  ', target: raw, current: raw, lastEvaluatedOn: '2030-01-07' as never })).toThrow()
  })
})
