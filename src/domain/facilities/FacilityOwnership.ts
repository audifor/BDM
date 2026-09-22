import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityIdFromString, facilityOwnershipInterestIdFromString, organizationIdFromString, personIdFromString, type FacilityId, type FacilityOwnershipInterestId, type OrganizationId, type PersonId } from '@/domain/ids'

/**
 * Facility ownership is a physical-asset interest, semantically distinct from corporate
 * `OrganizationOwnership` (equity in a legal entity). A club can hold 100% corporate
 * ownership of itself while owning 0% of the arena it plays in, or vice versa. This module
 * never reuses `OrganizationOwnership` records for facility asset ownership.
 */
export type FacilityOwnershipActor =
  | { readonly kind: 'PERSON'; readonly personId: PersonId }
  | { readonly kind: 'ORGANIZATION'; readonly organizationId: OrganizationId }

export interface FacilityOwnershipInterest {
  readonly id: FacilityOwnershipInterestId
  readonly facilityId: FacilityId
  readonly owner: FacilityOwnershipActor
  /** null represents unknown/unspecified ownership share, never a falsified precise value. */
  readonly ownershipPercentage: number | null
  readonly validFrom: GameDate | null
  readonly validTo: GameDate | null
}

export interface CreateFacilityOwnershipInterestInput {
  readonly id: FacilityOwnershipInterestId | string
  readonly facilityId: FacilityId | string
  readonly owner: FacilityOwnershipActor
  readonly ownershipPercentage: number | null
  readonly validFrom?: GameDate | string | null
  readonly validTo?: GameDate | string | null
}

export function createFacilityOwnershipInterest(input: CreateFacilityOwnershipInterestInput): FacilityOwnershipInterest {
  const ownershipPercentage = input.ownershipPercentage
  if (ownershipPercentage !== null && (!Number.isFinite(ownershipPercentage) || ownershipPercentage < 0 || ownershipPercentage > 100)) {
    throw new RangeError('Facility ownership percentage must be null or between 0 and 100')
  }
  const validFrom = input.validFrom === undefined || input.validFrom === null ? null : parseGameDate(input.validFrom)
  const validTo = input.validTo === undefined || input.validTo === null ? null : parseGameDate(input.validTo)
  if (validFrom !== null && validTo !== null && compareGameDates(validTo, validFrom) < 0) {
    throw new RangeError('Facility ownership validTo cannot precede validFrom')
  }
  return Object.freeze({
    id: facilityOwnershipInterestIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    owner: createFacilityOwnershipActor(input.owner),
    ownershipPercentage,
    validFrom,
    validTo,
  })
}

export function createFacilityOwnershipActor(actor: FacilityOwnershipActor): FacilityOwnershipActor {
  if (actor.kind === 'PERSON') return Object.freeze({ kind: 'PERSON', personId: personIdFromString(actor.personId) })
  if (actor.kind === 'ORGANIZATION') return Object.freeze({ kind: 'ORGANIZATION', organizationId: organizationIdFromString(actor.organizationId) })
  throw new TypeError('Facility ownership actor kind is invalid')
}

function isActiveOn(validFrom: GameDate | null, validTo: GameDate | null, onDate: GameDate): boolean {
  return (validFrom === null || compareGameDates(validFrom, onDate) <= 0) && (validTo === null || compareGameDates(onDate, validTo) <= 0)
}

export function getActiveFacilityOwnership(interests: readonly FacilityOwnershipInterest[], facilityId: FacilityId, onDate: GameDate): readonly FacilityOwnershipInterest[] {
  return interests
    .filter((interest) => interest.facilityId === facilityId && isActiveOn(interest.validFrom, interest.validTo, onDate))
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** Only meaningful when every active interest has a known (non-null) percentage; a partially-unknown ownership set has no defined total. */
export function totalKnownFacilityOwnershipPercentage(interests: readonly FacilityOwnershipInterest[]): number | null {
  if (interests.some((interest) => interest.ownershipPercentage === null)) return null
  return interests.reduce((sum, interest) => sum + (interest.ownershipPercentage as number), 0)
}
