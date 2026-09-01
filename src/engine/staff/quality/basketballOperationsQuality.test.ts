import { describe, expect, it } from 'vitest'
import { staffPersonIdFromString } from '@/domain/ids'
import type { DecisionQualityContext } from '@/domain/responsibility'
import { createStaffPerson, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { createPersonality, PERSONALITY_DIMENSIONS } from '@/domain/personality'
import { basketballOperationsQuality } from './basketballOperationsQuality'

const flatAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const neutralPersonality = createPersonality({ values: Object.fromEntries(PERSONALITY_DIMENSIONS.map((dimension) => [dimension, 50])) as Record<typeof PERSONALITY_DIMENSIONS[number], number> })
const zeroWorkload = { staffId: staffPersonIdFromString('basketball-ops-quality-test-staff'), totalCapacityUsed: 0, capacityLimit: 5, utilization: 0, overloaded: false }

function contextWith(overrides: { readonly attributes?: Partial<typeof flatAttributes>; readonly roleId?: DecisionQualityContext['roleId']; readonly workload?: DecisionQualityContext['workload'] } = {}): DecisionQualityContext {
  const staff = createStaffPerson({
    id: staffPersonIdFromString('basketball-ops-quality-test-staff'),
    identity: { firstName: 'Sam', lastName: 'Ortega' },
    professional: { attributes: { ...flatAttributes, ...overrides.attributes } },
  })
  return { staff, roleId: overrides.roleId ?? 'generalManager', personality: neutralPersonality, workload: overrides.workload ?? zeroWorkload }
}

describe('basketballOperationsQuality', () => {
  it('is deterministic: same context + same seed produces the same result across repeated calls', () => {
    const context = contextWith()
    const seed = 'staff-decision-quality-v1:responsibility:team-1:recommendSignings:2032-10-01'
    expect(basketballOperationsQuality(context, seed)).toBe(basketballOperationsQuality(context, seed))
  })

  it('always returns an integer in 0..100', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const result = basketballOperationsQuality(contextWith(), seed)
      expect(Number.isInteger(result)).toBe(true)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(100)
    }
  })

  it('a materially stronger relevant Staff attribute set produces no worse expected quality than a materially weaker one', () => {
    const seeds = Array.from({ length: 10 }, (_, index) => `strength-${index}`)
    const strong = contextWith({ attributes: { analysis: 95, leadership: 90, communication: 90 } })
    const weak = contextWith({ attributes: { analysis: 10, leadership: 10, communication: 10 } })
    const strongAverage = average(seeds.map((seed) => basketballOperationsQuality(strong, seed)))
    const weakAverage = average(seeds.map((seed) => basketballOperationsQuality(weak, seed)))
    expect(strongAverage).toBeGreaterThan(weakAverage)
  })

  it('uses the actual assigned role: proficiency is computed from (roleId, attributes) together, never a caller-relabeled role alone', () => {
    const seeds = Array.from({ length: 8 }, (_, index) => `role-${index}`)
    const genuine = contextWith({ attributes: { analysis: 95, leadership: 90 }, roleId: 'generalManager' })
    const mismatched = contextWith({ attributes: { medicalKnowledge: 95, rehabilitation: 90 }, roleId: 'generalManager' })
    const genuineAverage = average(seeds.map((seed) => basketballOperationsQuality(genuine, seed)))
    const mismatchedAverage = average(seeds.map((seed) => basketballOperationsQuality(mismatched, seed)))
    expect(genuineAverage).toBeGreaterThan(mismatchedAverage)
  })

  it('utilization <= 1 gives zero overload penalty', () => {
    const context = contextWith()
    const seed = 'no-overload-seed'
    const baseline = basketballOperationsQuality(context, seed)
    for (const utilization of [0, 0.5, 1]) {
      const withWorkload = contextWith({ workload: { ...zeroWorkload, utilization, overloaded: false } })
      expect(basketballOperationsQuality(withWorkload, seed)).toBe(baseline)
    }
  })

  it('increasing overload never improves quality with the same seed/context', () => {
    const context = contextWith()
    const seed = 'overload-monotonic-seed'
    let previous = basketballOperationsQuality(context, seed)
    for (const utilization of [1.1, 1.5, 2]) {
      const withOverload = contextWith({ workload: { ...zeroWorkload, utilization, overloaded: true } })
      const result = basketballOperationsQuality(withOverload, seed)
      expect(result).toBeLessThanOrEqual(previous)
      previous = result
    }
  })

  it('same holder/context (identical seed) always yields the same quality regardless of call count', () => {
    const context = contextWith({ attributes: { analysis: 70 } })
    const seed = 'repeat-seed'
    const results = Array.from({ length: 5 }, () => basketballOperationsQuality(context, seed))
    expect(new Set(results).size).toBe(1)
  })
})

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
