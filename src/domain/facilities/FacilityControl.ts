import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityControlRightIdFromString, facilityIdFromString, organizationIdFromString, personIdFromString, type FacilityControlRightId, type FacilityId, type OrganizationId, type PersonId } from '@/domain/ids'

/**
 * Who takes operational/decision-making control of a Facility, independent of who owns it
 * (`FacilityOwnershipInterest`) and independent of who runs day-to-day operations
 * (`FacilityOperatorAssignment`). Examples this must represent without a hack:
 *
 *   municipality owns        + club controls
 *   university owns          + athletics department controls
 *   holding company owns     + venue subsidiary controls
 *
 * This is deliberately NOT built on Governance's `GovernanceAuthorityGrant`: that type models
 * decision-authority delegation *within* an institution's governance bodies (who may approve a
 * FACILITIES-type decision), while `FacilityControlRight` records the resulting physical-asset
 * control fact itself. Governance may one day gate who is *allowed* to grant a
 * FacilityControlRight; it does not replace the record of who currently holds it.
 */
export type FacilityControlActor =
  | { readonly kind: 'PERSON'; readonly personId: PersonId }
  | { readonly kind: 'ORGANIZATION'; readonly organizationId: OrganizationId }

export interface FacilityControlRight {
  readonly id: FacilityControlRightId
  readonly facilityId: FacilityId
  readonly controller: FacilityControlActor
  readonly validFrom: GameDate | null
  readonly validTo: GameDate | null
}

export interface CreateFacilityControlRightInput {
  readonly id: FacilityControlRightId | string
  readonly facilityId: FacilityId | string
  readonly controller: FacilityControlActor
  readonly validFrom?: GameDate | string | null
  readonly validTo?: GameDate | string | null
}

export function createFacilityControlRight(input: CreateFacilityControlRightInput): FacilityControlRight {
  const validFrom = input.validFrom === undefined || input.validFrom === null ? null : parseGameDate(input.validFrom)
  const validTo = input.validTo === undefined || input.validTo === null ? null : parseGameDate(input.validTo)
  if (validFrom !== null && validTo !== null && compareGameDates(validTo, validFrom) < 0) {
    throw new RangeError('Facility control right validTo cannot precede validFrom')
  }
  return Object.freeze({
    id: facilityControlRightIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    controller: createFacilityControlActor(input.controller),
    validFrom,
    validTo,
  })
}

export function createFacilityControlActor(actor: FacilityControlActor): FacilityControlActor {
  if (actor.kind === 'PERSON') return Object.freeze({ kind: 'PERSON', personId: personIdFromString(actor.personId) })
  if (actor.kind === 'ORGANIZATION') return Object.freeze({ kind: 'ORGANIZATION', organizationId: organizationIdFromString(actor.organizationId) })
  throw new TypeError('Facility control actor kind is invalid')
}

function isActiveOn(validFrom: GameDate | null, validTo: GameDate | null, onDate: GameDate): boolean {
  return (validFrom === null || compareGameDates(validFrom, onDate) <= 0) && (validTo === null || compareGameDates(onDate, validTo) <= 0)
}

export function controllersOfFacilityAt(rights: readonly FacilityControlRight[], facilityId: FacilityId, onDate: GameDate): readonly FacilityControlRight[] {
  return rights.filter((right) => right.facilityId === facilityId && isActiveOn(right.validFrom, right.validTo, onDate)).sort((a, b) => a.id.localeCompare(b.id))
}

/** Kept for CFI2's exact requested resolver name; identical to `controllersOfFacilityAt`. */
export function whoControlsFacilityAt(rights: readonly FacilityControlRight[], facilityId: FacilityId, onDate: GameDate): readonly FacilityControlRight[] {
  return controllersOfFacilityAt(rights, facilityId, onDate)
}
