import type { GameDate } from '@/domain/date'
import type { FacilityComponentId, FacilityId, OrganizationId, TeamId } from '@/domain/ids'
import type { Facility } from './Facility'
import { activeFacilityComponentsAt, componentCategory, type FacilityComponent, type FacilityComponentType } from './FacilityComponent'
import type { FacilityComponentCategory } from './FacilityComponentCategory'
import { capabilitiesOfFacility, facilitiesWithCapability, facilityHasCapability, facilityHasUsableCapabilityAt, usableCapabilitiesOfFacilityAt, type FacilityComponentCapability } from './FacilityComponentCapability'
import { componentConditionAt, componentServiceabilityAt, facilityConditionRecordsAt, type FacilityComponentConditionRecord, type FacilityConditionRecord } from './FacilityCondition'
import { facilityRightsConflictsAt, type FacilityRightsConflict } from './FacilityConflict'
import { controllersOfFacilityAt, whoControlsFacilityAt } from './FacilityControl'
import type { FacilityInspection } from './FacilityInspection'
import { isFacilityMaintenanceNeedOpenStatus, type FacilityMaintenanceNeed } from './FacilityMaintenanceNeed'
import type { FacilityMaintenanceAction } from './FacilityMaintenanceAction'
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

// --- Maintenance / inspections / operational readiness (CFI5) ------------

/** All maintenance needs recorded for a Facility as of a date (i.e. `detectedAt <= onDate`, and if resolved, `resolvedAt > onDate` or still open) — an immutable-history view, not merely "currently open" (see `openMaintenanceNeedsAt` for that narrower question). */
export function maintenanceNeedsForFacilityAt(needs: readonly FacilityMaintenanceNeed[], facilityId: FacilityId, onDate: GameDate): readonly FacilityMaintenanceNeed[] {
  return needs.filter((need) => need.facilityId === facilityId && need.detectedAt <= onDate && (need.resolvedAt === null || need.resolvedAt > onDate)).sort((a, b) => a.id.localeCompare(b.id))
}

/** All maintenance needs recorded for one specific component as of a date. */
export function maintenanceNeedsForComponentAt(needs: readonly FacilityMaintenanceNeed[], componentId: FacilityComponentId, onDate: GameDate): readonly FacilityMaintenanceNeed[] {
  return needs.filter((need) => need.componentId === componentId && need.detectedAt <= onDate && (need.resolvedAt === null || need.resolvedAt > onDate)).sort((a, b) => a.id.localeCompare(b.id))
}

/** Every maintenance need across the given set whose status is not terminal (`COMPLETED`/`CANCELLED`) as of a date. */
export function openMaintenanceNeedsAt(needs: readonly FacilityMaintenanceNeed[], onDate: GameDate): readonly FacilityMaintenanceNeed[] {
  return needs.filter((need) => need.detectedAt <= onDate && isFacilityMaintenanceNeedOpenStatus(need.status)).sort((a, b) => a.id.localeCompare(b.id))
}

/** Every open (non-terminal) `CRITICAL`-severity maintenance need across the given set as of a date. */
export function criticalMaintenanceNeedsAt(needs: readonly FacilityMaintenanceNeed[], onDate: GameDate): readonly FacilityMaintenanceNeed[] {
  return openMaintenanceNeedsAt(needs, onDate).filter((need) => need.severity === 'CRITICAL')
}

/** Every maintenance action recorded against one Facility, in full immutable history (no date filter — actions are point-in-time historical facts, not temporally-resolved state). */
export function maintenanceActionsForFacility(actions: readonly FacilityMaintenanceAction[], facilityId: FacilityId): readonly FacilityMaintenanceAction[] {
  return actions.filter((action) => action.facilityId === facilityId).sort((a, b) => a.id.localeCompare(b.id))
}

/** Every maintenance action recorded against one specific component, in full immutable history. */
export function maintenanceHistoryForComponent(actions: readonly FacilityMaintenanceAction[], componentId: FacilityComponentId): readonly FacilityMaintenanceAction[] {
  return actions.filter((action) => action.componentId === componentId).sort((a, b) => a.id.localeCompare(b.id))
}

/** Every inspection recorded against one Facility, in full immutable history. */
export function inspectionsForFacility(inspections: readonly FacilityInspection[], facilityId: FacilityId): readonly FacilityInspection[] {
  return inspections.filter((inspection) => inspection.facilityId === facilityId).sort((a, b) => a.id.localeCompare(b.id))
}

