import type { GameDate } from '@/domain/date'
import type { FacilityComponentId, FacilityId, OrganizationId, TeamId } from '@/domain/ids'
import type { Facility } from './Facility'
import { activeFacilityComponentsAt, componentCategory, type FacilityComponent, type FacilityComponentType } from './FacilityComponent'
import type { FacilityComponentCategory } from './FacilityComponentCategory'
import { capabilitiesOfFacility, facilitiesWithCapability, facilityHasCapability, facilityHasUsableCapabilityAt, usableCapabilitiesOfFacilityAt, type FacilityComponentCapability } from './FacilityComponentCapability'
import { componentConditionAt, componentServiceabilityAt, facilityConditionRecordsAt, type FacilityComponentConditionRecord, type FacilityConditionRecord } from './FacilityCondition'
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

// --- Components / hierarchy / anatomy (CFI3) ------------------------------

export { activeFacilityComponentsAt }

/** All ACTIVE, currently-open components of a Facility at a date. Alias of `activeFacilityComponentsAt` under the CFI3-requested name. */
export function componentsOfFacility(components: readonly FacilityComponent[], facilityId: FacilityId, onDate: GameDate): readonly FacilityComponent[] {
  return activeFacilityComponentsAt(components, facilityId, onDate)
}

/** Active components of a Facility whose type falls in a given category (see `componentCategory`). */
export function componentsOfFacilityByCategory(components: readonly FacilityComponent[], facilityId: FacilityId, category: FacilityComponentCategory, onDate: GameDate): readonly FacilityComponent[] {
  return activeFacilityComponentsAt(components, facilityId, onDate).filter((component) => componentCategory(component.type) === category)
}

/** Active components of a Facility of one exact type. */
export function componentsOfFacilityByType(components: readonly FacilityComponent[], facilityId: FacilityId, type: FacilityComponentType, onDate: GameDate): readonly FacilityComponent[] {
  return activeFacilityComponentsAt(components, facilityId, onDate).filter((component) => component.type === type)
}

/** Direct children of a component (its `parentComponentId` matches), restricted to the same Facility and active at the date, deterministically ordered. */
export function childComponentsOf(components: readonly FacilityComponent[], parentComponentId: FacilityComponentId, onDate: GameDate): readonly FacilityComponent[] {
  const parent = components.find((component) => component.id === parentComponentId)
  if (parent === undefined) return Object.freeze([])
  return activeFacilityComponentsAt(components, parent.facilityId, onDate).filter((component) => component.parentComponentId === parentComponentId)
}

/** Every active component of a Facility with no parent (`parentComponentId === null`) at a date. */
export function rootComponentsOfFacility(components: readonly FacilityComponent[], facilityId: FacilityId, onDate: GameDate): readonly FacilityComponent[] {
  return activeFacilityComponentsAt(components, facilityId, onDate).filter((component) => component.parentComponentId === null)
}

/** All BASKETBALL-category active components of a Facility (main, practice, secondary, half, shooting, academy, outdoor courts). */
export function courtsOfFacility(components: readonly FacilityComponent[], facilityId: FacilityId, onDate: GameDate): readonly FacilityComponent[] {
  return componentsOfFacilityByCategory(components, facilityId, 'BASKETBALL', onDate)
}

/** Active PRACTICE_COURT components of a Facility specifically. */
export function practiceCourtsOfFacility(components: readonly FacilityComponent[], facilityId: FacilityId, onDate: GameDate): readonly FacilityComponent[] {
  return componentsOfFacilityByType(components, facilityId, 'PRACTICE_COURT', onDate)
}

/** All MEDICAL-category active components of a Facility. */
export function medicalComponentsOfFacility(components: readonly FacilityComponent[], facilityId: FacilityId, onDate: GameDate): readonly FacilityComponent[] {
  return componentsOfFacilityByCategory(components, facilityId, 'MEDICAL', onDate)
}

/** All RECOVERY-category active components of a Facility. */
export function recoveryComponentsOfFacility(components: readonly FacilityComponent[], facilityId: FacilityId, onDate: GameDate): readonly FacilityComponent[] {
  return componentsOfFacilityByCategory(components, facilityId, 'RECOVERY', onDate)
}

/** All TRAINING-category active components of a Facility. */
export function trainingComponentsOfFacility(components: readonly FacilityComponent[], facilityId: FacilityId, onDate: GameDate): readonly FacilityComponent[] {
  return componentsOfFacilityByCategory(components, facilityId, 'TRAINING', onDate)
}

// --- Derived component capabilities (CFI3) --------------------------------

export { capabilitiesOfFacility, facilitiesWithCapability, facilityHasCapability, type FacilityComponentCapability }

// --- Condition / serviceability (CFI4) ------------------------------------

export { componentConditionAt, componentServiceabilityAt, facilityConditionRecordsAt, type FacilityComponentConditionRecord, type FacilityConditionRecord }

/** Component IDs across the given set whose resolved `physicalCondition` is known and strictly below `threshold` at a date. A component with unknown condition is never included — unknown is never treated as "presumably below threshold". */
export function componentsBelowConditionAt(components: readonly FacilityComponent[], conditionRecords: readonly FacilityComponentConditionRecord[], threshold: number, onDate: GameDate): readonly FacilityComponentId[] {
  const result: FacilityComponentId[] = []
  for (const component of components) {
    const record = componentConditionAt(conditionRecords, component.id, onDate)
    if (record !== undefined && record.physicalCondition !== null && record.physicalCondition < threshold) result.push(component.id)
  }
  return Object.freeze([...result].sort((a, b) => a.localeCompare(b)))
}

