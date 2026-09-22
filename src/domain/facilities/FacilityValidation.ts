import type { GameDate } from '@/domain/date'
import type { FacilityId, OrganizationId, PersonId, TeamId } from '@/domain/ids'
import { createFacility, type Facility } from './Facility'
import { createFacilityComponent, type FacilityComponent } from './FacilityComponent'
import { createFacilityCompetitionApproval, type FacilityCompetitionApproval } from './FacilityCompetitionApproval'
import { createFacilityNameRecord, type FacilityNameRecord } from './FacilityNameHistory'
import { createFacilityOwnershipInterest, totalKnownFacilityOwnershipPercentage, type FacilityOwnershipInterest } from './FacilityOwnership'
import { createFacilityOrganizationRelationship, createFacilityTeamRelationship, type FacilityOrganizationRelationship, type FacilityTeamRelationship } from './FacilityRelationship'
import { createFacilityStatusRecord, type FacilityStatusRecord } from './FacilityStatusHistory'
import { createFacilityUsageRight, type FacilityUsageRight } from './FacilityUsageRight'
import { createPlace, type Place } from './Place'

export class FacilityValidationError extends Error {}

/**
 * Everything this validator needs to see, expressed independently of `GameWorld`'s concrete
 * shape so it stays reusable and unit-testable without constructing a full world.
 */
export interface FacilityValidationContext {
  readonly places: readonly Place[]
  readonly facilities: readonly Facility[]
  readonly components: readonly FacilityComponent[]
  readonly nameRecords: readonly FacilityNameRecord[]
  readonly ownershipInterests: readonly FacilityOwnershipInterest[]
  readonly organizationRelationships: readonly FacilityOrganizationRelationship[]
  readonly teamRelationships: readonly FacilityTeamRelationship[]
  readonly usageRights: readonly FacilityUsageRight[]
  readonly competitionApprovals: readonly FacilityCompetitionApproval[]
  readonly statusRecords: readonly FacilityStatusRecord[]
  readonly knownOrganizationIds: ReadonlySet<OrganizationId>
  readonly knownTeamIds: ReadonlySet<TeamId>
  readonly knownPersonIds: ReadonlySet<PersonId>
  readonly knownCompetitionIds: ReadonlySet<string>
}

/**
 * Pure structural + referential + temporal validation for the whole Facilities & Infrastructure
 * slice. GameWorld's own validator calls this once with world-derived collections; it never
 * duplicates these rules inline.
 */
