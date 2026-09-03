import { describe, expect, it } from 'vitest'

import {
  clampUnitCohesionValue,
  createStaffUnitCohesionState,
  neutralUnitCohesionValues,
  staffUnitKeyFor,
  STAFF_UNIT_COHESION_DIMENSIONS,
} from './StaffUnitCohesion'

/** The one approved catalog. Vocabulary uniqueness across layers is NOT the goal — the exact set below is. */
const CANONICAL_STAFF_UNIT_COHESION_DIMENSIONS = [
  'communication',
  'coordination',
  'roleClarity',
  'mutualSupport',
  'sharedPurpose',
  'trustClimate',
  'leadershipAlignment',
  'stability',
] as const

describe('StaffUnitCohesion domain', () => {
  it('defines EXACTLY the canonical 8 cohesion dimensions, in order', () => {
    expect(STAFF_UNIT_COHESION_DIMENSIONS).toEqual(CANONICAL_STAFF_UNIT_COHESION_DIMENSIONS)
    expect(new Set(STAFF_UNIT_COHESION_DIMENSIONS).size).toBe(8)
  })

  it('never re-introduces the retired vocabulary from the pre-correction implementation', () => {
    const retired = ['cohesionTrust', 'communicationFlow', 'coordinationQuality', 'conflictTolerance', 'moraleAlignment', 'leadershipCohesion']
    for (const name of retired) expect(STAFF_UNIT_COHESION_DIMENSIONS as readonly string[]).not.toContain(name)
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
    const state = createStaffUnitCohesionState({ unitKey: 'team-1:medical', scopeKey: 'team-1', departmentProxy: 'medical', target: raw, current: raw, establishedOn: '2030-01-07' as never, lastEvaluatedOn: '2030-01-07' as never })
    for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) expect(state.current[dimension]).toBe(0)
    expect(() => createStaffUnitCohesionState({ unitKey: '', scopeKey: 'team-1', departmentProxy: 'medical', target: raw, current: raw, establishedOn: '2030-01-07' as never, lastEvaluatedOn: '2030-01-07' as never })).toThrow()
  })
})
