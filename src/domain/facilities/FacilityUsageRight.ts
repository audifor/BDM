import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityIdFromString, facilityUsageRightIdFromString, organizationIdFromString, teamIdFromString, type FacilityId, type FacilityUsageRightId, type OrganizationId, type TeamId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

/**
 * Explicit, temporal right to use a Facility for a purpose. Usage never implies ownership:
 * a right may exist with no corresponding FacilityOwnershipInterest or
 * FacilityOrganizationRelationship/FacilityTeamRelationship at all (e.g. a one-off exhibition).
 */
export interface FacilityUsageRight {
  readonly id: FacilityUsageRightId
  readonly facilityId: FacilityId
  readonly organizationId: OrganizationId | null
  readonly teamId: TeamId | null
  readonly purpose: string
  readonly validFrom: GameDate
  readonly validTo: GameDate | null
  readonly exclusive: boolean
}

export interface CreateFacilityUsageRightInput {
  readonly id: FacilityUsageRightId | string
  readonly facilityId: FacilityId | string
  readonly organizationId?: OrganizationId | string | null
  readonly teamId?: TeamId | string | null
  readonly purpose: string
  readonly validFrom: GameDate | string
  readonly validTo?: GameDate | string | null
  readonly exclusive?: boolean
}

export function createFacilityUsageRight(input: CreateFacilityUsageRightInput): FacilityUsageRight {
  const organizationId = input.organizationId === undefined || input.organizationId === null ? null : organizationIdFromString(input.organizationId)
  const teamId = input.teamId === undefined || input.teamId === null ? null : teamIdFromString(input.teamId)
  if (organizationId === null && teamId === null) throw new TypeError('Facility usage right requires an Organization and/or a Team beneficiary')
  const validFrom = parseGameDate(input.validFrom)
  const validTo = input.validTo === undefined || input.validTo === null ? null : parseGameDate(input.validTo)
  if (validTo !== null && compareGameDates(validTo, validFrom) < 0) throw new RangeError('Facility usage right validTo cannot precede validFrom')
  return Object.freeze({
    id: facilityUsageRightIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    organizationId,
    teamId,
    purpose: requireNonEmptyString(input.purpose, 'Facility usage right purpose'),
    validFrom,
    validTo,
    exclusive: input.exclusive ?? false,
  })
}

function isActiveOn(validFrom: GameDate, validTo: GameDate | null, onDate: GameDate): boolean {
  return compareGameDates(validFrom, onDate) <= 0 && (validTo === null || compareGameDates(onDate, validTo) <= 0)
}

export function getActiveFacilityUsageRights(rights: readonly FacilityUsageRight[], facilityId: FacilityId, onDate: GameDate): readonly FacilityUsageRight[] {
  return rights.filter((right) => right.facilityId === facilityId && isActiveOn(right.validFrom, right.validTo, onDate)).sort((a, b) => a.id.localeCompare(b.id))
}
