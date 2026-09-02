import { describe, expect, it } from 'vitest'

import { RELATIONSHIP_DIMENSION_KEYS } from '@/domain/relationships'
import { STAFF_CULTURE_DIMENSIONS } from '@/domain/staffCulture'
import { STAFF_HUMAN_STATE_DIMENSIONS } from '@/domain/staffHumanState'

import {
  clampUnitCohesionValue,
  createStaffUnitCohesionState,
  neutralUnitCohesionValues,
  staffUnitKeyFor,
  STAFF_UNIT_COHESION_DIMENSIONS,
} from './StaffUnitCohesion'

describe('StaffUnitCohesion domain', () => {
  it('defines exactly 8 unique cohesion dimensions', () => {
    expect(STAFF_UNIT_COHESION_DIMENSIONS).toHaveLength(8)
    expect(new Set(STAFF_UNIT_COHESION_DIMENSIONS).size).toBe(8)
  })

  it('is a distinct vocabulary from Culture, Human State and dyadic Relationship facets', () => {
    for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) {
      expect(STAFF_CULTURE_DIMENSIONS as readonly string[]).not.toContain(dimension)
      expect(STAFF_HUMAN_STATE_DIMENSIONS as readonly string[]).not.toContain(dimension)
      expect(RELATIONSHIP_DIMENSION_KEYS as readonly string[]).not.toContain(dimension)
    }
  })

  it('clamps to integer 0-100 and defaults non-finite input to neutral 50', () => {
    expect(clampUnitCohesionValue(-5)).toBe(0)
    expect(clampUnitCohesionValue(140)).toBe(100)
    expect(clampUnitCohesionValue(49.4)).toBe(49)
    expect(clampUnitCohesionValue(Number.NaN)).toBe(50)
  })

  it('neutral values are 50 across all 8 dimensions', () => {
    const neutral = neutralUnitCohesionValues()
    for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) expect(neutral[dimension]).toBe(50)
  })

  it('builds a deterministic team:department unit key', () => {
    expect(staffUnitKeyFor('team-1' as never, 'coaching')).toBe('team-1:coaching')
  })

  it('createStaffUnitCohesionState clamps both value maps and validates the unit key', () => {
    const raw = Object.fromEntries(STAFF_UNIT_COHESION_DIMENSIONS.map((dimension) => [dimension, -30])) as never
    const state = createStaffUnitCohesionState({ unitKey: 'team-1:medical', target: raw, current: raw, lastEvaluatedOn: '2030-01-07' as never })
    for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) expect(state.current[dimension]).toBe(0)
    expect(() => createStaffUnitCohesionState({ unitKey: '', target: raw, current: raw, lastEvaluatedOn: '2030-01-07' as never })).toThrow()
  })
})
