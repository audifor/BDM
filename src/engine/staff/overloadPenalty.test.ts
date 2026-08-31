import { describe, expect, it } from 'vitest'
import { staffPersonIdFromString } from '@/domain/ids'
import { calculateOverloadPenalty } from './overloadPenalty'

const staffId = staffPersonIdFromString('overload-penalty-test-staff')
function workload(utilization: number, overloaded = utilization > 1) {
  return { staffId, totalCapacityUsed: utilization * 5, capacityLimit: 5, utilization, overloaded }
}

describe('calculateOverloadPenalty', () => {
  it('utilization <= 1 (not overloaded) always yields penalty exactly 0', () => {
    for (const utilization of [0, 0.25, 0.5, 0.99, 1]) {
      expect(calculateOverloadPenalty(workload(utilization, false))).toBe(0)
    }
  })

  it('penalty is 0 even if overloaded=true is incorrectly set at utilization <= 1 (utilization is the source of truth)', () => {
    expect(calculateOverloadPenalty(workload(1, true))).toBe(0)
  })

  it('penalty grows as utilization increases past 1', () => {
    const penalty1 = calculateOverloadPenalty(workload(1.1))
    const penalty2 = calculateOverloadPenalty(workload(1.3))
    const penalty3 = calculateOverloadPenalty(workload(1.6))
    expect(penalty1).toBeGreaterThan(0)
    expect(penalty2).toBeGreaterThanOrEqual(penalty1)
    expect(penalty3).toBeGreaterThanOrEqual(penalty2)
  })

  it('penalty is capped even at extreme utilization', () => {
    expect(calculateOverloadPenalty(workload(1000))).toBeLessThanOrEqual(20)
    expect(calculateOverloadPenalty(workload(1000))).toBeGreaterThan(0)
  })

  it('a non-finite utilization (Infinity, from a staff member with held responsibilities but no live TeamStaffAssignment) is treated as maximally overloaded — capped penalty, not zero/NaN', () => {
    const result = calculateOverloadPenalty({ staffId, totalCapacityUsed: 5, capacityLimit: 0, utilization: Infinity, overloaded: true })
    expect(Number.isFinite(result)).toBe(true)
    expect(result).toBe(20) // MAX_PENALTY
  })

  it('is a pure function: same input always yields the same output', () => {
    const input = workload(1.4)
    expect(calculateOverloadPenalty(input)).toBe(calculateOverloadPenalty(input))
  })
})
