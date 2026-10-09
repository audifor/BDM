import type { GameDate } from '@/domain/date'
import { componentConditionAt, resolveFacilityStatusAt, usableComponentsForTeamAt, type FacilityDevelopmentProject } from '@/domain/facilities'
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
export function componentPhysicalAvailabilityAt(world: GameWorld, componentId: FacilityComponentId, onDate: GameDate, teamId?: TeamId) {
  const component = world.facilityComponentsById[componentId]!
  const facility = world.facilitiesById[component.facilityId]!
  const condition = componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), componentId, onDate)
  const work = componentWorkProjectsAt(world, componentId, onDate)
  const facilityStatus = resolveFacilityStatusAt(Object.values(world.facilityStatusRecordsById), facility.id, onDate, facility.status)
  const access = teamId === undefined ? null : usableComponentsForTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), teamId, onDate).includes(componentId)
  const closed = component.status === 'PLANNED' || component.openedAt !== null && component.openedAt > onDate || component.closedAt !== null && component.closedAt <= onDate || ['TEMPORARILY_CLOSED', 'DECOMMISSIONED', 'DEMOLISHED', 'UNDER_CONSTRUCTION', 'PLANNED'].includes(facilityStatus)
  const status = closed || work.length > 0 || condition?.serviceability === 'OUT_OF_SERVICE' ? 'OUT_OF_SERVICE' : condition !== undefined && condition.serviceability !== 'FULL' ? 'LIMITED' : condition === undefined || condition.physicalCondition === null || facilityStatus === 'UNKNOWN' ? 'UNKNOWN' : 'AVAILABLE'
  const specification = component.specification
  const nominalCapacity = specification?.kind === 'CAPACITY' ? specification.amount : component.capacity
  const capacityUnit = specification?.kind === 'CAPACITY' ? specification.unit : null
  return {
    status, access, affectedProjectIds: work.map((p) => p.id), nominalCapacity, capacityUnit,
    // No measured operating capacity or occupancy authority exists in the source model.
    operationalCapacity: null,
  } as const
}
