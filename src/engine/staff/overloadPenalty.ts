import type { StaffWorkloadSnapshot } from '@/domain/responsibility'

/**
 * Wave 3 activates docs/STAFF_SYSTEM_V2.md §11.2: workload overload degrades `DecisionQualityFn`
 * output. One shared, bounded, pure policy used by every domain's quality function
 * (`trainingQuality`, `scoutingQuality`, `tacticsQuality`) rather than a duplicated formula per
 * domain.
 *
 * `utilization <= 1` (not overloaded) always yields penalty `0` — this is the regression
 * invariant that keeps every non-overloaded holder's quality numerically identical to the
 * pre-Wave-3 formula. Above `1`, the penalty grows linearly with excess utilization and is
 * capped at `MAX_PENALTY`, so overload degrades quality monotonically but never hard-blocks
 * execution (a quality of `0` is still a valid, if poor, decision — never a thrown error).
 *
 * Pure function of an already-derived `StaffWorkloadSnapshot` (never persisted, never order
 * dependent — `calculateStaffWorkload` itself only reads canonical world state keyed by stable
 * ids).
 */
const MAX_PENALTY = 20
const PENALTY_PER_EXCESS_UTILIZATION = 25

export function calculateOverloadPenalty(workload: StaffWorkloadSnapshot): number {
  if (!workload.overloaded || workload.utilization <= 1) return 0
  // Infinity (a staff member with held responsibilities but no live TeamStaffAssignment, per
  // calculateStaffWorkload) is the maximally overloaded case, not an ignorable one.
  if (!Number.isFinite(workload.utilization)) return MAX_PENALTY
  const excess = workload.utilization - 1
  return Math.min(MAX_PENALTY, Math.round(excess * PENALTY_PER_EXCESS_UTILIZATION))
}
