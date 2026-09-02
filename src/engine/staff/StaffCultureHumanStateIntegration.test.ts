import { describe, expect, it } from 'vitest'

import {
  STAFF_EXPECTATION_DIMENSIONS,
  STAFF_HUMAN_EVENT_KINDS,
  STAFF_HUMAN_STATE_DIMENSIONS,
  type StaffHumanState,
} from '@/domain/staffHumanState'
import { STAFF_CONSEQUENCE_SIGNAL_KINDS } from '@/domain/staffHumanState/StaffConsequenceSignals'

import { applyCultureFitPressure, CULTURE_FIT_PRESSURE_CLAMP } from './StaffCultureEngine'

function neutralState(): StaffHumanState {
  return {
    contextId: 'staff-human-context:s:t:2030-01-01' as never,
    staffId: 'staff-1' as never,
    roleSatisfaction: 50, responsibilitySatisfaction: 50, autonomySatisfaction: 50, influenceSatisfaction: 50,
    contractSatisfaction: 50, workloadSatisfaction: 50, professionalFulfillment: 50, recognitionSatisfaction: 50,
    frustration: 50, stress: 50, organizationalCommitment: 50,
    lastEvaluatedOn: '2030-01-07' as never,
  }
}

describe('Culture Fit → Human State integration', () => {
  it('adds NO new canonical vocabulary: the 11/15/30/40 counts are unchanged', () => {
    expect(STAFF_HUMAN_STATE_DIMENSIONS).toHaveLength(11)
    expect(STAFF_EXPECTATION_DIMENSIONS).toHaveLength(15)
    expect(STAFF_HUMAN_EVENT_KINDS).toHaveLength(30)
    expect(STAFF_CONSEQUENCE_SIGNAL_KINDS).toHaveLength(40)
  })

  it('touches ONLY organizationalCommitment and professionalFulfillment', () => {
    const state = neutralState()
    const pressured = applyCultureFitPressure(state, 10)
    for (const dimension of STAFF_HUMAN_STATE_DIMENSIONS) {
      if (dimension === 'organizationalCommitment' || dimension === 'professionalFulfillment') continue
      expect(pressured[dimension]).toBe(state[dimension])
    }
  })

  it('strong mismatch produces bounded, gradual negative pressure over several weekly ticks', () => {
    let state = neutralState()
    const readings: number[] = [state.organizationalCommitment]
    for (let week = 0; week < 6; week += 1) {
      const previous = state
      state = applyCultureFitPressure(state, 5)
      // No cliff: a single tick can never swing more than the secondary clamp.
      expect(Math.abs(state.organizationalCommitment - previous.organizationalCommitment)).toBeLessThanOrEqual(CULTURE_FIT_PRESSURE_CLAMP)
      expect(Math.abs(state.professionalFulfillment - previous.professionalFulfillment)).toBeLessThanOrEqual(CULTURE_FIT_PRESSURE_CLAMP)
      expect(state.organizationalCommitment).toBeLessThanOrEqual(previous.organizationalCommitment)
      readings.push(state.organizationalCommitment)
    }
    expect(readings[readings.length - 1]!).toBeLessThan(readings[0]!)
    expect(state.organizationalCommitment).toBeGreaterThanOrEqual(0)
  })

  it('strong fit produces bounded, gradual positive pressure over several weekly ticks', () => {
    let state = neutralState()
    const start = state.professionalFulfillment
    for (let week = 0; week < 6; week += 1) {
      const previous = state
      state = applyCultureFitPressure(state, 95)
      expect(Math.abs(state.professionalFulfillment - previous.professionalFulfillment)).toBeLessThanOrEqual(CULTURE_FIT_PRESSURE_CLAMP)
      expect(state.professionalFulfillment).toBeGreaterThanOrEqual(previous.professionalFulfillment)
    }
    expect(state.professionalFulfillment).toBeGreaterThan(start)
    expect(state.professionalFulfillment).toBeLessThanOrEqual(100)
  })

  it('a perfectly neutral fit is a true no-op', () => {
    const state = neutralState()
    expect(applyCultureFitPressure(state, 50)).toBe(state)
  })

  it('saturates at the 0-100 boundary rather than overflowing', () => {
    let low = { ...neutralState(), organizationalCommitment: 2, professionalFulfillment: 2 }
    for (let week = 0; week < 20; week += 1) low = applyCultureFitPressure(low, 0)
    expect(low.organizationalCommitment).toBe(0)
    expect(low.professionalFulfillment).toBe(0)

    let high = { ...neutralState(), organizationalCommitment: 98, professionalFulfillment: 98 }
    for (let week = 0; week < 20; week += 1) high = applyCultureFitPressure(high, 100)
    expect(high.organizationalCommitment).toBe(100)
    expect(high.professionalFulfillment).toBe(100)
  })
})
