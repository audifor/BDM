import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityComponentIdFromString, facilityIdFromString, facilityUsageRightIdFromString, organizationIdFromString, teamIdFromString, type FacilityComponentId, type FacilityId, type FacilityUsageRightId, type OrganizationId, type TeamId } from '@/domain/ids'

/**
 * Extensible catalog of what a usage right is for. Extends CFI1's inline free-text `purpose`
 * with a proper, open-ended enum (`OTHER` covers anything not yet named) so purposes are
 * queryable and validated, matching the convention every other Facility catalog in this domain
 * already uses.
 */
export const FACILITY_USAGE_PURPOSES = [
  'HOME_VENUE',
  'SECONDARY_HOME_VENUE',
  'TEMPORARY_HOME',
  'TRAINING',
  'PRACTICE',
  'PERFORMANCE',
  'MEDICAL',
  'REHABILITATION',
  'ACADEMY',
  'YOUTH',
  'ADMINISTRATION',
  'HEADQUARTERS',
  'STORAGE',
  'MEDIA',
  'COMMUNITY',
  'OTHER',
] as const

export type FacilityUsagePurpose = (typeof FACILITY_USAGE_PURPOSES)[number]

export function isFacilityUsagePurpose(value: unknown): value is FacilityUsagePurpose {
  return typeof value === 'string' && (FACILITY_USAGE_PURPOSES as readonly string[]).includes(value)
}

/**
 * Exclusivity is a three-state fact, never a boolean: EXCLUSIVE (only this beneficiary may use
 * the scoped resource during the interval), SHARED (multiple named beneficiaries jointly hold
 * the same kind of right by design, e.g. men's and women's teams sharing a training center),
 * NON_EXCLUSIVE (usage is permitted but not reserved against other unrelated usage, e.g. a
 * university performance center open to several programs). Collapsing this into a boolean would
 * destroy the SHARED/NON_EXCLUSIVE distinction the brief explicitly asks to preserve.
 */
export const FACILITY_USAGE_EXCLUSIVITIES = ['EXCLUSIVE', 'SHARED', 'NON_EXCLUSIVE'] as const
export type FacilityUsageExclusivity = (typeof FACILITY_USAGE_EXCLUSIVITIES)[number]

/**
 * Priority is a pure ordering fact for future conflict resolution/scheduling; CFI2 does not
 * implement an allocator that consumes it yet.
 */
export const FACILITY_USAGE_PRIORITIES = ['PRIMARY', 'SECONDARY', 'TERTIARY'] as const
export type FacilityUsagePriority = (typeof FACILITY_USAGE_PRIORITIES)[number]

/**
 * Explicit, temporal right to use a Facility (or one/more of its components) for a purpose.
 * Usage never implies ownership, control, or operation: a right may exist with no corresponding
 * FacilityOwnershipInterest, FacilityControlRight, FacilityOperatorAssignment, or
 * FacilityOrganizationRelationship at all (e.g. a one-off exhibition).
 *
 * Scope: `componentIds === null` means the right covers the whole Facility; a non-empty list
 * scopes it to specific FacilityComponents (e.g. Team A gets the main court, Team B gets
 * practice court 2, both under the same Facility). An empty array is rejected — that would be an
 * incoherent "right to nothing".
 *
 * `agreementReferenceId` is an optional, opaque forward reference to a future economic/legal
 * lease or contract record. CFI2 does not define that system; this field only keeps room for it
 * without implementing any economics now.
 */
export interface FacilityUsageRight {
  readonly id: FacilityUsageRightId
  readonly facilityId: FacilityId
  readonly componentIds: readonly FacilityComponentId[] | null
  readonly organizationId: OrganizationId | null
  readonly teamId: TeamId | null
  readonly purpose: FacilityUsagePurpose
  readonly exclusivity: FacilityUsageExclusivity
  readonly priority: FacilityUsagePriority
  readonly validFrom: GameDate
  readonly validTo: GameDate | null
  readonly agreementReferenceId: string | null
}

export interface CreateFacilityUsageRightInput {
  readonly id: FacilityUsageRightId | string
  readonly facilityId: FacilityId | string
  readonly componentIds?: readonly (FacilityComponentId | string)[] | null
  readonly organizationId?: OrganizationId | string | null
  readonly teamId?: TeamId | string | null
  readonly purpose: FacilityUsagePurpose
  readonly exclusivity?: FacilityUsageExclusivity
  readonly priority?: FacilityUsagePriority
  readonly validFrom: GameDate | string
  readonly validTo?: GameDate | string | null
  readonly agreementReferenceId?: string | null
}

