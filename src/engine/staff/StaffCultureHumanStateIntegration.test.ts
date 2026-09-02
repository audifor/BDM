import { describe, expect, it } from 'vitest'

import {
  STAFF_EXPECTATION_DIMENSIONS,
  STAFF_HUMAN_EVENT_KINDS,
  STAFF_HUMAN_STATE_DIMENSIONS,
  type StaffHumanState,
} from '@/domain/staffHumanState'
import { STAFF_CONSEQUENCE_SIGNAL_KINDS } from '@/domain/staffHumanState/StaffConsequenceSignals'
import { STAFF_CULTURE_DIMENSIONS, type StaffCultureDimension } from '@/domain/staffCulture'

import { applyCultureFitPressure, CULTURE_FIT_PRESSURE_CLAMP, CULTURE_FIT_TOTAL_PRESSURE_CLAMP, type StaffCultureFit } from './StaffCultureEngine'

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

/** Builds a `StaffCultureFit` where every dimension is neutral (preference 50, zero gap) except the ones explicitly overridden. */
function fitWith(overrides: Readonly<Partial<Record<StaffCultureDimension, { readonly preference: number; readonly signedGap: number }>>>): StaffCultureFit {
  const preferences: Record<StaffCultureDimension, number> = {} as never
  const signedGap: Record<StaffCultureDimension, number> = {} as never
  const perDimension: Record<StaffCultureDimension, number> = {} as never
  for (const dimension of STAFF_CULTURE_DIMENSIONS) {
    const override = overrides[dimension]
    preferences[dimension] = override?.preference ?? 50
    signedGap[dimension] = override?.signedGap ?? 0
    perDimension[dimension] = Math.abs(signedGap[dimension])
  }
  return { fitScore: 50, preferences, signedGap, perDimension }
}

