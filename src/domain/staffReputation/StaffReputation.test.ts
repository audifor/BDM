import { describe, expect, it } from 'vitest'
import { createDefaultStaffReputationProfile, createStaffReputationProfile, clampStaffReputationValue, staffReputationScore, STAFF_REPUTATION_DEFAULT, STAFF_REPUTATION_DIMENSIONS, STAFF_REPUTATION_MAX, STAFF_REPUTATION_MIN } from './StaffReputation'

describe('createDefaultStaffReputationProfile: deterministic backfill', () => {
  it('defaults every dimension to the canonical default value', () => {
    const profile = createDefaultStaffReputationProfile()
    for (const dimension of STAFF_REPUTATION_DIMENSIONS) expect(profile.values[dimension]).toBe(STAFF_REPUTATION_DEFAULT)
  })

  it('is deterministic across calls', () => {
    expect(createDefaultStaffReputationProfile()).toEqual(createDefaultStaffReputationProfile())
  })
})

describe('createStaffReputationProfile: bounds', () => {
  it('accepts values within bounds', () => {
    const profile = createStaffReputationProfile({ values: { competence: 500, reliability: 0, publicStanding: 1000 } })
    expect(profile.values.competence).toBe(500)
  })

  it('rejects a value below the minimum', () => {
    expect(() => createStaffReputationProfile({ values: { competence: -1, reliability: 200, publicStanding: 200 } })).toThrow(RangeError)
  })

  it('rejects a value above the maximum', () => {
    expect(() => createStaffReputationProfile({ values: { competence: 1001, reliability: 200, publicStanding: 200 } })).toThrow(RangeError)
  })

  it('rejects a non-finite value', () => {
    expect(() => createStaffReputationProfile({ values: { competence: Number.NaN, reliability: 200, publicStanding: 200 } })).toThrow(RangeError)
  })
})

describe('clampStaffReputationValue', () => {
  it('clamps below the minimum', () => { expect(clampStaffReputationValue(-50)).toBe(STAFF_REPUTATION_MIN) })
  it('clamps above the maximum', () => { expect(clampStaffReputationValue(2000)).toBe(STAFF_REPUTATION_MAX) })
  it('leaves an in-bounds value unchanged', () => { expect(clampStaffReputationValue(400)).toBe(400) })
})

describe('staffReputationScore', () => {
  it('is the mean of the three dimensions', () => {
    const profile = createStaffReputationProfile({ values: { competence: 300, reliability: 600, publicStanding: 900 } })
    expect(staffReputationScore(profile)).toBe(600)
  })

  it('matches the default profile score', () => {
    expect(staffReputationScore(createDefaultStaffReputationProfile())).toBe(STAFF_REPUTATION_DEFAULT)
  })
})
