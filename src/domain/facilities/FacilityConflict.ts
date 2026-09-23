import { compareGameDates, type GameDate } from '@/domain/date'
import type { FacilityId } from '@/domain/ids'
import { isActiveFacilityUsageRightOn, type FacilityUsageRight } from './FacilityUsageRight'

/**
 * A detected incompatibility between two simultaneously active FacilityUsageRights. This is a
 * pure, derived computation — never stored world state — over the canonical usage rights already
 * validated for structural correctness (foreign references, temporal ranges) by
 * `validateFacilitiesDomain`. Two teams both holding HOME_VENUE on the same Facility is NOT by
 * itself a conflict (see CFI2 §15/§17): only EXCLUSIVE rights whose scopes actually overlap for
 * overlapping beneficiaries/time are flagged.
 */
export interface FacilityRightsConflict {
  readonly facilityId: FacilityId
  readonly rightIds: readonly [string, string]
  readonly reason: 'EXCLUSIVE_SCOPE_OVERLAP'
}

/**
 * Two active rights conflict only when ALL of the following hold:
 *   - at least one of them is EXCLUSIVE (SHARED/NON_EXCLUSIVE rights never conflict with anything
 *     by themselves — they were designed to coexist);
 *   - their component scopes overlap (whole-facility scope overlaps with every component scope);
 *   - they belong to different beneficiaries (the same Team/Organization holding two rights over
 *     itself is not a conflict).
 *
 * This intentionally does NOT flag two teams both holding a non-exclusive/shared HOME_VENUE right
 * on the same Facility — that is ordinary coexistence, not a conflict, per CFI2's explicit
 * requirement to distinguish the two.
 */
export function facilityRightsConflictsAt(rights: readonly FacilityUsageRight[], facilityId: FacilityId, onDate: GameDate): readonly FacilityRightsConflict[] {
  const active = rights.filter((right) => right.facilityId === facilityId && isActiveFacilityUsageRightOn(right, onDate)).sort((a, b) => a.id.localeCompare(b.id))
  const conflicts: FacilityRightsConflict[] = []
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i]!
      const b = active[j]!
      if (sameBeneficiary(a, b)) continue
      if (a.exclusivity !== 'EXCLUSIVE' && b.exclusivity !== 'EXCLUSIVE') continue
      if (!scopesOverlap(a, b)) continue
      conflicts.push(Object.freeze({ facilityId, rightIds: [a.id, b.id] as const, reason: 'EXCLUSIVE_SCOPE_OVERLAP' as const }))
    }
  }
  return Object.freeze(conflicts)
}

/** Whether two temporal intervals (as already-active-on-date rights) would ever overlap at all, independent of the query date — used by structural validation to reject a duplicate/incompatible pair across their full recorded history, not only "today". */
export function facilityRightsOverlapInTime(a: FacilityUsageRight, b: FacilityUsageRight): boolean {
  const aTo = a.validTo
  const bTo = b.validTo
  const startsBeforeOtherEnds = aTo === null || compareGameDates(a.validFrom, aTo) <= 0
  if (!startsBeforeOtherEnds) return false
  const laterStart = compareGameDates(a.validFrom, b.validFrom) >= 0 ? a.validFrom : b.validFrom
  const earlierEnd = aTo === null ? bTo : bTo === null ? aTo : compareGameDates(aTo, bTo) <= 0 ? aTo : bTo
  return earlierEnd === null || compareGameDates(laterStart, earlierEnd) <= 0
}

function sameBeneficiary(a: FacilityUsageRight, b: FacilityUsageRight): boolean {
  return a.teamId !== null && a.teamId === b.teamId || (a.organizationId !== null && a.organizationId === b.organizationId && a.teamId === null && b.teamId === null)
}

function scopesOverlap(a: FacilityUsageRight, b: FacilityUsageRight): boolean {
  if (a.componentIds === null || b.componentIds === null) return true
  return a.componentIds.some((id) => b.componentIds!.includes(id))
}