export function createFacilityUsageRight(input: CreateFacilityUsageRightInput): FacilityUsageRight {
  const organizationId = input.organizationId === undefined || input.organizationId === null ? null : organizationIdFromString(input.organizationId)
  const teamId = input.teamId === undefined || input.teamId === null ? null : teamIdFromString(input.teamId)
  if (organizationId === null && teamId === null) throw new TypeError('Facility usage right requires an Organization and/or a Team beneficiary')
  if (!isFacilityUsagePurpose(input.purpose)) throw new TypeError(`Facility usage right purpose is invalid: ${String(input.purpose)}`)
  const exclusivity = input.exclusivity ?? 'NON_EXCLUSIVE'
  if (!FACILITY_USAGE_EXCLUSIVITIES.includes(exclusivity)) throw new TypeError(`Facility usage right exclusivity is invalid: ${String(exclusivity)}`)
  const priority = input.priority ?? 'PRIMARY'
  if (!FACILITY_USAGE_PRIORITIES.includes(priority)) throw new TypeError(`Facility usage right priority is invalid: ${String(priority)}`)
  const componentIds = input.componentIds === undefined || input.componentIds === null ? null : input.componentIds.map((id) => facilityComponentIdFromString(id))
  if (componentIds !== null) {
    if (componentIds.length === 0) throw new RangeError('Facility usage right component scope cannot be an empty list')
    if (new Set(componentIds).size !== componentIds.length) throw new RangeError('Facility usage right component scope must not contain duplicates')
  }
  const validFrom = parseGameDate(input.validFrom)
  const validTo = input.validTo === undefined || input.validTo === null ? null : parseGameDate(input.validTo)
  if (validTo !== null && compareGameDates(validTo, validFrom) < 0) throw new RangeError('Facility usage right validTo cannot precede validFrom')
  const agreementReferenceId = input.agreementReferenceId === undefined || input.agreementReferenceId === null ? null : input.agreementReferenceId
  if (agreementReferenceId !== null && agreementReferenceId.trim().length === 0) throw new TypeError('Facility usage right agreement reference id must be a non-empty string or null')
  return Object.freeze({
    id: facilityUsageRightIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    componentIds: componentIds === null ? null : Object.freeze(componentIds),
    organizationId,
    teamId,
    purpose: input.purpose,
    exclusivity,
    priority,
    validFrom,
    validTo,
    agreementReferenceId,
  })
}

export function isActiveFacilityUsageRightOn(right: FacilityUsageRight, onDate: GameDate): boolean {
  return isActiveOn(right.validFrom, right.validTo, onDate)
}

function isActiveOn(validFrom: GameDate, validTo: GameDate | null, onDate: GameDate): boolean {
  return compareGameDates(validFrom, onDate) <= 0 && (validTo === null || compareGameDates(onDate, validTo) <= 0)
}

export function getActiveFacilityUsageRights(rights: readonly FacilityUsageRight[], facilityId: FacilityId, onDate: GameDate): readonly FacilityUsageRight[] {
  return rights.filter((right) => right.facilityId === facilityId && isActiveFacilityUsageRightOn(right, onDate)).sort((a, b) => a.id.localeCompare(b.id))
}

export function usageRightsForFacilityAt(rights: readonly FacilityUsageRight[], facilityId: FacilityId, onDate: GameDate): readonly FacilityUsageRight[] {
  return getActiveFacilityUsageRights(rights, facilityId, onDate)
}

export function usageRightsForTeamAt(rights: readonly FacilityUsageRight[], teamId: TeamId, onDate: GameDate): readonly FacilityUsageRight[] {
  return rights.filter((right) => right.teamId === teamId && isActiveFacilityUsageRightOn(right, onDate)).sort((a, b) => a.id.localeCompare(b.id))
}

export function usageRightsForOrganizationAt(rights: readonly FacilityUsageRight[], organizationId: OrganizationId, onDate: GameDate): readonly FacilityUsageRight[] {
  return rights.filter((right) => right.organizationId === organizationId && isActiveFacilityUsageRightOn(right, onDate)).sort((a, b) => a.id.localeCompare(b.id))
}

/** Whether a right's scope includes a given component: whole-facility rights (`componentIds === null`) cover every component. */
export function usageRightCoversComponent(right: FacilityUsageRight, componentId: FacilityComponentId): boolean {
  return right.componentIds === null || right.componentIds.includes(componentId)
}
