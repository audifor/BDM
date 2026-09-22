import type { GameDate } from '@/domain/date'
import type { FacilityId, OrganizationId, PersonId, TeamId } from '@/domain/ids'
import { createFacility, type Facility } from './Facility'
import { createFacilityComponent, type FacilityComponent } from './FacilityComponent'
import { createFacilityCompetitionApproval, type FacilityCompetitionApproval } from './FacilityCompetitionApproval'
import { createFacilityControlRight, type FacilityControlRight } from './FacilityControl'
import { createFacilityComponentConditionRecord, createFacilityConditionRecord, type FacilityComponentConditionRecord, type FacilityConditionRecord } from './FacilityCondition'
import { facilityRightsOverlapInTime } from './FacilityConflict'
import { createFacilityInspection, type FacilityInspection } from './FacilityInspection'
import { createFacilityMaintenanceAction, type FacilityMaintenanceAction } from './FacilityMaintenanceAction'
import { createFacilityMaintenanceNeed, type FacilityMaintenanceNeed } from './FacilityMaintenanceNeed'
import { createFacilityNameRecord, type FacilityNameRecord } from './FacilityNameHistory'
import { createFacilityOperationalIncident, type FacilityOperationalIncident } from './FacilityOperationalIncident'
import { createFacilityOperatorAssignment, type FacilityOperatorAssignment } from './FacilityOperator'
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
  readonly controlRights: readonly FacilityControlRight[]
  readonly operatorAssignments: readonly FacilityOperatorAssignment[]
  readonly organizationRelationships: readonly FacilityOrganizationRelationship[]
  readonly teamRelationships: readonly FacilityTeamRelationship[]
  readonly usageRights: readonly FacilityUsageRight[]
  readonly competitionApprovals: readonly FacilityCompetitionApproval[]
  readonly statusRecords: readonly FacilityStatusRecord[]
  readonly componentConditionRecords: readonly FacilityComponentConditionRecord[]
  readonly conditionRecords: readonly FacilityConditionRecord[]
  readonly maintenanceNeeds: readonly FacilityMaintenanceNeed[]
  readonly maintenanceActions: readonly FacilityMaintenanceAction[]
  readonly inspections: readonly FacilityInspection[]
  readonly operationalIncidents: readonly FacilityOperationalIncident[]
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
  assertValidComponentHierarchy(context.components)

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

  const controlRightIds = new Set<string>()
  for (const right of context.controlRights) {
    createFacilityControlRight(right)
    if (controlRightIds.has(right.id)) throw new FacilityValidationError(`Duplicate Facility control right ID: ${right.id}`)
    controlRightIds.add(right.id)
    requireFacility(facilityIds, right.facilityId, `Facility control right ${right.id}`)
    if (right.controller.kind === 'PERSON') {
      if (!context.knownPersonIds.has(right.controller.personId)) throw new FacilityValidationError(`Facility control right ${right.id} references missing Person ${right.controller.personId}`)
    } else {
      if (!context.knownOrganizationIds.has(right.controller.organizationId)) throw new FacilityValidationError(`Facility control right ${right.id} references missing Organization ${right.controller.organizationId}`)
    }
  }

  const operatorAssignmentIds = new Set<string>()
  for (const assignment of context.operatorAssignments) {
    createFacilityOperatorAssignment(assignment)
    if (operatorAssignmentIds.has(assignment.id)) throw new FacilityValidationError(`Duplicate Facility operator assignment ID: ${assignment.id}`)
    operatorAssignmentIds.add(assignment.id)
    requireFacility(facilityIds, assignment.facilityId, `Facility operator assignment ${assignment.id}`)
    if (!context.knownOrganizationIds.has(assignment.operatorOrganizationId)) throw new FacilityValidationError(`Facility operator assignment ${assignment.id} references missing Organization ${assignment.operatorOrganizationId}`)
  }
  assertNoDuplicateActiveRelationships(context.operatorAssignments, (assignment) => assignment.facilityId, 'Facility operator assignment')

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
    if (right.componentIds !== null) {
      for (const componentId of right.componentIds) {
        const component = context.components.find((candidate) => candidate.id === componentId)
        if (component === undefined) throw new FacilityValidationError(`Facility usage right ${right.id} references missing Facility component ${componentId}`)
        if (component.facilityId !== right.facilityId) throw new FacilityValidationError(`Facility usage right ${right.id} component ${componentId} belongs to a different Facility`)
      }
    }
  }
  assertNoExactDuplicateUsageRights(context.usageRights)
  assertNoIncompatibleExclusiveUsageRights(context.usageRights)

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

  const componentConditionRecordIds = new Set<string>()
  for (const record of context.componentConditionRecords) {
    createFacilityComponentConditionRecord(record)
    if (componentConditionRecordIds.has(record.id)) throw new FacilityValidationError(`Duplicate Facility component condition record ID: ${record.id}`)
    componentConditionRecordIds.add(record.id)
    if (!componentIds.has(record.componentId)) throw new FacilityValidationError(`Facility component condition record ${record.id} references missing Facility component ${record.componentId}`)
  }
  assertNoDuplicateEffectivePeriods(
    context.componentConditionRecords,
    (record) => record.componentId,
    'Facility component condition record',
  )

  const conditionRecordIds = new Set<string>()
  for (const record of context.conditionRecords) {
    createFacilityConditionRecord(record)
    if (conditionRecordIds.has(record.id)) throw new FacilityValidationError(`Duplicate Facility condition record ID: ${record.id}`)
    conditionRecordIds.add(record.id)
    requireFacility(facilityIds, record.facilityId, `Facility condition record ${record.id}`)
  }
  assertNoDuplicateEffectivePeriods(
    context.conditionRecords,
    (record) => `${record.facilityId}:${record.dimension}`,
    'Facility condition record',
  )

  const maintenanceNeedIds = new Set<string>()
  for (const need of context.maintenanceNeeds) {
    createFacilityMaintenanceNeed(need)
    if (maintenanceNeedIds.has(need.id)) throw new FacilityValidationError(`Duplicate Facility maintenance need ID: ${need.id}`)
    maintenanceNeedIds.add(need.id)
    requireFacility(facilityIds, need.facilityId, `Facility maintenance need ${need.id}`)
    if (need.componentId !== null) {
      const component = requireComponent(context.components, need.componentId, `Facility maintenance need ${need.id}`)
      if (component.facilityId !== need.facilityId) throw new FacilityValidationError(`Facility maintenance need ${need.id} component ${need.componentId} belongs to a different Facility`)
    }
  }

  const maintenanceActionIds = new Set<string>()
  for (const action of context.maintenanceActions) {
    createFacilityMaintenanceAction(action)
    if (maintenanceActionIds.has(action.id)) throw new FacilityValidationError(`Duplicate Facility maintenance action ID: ${action.id}`)
    maintenanceActionIds.add(action.id)
    requireFacility(facilityIds, action.facilityId, `Facility maintenance action ${action.id}`)
    if (action.componentId !== null) {
      const component = requireComponent(context.components, action.componentId, `Facility maintenance action ${action.id}`)
      if (component.facilityId !== action.facilityId) throw new FacilityValidationError(`Facility maintenance action ${action.id} component ${action.componentId} belongs to a different Facility`)
    }
    if (action.needId !== null) {
      const need = context.maintenanceNeeds.find((candidate) => candidate.id === action.needId)
      if (need === undefined) throw new FacilityValidationError(`Facility maintenance action ${action.id} references missing maintenance need ${action.needId}`)
      if (need.facilityId !== action.facilityId) throw new FacilityValidationError(`Facility maintenance action ${action.id} need ${action.needId} belongs to a different Facility`)
    }
  }

  const inspectionIds = new Set<string>()
  for (const inspection of context.inspections) {
    createFacilityInspection(inspection)
    if (inspectionIds.has(inspection.id)) throw new FacilityValidationError(`Duplicate Facility inspection ID: ${inspection.id}`)
    inspectionIds.add(inspection.id)
    requireFacility(facilityIds, inspection.facilityId, `Facility inspection ${inspection.id}`)
    if (inspection.componentId !== null) {
      const component = requireComponent(context.components, inspection.componentId, `Facility inspection ${inspection.id}`)
      if (component.facilityId !== inspection.facilityId) throw new FacilityValidationError(`Facility inspection ${inspection.id} component ${inspection.componentId} belongs to a different Facility`)
    }
    if (inspection.producedNeedId !== null) {
      const need = context.maintenanceNeeds.find((candidate) => candidate.id === inspection.producedNeedId)
      if (need === undefined) throw new FacilityValidationError(`Facility inspection ${inspection.id} references missing maintenance need ${inspection.producedNeedId}`)
      if (need.facilityId !== inspection.facilityId) throw new FacilityValidationError(`Facility inspection ${inspection.id} need ${inspection.producedNeedId} belongs to a different Facility`)
    }
  }

  const incidentIds = new Set<string>()
  for (const incident of context.operationalIncidents) {
    createFacilityOperationalIncident(incident)
    if (incidentIds.has(incident.id)) throw new FacilityValidationError(`Duplicate Facility operational incident ID: ${incident.id}`)
    incidentIds.add(incident.id)
    requireFacility(facilityIds, incident.facilityId, `Facility operational incident ${incident.id}`)
    if (incident.componentId !== null) {
      const component = requireComponent(context.components, incident.componentId, `Facility operational incident ${incident.id}`)
      if (component.facilityId !== incident.facilityId) throw new FacilityValidationError(`Facility operational incident ${incident.id} component ${incident.componentId} belongs to a different Facility`)
    }
    if (incident.producedNeedId !== null) {
      const need = context.maintenanceNeeds.find((candidate) => candidate.id === incident.producedNeedId)
      if (need === undefined) throw new FacilityValidationError(`Facility operational incident ${incident.id} references missing maintenance need ${incident.producedNeedId}`)
      if (need.facilityId !== incident.facilityId) throw new FacilityValidationError(`Facility operational incident ${incident.id} need ${incident.producedNeedId} belongs to a different Facility`)
    }
  }
}