export function validateFacilitiesDomain(context: FacilityValidationContext): void {
  const placeIds = new Set<string>()
  for (const place of context.places) {
    createPlace(place)
    if (placeIds.has(place.id)) throw new FacilityValidationError(`Duplicate Place ID: ${place.id}`)
    placeIds.add(place.id)
  }
  for (const place of context.places) {
    if (place.parentPlaceId !== null && !placeIds.has(place.parentPlaceId)) {
      throw new FacilityValidationError(`Place ${place.id} references missing parent Place ${place.parentPlaceId}`)
    }
  }

  const facilityIds = new Set<FacilityId>()
  for (const facility of context.facilities) {
    createFacility(facility)
    if (facilityIds.has(facility.id)) throw new FacilityValidationError(`Duplicate Facility ID: ${facility.id}`)
    facilityIds.add(facility.id)
    if (!placeIds.has(facility.placeId)) throw new FacilityValidationError(`Facility ${facility.id} references missing Place ${facility.placeId}`)
  }

  const componentIds = new Set<string>()
  for (const component of context.components) {
    createFacilityComponent(component)
    if (componentIds.has(component.id)) throw new FacilityValidationError(`Duplicate Facility component ID: ${component.id}`)
    componentIds.add(component.id)
    requireFacility(facilityIds, component.facilityId, `Facility component ${component.id}`)
  }

  const nameRecordIds = new Set<string>()
  for (const record of context.nameRecords) {
    createFacilityNameRecord(record)
    if (nameRecordIds.has(record.id)) throw new FacilityValidationError(`Duplicate Facility name record ID: ${record.id}`)
    nameRecordIds.add(record.id)
    requireFacility(facilityIds, record.facilityId, `Facility name record ${record.id}`)
  }
  for (const facility of context.facilities) {
    const canonicalRecords = context.nameRecords.filter((record) => record.facilityId === facility.id && record.isCanonical)
    assertNoOverlap(canonicalRecords, `Facility ${facility.id} canonical name history`)
  }

  const ownershipIds = new Set<string>()
  for (const interest of context.ownershipInterests) {
    createFacilityOwnershipInterest(interest)
    if (ownershipIds.has(interest.id)) throw new FacilityValidationError(`Duplicate Facility ownership interest ID: ${interest.id}`)
    ownershipIds.add(interest.id)
    requireFacility(facilityIds, interest.facilityId, `Facility ownership interest ${interest.id}`)
    if (interest.owner.kind === 'PERSON') {
      if (!context.knownPersonIds.has(interest.owner.personId)) throw new FacilityValidationError(`Facility ownership interest ${interest.id} references missing Person ${interest.owner.personId}`)
    } else {
      if (!context.knownOrganizationIds.has(interest.owner.organizationId)) throw new FacilityValidationError(`Facility ownership interest ${interest.id} references missing Organization ${interest.owner.organizationId}`)
    }
  }
  for (const facility of context.facilities) {
    const active = context.ownershipInterests.filter((interest) => interest.facilityId === facility.id)
    assertOwnershipDoesNotOverlapPast100(active, facility.id)
  }

  const orgRelationshipIds = new Set<string>()
  for (const relationship of context.organizationRelationships) {
    createFacilityOrganizationRelationship(relationship)
    if (orgRelationshipIds.has(relationship.id)) throw new FacilityValidationError(`Duplicate Facility organization relationship ID: ${relationship.id}`)
    orgRelationshipIds.add(relationship.id)
    requireFacility(facilityIds, relationship.facilityId, `Facility organization relationship ${relationship.id}`)
    if (!context.knownOrganizationIds.has(relationship.organizationId)) throw new FacilityValidationError(`Facility organization relationship ${relationship.id} references missing Organization ${relationship.organizationId}`)
  }
  assertNoDuplicateActiveRelationships(
    context.organizationRelationships,
    (relationship) => `${relationship.facilityId}:${relationship.organizationId}:${relationship.kind}`,
    'Facility organization relationship',
  )

  const teamRelationshipIds = new Set<string>()
  for (const relationship of context.teamRelationships) {
    createFacilityTeamRelationship(relationship)
    if (teamRelationshipIds.has(relationship.id)) throw new FacilityValidationError(`Duplicate Facility team relationship ID: ${relationship.id}`)
    teamRelationshipIds.add(relationship.id)
    requireFacility(facilityIds, relationship.facilityId, `Facility team relationship ${relationship.id}`)
    if (!context.knownTeamIds.has(relationship.teamId)) throw new FacilityValidationError(`Facility team relationship ${relationship.id} references missing Team ${relationship.teamId}`)
  }
  assertNoDuplicateActiveRelationships(
    context.teamRelationships,
    (relationship) => `${relationship.facilityId}:${relationship.teamId}:${relationship.kind}`,
    'Facility team relationship',
  )

  const usageRightIds = new Set<string>()
  for (const right of context.usageRights) {
    createFacilityUsageRight(right)
    if (usageRightIds.has(right.id)) throw new FacilityValidationError(`Duplicate Facility usage right ID: ${right.id}`)
    usageRightIds.add(right.id)
    requireFacility(facilityIds, right.facilityId, `Facility usage right ${right.id}`)
    if (right.organizationId !== null && !context.knownOrganizationIds.has(right.organizationId)) throw new FacilityValidationError(`Facility usage right ${right.id} references missing Organization ${right.organizationId}`)
    if (right.teamId !== null && !context.knownTeamIds.has(right.teamId)) throw new FacilityValidationError(`Facility usage right ${right.id} references missing Team ${right.teamId}`)
  }

  const approvalIds = new Set<string>()
  for (const approval of context.competitionApprovals) {
    createFacilityCompetitionApproval(approval)
    if (approvalIds.has(approval.id)) throw new FacilityValidationError(`Duplicate Facility competition approval ID: ${approval.id}`)
    approvalIds.add(approval.id)
    requireFacility(facilityIds, approval.facilityId, `Facility competition approval ${approval.id}`)
    if (!context.knownCompetitionIds.has(approval.competitionId)) throw new FacilityValidationError(`Facility competition approval ${approval.id} references missing Competition ${approval.competitionId}`)
  }

  const statusRecordIds = new Set<string>()
  for (const record of context.statusRecords) {
    createFacilityStatusRecord(record)
    if (statusRecordIds.has(record.id)) throw new FacilityValidationError(`Duplicate Facility status record ID: ${record.id}`)
    statusRecordIds.add(record.id)
    requireFacility(facilityIds, record.facilityId, `Facility status record ${record.id}`)
  }
}

