import type { GameDate } from '@/domain/date'
import type { FacilityComponentId, FacilityId, OrganizationId, TeamId } from '@/domain/ids'
import type { Facility } from './Facility'
import type { FacilityComponent } from './FacilityComponent'
import { facilityRightsConflictsAt, type FacilityRightsConflict } from './FacilityConflict'
import { controllersOfFacilityAt, whoControlsFacilityAt } from './FacilityControl'
import { resolveFacilityNameAt, type FacilityNameRecord } from './FacilityNameHistory'
import { facilitiesOwnedByOrganizationAt, facilityOwnershipAt, ownershipShareOfAt, ownersOfFacilityAt, type FacilityOwnershipInterest, type FacilityOwnershipSnapshot } from './FacilityOwnership'
import { facilitiesOperatedByOrganizationAt, operatorsOfFacilityAt } from './FacilityOperator'
import { getActiveFacilitiesForTeam, getActiveFacilityOrganizationRelationships, getActiveFacilityTeamRelationships, type FacilityOrganizationRelationship, type FacilityTeamRelationship } from './FacilityRelationship'
import { resolveFacilityStatusAt, type FacilityStatusRecord } from './FacilityStatusHistory'
import { usageRightCoversComponent, usageRightsForFacilityAt, usageRightsForOrganizationAt, usageRightsForTeamAt, type FacilityUsageRight } from './FacilityUsageRight'
import type { FacilityStatus } from './FacilityLifecycle'

/** Deterministic query surface over the Facilities & Infrastructure domain. Every resolver here is a pure projection: it never mutates state and always returns the same result for the same inputs and date. */

// --- Ownership ---------------------------------------------------------

export { ownersOfFacilityAt, ownershipShareOfAt, facilityOwnershipAt, facilitiesOwnedByOrganizationAt, type FacilityOwnershipInterest, type FacilityOwnershipSnapshot }

// --- Control -------------------------------------------------------------

export { controllersOfFacilityAt, whoControlsFacilityAt }

// --- Operation -------------------------------------------------------------

export { operatorsOfFacilityAt, facilitiesOperatedByOrganizationAt }

// --- Structural relationships ---------------------------------------------

export function organizationsRelatedToFacilityAt(relationships: readonly FacilityOrganizationRelationship[], facilityId: FacilityId, onDate: GameDate): readonly FacilityOrganizationRelationship[] {
  return getActiveFacilityOrganizationRelationships(relationships, facilityId, onDate)
}

export function usersOfFacilityAt(relationships: readonly FacilityTeamRelationship[], facilityId: FacilityId, onDate: GameDate): readonly FacilityTeamRelationship[] {
  return getActiveFacilityTeamRelationships(relationships, facilityId, onDate)
}

export function facilitiesUsedByTeamAt(relationships: readonly FacilityTeamRelationship[], teamId: TeamId, onDate: GameDate): readonly FacilityTeamRelationship[] {
  return getActiveFacilitiesForTeam(relationships, teamId, onDate)
}

/** Every distinct Facility a given Organization holds an active usage right over (directly, not inherited from any Team it may control), ordered deterministically. */
export function facilitiesUsedByOrganizationAt(rights: readonly FacilityUsageRight[], organizationId: OrganizationId, onDate: GameDate): readonly FacilityId[] {
  const facilityIds = new Set<FacilityId>()
  for (const right of usageRightsForOrganizationAt(rights, organizationId, onDate)) facilityIds.add(right.facilityId)
  return Object.freeze([...facilityIds].sort((a, b) => a.localeCompare(b)))
}

/** HOME_VENUE/SECONDARY_HOME_VENUE/TEMPORARY_HOME usage rights for a Team at a date, distinguishing primary (HOME_VENUE) from temporary/secondary without discarding the historical HOME_VENUE relationship a TEMPORARY_HOME period does not delete. */
export function homeFacilitiesForTeamAt(rights: readonly FacilityUsageRight[], teamId: TeamId, onDate: GameDate): readonly FacilityUsageRight[] {
  return usageRightsForTeamAt(rights, teamId, onDate).filter((right) => right.purpose === 'HOME_VENUE' || right.purpose === 'SECONDARY_HOME_VENUE' || right.purpose === 'TEMPORARY_HOME')
}

/** TRAINING/PRACTICE usage rights for a Team at a date. */
export function trainingFacilitiesForTeamAt(rights: readonly FacilityUsageRight[], teamId: TeamId, onDate: GameDate): readonly FacilityUsageRight[] {
  return usageRightsForTeamAt(rights, teamId, onDate).filter((right) => right.purpose === 'TRAINING' || right.purpose === 'PRACTICE')
}

/** Every distinct Team holding an active usage right (of any purpose) over a Facility at a date. */
export function teamsUsingFacilityAt(rights: readonly FacilityUsageRight[], facilityId: FacilityId, onDate: GameDate): readonly TeamId[] {
  const teamIds = new Set<TeamId>()
  for (const right of usageRightsForFacilityAt(rights, facilityId, onDate)) if (right.teamId !== null) teamIds.add(right.teamId)
  return Object.freeze([...teamIds].sort((a, b) => a.localeCompare(b)))
}

/** Every distinct Organization holding an active usage right (of any purpose) over a Facility at a date. */
export function organizationsUsingFacilityAt(rights: readonly FacilityUsageRight[], facilityId: FacilityId, onDate: GameDate): readonly OrganizationId[] {
  const organizationIds = new Set<OrganizationId>()
  for (const right of usageRightsForFacilityAt(rights, facilityId, onDate)) if (right.organizationId !== null) organizationIds.add(right.organizationId)
  return Object.freeze([...organizationIds].sort((a, b) => a.localeCompare(b)))
}

/** The FacilityComponents a Team may use at a date, resolved from its active usage rights' scopes (whole-facility rights resolve to every ACTIVE component of that Facility at the date). */
export function facilityComponentsUsableByTeamAt(rights: readonly FacilityUsageRight[], components: readonly FacilityComponent[], teamId: TeamId, onDate: GameDate): readonly FacilityComponentId[] {
  const usable = new Set<FacilityComponentId>()
  for (const right of usageRightsForTeamAt(rights, teamId, onDate)) {
    const facilityComponents = activeFacilityComponentsAt(components, right.facilityId, onDate)
    for (const component of facilityComponents) if (usageRightCoversComponent(right, component.id)) usable.add(component.id)
  }
  return Object.freeze([...usable].sort((a, b) => a.localeCompare(b)))
}

// --- Usage rights ----------------------------------------------------------

export { usageRightsForFacilityAt, usageRightsForTeamAt, usageRightsForOrganizationAt }

// --- Conflict detection ------------------------------------------------------

export { facilityRightsConflictsAt, type FacilityRightsConflict }

// --- Components / naming / status ----------------------------------------

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