function requireFacility(facilityIds: ReadonlySet<FacilityId>, facilityId: FacilityId, label: string): void {
  if (!facilityIds.has(facilityId)) throw new FacilityValidationError(`${label} references missing Facility ${facilityId}`)
}

function requireComponent(components: readonly FacilityComponent[], componentId: FacilityComponent['id'], label: string): FacilityComponent {
  const component = components.find((candidate) => candidate.id === componentId)
  if (component === undefined) throw new FacilityValidationError(`${label} references missing Facility component ${componentId}`)
  return component
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

/**
 * Same overlap-detection semantics as `assertNoDuplicateActiveRelationships`, adapted for records
 * whose interval fields are named `effectiveFrom`/`effectiveTo` (CFI4's condition records) rather
 * than `validFrom`/`validTo` (CFI1/CFI2's relationship-style records) — kept as a separate small
 * adapter rather than renaming either family's fields or generalizing the shared helper's field
 * names, so no existing CFI1/CFI2 caller changes shape.
 */
function assertNoDuplicateEffectivePeriods<T extends { readonly effectiveFrom: GameDate; readonly effectiveTo: GameDate | null }>(records: readonly T[], key: (record: T) => string, label: string): void {
  const byKey = new Map<string, T[]>()
  for (const record of records) {
    const k = key(record)
    const bucket = byKey.get(k) ?? []
    bucket.push(record)
    byKey.set(k, bucket)
  }
  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue
    assertNoOverlap(bucket.map((item, index) => ({ id: String(index), validFrom: item.effectiveFrom, validTo: item.effectiveTo })), label)
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

/** Two rights are an exact duplicate when every semantically meaningful field matches (same facility, scope, beneficiary, purpose and interval) — a data-entry accident, never a legitimate second record. Differing IDs alone do not exempt a pair from this check. */
function assertNoExactDuplicateUsageRights(rights: readonly FacilityUsageRight[]): void {
  const seen = new Map<string, FacilityUsageRight>()
  for (const right of rights) {
    const scopeKey = right.componentIds === null ? 'WHOLE' : [...right.componentIds].sort().join(',')
    const key = [right.facilityId, scopeKey, right.organizationId ?? '', right.teamId ?? '', right.purpose, right.validFrom, right.validTo ?? ''].join('|')
    const existing = seen.get(key)
    if (existing !== undefined) throw new FacilityValidationError(`Facility usage rights ${existing.id} and ${right.id} are exact duplicates`)
    seen.set(key, right)
  }
}

/**
 * CFI3: validates the optional `FacilityComponent.parentComponentId` hierarchy. A parent must
 * exist, must belong to the same Facility as its child (a component cannot be parented across
 * Facility boundaries), and the graph must be acyclic. The hierarchy is intentionally shallow by
 * convention rather than by hard depth limit — depth itself is not restricted, only cycles and
 * cross-Facility parenting, which are the two combinations that are never physically coherent.
 */
function assertValidComponentHierarchy(components: readonly FacilityComponent[]): void {
  const byId = new Map(components.map((component) => [component.id, component] as const))
  for (const component of components) {
    if (component.parentComponentId === null) continue
    const parent = byId.get(component.parentComponentId)
    if (parent === undefined) throw new FacilityValidationError(`Facility component ${component.id} references missing parent component ${component.parentComponentId}`)
    if (parent.facilityId !== component.facilityId) throw new FacilityValidationError(`Facility component ${component.id} parent ${parent.id} belongs to a different Facility`)
  }
  const visiting = new Set<FacilityComponent['id']>()
  const resolved = new Set<FacilityComponent['id']>()
  const visit = (componentId: FacilityComponent['id']): void => {
    if (resolved.has(componentId)) return
    if (visiting.has(componentId)) throw new FacilityValidationError(`Facility component hierarchy contains a cycle involving ${componentId}`)
    const component = byId.get(componentId)
    if (component === undefined || component.parentComponentId === null) {
      resolved.add(componentId)
      return
    }
    visiting.add(componentId)
    visit(component.parentComponentId)
    visiting.delete(componentId)
    resolved.add(componentId)
  }
  for (const component of components) visit(component.id)
}

/**
 * An EXCLUSIVE right whose scope and interval overlap another right (of any exclusivity) for a
 * *different* beneficiary is an invalid, temporally-impossible state — not merely a queryable
 * runtime conflict. `facilityRightsConflictsAt` answers "what conflicts exist right now"; this
 * validator additionally guarantees such an incoherent pair can never be constructed into
 * GameWorld state at all. Two SHARED/NON_EXCLUSIVE rights over the same scope never trip this,
 * matching CFI2's explicit requirement that ordinary coexistence is not a conflict.
 */
function assertNoIncompatibleExclusiveUsageRights(rights: readonly FacilityUsageRight[]): void {
  for (let i = 0; i < rights.length; i += 1) {
    for (let j = i + 1; j < rights.length; j += 1) {
      const a = rights[i]!
      const b = rights[j]!
      if (a.facilityId !== b.facilityId) continue
      if (a.exclusivity !== 'EXCLUSIVE' && b.exclusivity !== 'EXCLUSIVE') continue
      const sameBeneficiary = (a.teamId !== null && a.teamId === b.teamId) || (a.teamId === null && b.teamId === null && a.organizationId !== null && a.organizationId === b.organizationId)
      if (sameBeneficiary) continue
      const scopesOverlap = a.componentIds === null || b.componentIds === null || a.componentIds.some((id) => b.componentIds!.includes(id))
      if (!scopesOverlap) continue
      if (!facilityRightsOverlapInTime(a, b)) continue
      throw new FacilityValidationError(`Facility usage rights ${a.id} and ${b.id} hold incompatible EXCLUSIVE claims over overlapping scope and time`)
    }
  }
}