describe('Culture Fit -> Human State integration', () => {
  it('adds NO new canonical vocabulary: the 11/15/30/40/14/8 counts are unchanged', () => {
    expect(STAFF_HUMAN_STATE_DIMENSIONS).toHaveLength(11)
    expect(STAFF_EXPECTATION_DIMENSIONS).toHaveLength(15)
    expect(STAFF_HUMAN_EVENT_KINDS).toHaveLength(30)
    expect(STAFF_CONSEQUENCE_SIGNAL_KINDS).toHaveLength(40)
    expect(STAFF_CULTURE_DIMENSIONS).toHaveLength(14)
  })

  it('REGRESSION A: a strong autonomy preference with a low-autonomy lived culture nudges autonomySatisfaction down, and nothing else', () => {
    const state = neutralState()
    // preference 90 (strongly wants autonomy), lived culture reads 30 -> signed gap -40 (culture below preference).
    const fit = fitWith({ autonomy: { preference: 90, signedGap: -40 } })
    const pressured = applyCultureFitPressure(state, fit)
    expect(pressured.autonomySatisfaction).toBeLessThan(state.autonomySatisfaction)
    for (const dimension of STAFF_HUMAN_STATE_DIMENSIONS) {
      if (dimension === 'autonomySatisfaction') continue
      expect(pressured[dimension]).toBe(state[dimension])
    }
  })

  it('REGRESSION B: performanceIntensity above the preferred level nudges stress up', () => {
    const state = neutralState()
    // preference 20 (prefers low intensity), lived culture reads 80 -> signed gap +60 (ABOVE preferred level).
    const fit = fitWith({ performanceIntensity: { preference: 20, signedGap: 60 } })
    const pressured = applyCultureFitPressure(state, fit)
    expect(pressured.stress).toBeGreaterThan(state.stress)
  })

  it('performanceIntensity BELOW the preferred level does NOT increase stress (only ABOVE does)', () => {
    const state = neutralState()
    const fit = fitWith({ performanceIntensity: { preference: 80, signedGap: -60 } })
    const pressured = applyCultureFitPressure(state, fit)
    expect(pressured.stress).toBe(state.stress)
  })

  it('REGRESSION C: a development-oriented Staff person in a low-development-orientation culture loses professionalFulfillment', () => {
    const state = neutralState()
    const fit = fitWith({ developmentOrientation: { preference: 85, signedGap: -50 } })
    const pressured = applyCultureFitPressure(state, fit)
    expect(pressured.professionalFulfillment).toBeLessThan(state.professionalFulfillment)
  })

  it('REGRESSION D: a stability/long-term mismatch pressures organizationalCommitment', () => {
    const state = neutralState()
    const fit = fitWith({ stability: { preference: 85, signedGap: -50 }, longTermOrientation: { preference: 85, signedGap: -50 } })
    const pressured = applyCultureFitPressure(state, fit)
    expect(pressured.organizationalCommitment).toBeLessThan(state.organizationalCommitment)
  })

  it('unrelated dimensions remain unchanged when only one dimension mismatches', () => {
    const state = neutralState()
    const fit = fitWith({ communicationOpenness: { preference: 90, signedGap: -50 } })
    const pressured = applyCultureFitPressure(state, fit)
    for (const dimension of STAFF_HUMAN_STATE_DIMENSIONS) {
      if (dimension === 'professionalFulfillment' || dimension === 'frustration') continue
      expect(pressured[dimension]).toBe(state[dimension])
    }
  })

  it('matching culture (zero gap everywhere) never creates negative pressure — a perfect match is at worst neutral, and may be a mild genuine positive', () => {
    const state = neutralState()
    const fit = fitWith({
      autonomy: { preference: 90, signedGap: 0 },
      performanceIntensity: { preference: 20, signedGap: 0 },
      developmentOrientation: { preference: 85, signedGap: 0 },
      stability: { preference: 85, signedGap: 0 },
    })
    const pressured = applyCultureFitPressure(state, fit)
    for (const dimension of STAFF_HUMAN_STATE_DIMENSIONS) expect(pressured[dimension]).toBeGreaterThanOrEqual(state[dimension])
  })

  it('a strong POSITIVE fit (culture reads exactly at what this person strongly prefers) produces gradual positive pressure over several ticks', () => {
    let state = neutralState()
    const start = state.autonomySatisfaction
    for (let week = 0; week < 30; week += 1) {
      const previous = state
      // Extreme, maximally-important autonomy preference exactly matched by the lived culture — the
      // strongest possible genuine fit signal (importance = 1, gap = 0).
      const fit = fitWith({ autonomy: { preference: 100, signedGap: 0 } })
      state = applyCultureFitPressure(state, fit)
      expect(Math.abs(state.autonomySatisfaction - previous.autonomySatisfaction)).toBeLessThanOrEqual(CULTURE_FIT_PRESSURE_CLAMP)
      expect(state.autonomySatisfaction).toBeGreaterThanOrEqual(previous.autonomySatisfaction)
    }
    expect(state.autonomySatisfaction).toBeGreaterThan(start)
  })

  it('a strong mismatch produces bounded, gradual negative pressure over several weekly ticks, never a cliff', () => {
    let state = neutralState()
    const readings: number[] = [state.autonomySatisfaction]
    for (let week = 0; week < 6; week += 1) {
      const previous = state
      const fit = fitWith({ autonomy: { preference: 95, signedGap: -60 } })
      state = applyCultureFitPressure(state, fit)
      expect(Math.abs(state.autonomySatisfaction - previous.autonomySatisfaction)).toBeLessThanOrEqual(CULTURE_FIT_PRESSURE_CLAMP)
      expect(state.autonomySatisfaction).toBeLessThanOrEqual(previous.autonomySatisfaction)
      readings.push(state.autonomySatisfaction)
    }
    expect(readings[readings.length - 1]!).toBeLessThan(readings[0]!)
    expect(state.autonomySatisfaction).toBeGreaterThanOrEqual(0)
  })

  it('saturates at the 0-100 boundary rather than overflowing', () => {
    let low = { ...neutralState(), autonomySatisfaction: 1 }
    const fit = fitWith({ autonomy: { preference: 95, signedGap: -80 } })
    for (let week = 0; week < 30; week += 1) low = applyCultureFitPressure(low, fit)
    expect(low.autonomySatisfaction).toBe(0)

    let high = { ...neutralState(), autonomySatisfaction: 99 }
    const positiveFit = fitWith({ autonomy: { preference: 100, signedGap: 0 } })
    for (let week = 0; week < 30; week += 1) high = applyCultureFitPressure(high, positiveFit)
    expect(high.autonomySatisfaction).toBe(100)
  })

  it('total pressure across several simultaneously-mismatched dimensions stays subordinate to the primary ±6 appraisal clamp', () => {
    const state = neutralState()
    const fit = fitWith({
      autonomy: { preference: 95, signedGap: -60 },
      hierarchy: { preference: 90, signedGap: 60 },
      communicationOpenness: { preference: 90, signedGap: -60 },
      performanceIntensity: { preference: 10, signedGap: 60 },
      developmentOrientation: { preference: 90, signedGap: -60 },
      collaboration: { preference: 90, signedGap: -60 },
      stability: { preference: 90, signedGap: -60 },
      longTermOrientation: { preference: 90, signedGap: -60 },
      analyticsOrientation: { preference: 90, signedGap: -60 },
    })
    const pressured = applyCultureFitPressure(state, fit)
    let totalMovement = 0
    for (const dimension of STAFF_HUMAN_STATE_DIMENSIONS) totalMovement += Math.abs(pressured[dimension] - state[dimension])
    expect(totalMovement).toBeLessThanOrEqual(CULTURE_FIT_TOTAL_PRESSURE_CLAMP)
  })
})
