import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityIdFromString, facilityOperatorAssignmentIdFromString, organizationIdFromString, type FacilityId, type FacilityOperatorAssignmentId, type OrganizationId } from '@/domain/ids'

/**
 * Who runs the day-to-day operations of a Facility. Never assumed equal to the owner
 * (`FacilityOwnershipInterest`) or the controller (`FacilityControlRight`): a municipality can
 * own an arena while a private venue-management company operates it and a club merely holds
 * usage rights. Operator is its own first-class, temporal, historical concept — CFI1 modeled it
 * as one relationship kind among many; CFI2 promotes it to a dedicated model so operator changes
 * can be queried and validated (duplicate-active-operator detection, historical succession)
 * without conflating it with TENANT/LESSOR/MANAGER/FINANCIER-style structural relationships.
 */
export interface FacilityOperatorAssignment {
  readonly id: FacilityOperatorAssignmentId
  readonly facilityId: FacilityId
  readonly operatorOrganizationId: OrganizationId
  readonly validFrom: GameDate | null
  readonly validTo: GameDate | null
}

export interface CreateFacilityOperatorAssignmentInput {
  readonly id: FacilityOperatorAssignmentId | string
  readonly facilityId: FacilityId | string
  readonly operatorOrganizationId: OrganizationId | string
  readonly validFrom?: GameDate | string | null
  readonly validTo?: GameDate | string | null
}

export function createFacilityOperatorAssignment(input: CreateFacilityOperatorAssignmentInput): FacilityOperatorAssignment {
  const validFrom = input.validFrom === undefined || input.validFrom === null ? null : parseGameDate(input.validFrom)
  const validTo = input.validTo === undefined || input.validTo === null ? null : parseGameDate(input.validTo)
  if (validFrom !== null && validTo !== null && compareGameDates(validTo, validFrom) < 0) {
    throw new RangeError('Facility operator assignment validTo cannot precede validFrom')
  }
  return Object.freeze({
    id: facilityOperatorAssignmentIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    operatorOrganizationId: organizationIdFromString(input.operatorOrganizationId),
    validFrom,
    validTo,
  })
}

function isActiveOn(validFrom: GameDate | null, validTo: GameDate | null, onDate: GameDate): boolean {
  return (validFrom === null || compareGameDates(validFrom, onDate) <= 0) && (validTo === null || compareGameDates(onDate, validTo) <= 0)
}

export function operatorsOfFacilityAt(assignments: readonly FacilityOperatorAssignment[], facilityId: FacilityId, onDate: GameDate): readonly FacilityOperatorAssignment[] {
  return assignments.filter((assignment) => assignment.facilityId === facilityId && isActiveOn(assignment.validFrom, assignment.validTo, onDate)).sort((a, b) => a.id.localeCompare(b.id))
}

export function facilitiesOperatedByOrganizationAt(assignments: readonly FacilityOperatorAssignment[], organizationId: OrganizationId, onDate: GameDate): readonly FacilityId[] {
  const facilityIds = new Set<FacilityId>()
  for (const assignment of assignments) {
    if (assignment.operatorOrganizationId === organizationId && isActiveOn(assignment.validFrom, assignment.validTo, onDate)) facilityIds.add(assignment.facilityId)
  }
  return Object.freeze([...facilityIds].sort((a, b) => a.localeCompare(b)))
}