/** Component IDs across the given set whose resolved serviceability is `OUT_OF_SERVICE` at a date. */
export function componentsOutOfServiceAt(components: readonly FacilityComponent[], conditionRecords: readonly FacilityComponentConditionRecord[], onDate: GameDate): readonly FacilityComponentId[] {
  return Object.freeze(components.filter((component) => componentServiceabilityAt(conditionRecords, component.id, onDate) === 'OUT_OF_SERVICE').map((component) => component.id).sort((a, b) => a.localeCompare(b)))
}

/** Component IDs across the given set whose resolved serviceability is `LIMITED` or `SEVERELY_LIMITED` at a date. */
export function componentsWithLimitedServiceAt(components: readonly FacilityComponent[], conditionRecords: readonly FacilityComponentConditionRecord[], onDate: GameDate): readonly FacilityComponentId[] {
  return Object.freeze(components.filter((component) => {
    const serviceability = componentServiceabilityAt(conditionRecords, component.id, onDate)
    return serviceability === 'LIMITED' || serviceability === 'SEVERELY_LIMITED'
  }).map((component) => component.id).sort((a, b) => a.localeCompare(b)))
}

/**
 * A derived, non-persisted summary of a Facility's component condition landscape at a date. Never
 * treated as world truth — it is recomputed on every call from the same canonical records
 * `componentConditionAt` reads. `averageCondition` is explicitly documented as a derived
 * convenience (over components with a known condition only) and must never be mistaken for a
 * stored "facility condition" value; `null` when no active component has a known condition.
 */
export interface FacilityConditionSummary {
  readonly facilityId: FacilityId
  readonly componentCount: number
  readonly knownConditionComponentCount: number
  readonly outOfServiceComponentIds: readonly FacilityComponentId[]
  readonly limitedServiceComponentIds: readonly FacilityComponentId[]
  readonly worstKnownCondition: number | null
  readonly averageKnownCondition: number | null
}

export function facilityConditionSummaryAt(components: readonly FacilityComponent[], conditionRecords: readonly FacilityComponentConditionRecord[], facilityId: FacilityId, onDate: GameDate): FacilityConditionSummary {
  const active = activeFacilityComponentsAt(components, facilityId, onDate)
  const knownConditions: number[] = []
  for (const component of active) {
    const record = componentConditionAt(conditionRecords, component.id, onDate)
    if (record !== undefined && record.physicalCondition !== null) knownConditions.push(record.physicalCondition)
  }
  return Object.freeze({
    facilityId,
    componentCount: active.length,
    knownConditionComponentCount: knownConditions.length,
    outOfServiceComponentIds: componentsOutOfServiceAt(active, conditionRecords, onDate),
    limitedServiceComponentIds: componentsWithLimitedServiceAt(active, conditionRecords, onDate),
    worstKnownCondition: knownConditions.length === 0 ? null : Math.min(...knownConditions),
    averageKnownCondition: knownConditions.length === 0 ? null : knownConditions.reduce((sum, value) => sum + value, 0) / knownConditions.length,
  })
}

// --- Capability availability (CFI3 presence + CFI4 serviceability) -------

export { usableCapabilitiesOfFacilityAt, facilityHasUsableCapabilityAt }

// --- Access integration (CFI3 reuses CFI2's usage-right scoping; no duplicated logic) ---

/** Alias of `facilityComponentsUsableByTeamAt` under the CFI3-requested name; delegates to the same CFI2 scope-resolution logic rather than reimplementing it. Access only — does not consider physical serviceability; see `availableComponentsForTeamAt` for the CFI4 combination. */
export function usableComponentsForTeamAt(rights: readonly FacilityUsageRight[], components: readonly FacilityComponent[], teamId: TeamId, onDate: GameDate): readonly FacilityComponentId[] {
  return facilityComponentsUsableByTeamAt(rights, components, teamId, onDate)
}

/**
 * CFI4: the intersection of CFI2 access (`usableComponentsForTeamAt`) and CFI4 physical
 * serviceability (excluding `OUT_OF_SERVICE`). Deliberately a new, separate function rather than a
 * silent redefinition of `usableComponentsForTeamAt`/`facilityComponentsUsableByTeamAt` — those
 * remain pure access-rights resolvers so any existing caller's semantics are preserved unchanged.
 * `LIMITED`/`SEVERELY_LIMITED` components remain available here (they are usable, just degraded);
 * only `OUT_OF_SERVICE` is excluded.
 */
export function availableComponentsForTeamAt(rights: readonly FacilityUsageRight[], components: readonly FacilityComponent[], conditionRecords: readonly FacilityComponentConditionRecord[], teamId: TeamId, onDate: GameDate): readonly FacilityComponentId[] {
  const accessible = usableComponentsForTeamAt(rights, components, teamId, onDate)
  return Object.freeze(accessible.filter((componentId) => componentServiceabilityAt(conditionRecords, componentId, onDate) !== 'OUT_OF_SERVICE'))
}

export function facilityNameAt(nameRecords: readonly FacilityNameRecord[], facilityId: FacilityId, onDate: GameDate, fallbackCanonicalName: string): string {
  const resolved = resolveFacilityNameAt(nameRecords.filter((record) => record.facilityId === facilityId), onDate)
  return resolved ?? fallbackCanonicalName
}

export function facilityStatusAt(statusRecords: readonly FacilityStatusRecord[], facility: Facility, onDate: GameDate): FacilityStatus {
  return resolveFacilityStatusAt(statusRecords, facility.id, onDate, facility.status)
}
