/**
 * Canonical asset lifecycle. Names are provisional; the guarantee CFI1 makes is that
 * temporally impossible combinations are rejected (see `assertFacilityLifecycleDates`),
 * not that these exact status names are final.
 */
export const FACILITY_STATUSES = [
  'PLANNED',
  'UNDER_CONSTRUCTION',
  'ACTIVE',
  'PARTIALLY_CLOSED',
  'TEMPORARILY_CLOSED',
  'UNDER_RENOVATION',
  'DECOMMISSIONED',
  'DEMOLISHED',
] as const

export type FacilityStatus = (typeof FACILITY_STATUSES)[number]

/** Terminal statuses never revert to an earlier lifecycle stage. */
export const TERMINAL_FACILITY_STATUSES: readonly FacilityStatus[] = ['DECOMMISSIONED', 'DEMOLISHED']

export function isFacilityStatus(value: unknown): value is FacilityStatus {
  return typeof value === 'string' && (FACILITY_STATUSES as readonly string[]).includes(value)
}

export function isTerminalFacilityStatus(status: FacilityStatus): boolean {
  return TERMINAL_FACILITY_STATUSES.includes(status)
}
