import type { GameDate } from '@/domain/date'
import type { FacilityId, TeamId } from '@/domain/ids'
import type { Facility } from './Facility'
import type { FacilityComponent } from './FacilityComponent'
import { resolveFacilityNameAt, type FacilityNameRecord } from './FacilityNameHistory'
import { getActiveFacilityOwnership, type FacilityOwnershipInterest } from './FacilityOwnership'
import { getActiveFacilitiesForTeam, getActiveFacilityOrganizationRelationships, getActiveFacilityTeamRelationships, type FacilityOrganizationRelationship, type FacilityTeamRelationship } from './FacilityRelationship'
import { resolveFacilityStatusAt, type FacilityStatusRecord } from './FacilityStatusHistory'
import type { FacilityStatus } from './FacilityLifecycle'

/** Deterministic query surface over the Facilities & Infrastructure domain. Every resolver here is a pure projection: it never mutates state and always returns the same result for the same inputs and date. */

export function ownersOfFacilityAt(interests: readonly FacilityOwnershipInterest[], facilityId: FacilityId, onDate: GameDate): readonly FacilityOwnershipInterest[] {
  return getActiveFacilityOwnership(interests, facilityId, onDate)
}

export function organizationsRelatedToFacilityAt(relationships: readonly FacilityOrganizationRelationship[], facilityId: FacilityId, onDate: GameDate): readonly FacilityOrganizationRelationship[] {
  return getActiveFacilityOrganizationRelationships(relationships, facilityId, onDate)
}

export function usersOfFacilityAt(relationships: readonly FacilityTeamRelationship[], facilityId: FacilityId, onDate: GameDate): readonly FacilityTeamRelationship[] {
  return getActiveFacilityTeamRelationships(relationships, facilityId, onDate)
}

export function facilitiesUsedByTeamAt(relationships: readonly FacilityTeamRelationship[], teamId: TeamId, onDate: GameDate): readonly FacilityTeamRelationship[] {
  return getActiveFacilitiesForTeam(relationships, teamId, onDate)
}

export function activeFacilityComponentsAt(components: readonly FacilityComponent[], facilityId: FacilityId, onDate: GameDate): readonly FacilityComponent[] {
  return components
    .filter((component) => component.facilityId === facilityId)
    .filter((component) => {
      if (component.openedAt !== null && component.openedAt > onDate) return false
      if (component.closedAt !== null && component.closedAt <= onDate) return false
      return component.status !== 'CLOSED'
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function facilityNameAt(nameRecords: readonly FacilityNameRecord[], facilityId: FacilityId, onDate: GameDate, fallbackCanonicalName: string): string {
  const resolved = resolveFacilityNameAt(nameRecords.filter((record) => record.facilityId === facilityId), onDate)
  return resolved ?? fallbackCanonicalName
}

export function facilityStatusAt(statusRecords: readonly FacilityStatusRecord[], facility: Facility, onDate: GameDate): FacilityStatus {
  return resolveFacilityStatusAt(statusRecords, facility.id, onDate, facility.status)
}
