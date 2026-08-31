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

  it('produces the same result regardless of an unrelated context field (workload) being present, as long as staff/role/personality/seed match — proving the formula is bounded to documented inputs', () => {
    const context = contextWith()
    const withHigherWorkload = { ...context, workload: { ...zeroWorkload, totalCapacityUsed: 9, utilization: 1.8, overloaded: true } }
    expect(trainingQuality(withHigherWorkload, 'workload-irrelevant-seed')).toBe(trainingQuality(context, 'workload-irrelevant-seed'))
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
