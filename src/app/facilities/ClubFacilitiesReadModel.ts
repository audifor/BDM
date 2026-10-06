import type { GameDate } from '@/domain/date'
import {
  FACILITY_DEVELOPMENT_PROJECT_ALLOWED_TRANSITIONS,
  componentConditionAt,
  componentOperationalReadinessAt,
  componentsOfFacility,
  currentProjectPhaseAt,
  developmentProjectsForOrganization,
  facilityConditionSummaryAt,
  facilityNameAt,
  facilityOperationalReadinessAt,
  facilityStatusAt,
  isDevelopmentProjectDelayedAt,
  isFacilityDevelopmentProjectTerminalStatus,
  maintenanceActionsForFacility,
  maintenanceNeedsForFacilityAt,
  openMaintenanceNeedsAt,
  projectPhases,
  type Facility,
  type FacilityComponent,
  type FacilityDevelopmentProject,
  type FacilityDevelopmentProjectPhaseStatus,
  type FacilityDevelopmentProjectScope,
  type FacilityMaintenanceActionOutcome,
  type FacilityMaintenanceActionType,
  type FacilityMaintenanceNeedSeverity,
  type FacilityMaintenanceNeedStatus,
  type FacilityMaintenanceNeedType,
  type FacilityServiceability,
  type FacilityTechnicalStandard,
} from '@/domain/facilities'
import type { FacilityComponentId, FacilityDevelopmentProjectId, FacilityId, OrganizationId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { projectsEligibleToStartAt } from '@/engine/facilities'
import {
  committedFacilityExpenditureAt,
  isFacilityProjectUnderfundedAt,
  outstandingFacilityCommitmentsAt,
  paidFacilityExpenditureAt,
  recognizedFacilityExpenditureAt,
} from '@/integration/facilitiesFinance'
import { sportingFacilityContextForTeamAt, type TeamSportingFacilityContext } from '@/integration/facilitiesSporting'

/**
 * MX0.6 — the club-scoped application read boundary over canonical Facilities state (the boundary
 * CFI6's certification deliberately deferred).
 *
 * This layer only *reads* the canonical `GameWorld` facilities collections through the domain
 * queries and the CFI7/CFI8 integration queries. It stores nothing, derives nothing that is not a
 * pure function of world truth, and invents no sporting, financial or lifecycle fact: what the
 * product shows here is recomputed on demand, so a save/load round-trip cannot desynchronize it.
 */

/** How the club's Organization is involved with a Facility. Derived only from canonical relationship records. */
export type ClubFacilityAccessKind = 'OWNED' | 'OPERATED' | 'USED'

/** The canonical project commands that exist today. Availability is read off the canonical transition graph. */
export type ClubProjectActionId = 'START' | 'PAUSE' | 'RESUME' | 'COMPLETE' | 'CANCEL'

export interface ClubFacilityAuthority {
  readonly teamId: TeamId
  readonly organizationId: OrganizationId
  readonly facilityIds: readonly FacilityId[]
  readonly projectIds: readonly FacilityDevelopmentProjectId[]
}

export interface ClubFacilityComponentRow {
  readonly componentId: FacilityComponentId
  readonly facilityId: FacilityId
  readonly name: string
  readonly type: FacilityComponent['type']
  readonly status: FacilityComponent['status']
  readonly parentComponentId: FacilityComponentId | null
  readonly quantity: number | null
  readonly capacity: number | null
  readonly physicalCondition: number | null
  readonly serviceability: FacilityServiceability
  readonly technicalStandard: FacilityTechnicalStandard | null
  readonly openNeedIds: readonly string[]
  readonly criticalNeedIds: readonly string[]
}

export interface ClubFacilityRow {
  readonly facilityId: FacilityId
  readonly name: string
  readonly canonicalName: string
  readonly type: Facility['type']
  readonly purposes: Facility['purposes']
  readonly capabilities: Facility['capabilities']
  readonly status: Facility['status']
  readonly openedOn: GameDate | null
  readonly closedOn: GameDate | null
  readonly totalCapacity: number | null
  readonly courtCount: number | null
  readonly hasAccessibilityProvision: boolean | null
  readonly placeId: Facility['placeId']
  readonly placeName: string | null
  readonly accessKinds: readonly ClubFacilityAccessKind[]
  readonly componentIds: readonly FacilityComponentId[]
  readonly activeComponentCount: number
  readonly knownConditionComponentCount: number
  readonly averageKnownCondition: number | null
  readonly worstKnownCondition: number | null
  readonly outOfServiceComponentIds: readonly FacilityComponentId[]
  readonly limitedServiceComponentIds: readonly FacilityComponentId[]
  readonly openNeedIds: readonly string[]
  readonly criticalNeedIds: readonly string[]
  readonly maintenanceActionIds: readonly string[]
  readonly inspectionCount: number
  readonly activeProjectIds: readonly FacilityDevelopmentProjectId[]
}

export interface ClubMaintenanceNeedRow {
  readonly needId: string
  readonly facilityId: FacilityId
  readonly facilityName: string
  readonly componentId: FacilityComponentId | null
  readonly componentName: string | null
  readonly type: FacilityMaintenanceNeedType
  readonly severity: FacilityMaintenanceNeedSeverity
  readonly status: FacilityMaintenanceNeedStatus
  readonly detectedAt: GameDate
  readonly resolvedAt: GameDate | null
  readonly source: string
  readonly open: boolean
}

export interface ClubMaintenanceActionRow {
  readonly actionId: string
  readonly needId: string | null
  readonly facilityId: FacilityId
  readonly facilityName: string
  readonly componentId: FacilityComponentId | null
  readonly componentName: string | null
  readonly type: FacilityMaintenanceActionType
  readonly startedAt: GameDate
  readonly completedAt: GameDate | null
  readonly outcome: FacilityMaintenanceActionOutcome | null
  readonly resultingCondition: number | null
  readonly resultingServiceability: FacilityServiceability | null
}

export interface ClubProjectPhaseRow {
  readonly phaseId: string
  readonly sequence: number
  readonly name: string | null
  readonly status: FacilityDevelopmentProjectPhaseStatus
  readonly plannedStart: GameDate
  readonly plannedCompletion: GameDate
  readonly actualStart: GameDate | null
  readonly actualCompletion: GameDate | null
}

export interface ClubProjectMoneyRow {
  readonly currencyCode: string
  readonly committedMinorUnits: number
  readonly recognizedMinorUnits: number
  readonly paidMinorUnits: number
  readonly outstandingCommitmentMinorUnits: number
}

export interface ClubProjectRow {
  readonly projectId: FacilityDevelopmentProjectId
  readonly organizationId: OrganizationId
  readonly facilityId: FacilityId | null
  readonly facilityName: string | null
  readonly projectType: FacilityDevelopmentProject['projectType']
  readonly status: FacilityDevelopmentProject['status']
  readonly scopeKind: FacilityDevelopmentProjectScope['kind']
  readonly scopeSummary: string
  readonly reason: string | null
  readonly plannedStartDate: GameDate
  readonly actualStartDate: GameDate | null
  readonly plannedCompletionDate: GameDate
  readonly actualCompletionDate: GameDate | null
  readonly delayed: boolean
  readonly eligibleToStart: boolean
  readonly currentPhase: ClubProjectPhaseRow | null
  readonly phases: readonly ClubProjectPhaseRow[]
  readonly actions: readonly ClubProjectActionId[]
  readonly money: readonly ClubProjectMoneyRow[]
  readonly underfundedAsOfDate: boolean | null
}

export interface ClubFacilityCostRow extends ClubProjectMoneyRow {
  readonly projectId: FacilityDevelopmentProjectId
}

export interface ClubFacilitiesWorkspaceModel {
  readonly teamId: TeamId
  readonly teamName: string
  readonly organizationId: OrganizationId
  readonly organizationName: string | null
  readonly asOf: GameDate
  /** Canonical reporting currency when the club Organization has a financial profile; `null` means not configured, never a guessed default. */
  readonly reportingCurrencyCode: string | null
  readonly facilities: readonly ClubFacilityRow[]
  readonly components: readonly ClubFacilityComponentRow[]
  readonly needs: readonly ClubMaintenanceNeedRow[]
  readonly openNeeds: readonly ClubMaintenanceNeedRow[]
  readonly criticalOpenNeeds: readonly ClubMaintenanceNeedRow[]
  readonly maintenanceActions: readonly ClubMaintenanceActionRow[]
  readonly projects: readonly ClubProjectRow[]
  readonly eligibleProjectIds: readonly FacilityDevelopmentProjectId[]
  readonly activeProjectIds: readonly FacilityDevelopmentProjectId[]
  readonly costs: readonly ClubFacilityCostRow[]
  readonly sporting: TeamSportingFacilityContext
}

function accessKindsFor(world: GameWorld, facilityId: FacilityId, organizationId: OrganizationId, asOf: GameDate): readonly ClubFacilityAccessKind[] {
  const kinds = new Set<ClubFacilityAccessKind>()
  const activeOn = (validFrom: GameDate | null, validTo: GameDate | null) => (validFrom === null || validFrom <= asOf) && (validTo === null || validTo >= asOf)

  for (const interest of Object.values(world.facilityOwnershipInterestsById)) {
    if (interest.facilityId !== facilityId) continue
    if (interest.owner.kind !== 'ORGANIZATION' || interest.owner.organizationId !== organizationId) continue
    if (activeOn(interest.validFrom, interest.validTo)) kinds.add('OWNED')
  }
  for (const assignment of Object.values(world.facilityOperatorAssignmentsById)) {
    if (assignment.facilityId !== facilityId || assignment.operatorOrganizationId !== organizationId) continue
    if (activeOn(assignment.validFrom, assignment.validTo)) kinds.add('OPERATED')
  }
  for (const relationship of Object.values(world.facilityOrganizationRelationshipsById)) {
    if (relationship.facilityId !== facilityId || relationship.organizationId !== organizationId) continue
    if (activeOn(relationship.validFrom, relationship.validTo)) kinds.add('USED')
  }
  for (const right of Object.values(world.facilityUsageRightsById)) {
    if (right.facilityId !== facilityId || right.organizationId !== organizationId) continue
    if (activeOn(right.validFrom, right.validTo)) kinds.add('USED')
  }
  return Object.freeze([...kinds].sort())
}

function componentLabel(world: GameWorld, componentId: FacilityComponentId | null): string | null {
  if (componentId === null) return null
  const component: FacilityComponent | undefined = world.facilityComponentsById[componentId]
  return component === undefined ? null : (component.name ?? component.type)
}

function facilityLabel(world: GameWorld, facilityId: FacilityId, asOf: GameDate): string {
  const facility = world.facilitiesById[facilityId]
  if (facility === undefined) return String(facilityId)
  return facilityNameAt(Object.values(world.facilityNameRecordsById), facilityId, asOf, facility.canonicalName)
}

function scopeSummary(scope: FacilityDevelopmentProjectScope): string {
  switch (scope.kind) {
    case 'CREATE_FACILITY':
      return `New ${scope.facilityType} · ${scope.canonicalName} · ${scope.initialComponents.length} planned component(s)`
    case 'ADD_COMPONENT':
      return `Add ${scope.components.length} component(s)`
    case 'EXPAND_FACILITY':
      return `Expand with ${scope.components.length} component(s)`
    case 'REPLACE_COMPONENT':
      return `Replace component ${scope.retiredComponentId} · resulting condition ${scope.resultingCondition}`
    case 'RENOVATE_COMPONENT':
      return `Renovate component ${scope.componentId} · resulting condition ${scope.resultingCondition}`
    case 'REMOVE_COMPONENT':
      return `Remove component ${scope.componentId}`
    case 'RECONFIGURE_FACILITY':
      return `Reconfigure · ${scope.additions.length} added · ${scope.renovations.length} renovated · ${scope.replacements.length} replaced · ${scope.removals.length} removed`
    case 'DEMOLISH_FACILITY':
      return `Demolish facility ${scope.facilityId}`
  }
}

/**
 * The commands a manager may issue right now, read straight off the canonical transition graph —
 * the app layer never adds a product rule of its own.
 */
export function projectActionsFor(project: FacilityDevelopmentProject): readonly ClubProjectActionId[] {
  const allowed = FACILITY_DEVELOPMENT_PROJECT_ALLOWED_TRANSITIONS[project.status]
  const actions: ClubProjectActionId[] = []
  if ((project.status === 'PLANNED' || project.status === 'APPROVED' || project.status === 'SCHEDULED') && allowed.includes('IN_PROGRESS')) actions.push('START')
  if (allowed.includes('PAUSED')) actions.push('PAUSE')
  if (project.status === 'PAUSED' && allowed.includes('IN_PROGRESS')) actions.push('RESUME')
  if (allowed.includes('COMPLETED')) actions.push('COMPLETE')
  if (allowed.includes('CANCELLED')) actions.push('CANCEL')
  return Object.freeze(actions)
}

function moneyRows(world: GameWorld, projectId: FacilityDevelopmentProjectId, asOf: GameDate): readonly ClubProjectMoneyRow[] {
  const committed = committedFacilityExpenditureAt(world, projectId, asOf)
  const recognized = recognizedFacilityExpenditureAt(world, projectId, asOf)
  const paid = paidFacilityExpenditureAt(world, projectId, asOf)
  const outstanding = outstandingFacilityCommitmentsAt(world, projectId, asOf)
  const sum = (entries: readonly { readonly currencyCode: string; readonly minorUnits: number }[], currencyCode: string) =>
    entries.filter((entry) => entry.currencyCode === currencyCode).reduce((total, entry) => total + entry.minorUnits, 0)
  const currencies = [...new Set([...committed, ...recognized, ...paid, ...outstanding].map((entry) => entry.currencyCode))].sort()
  return Object.freeze(
    currencies.map((currencyCode) =>
      Object.freeze({
        currencyCode,
        committedMinorUnits: sum(committed, currencyCode),
        recognizedMinorUnits: sum(recognized, currencyCode),
        paidMinorUnits: sum(paid, currencyCode),
        outstandingCommitmentMinorUnits: sum(outstanding, currencyCode),
      }),
    ),
  )
}

/** The club's Facilities authority: its Organization, every Facility it is canonically involved with, and its own projects. */
export function resolveClubFacilityAuthority(world: GameWorld, teamId: TeamId): ClubFacilityAuthority {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Unknown team: ${teamId}`)
  const organizationId = team.organizationId
  const facilityIds = new Set<FacilityId>()
  for (const facility of Object.values(world.facilitiesById)) {
    if (accessKindsFor(world, facility.id, organizationId, world.currentDate).length > 0) facilityIds.add(facility.id)
  }
  const projects = developmentProjectsForOrganization(Object.values(world.facilityDevelopmentProjectsById), organizationId)
  for (const project of projects) if (project.facilityId !== null) facilityIds.add(project.facilityId)
  return Object.freeze({
    teamId,
    organizationId,
    facilityIds: Object.freeze([...facilityIds].sort()),
    projectIds: Object.freeze(projects.map((project) => project.id).sort()),
  })
}

export function buildClubFacilitiesWorkspaceModel(world: GameWorld, teamId: TeamId): ClubFacilitiesWorkspaceModel {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Unknown team: ${teamId}`)
  const asOf = world.currentDate
  const authority = resolveClubFacilityAuthority(world, teamId)
  const allComponents = Object.values(world.facilityComponentsById)
  const conditionRecords = Object.values(world.facilityComponentConditionRecordsById)
  const allNeeds = Object.values(world.facilityMaintenanceNeedsById)
  const allActions = Object.values(world.facilityMaintenanceActionsById)
  const allInspections = Object.values(world.facilityInspectionsById)
  const allProjects = Object.values(world.facilityDevelopmentProjectsById)
  const allPhases = Object.values(world.facilityDevelopmentProjectPhasesById)
  const eligibleProjectIds = new Set(projectsEligibleToStartAt(allProjects, asOf))

  const facilities: ClubFacilityRow[] = []
  const components: ClubFacilityComponentRow[] = []
  const needs: ClubMaintenanceNeedRow[] = []
  const maintenanceActions: ClubMaintenanceActionRow[] = []

  for (const facilityId of authority.facilityIds) {
    const facility = world.facilitiesById[facilityId]
    if (facility === undefined) continue
    const facilityName = facilityLabel(world, facilityId, asOf)
    const facilityComponents = componentsOfFacility(allComponents, facilityId, asOf)
    const condition = facilityConditionSummaryAt(allComponents, conditionRecords, facilityId, asOf)
    const readiness = facilityOperationalReadinessAt(allComponents, conditionRecords, allNeeds, facilityId, asOf)
    const facilityNeeds = maintenanceNeedsForFacilityAt(allNeeds, facilityId, asOf)
    // Resolved needs drop out of the canonical "as of date" view, so the product history is read from
    // the immutable need records themselves while "open" stays the canonical query.
    const recordedNeeds = allNeeds.filter((need) => need.facilityId === facilityId && need.detectedAt <= asOf).sort((a, b) => String(a.id).localeCompare(String(b.id)))
    const openFacilityNeeds = new Set(openMaintenanceNeedsAt(facilityNeeds, asOf).map((need) => String(need.id)))
    const facilityActions = maintenanceActionsForFacility(allActions, facilityId)

    for (const component of facilityComponents) {
      const record = componentConditionAt(conditionRecords, component.id, asOf)
      const componentReadiness = componentOperationalReadinessAt(conditionRecords, allNeeds, component.id, asOf)
      components.push(
        Object.freeze({
          componentId: component.id,
          facilityId,
          name: component.name ?? component.type,
          type: component.type,
          status: component.status,
          parentComponentId: component.parentComponentId,
          quantity: component.quantity,
          capacity: component.capacity,
          physicalCondition: record?.physicalCondition ?? null,
          serviceability: componentReadiness.serviceability,
          technicalStandard: record?.technicalStandard ?? null,
          openNeedIds: Object.freeze(componentReadiness.openMaintenanceNeeds.map((need) => String(need.id))),
          criticalNeedIds: Object.freeze(componentReadiness.criticalMaintenanceNeeds.map((need) => String(need.id))),
        }),
      )
    }

    for (const need of recordedNeeds) {
      needs.push(
        Object.freeze({
          needId: String(need.id),
          facilityId,
          facilityName,
          componentId: need.componentId,
          componentName: componentLabel(world, need.componentId),
          type: need.type,
          severity: need.severity,
          status: need.status,
          detectedAt: need.detectedAt,
          resolvedAt: need.resolvedAt,
          source: need.source,
          open: openFacilityNeeds.has(String(need.id)),
        }),
      )
    }

    for (const action of facilityActions) {
      maintenanceActions.push(
        Object.freeze({
          actionId: String(action.id),
          needId: action.needId === null ? null : String(action.needId),
          facilityId,
          facilityName,
          componentId: action.componentId,
          componentName: componentLabel(world, action.componentId),
          type: action.type,
          startedAt: action.startedAt,
          completedAt: action.completedAt,
          outcome: action.outcome,
          resultingCondition: action.resultingCondition,
          resultingServiceability: action.resultingServiceability,
        }),
      )
    }

    facilities.push(
      Object.freeze({
        facilityId,
        name: facilityName,
        canonicalName: facility.canonicalName,
        type: facility.type,
        purposes: facility.purposes,
        capabilities: facility.capabilities,
        status: facilityStatusAt(Object.values(world.facilityStatusRecordsById), facility, asOf),
        openedOn: facility.physical.openedOn,
        closedOn: facility.closedOn,
        totalCapacity: facility.physical.totalCapacity,
        courtCount: facility.physical.courtCount,
        hasAccessibilityProvision: facility.physical.hasAccessibilityProvision,
        placeId: facility.placeId,
        placeName: world.placesById[facility.placeId]?.name ?? null,
        accessKinds: accessKindsFor(world, facilityId, authority.organizationId, asOf),
        componentIds: Object.freeze(facilityComponents.map((component) => component.id)),
        activeComponentCount: condition.componentCount,
        knownConditionComponentCount: condition.knownConditionComponentCount,
        averageKnownCondition: condition.averageKnownCondition,
        worstKnownCondition: condition.worstKnownCondition,
        outOfServiceComponentIds: condition.outOfServiceComponentIds,
        limitedServiceComponentIds: condition.limitedServiceComponentIds,
        openNeedIds: Object.freeze(readiness.openMaintenanceNeeds.map((need) => String(need.id))),
        criticalNeedIds: Object.freeze(readiness.criticalMaintenanceNeeds.map((need) => String(need.id))),
        maintenanceActionIds: Object.freeze(facilityActions.map((action) => String(action.id))),
        inspectionCount: allInspections.filter((inspection) => inspection.facilityId === facilityId).length,
        activeProjectIds: Object.freeze(
          allProjects
            .filter((project) => project.facilityId === facilityId && !isFacilityDevelopmentProjectTerminalStatus(project.status))
            .map((project) => project.id)
            .sort(),
        ),
      }),
    )
  }

  const projectRows: ClubProjectRow[] = authority.projectIds.map((projectId) => {
    const project = allProjects.find((candidate) => candidate.id === projectId)
    if (project === undefined) throw new RangeError(`Unknown facility development project: ${projectId}`)
    const phases = projectPhases(allPhases, project.id)
    const current = currentProjectPhaseAt(allPhases, project.id)
    const toPhaseRow = (phase: (typeof phases)[number]): ClubProjectPhaseRow =>
      Object.freeze({
        phaseId: String(phase.id),
        sequence: phase.sequence,
        name: phase.name,
        status: phase.status,
        plannedStart: phase.plannedStart,
        plannedCompletion: phase.plannedCompletion,
        actualStart: phase.actualStart,
        actualCompletion: phase.actualCompletion,
      })
    return Object.freeze({
      projectId: project.id,
      organizationId: project.organizationId,
      facilityId: project.facilityId,
      facilityName: project.facilityId === null ? null : facilityLabel(world, project.facilityId, asOf),
      projectType: project.projectType,
      status: project.status,
      scopeKind: project.scope.kind,
      scopeSummary: scopeSummary(project.scope),
      reason: project.reason,
      plannedStartDate: project.plannedStartDate,
      actualStartDate: project.actualStartDate,
      plannedCompletionDate: project.plannedCompletionDate,
      actualCompletionDate: project.actualCompletionDate,
      delayed: isDevelopmentProjectDelayedAt(project, asOf),
      eligibleToStart: eligibleProjectIds.has(project.id),
      currentPhase: current === undefined ? null : toPhaseRow(current),
      phases: Object.freeze(phases.map(toPhaseRow)),
      actions: projectActionsFor(project),
      money: moneyRows(world, project.id, asOf),
      underfundedAsOfDate: isFacilityProjectUnderfundedAt(world, project.id, asOf),
    })
  })

  const costs: ClubFacilityCostRow[] = projectRows.flatMap((project) =>
    project.money.map((money) => Object.freeze({ ...money, projectId: project.projectId })),
  )
  const openNeeds = needs.filter((need) => need.open)

  return Object.freeze({
    teamId,
    teamName: team.name,
    organizationId: authority.organizationId,
    organizationName: world.organizationsById[authority.organizationId]?.legalName ?? null,
    asOf,
    reportingCurrencyCode: world.organizationFinancialProfilesById[authority.organizationId]?.baseCurrencyCode ?? null,
    facilities: Object.freeze(facilities),
    components: Object.freeze(components),
    needs: Object.freeze(needs),
    openNeeds: Object.freeze(openNeeds),
    criticalOpenNeeds: Object.freeze(openNeeds.filter((need) => need.severity === 'CRITICAL')),
    maintenanceActions: Object.freeze(maintenanceActions),
    projects: Object.freeze(projectRows),
    eligibleProjectIds: Object.freeze(projectRows.filter((project) => project.eligibleToStart).map((project) => project.projectId)),
    activeProjectIds: Object.freeze(
      projectRows.filter((project) => !isFacilityDevelopmentProjectTerminalStatus(project.status)).map((project) => project.projectId),
    ),
    costs: Object.freeze(costs),
    sporting: sportingFacilityContextForTeamAt(world, teamId, asOf),
  })
}
