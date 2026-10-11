import { compareGameDates, type GameDate } from '@/domain/date'
import { componentConditionAt, resolveFacilityStatusAt, usableComponentsForTeamAt, type FacilityComponent, type FacilityComponentConditionRecord, type FacilityDevelopmentProject, type FacilityMaintenanceAction, type FacilityStatusRecord, type FacilityUsageRight } from '@/domain/facilities'
import type { GameWorld } from '@/domain/world'
import type { FacilityComponentId, TeamId } from '@/domain/ids'

/** Existing scopes identify work on existing assets; additions do not close unrelated assets. */
export function projectAffectedComponentIds(project: FacilityDevelopmentProject): readonly string[] {
  const scope = project.scope
  switch (scope.kind) {
    case 'RENOVATE_COMPONENT': case 'REMOVE_COMPONENT': return [scope.componentId]
    case 'REPLACE_COMPONENT': return [scope.retiredComponentId]
    case 'RECONFIGURE_FACILITY': return [...scope.renovations.map((r) => r.componentId), ...scope.replacements.map((r) => r.retiredComponentId), ...scope.removals]
    default: return []
  }
}

export function activePhysicalProjectsAt(world: GameWorld, onDate: GameDate) {
  return Object.values(world.facilityDevelopmentProjectsById).filter((p) => p.actualStartDate !== null && p.actualStartDate <= onDate && (p.actualCompletionDate === null || p.actualCompletionDate > onDate) && (p.cancelledAt === null || p.cancelledAt > onDate)).sort((a, b) => a.id.localeCompare(b.id))
}

export function componentWorkProjectsAt(world: GameWorld, componentId: string, onDate: GameDate) {
  const component = Object.values(world.facilityComponentsById).find((c) => c.id === componentId)
  return activePhysicalProjectsAt(world, onDate).filter((p) => p.facilityId === component?.facilityId && (p.scope.kind === 'DEMOLISH_FACILITY' || p.scope.kind === 'CREATE_FACILITY' || projectAffectedComponentIds(p).includes(componentId)))
}

export function projectPhysicalBlocker(world: GameWorld, project: FacilityDevelopmentProject, command: 'START' | 'COMPLETE', onDate: GameDate): 'PHYSICAL_WORK_CONFLICT' | 'PHYSICAL_PHASES_INCOMPLETE' | 'PHYSICAL_ASSET_UNAVAILABLE' | 'PHYSICAL_COMPLETION_BEFORE_START' | null {
  if (command === 'COMPLETE' && project.actualStartDate !== null && onDate < project.actualStartDate) return 'PHYSICAL_COMPLETION_BEFORE_START'
  const target = project.facilityId === null ? undefined : world.facilitiesById[project.facilityId]
  const affected = projectAffectedComponentIds(project)
  const targetEnded = target !== undefined && ['DECOMMISSIONED', 'DEMOLISHED'].includes(resolveFacilityStatusAt(Object.values(world.facilityStatusRecordsById), target.id, onDate, target.status))
  const componentEnded = affected.some((id) => {
    const component = Object.values(world.facilityComponentsById).find((c) => c.id === id)
    return component !== undefined && (component.status === 'PLANNED' || component.closedAt !== null && component.closedAt <= onDate)
  })
  if (targetEnded || componentEnded) return 'PHYSICAL_ASSET_UNAVAILABLE'
  if (new Set(affected).size !== affected.length) return 'PHYSICAL_WORK_CONFLICT'
  if (command === 'COMPLETE') {
    const phases = Object.values(world.facilityDevelopmentProjectPhasesById).filter((p) => p.projectId === project.id)
    return phases.some((p) => p.status !== 'COMPLETED' || p.actualCompletion === null || p.actualCompletion > onDate) ? 'PHYSICAL_PHASES_INCOMPLETE' : null
  }
  const conflict = activePhysicalProjectsAt(world, onDate).some((p) => p.id !== project.id && p.facilityId !== null && p.facilityId === project.facilityId && (p.scope.kind === 'DEMOLISH_FACILITY' || project.scope.kind === 'DEMOLISH_FACILITY' || projectAffectedComponentIds(p).some((id) => affected.includes(id))))
  return conflict ? 'PHYSICAL_WORK_CONFLICT' : null
}

/** Physical proof is distinct from a CFI4 default and from an access entitlement. Never persisted. */
/**
 * Per-world lookup tables for `componentPhysicalAvailabilityAt`. A GameWorld is immutable, so the index built for one world value
 * is valid for exactly that value; a changed world gets a fresh index. Every table holds the same records, in the same order, as
 * the full scans it replaces, so results are identical (see FacilityPhysicalOperationsIndex.test.ts).
 */
