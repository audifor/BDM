import { describe, expect, it } from 'vitest'

import { STAFF_HUMAN_STATE_DIMENSIONS, STAFF_EXPECTATION_DIMENSIONS, STAFF_HUMAN_EVENT_KINDS } from '@/domain/staffHumanState'
import { STAFF_CONSEQUENCE_SIGNAL_KINDS } from '@/domain/staffHumanState/StaffConsequenceSignals'
import { RELATIONSHIP_DIMENSION_KEYS } from '@/domain/relationships'

import {
  clampCultureValue,
  createStaffCultureState,
  neutralCultureValues,
  STAFF_CULTURE_DIMENSIONS,
} from './StaffCulture'

/** The one approved catalog. Vocabulary uniqueness across layers is NOT the goal — the exact set below is. */
const CANONICAL_STAFF_CULTURE_DIMENSIONS = [
  'autonomy',
  'hierarchy',
  'collaboration',
  'accountability',
  'communicationOpenness',
  'innovation',
  'adaptability',
  'developmentOrientation',
  'analyticsOrientation',
  'performanceIntensity',
  'stability',
  'longTermOrientation',
  'discipline',
  'competitiveness',
] as const

describe('StaffCulture domain', () => {
  it('defines EXACTLY the canonical 14 culture dimensions, in order', () => {
    expect(STAFF_CULTURE_DIMENSIONS).toEqual(CANONICAL_STAFF_CULTURE_DIMENSIONS)
    expect(new Set(STAFF_CULTURE_DIMENSIONS).size).toBe(14)
  })

  it('never re-introduces the retired vocabulary from the pre-correction implementation', () => {
    const retired = [
      'innovationOrientation', 'disciplineOrientation', 'collaborationOrientation', 'hierarchyOrientation',
      'riskTolerance', 'accountabilityStandard', 'developmentFocus', 'stabilityOrientation',
      'competitiveIntensity', 'professionalismStandard', 'inclusivity', 'transparencyStandard', 'resultsOrientation',
    ]
    for (const name of retired) expect(STAFF_CULTURE_DIMENSIONS as readonly string[]).not.toContain(name)
  })

  it('canonical counts across the wider Staff vocabulary remain unchanged', () => {
    expect(STAFF_HUMAN_STATE_DIMENSIONS).toHaveLength(11)
    expect(STAFF_EXPECTATION_DIMENSIONS).toHaveLength(15)
    expect(STAFF_HUMAN_EVENT_KINDS).toHaveLength(30)
    expect(STAFF_CONSEQUENCE_SIGNAL_KINDS).toHaveLength(40)
    expect(RELATIONSHIP_DIMENSION_KEYS).toHaveLength(8)
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