/** The most recent inspection recorded for one component at or before a date, or `undefined` if none exists — never assumed to be "no issue" when absent. */
export function latestInspectionForComponentAt(inspections: readonly FacilityInspection[], componentId: FacilityComponentId, onDate: GameDate): FacilityInspection | undefined {
  const candidates = inspections.filter((inspection) => inspection.componentId === componentId && inspection.inspectedAt <= onDate)
  if (candidates.length === 0) return undefined
  return [...candidates].sort((a, b) => {
    const byDate = b.inspectedAt.localeCompare(a.inspectedAt)
    return byDate !== 0 ? byDate : b.id.localeCompare(a.id)
  })[0]
}

/** Component IDs, across the given set, that currently have at least one open (non-terminal) maintenance need as of a date. */
export function componentsRequiringMaintenanceAt(components: readonly FacilityComponent[], needs: readonly FacilityMaintenanceNeed[], onDate: GameDate): readonly FacilityComponentId[] {
  const open = openMaintenanceNeedsAt(needs, onDate)
  const componentIds = new Set(components.map((component) => component.id))
  const result = new Set<FacilityComponentId>()
  for (const need of open) if (need.componentId !== null && componentIds.has(need.componentId)) result.add(need.componentId)
  return Object.freeze([...result].sort((a, b) => a.localeCompare(b)))
}

/**
 * A derived, non-persisted operational-readiness breakdown for one Facility at a date. Deliberately
 * a structured explanation, never a single OVERALL readiness number — the brief's own explicit
 * instruction. Recomputed on every call from the same canonical records every other CFI4/CFI5 query
 * reads; never itself a source of truth.
 */
export interface FacilityOperationalReadiness {
  readonly facilityId: FacilityId
  readonly activeComponentIds: readonly FacilityComponentId[]
  readonly limitedComponentIds: readonly FacilityComponentId[]
  readonly unavailableComponentIds: readonly FacilityComponentId[]
  readonly openMaintenanceNeeds: readonly FacilityMaintenanceNeed[]
  readonly criticalMaintenanceNeeds: readonly FacilityMaintenanceNeed[]
}

export function facilityOperationalReadinessAt(components: readonly FacilityComponent[], conditionRecords: readonly FacilityComponentConditionRecord[], needs: readonly FacilityMaintenanceNeed[], facilityId: FacilityId, onDate: GameDate): FacilityOperationalReadiness {
  const active = activeFacilityComponentsAt(components, facilityId, onDate)
  const unavailable = componentsOutOfServiceAt(active, conditionRecords, onDate)
  const limited = componentsWithLimitedServiceAt(active, conditionRecords, onDate)
  const facilityNeeds = maintenanceNeedsForFacilityAt(needs, facilityId, onDate)
  return Object.freeze({
    facilityId,
    activeComponentIds: Object.freeze(active.map((component) => component.id)),
    limitedComponentIds: limited,
    unavailableComponentIds: unavailable,
    openMaintenanceNeeds: Object.freeze(facilityNeeds.filter((need) => isFacilityMaintenanceNeedOpenStatus(need.status))),
    criticalMaintenanceNeeds: Object.freeze(facilityNeeds.filter((need) => isFacilityMaintenanceNeedOpenStatus(need.status) && need.severity === 'CRITICAL')),
  })
}

/** Same breakdown as `facilityOperationalReadinessAt`, scoped to one component (its own serviceability plus its own open/critical maintenance needs). */
export interface FacilityComponentOperationalReadiness {
  readonly componentId: FacilityComponentId
  readonly serviceability: ReturnType<typeof componentServiceabilityAt>
  readonly openMaintenanceNeeds: readonly FacilityMaintenanceNeed[]
  readonly criticalMaintenanceNeeds: readonly FacilityMaintenanceNeed[]
}

export function componentOperationalReadinessAt(conditionRecords: readonly FacilityComponentConditionRecord[], needs: readonly FacilityMaintenanceNeed[], componentId: FacilityComponentId, onDate: GameDate): FacilityComponentOperationalReadiness {
  const componentNeeds = maintenanceNeedsForComponentAt(needs, componentId, onDate)
  return Object.freeze({
    componentId,
    serviceability: componentServiceabilityAt(conditionRecords, componentId, onDate),
    openMaintenanceNeeds: Object.freeze(componentNeeds.filter((need) => isFacilityMaintenanceNeedOpenStatus(need.status))),
    criticalMaintenanceNeeds: Object.freeze(componentNeeds.filter((need) => isFacilityMaintenanceNeedOpenStatus(need.status) && need.severity === 'CRITICAL')),
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
