import { describe, expect, it } from 'vitest'
import { staffPersonIdFromString } from '@/domain/ids'
import type { DecisionQualityContext } from '@/domain/responsibility'
import { createStaffPerson, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { createPersonality, PERSONALITY_DIMENSIONS } from '@/domain/personality'
import { trainingQuality } from './trainingQuality'

const flatAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const neutralPersonality = createPersonality({ values: Object.fromEntries(PERSONALITY_DIMENSIONS.map((dimension) => [dimension, 50])) as Record<typeof PERSONALITY_DIMENSIONS[number], number> })
const zeroWorkload = { staffId: staffPersonIdFromString('quality-test-staff'), totalCapacityUsed: 0, capacityLimit: 5, utilization: 0, overloaded: false }

function contextWith(overrides: { readonly attributes?: Partial<typeof flatAttributes>; readonly personalityValues?: Partial<Record<typeof PERSONALITY_DIMENSIONS[number], number>>; readonly roleId?: DecisionQualityContext['roleId'] } = {}): DecisionQualityContext {
  const staff = createStaffPerson({
    id: staffPersonIdFromString('quality-test-staff'),
    identity: { firstName: 'Rae', lastName: 'Torres' },
    professional: { attributes: { ...flatAttributes, ...overrides.attributes } },
  })
  const personality = overrides.personalityValues === undefined
    ? neutralPersonality
    : createPersonality({ values: { ...neutralPersonality.values, ...overrides.personalityValues } })
  return { staff, roleId: overrides.roleId ?? 'assistantCoach', personality, workload: zeroWorkload }
}

describe('trainingQuality', () => {
  it('is deterministic: same context + same seed produces the same result across repeated calls', () => {
    const context = contextWith()
    const first = trainingQuality(context, 'staff-decision-quality-v1:responsibility:team-1:createTeamTrainingPlan:2032-10-01')
    const second = trainingQuality(context, 'staff-decision-quality-v1:responsibility:team-1:createTeamTrainingPlan:2032-10-01')
    expect(second).toBe(first)
  })

  it('always returns an integer in 0..100', () => {
    for (const seed of ['seed-a', 'seed-b', 'seed-c', 'seed-d', 'seed-e']) {
      const result = trainingQuality(contextWith(), seed)
      expect(Number.isInteger(result)).toBe(true)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(100)
    }
  })

  it('a materially stronger relevant Staff attribute set produces no worse expected quality than a materially weaker one, all else equal', () => {
    const seeds = Array.from({ length: 12 }, (_, index) => `strength-comparison-seed-${index}`)
    const strongContext = contextWith({ attributes: { coaching: 95, tacticalKnowledge: 90, playerDevelopment: 90, leadership: 90 } })
    const weakContext = contextWith({ attributes: { coaching: 10, tacticalKnowledge: 10, playerDevelopment: 10, leadership: 10 } })
    const strongAverage = average(seeds.map((seed) => trainingQuality(strongContext, seed)))
    const weakAverage = average(seeds.map((seed) => trainingQuality(weakContext, seed)))
    expect(strongAverage).toBeGreaterThan(weakAverage)
  })

  it('Wave 3 regression invariant: for any non-overloaded holder (utilization <= 1), quality is byte-for-byte identical to the merged Wave 2 formula — workload variation below/at the 1.0 threshold never changes the result', () => {
    const context = contextWith()
    const seed = 'workload-non-overloaded-seed'
    const baseline = trainingQuality(context, seed)
    for (const utilization of [0, 0.4, 0.75, 1]) {
      const withWorkload = { ...context, workload: { ...zeroWorkload, totalCapacityUsed: utilization * 5, utilization, overloaded: false } }
      expect(trainingQuality(withWorkload, seed)).toBe(baseline)
    }
  })

  it('overload never improves quality and degrades it monotonically as utilization rises past 1.0, with the same seed/context', () => {
    const context = contextWith()
    const seed = 'overload-monotonic-seed'
    const baseline = trainingQuality(context, seed)
    const utilizations = [1.01, 1.2, 1.5, 2, 3]
    let previous = baseline
    for (const utilization of utilizations) {
      const withOverload = { ...context, workload: { ...zeroWorkload, totalCapacityUsed: utilization * 5, utilization, overloaded: true } }
      const result = trainingQuality(withOverload, seed)
      expect(result).toBeLessThanOrEqual(previous)
      previous = result
    }
    expect(previous).toBeLessThan(baseline)
  })

  it('overload penalty is capped: even extreme utilization does not drive quality below the documented floor relative to the same non-overloaded baseline minus MAX_PENALTY', () => {
    const context = contextWith({ attributes: { coaching: 100, tacticalKnowledge: 100, playerDevelopment: 100, leadership: 100, communication: 100, motivation: 100, analysis: 100, discipline: 100, adaptability: 100 } })
    const seed = 'overload-cap-seed'
    const baseline = trainingQuality(context, seed)
    const extremelyOverloaded = { ...context, workload: { ...zeroWorkload, totalCapacityUsed: 1000, utilization: 200, overloaded: true } }
    const result = trainingQuality(extremelyOverloaded, seed)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(baseline - result).toBeLessThanOrEqual(20) // MAX_PENALTY, see overloadPenalty.ts
  })

  it('role/context must correspond to the canonical assignment: a caller cannot spoof quality just by relabeling roleId without matching attributes — the underlying attributes still drive the base score for whatever role is claimed', () => {
    // calculateStaffRoleProficiencyByRoleId reads canonical STAFF_ROLE_REGISTRY weights per role,
    // so passing a role with attribute weights the staff member does not actually have strong
    // values for cannot inflate quality — the formula only ever reads the (roleId, attributes)
    // pair actually supplied, and both must correspond to real canonical world state at the
    // integration boundary (see resolveDelegatedResponsibility, which builds this context only
    // from the staff member's real active TeamStaffAssignment.role).
    const mismatchedContext = contextWith({ attributes: { coaching: 5, tacticalKnowledge: 5, playerDevelopment: 5 }, roleId: 'headScout' })
    const genuineScoutContext = contextWith({ attributes: { talentEvaluation: 95, potentialEvaluation: 90, analysis: 85 }, roleId: 'headScout' })
    const seeds = Array.from({ length: 8 }, (_, index) => `spoof-check-seed-${index}`)
    const mismatchedAverage = average(seeds.map((seed) => trainingQuality(mismatchedContext, seed)))
    const genuineAverage = average(seeds.map((seed) => trainingQuality(genuineScoutContext, seed)))
    expect(genuineAverage).toBeGreaterThan(mismatchedAverage)
  })
})

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