interface PhysicalLookup {
  readonly conditionsByComponent: Map<string, FacilityComponentConditionRecord[]>
  readonly maintenanceByComponent: Map<string, FacilityMaintenanceAction[]>
  readonly statusRecords: readonly FacilityStatusRecord[]
  readonly rights: readonly FacilityUsageRight[]
  readonly components: readonly FacilityComponent[]
  readonly usableByTeamDate: Map<string, ReadonlySet<string>>
  readonly activeProjectsByDate: Map<string, readonly FacilityDevelopmentProject[]>
}
const physicalLookups = new WeakMap<GameWorld, PhysicalLookup>()

function physicalLookup(world: GameWorld): PhysicalLookup {
  const cached = physicalLookups.get(world)
  if (cached !== undefined) return cached
  const conditionsByComponent = new Map<string, FacilityComponentConditionRecord[]>()
  for (const record of Object.values(world.facilityComponentConditionRecordsById)) {
    const list = conditionsByComponent.get(record.componentId)
    if (list === undefined) conditionsByComponent.set(record.componentId, [record]); else list.push(record)
  }
  const maintenanceByComponent = new Map<string, FacilityMaintenanceAction[]>()
  for (const action of Object.values(world.facilityMaintenanceActionsById)) {
    if (action.componentId === null) continue
    const list = maintenanceByComponent.get(action.componentId)
    if (list === undefined) maintenanceByComponent.set(action.componentId, [action]); else list.push(action)
  }
  const lookup: PhysicalLookup = {
    conditionsByComponent, maintenanceByComponent, statusRecords: Object.values(world.facilityStatusRecordsById), rights: Object.values(world.facilityUsageRightsById),
    components: Object.values(world.facilityComponentsById), usableByTeamDate: new Map(), activeProjectsByDate: new Map(),
  }
  physicalLookups.set(world, lookup)
  return lookup
}

export function componentPhysicalAvailabilityAt(world: GameWorld, componentId: FacilityComponentId, onDate: GameDate, teamId?: TeamId) {
  const lookup = physicalLookup(world)
  const component = world.facilityComponentsById[componentId]!
  const facility = world.facilitiesById[component.facilityId]!
  const condition = componentConditionAt(lookup.conditionsByComponent.get(componentId) ?? [], componentId, onDate)
  let activeProjects = lookup.activeProjectsByDate.get(onDate)
  if (activeProjects === undefined) { activeProjects = activePhysicalProjectsAt(world, onDate); lookup.activeProjectsByDate.set(onDate, activeProjects) }
  const work = activeProjects.filter((p) => p.facilityId === component.facilityId && (p.scope.kind === 'DEMOLISH_FACILITY' || p.scope.kind === 'CREATE_FACILITY' || projectAffectedComponentIds(p).includes(componentId)))
  // BS17 maintenance/repair works in progress occupy the component exactly like development works: a started, not yet
  // completed action makes it unavailable, and completing or stopping it releases it.
  const maintenance = (lookup.maintenanceByComponent.get(componentId) ?? []).filter((action) => compareGameDates(action.startedAt, onDate) <= 0 && (action.completedAt === null || compareGameDates(action.completedAt, onDate) > 0))
  const facilityStatus = resolveFacilityStatusAt(lookup.statusRecords, facility.id, onDate, facility.status)
  let access: boolean | null = null
  if (teamId !== undefined) {
    const key = `${teamId}|${onDate}`
    let usable = lookup.usableByTeamDate.get(key)
    if (usable === undefined) { usable = new Set(usableComponentsForTeamAt(lookup.rights, lookup.components, teamId, onDate)); lookup.usableByTeamDate.set(key, usable) }
    access = usable.has(componentId)
  }
  const closed = component.status === 'PLANNED' || component.openedAt !== null && component.openedAt > onDate || component.closedAt !== null && component.closedAt <= onDate || ['TEMPORARILY_CLOSED', 'DECOMMISSIONED', 'DEMOLISHED', 'UNDER_CONSTRUCTION', 'PLANNED'].includes(facilityStatus)
  const status = closed || work.length > 0 || maintenance.length > 0 || condition?.serviceability === 'OUT_OF_SERVICE' ? 'OUT_OF_SERVICE' : condition !== undefined && condition.serviceability !== 'FULL' ? 'LIMITED' : condition === undefined || condition.physicalCondition === null || facilityStatus === 'UNKNOWN' ? 'UNKNOWN' : 'AVAILABLE'
  const specification = component.specification
  const nominalCapacity = specification?.kind === 'CAPACITY' ? specification.amount : component.capacity
  const capacityUnit = specification?.kind === 'CAPACITY' ? specification.unit : null
  return {
    status, access, affectedProjectIds: work.map((p) => p.id), affectedMaintenanceActionIds: maintenance.map((action) => String(action.id)), nominalCapacity, capacityUnit,
    // No measured operating capacity or occupancy authority exists in the source model.
    operationalCapacity: null,
  } as const
}