function requireFacility(facilityIds: ReadonlySet<FacilityId>, facilityId: FacilityId, label: string): void {
  if (!facilityIds.has(facilityId)) throw new FacilityValidationError(`${label} references missing Facility ${facilityId}`)
}

function assertNoOverlap(records: readonly { readonly id: string; readonly validFrom: GameDate | null; readonly validTo: GameDate | null }[], label: string): void {
  const sorted = [...records].sort((a, b) => (a.validFrom === null ? -Infinity : Date.parse(a.validFrom)) - (b.validFrom === null ? -Infinity : Date.parse(b.validFrom)))
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]!
    const current = sorted[i]!
    if (previous.validTo === null) throw new FacilityValidationError(`${label} has overlapping open-ended records`)
    if (current.validFrom !== null && current.validFrom < previous.validTo) throw new FacilityValidationError(`${label} has overlapping records`)
  }
}

function assertOwnershipDoesNotOverlapPast100(interests: readonly FacilityOwnershipInterest[], facilityId: FacilityId): void {
  const boundaries = new Set<string>()
  for (const interest of interests) {
    if (interest.validFrom !== null) boundaries.add(interest.validFrom)
    if (interest.validTo !== null) boundaries.add(interest.validTo)
  }
  if (boundaries.size === 0 && interests.length > 0) {
    const total = totalKnownFacilityOwnershipPercentage(interests)
    if (total !== null && total > 100) throw new FacilityValidationError(`Facility ${facilityId} ownership exceeds 100% when fully known`)
    return
  }
  for (const boundary of boundaries) {
    const activeOnBoundary = interests.filter((interest) => (interest.validFrom === null || interest.validFrom <= boundary) && (interest.validTo === null || boundary <= interest.validTo))
    const total = totalKnownFacilityOwnershipPercentage(activeOnBoundary)
    if (total !== null && total > 100) throw new FacilityValidationError(`Facility ${facilityId} ownership exceeds 100% when fully known as of ${boundary}`)
  }
}

function assertNoDuplicateActiveRelationships<T extends { readonly validFrom: GameDate | null; readonly validTo: GameDate | null }>(relationships: readonly T[], key: (relationship: T) => string, label: string): void {
  const byKey = new Map<string, T[]>()
  for (const relationship of relationships) {
    const k = key(relationship)
    const bucket = byKey.get(k) ?? []
    bucket.push(relationship)
    byKey.set(k, bucket)
  }
  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue
    assertNoOverlap(bucket.map((item, index) => ({ id: String(index), validFrom: item.validFrom, validTo: item.validTo })), label)
  }
}
