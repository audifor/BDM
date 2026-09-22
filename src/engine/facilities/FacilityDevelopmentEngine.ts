import { compareGameDates, type GameDate } from '@/domain/date'
import {
  componentBlueprintToCreateInput,
  componentConditionAt,
  createFacility,
  createFacilityComponent,
  createFacilityComponentConditionRecord,
  createFacilityDevelopmentProject,
  createFacilityMaintenanceNeed,
  createFacilityStatusRecord,
  isFacilityMaintenanceNeedOpenStatus,
  isTerminalFacilityStatus,
  isValidFacilityDevelopmentProjectTransition,
  maintenanceNeedsForComponentAt,
  type ComponentBlueprint,
  type FacilityComponent,
  type FacilityComponentConditionRecord,
  type FacilityDevelopmentProject,
  type FacilityDevelopmentProjectStatus,
  type FacilityMaintenanceNeed,
  type FacilityServiceability,
  type FacilityStatus,
} from '@/domain/facilities'
import {
  facilityComponentConditionRecordIdFromString,
  facilityComponentIdFromString,
  facilityIdFromString,
  facilityStatusRecordIdFromString,
  type FacilityComponentId,
  type FacilityDevelopmentProjectId,
  type FacilityId,
} from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/**
 * The explicit set of world-truth facts one project command can change, returned as plain data —
 * the "future RPG/Finance seam" the brief asks for. No event bus, dispatcher, or downstream
 * connection is built here; a caller (a future CFI7/RPG layer) inspects this shape itself.
 */
export interface FacilityDevelopmentOutcome {
  readonly projectId: FacilityDevelopmentProjectId
  readonly previousStatus: FacilityDevelopmentProjectStatus
  readonly newStatus: FacilityDevelopmentProjectStatus
  readonly createdFacilityIds: readonly FacilityId[]
  readonly createdComponentIds: readonly FacilityComponentId[]
  readonly retiredComponentIds: readonly FacilityComponentId[]
  readonly updatedComponentIds: readonly FacilityComponentId[]
  readonly conditionRecordIds: readonly string[]
  readonly requiresTemporaryRelocation: boolean
}

export interface FacilityDevelopmentCommandResult {
  readonly world: GameWorld
  readonly outcome: FacilityDevelopmentOutcome
}

function emptyOutcome(project: FacilityDevelopmentProject, newStatus: FacilityDevelopmentProjectStatus): FacilityDevelopmentOutcome {
  return Object.freeze({
    projectId: project.id,
    previousStatus: project.status,
    newStatus,
    createdFacilityIds: Object.freeze([]),
    createdComponentIds: Object.freeze([]),
    retiredComponentIds: Object.freeze([]),
    updatedComponentIds: Object.freeze([]),
    conditionRecordIds: Object.freeze([]),
    requiresTemporaryRelocation: false,
  })
}

function requireProject(world: GameWorld, projectId: FacilityDevelopmentProjectId): FacilityDevelopmentProject {
  const project = world.facilityDevelopmentProjectsById[projectId]
  if (project === undefined) throw new RangeError(`Unknown facility development project: ${projectId}`)
  return project
}

function transition(world: GameWorld, project: FacilityDevelopmentProject, to: FacilityDevelopmentProjectStatus, patch: Partial<FacilityDevelopmentProject>): GameWorld {
  if (!isValidFacilityDevelopmentProjectTransition(project.status, to)) {
    throw new RangeError(`Invalid facility development project transition ${project.status} -> ${to}`)
  }
  const updated = createFacilityDevelopmentProject({ ...project, ...patch, status: to })
  const existing = Object.values(world.facilityDevelopmentProjectsById)
  return updateGameWorld(world, {
    facilityDevelopmentProjects: existing.map((candidate) => (candidate.id === project.id ? updated : candidate)),
  })
}

/**
 * Moves a project from `SCHEDULED` (or `PLANNED`/`APPROVED`, since intermediate statuses are
 * optional per the brief) into `IN_PROGRESS`. For a `CREATE_FACILITY` scope, this is the moment the
 * real `Facility` entity is born — in `UNDER_CONSTRUCTION` lifecycle status — closing the gap
 * between "a project plans a facility" and "the facility exists as PLANNED real-world asset". For
 * every other scope, the existing target Facility is temporarily moved to `UNDER_RENOVATION` only
 * when the project's scope is facility-wide in character (`RECONFIGURE_FACILITY`,
 * `DEMOLISH_FACILITY`) AND the Facility is not already `UNDER_RENOVATION`/terminal — a
 * single-component addition/renovation does not force the whole Facility into a renovation
 * lifecycle status, per the brief's explicit instruction not to close the entire Facility for a
 * scoped project.
 *
 * CFI6a: whenever this temporary transition is made, the Facility's *actual* prior status (whatever
 * it genuinely was — `ACTIVE`, `TEMPORARILY_CLOSED`, `PARTIALLY_CLOSED`, ...) is recorded on the
 * project itself as `facilityLifecyclePriorStatus`, so `completeFacilityDevelopmentProject`/
 * `cancelFacilityDevelopmentProject` can restore that exact status later rather than hardcoding a
 * restoration to `ACTIVE`.
 */
export function startFacilityDevelopmentProject(world: GameWorld, projectId: FacilityDevelopmentProjectId, startedAt: GameDate): FacilityDevelopmentCommandResult {
  const project = requireProject(world, projectId)
  if (project.status !== 'PLANNED' && project.status !== 'APPROVED' && project.status !== 'SCHEDULED') {
    throw new RangeError(`Facility development project ${projectId} cannot be started from status ${project.status}`)
  }

  let createdFacilityIds: readonly FacilityId[] = Object.freeze([])
  let world2 = world
  let facilityId = project.facilityId
  let facilityLifecyclePriorStatus: FacilityStatus | null = null

  if (project.scope.kind === 'CREATE_FACILITY') {
    const newFacilityId = facilityIdFromString(`facility:${project.id}`)
    const facility = createFacility({
      id: newFacilityId,
      placeId: project.scope.placeId,
      type: project.scope.facilityType,
      purposes: ['TRAINING'],
      status: 'UNDER_CONSTRUCTION',
      canonicalName: project.scope.canonicalName,
    })
    const statusRecord = createFacilityStatusRecord({
      id: facilityStatusRecordIdFromString(`facility-status:${newFacilityId}:${startedAt}`),
      facilityId: newFacilityId,
      status: 'UNDER_CONSTRUCTION',
      effectiveFrom: startedAt,
    })
    world2 = updateGameWorld(world2, {
      facilities: [...Object.values(world2.facilitiesById), facility],
      facilityStatusRecords: [...Object.values(world2.facilityStatusRecordsById), statusRecord],
    })
    createdFacilityIds = Object.freeze([newFacilityId])
    facilityId = newFacilityId
  } else if ((project.scope.kind === 'RECONFIGURE_FACILITY' || project.scope.kind === 'DEMOLISH_FACILITY') && facilityId !== null) {
    const target = world2.facilitiesById[facilityId]
    if (target !== undefined && target.status !== 'UNDER_RENOVATION' && !isTerminalFacilityStatus(target.status)) {
      const statusRecord = createFacilityStatusRecord({
        id: facilityStatusRecordIdFromString(`facility-status:${facilityId}:${startedAt}`),
        facilityId,
        status: 'UNDER_RENOVATION',
        effectiveFrom: startedAt,
      })
      world2 = updateGameWorld(world2, {
        facilities: Object.values(world2.facilitiesById).map((candidate) => (candidate.id === facilityId ? { ...candidate, status: 'UNDER_RENOVATION' } : candidate)),
        facilityStatusRecords: [...Object.values(world2.facilityStatusRecordsById), statusRecord],
      })
      facilityLifecyclePriorStatus = target.status
    }
  }

  const worldAfterTransition = transition(world2, project, 'IN_PROGRESS', { facilityId, actualStartDate: startedAt, facilityLifecyclePriorStatus })
  return {
    world: worldAfterTransition,
    outcome: Object.freeze({ ...emptyOutcome(project, 'IN_PROGRESS'), createdFacilityIds }),
  }
}

export function pauseFacilityDevelopmentProject(world: GameWorld, projectId: FacilityDevelopmentProjectId): FacilityDevelopmentCommandResult {
  const project = requireProject(world, projectId)
  const updatedWorld = transition(world, project, 'PAUSED', {})
  return { world: updatedWorld, outcome: emptyOutcome(project, 'PAUSED') }
}

export function resumeFacilityDevelopmentProject(world: GameWorld, projectId: FacilityDevelopmentProjectId): FacilityDevelopmentCommandResult {
  const project = requireProject(world, projectId)
  const updatedWorld = transition(world, project, 'IN_PROGRESS', {})
  return { world: updatedWorld, outcome: emptyOutcome(project, 'IN_PROGRESS') }
}

/**
 * A cancellation is never a deletion: the project record persists with `status: 'CANCELLED'` and
 * `cancelledAt` set, preserving history exactly as the brief requires. CFI6 deliberately does not
 * attempt to resolve every physical consequence of a partially-built project (e.g. undoing a
 * half-finished component) — any components/condition records already written by a prior partial
 * completion remain as they are; only the project's own status changes here.
 *
 * CFI6a: if this project had temporarily altered its target Facility's lifecycle on start (i.e.
 * `facilityLifecyclePriorStatus` is non-null), cancelling it restores that exact prior status —
 * never a hardcoded `ACTIVE` — so an abandoned renovation does not leave the Facility stuck in
 * `UNDER_RENOVATION` forever. A project that never altered lifecycle (most single-component scopes,
 * or one cancelled before it ever started) leaves the Facility completely untouched, as before.
 */
export function cancelFacilityDevelopmentProject(world: GameWorld, projectId: FacilityDevelopmentProjectId, cancelledAt: GameDate): FacilityDevelopmentCommandResult {
  const project = requireProject(world, projectId)
  const restoredWorld = restoreFacilityLifecycleIfNeeded(world, project, cancelledAt)
  const updatedWorld = transition(restoredWorld, project, 'CANCELLED', { cancelledAt })
  return { world: updatedWorld, outcome: emptyOutcome(project, 'CANCELLED') }
}

/**
 * CFI6a: restores a project's target Facility to `facilityLifecyclePriorStatus` (writing a new,
 * additive `FacilityStatusRecord` — the prior `UNDER_RENOVATION` record is never edited or removed)
 * when, and only when, that field is set AND the Facility has not since reached a terminal status.
 * A completed `DEMOLISH_FACILITY` project also sets `facilityLifecyclePriorStatus` on start (the
 * Facility genuinely does pass through `UNDER_RENOVATION` while being torn down), but by the time
 * `completeFacilityDevelopmentProject` calls this (after `applyFacilityDevelopmentScope` has already
 * written the terminal `DEMOLISHED` status), the `isTerminalFacilityStatus` guard below makes this a
 * correct no-op — demolition is never "restored" to its pre-project status, per the brief.
 */
function restoreFacilityLifecycleIfNeeded(world: GameWorld, project: FacilityDevelopmentProject, effectiveFrom: GameDate): GameWorld {
  if (project.facilityLifecyclePriorStatus === null || project.facilityId === null) return world
  const facilityId = project.facilityId
  const target = world.facilitiesById[facilityId]
  if (target === undefined || isTerminalFacilityStatus(target.status)) return world
  const priorStatus = project.facilityLifecyclePriorStatus
  const statusRecord = createFacilityStatusRecord({
    id: facilityStatusRecordIdFromString(`facility-status:${facilityId}:${effectiveFrom}`),
    facilityId,
    status: priorStatus,
    effectiveFrom,
  })
  return updateGameWorld(world, {
    facilities: Object.values(world.facilitiesById).map((candidate) => (candidate.id === facilityId ? { ...candidate, status: priorStatus } : candidate)),
    facilityStatusRecords: [...Object.values(world.facilityStatusRecordsById), statusRecord],
  })
}

/**
 * The central command: realizes a project's `scope` against world truth, atomically, in one
 * `updateGameWorld` call. Idempotent by construction — every generated ID
 * (`facility-component:${projectId}:${index}`, `facility-component-condition:${componentId}:${completedAt}`,
 * `facility-maintenance-need:...`) is content-addressed from the project's own identity, so
 * completing the same project twice attempts to create already-existing IDs, which `GameWorld`'s
 * duplicate-ID guard rejects rather than silently duplicating world truth. The second call is
 * additionally short-circuited explicitly: a project already `COMPLETED` cannot be completed again
 * (the status transition guard alone already prevents this, since `COMPLETED -> COMPLETED` is not a
 * valid transition).
 */
export function completeFacilityDevelopmentProject(world: GameWorld, projectId: FacilityDevelopmentProjectId, completedAt: GameDate): FacilityDevelopmentCommandResult {
  const project = requireProject(world, projectId)
  if (project.status !== 'IN_PROGRESS') throw new RangeError(`Facility development project ${projectId} cannot be completed from status ${project.status}`)

  const application = applyFacilityDevelopmentScope(world, project, completedAt)
  const restoredWorld = restoreFacilityLifecycleIfNeeded(application.world, project, completedAt)
  const worldAfterTransition = transition(restoredWorld, project, 'COMPLETED', { actualCompletionDate: completedAt })

  return {
    world: worldAfterTransition,
    outcome: Object.freeze({ ...application.outcome, previousStatus: project.status, newStatus: 'COMPLETED' as const }),
  }
}

interface ScopeApplication {
  readonly world: GameWorld
  readonly outcome: FacilityDevelopmentOutcome
}

/**
 * Realizes exactly one project's scope. Every scope kind is handled explicitly (a switch over the
 * scope's discriminant, exhaustive by construction) rather than duck-typed, so adding a new scope
 * kind in a future wave without updating this function is a compile error, not a silent no-op.
 */
function applyFacilityDevelopmentScope(world: GameWorld, project: FacilityDevelopmentProject, completedAt: GameDate): ScopeApplication {
  const scope = project.scope
  const facilityId = project.facilityId

  switch (scope.kind) {
    case 'CREATE_FACILITY': {
      if (facilityId === null) throw new RangeError(`Facility development project ${project.id} completed CREATE_FACILITY scope without a facilityId (did startFacilityDevelopmentProject run first?)`)
      const { world: worldWithComponents, createdComponentIds } = addComponents(world, facilityId, project.id, scope.initialComponents, completedAt)
      const activatedWorld = updateGameWorld(worldWithComponents, {
        facilities: Object.values(worldWithComponents.facilitiesById).map((candidate) => (candidate.id === facilityId ? { ...candidate, status: 'ACTIVE' } : candidate)),
        facilityStatusRecords: [
          ...Object.values(worldWithComponents.facilityStatusRecordsById),
          createFacilityStatusRecord({ id: facilityStatusRecordIdFromString(`facility-status:${facilityId}:${completedAt}`), facilityId, status: 'ACTIVE', effectiveFrom: completedAt }),
        ],
      })
      return {
        world: activatedWorld,
        outcome: Object.freeze({ ...emptyOutcome(project, 'COMPLETED'), createdFacilityIds: Object.freeze([facilityId]), createdComponentIds }),
      }
    }
    case 'ADD_COMPONENT':
    case 'EXPAND_FACILITY': {
      requireFacilityId(project, facilityId)
      const { world: worldWithComponents, createdComponentIds } = addComponents(world, facilityId!, project.id, scope.components, completedAt)
      return { world: worldWithComponents, outcome: Object.freeze({ ...emptyOutcome(project, 'COMPLETED'), createdComponentIds }) }
    }
    case 'REPLACE_COMPONENT': {
      requireFacilityId(project, facilityId)
      return applyReplacement(world, facilityId!, project.id, scope.retiredComponentId, scope.replacement, scope.resultingCondition, completedAt, project)
    }
    case 'RENOVATE_COMPONENT': {
      requireFacilityId(project, facilityId)
      return applyRenovation(world, project, scope.componentId, scope, completedAt)
    }
    case 'REMOVE_COMPONENT': {
      requireFacilityId(project, facilityId)
      return applyRemoval(world, project, scope.componentId, completedAt)
    }
    case 'RECONFIGURE_FACILITY': {
      requireFacilityId(project, facilityId)
      let current = world
      let createdComponentIds: FacilityComponentId[] = []
      let retiredComponentIds: FacilityComponentId[] = []
      let updatedComponentIds: FacilityComponentId[] = []
      let conditionRecordIds: string[] = []

      if (scope.additions.length > 0) {
        const added = addComponents(current, facilityId!, project.id, scope.additions, completedAt)
        current = added.world
        createdComponentIds = [...createdComponentIds, ...added.createdComponentIds]
      }
      for (const renovation of scope.renovations) {
        const result = applyRenovation(current, project, renovation.componentId, renovation, completedAt)
        current = result.world
        updatedComponentIds = [...updatedComponentIds, ...result.outcome.updatedComponentIds]
        conditionRecordIds = [...conditionRecordIds, ...result.outcome.conditionRecordIds]
      }
      for (const replacement of scope.replacements) {
        const result = applyReplacement(current, facilityId!, project.id, replacement.retiredComponentId, replacement.replacement, replacement.resultingCondition, completedAt, project)
        current = result.world
        createdComponentIds = [...createdComponentIds, ...result.outcome.createdComponentIds]
        retiredComponentIds = [...retiredComponentIds, ...result.outcome.retiredComponentIds]
        conditionRecordIds = [...conditionRecordIds, ...result.outcome.conditionRecordIds]
      }
      for (const componentId of scope.removals) {
        const result = applyRemoval(current, project, componentId, completedAt)
        current = result.world
        retiredComponentIds = [...retiredComponentIds, ...result.outcome.retiredComponentIds]
      }
      return {
        world: current,
        outcome: Object.freeze({
          ...emptyOutcome(project, 'COMPLETED'),
          createdComponentIds: Object.freeze(createdComponentIds),
          retiredComponentIds: Object.freeze(retiredComponentIds),
          updatedComponentIds: Object.freeze(updatedComponentIds),
          conditionRecordIds: Object.freeze(conditionRecordIds),
          requiresTemporaryRelocation: true,
        }),
      }
    }
    case 'DEMOLISH_FACILITY': {
      const targetFacilityId = facilityIdFromString(scope.facilityId)
      const target = world.facilitiesById[targetFacilityId]
      if (target === undefined) throw new RangeError(`Facility development project ${project.id} demolition references missing Facility ${targetFacilityId}`)
      const activeComponents = Object.values(world.facilityComponentsById).filter((component) => component.facilityId === targetFacilityId && component.status !== 'CLOSED')
      const closedComponents = activeComponents.map((component) => ({ ...component, status: 'CLOSED' as const, closedAt: completedAt }))
      const updatedWorld = updateGameWorld(world, {
        facilities: Object.values(world.facilitiesById).map((candidate) => (candidate.id === targetFacilityId ? { ...candidate, status: 'DEMOLISHED', closedOn: completedAt } : candidate)),
        facilityComponents: Object.values(world.facilityComponentsById).map((candidate) => closedComponents.find((closed) => closed.id === candidate.id) ?? candidate),
        facilityStatusRecords: [
          ...Object.values(world.facilityStatusRecordsById),
          createFacilityStatusRecord({ id: facilityStatusRecordIdFromString(`facility-status:${targetFacilityId}:${completedAt}`), facilityId: targetFacilityId, status: 'DEMOLISHED', effectiveFrom: completedAt }),
        ],
      })
      return {
        world: updatedWorld,
        outcome: Object.freeze({ ...emptyOutcome(project, 'COMPLETED'), retiredComponentIds: Object.freeze(activeComponents.map((component) => component.id)) }),
      }
    }
    default: {
      const exhaustive: never = scope
      throw new TypeError(`Unhandled facility development project scope: ${JSON.stringify(exhaustive)}`)
    }
  }
}

function requireFacilityId(project: FacilityDevelopmentProject, facilityId: FacilityId | null): asserts facilityId is FacilityId {
  if (facilityId === null) throw new RangeError(`Facility development project ${project.id} scope ${project.scope.kind} requires a facilityId`)
}

function addComponents(world: GameWorld, facilityId: FacilityId, projectId: FacilityDevelopmentProjectId, blueprints: readonly ComponentBlueprint[], completedAt: GameDate): { world: GameWorld; createdComponentIds: readonly FacilityComponentId[] } {
  const existingComponents = Object.values(world.facilityComponentsById)
  const newComponents: FacilityComponent[] = blueprints.map((blueprint, index) =>
    createFacilityComponent(componentBlueprintToCreateInput(blueprint, `facility-component:${projectId}:${index}`, facilityId, completedAt)),
  )
  const updatedWorld = updateGameWorld(world, { facilityComponents: [...existingComponents, ...newComponents] })
  return { world: updatedWorld, createdComponentIds: Object.freeze(newComponents.map((component) => component.id)) }
}

/** Renovation: same identity, improved/changed asset — see `RenovateComponentScope`'s own doc comment for the Renovation-vs-Replacement distinction. Updates the component's specification/technical standard/equipment tags in place (a new `FacilityComponent` value with the same `id`) and writes one new CFI4 condition record for the explicit `resultingCondition`. */
function applyRenovation(world: GameWorld, project: FacilityDevelopmentProject, componentId: FacilityComponentId, patch: { readonly updatedSpecification?: unknown; readonly updatedTechnicalStandard?: unknown; readonly updatedEquipmentTags?: readonly string[]; readonly resultingCondition: number }, completedAt: GameDate): ScopeApplication {
  const existingComponents = Object.values(world.facilityComponentsById)
  const existing = existingComponents.find((component) => component.id === componentId)
  if (existing === undefined) throw new RangeError(`Facility development project ${project.id} renovation references missing component ${componentId}`)

  const updatedComponent = createFacilityComponent({
    ...existing,
    specification: patch.updatedSpecification !== undefined && patch.updatedSpecification !== null ? (patch.updatedSpecification as FacilityComponent['specification']) : existing.specification,
    equipmentTags: patch.updatedEquipmentTags ?? existing.equipmentTags,
  })

  const conditionRecords = Object.values(world.facilityComponentConditionRecordsById)
  const activeRecord = componentConditionAt(conditionRecords, componentId, completedAt)
  const newRecordId = `facility-component-condition:${componentId}:${completedAt}`
  const newRecord = createFacilityComponentConditionRecord({
    id: facilityComponentConditionRecordIdFromString(newRecordId),
    componentId,
    effectiveFrom: completedAt,
    physicalCondition: patch.resultingCondition,
    serviceability: 'FULL',
    technicalStandard: (patch.updatedTechnicalStandard as FacilityComponentConditionRecord['technicalStandard'] | undefined) ?? activeRecord?.technicalStandard ?? null,
  })
  const carried = conditionRecords.map((record) => (activeRecord !== undefined && record.id === activeRecord.id && record.effectiveTo === null ? { ...record, effectiveTo: previousDay(completedAt) } : record))

  const closure = closeRelatedMaintenanceNeeds(world, componentId, completedAt)

  const updatedWorld = updateGameWorld(world, {
    facilityComponents: existingComponents.map((component) => (component.id === componentId ? updatedComponent : component)),
    facilityComponentConditionRecords: [...carried, newRecord],
    ...(closure.closedNeeds.length > 0 ? { facilityMaintenanceNeeds: closure.updatedNeeds } : {}),
  })

  return {
    world: updatedWorld,
    outcome: Object.freeze({ ...emptyOutcome(project, 'COMPLETED'), updatedComponentIds: Object.freeze([componentId]), conditionRecordIds: Object.freeze([newRecordId]) }),
  }
}

/** Replacement: old identity ends (retired, `status: 'CLOSED'`, `closedAt` set — never deleted), new identity begins (a brand-new `FacilityComponent` with its own id, commissioned at the project's explicit `resultingCondition`). */
function applyReplacement(world: GameWorld, facilityId: FacilityId, projectId: FacilityDevelopmentProjectId, retiredComponentId: FacilityComponentId, replacement: ComponentBlueprint, resultingCondition: number, completedAt: GameDate, project: FacilityDevelopmentProject): ScopeApplication {
  const existingComponents = Object.values(world.facilityComponentsById)
  const retiring = existingComponents.find((component) => component.id === retiredComponentId)
  if (retiring === undefined) throw new RangeError(`Facility development project ${projectId} replacement references missing component ${retiredComponentId}`)

  const retiredComponent = createFacilityComponent({ ...retiring, status: 'CLOSED', closedAt: completedAt })
  const newComponentId = facilityComponentIdFromString(`facility-component:${projectId}:replacement`)
  const newComponent = createFacilityComponent(componentBlueprintToCreateInput(replacement, newComponentId, facilityId, completedAt))

  const conditionRecordId = `facility-component-condition:${newComponentId}:${completedAt}`
  const newConditionRecord = createFacilityComponentConditionRecord({
    id: facilityComponentConditionRecordIdFromString(conditionRecordId),
    componentId: newComponentId,
    effectiveFrom: completedAt,
    physicalCondition: resultingCondition,
    serviceability: 'FULL',
  })

  const closure = closeRelatedMaintenanceNeeds(world, retiredComponentId, completedAt)

  const updatedWorld = updateGameWorld(world, {
    facilityComponents: [...existingComponents.map((component) => (component.id === retiredComponentId ? retiredComponent : component)), newComponent],
    facilityComponentConditionRecords: [...Object.values(world.facilityComponentConditionRecordsById), newConditionRecord],
    ...(closure.closedNeeds.length > 0 ? { facilityMaintenanceNeeds: closure.updatedNeeds } : {}),
  })

  return {
    world: updatedWorld,
    outcome: Object.freeze({
      ...emptyOutcome(project, 'COMPLETED'),
      createdComponentIds: Object.freeze([newComponentId]),
      retiredComponentIds: Object.freeze([retiredComponentId]),
      conditionRecordIds: Object.freeze([conditionRecordId]),
    }),
  }
}

/** Removal/decommissioning at component scale: `status: 'CLOSED'` + `closedAt` — never a physical delete. `activeFacilityComponentsAt` (CFI3) already resolves this temporally: the component remains queryable for any date before `closedAt`, and correctly excluded from "active" as of any date at/after it. No new component-history collection was needed for this (see the CFI6 certification report's audit finding). */
function applyRemoval(world: GameWorld, project: FacilityDevelopmentProject, componentId: FacilityComponentId, completedAt: GameDate): ScopeApplication {
  const existingComponents = Object.values(world.facilityComponentsById)
  const existing = existingComponents.find((component) => component.id === componentId)
  if (existing === undefined) throw new RangeError(`Facility development project ${project.id} removal references missing component ${componentId}`)
  const retired = createFacilityComponent({ ...existing, status: 'CLOSED', closedAt: completedAt })

  const closure = closeRelatedMaintenanceNeeds(world, componentId, completedAt)
  const updatedWorld = updateGameWorld(world, {
    facilityComponents: existingComponents.map((component) => (component.id === componentId ? retired : component)),
    ...(closure.closedNeeds.length > 0 ? { facilityMaintenanceNeeds: closure.updatedNeeds } : {}),
  })

  return { world: updatedWorld, outcome: Object.freeze({ ...emptyOutcome(project, 'COMPLETED'), retiredComponentIds: Object.freeze([componentId]) }) }
}

/**
 * Closes only the maintenance needs actually related to the intervened component — never every
 * open need on the whole Facility. A roof leak on a different component is left untouched by a
 * renovated court, exactly as the brief requires.
 */
function closeRelatedMaintenanceNeeds(world: GameWorld, componentId: FacilityComponentId, completedAt: GameDate): { updatedNeeds: readonly FacilityMaintenanceNeed[]; closedNeeds: readonly FacilityMaintenanceNeed[] } {
  const existingNeeds = Object.values(world.facilityMaintenanceNeedsById)
  const related = maintenanceNeedsForComponentAt(existingNeeds, componentId, completedAt).filter((need) => isFacilityMaintenanceNeedOpenStatus(need.status))
  if (related.length === 0) return { updatedNeeds: existingNeeds, closedNeeds: Object.freeze([]) }
  const relatedIds = new Set(related.map((need) => need.id))
  const updatedNeeds = existingNeeds.map((need) =>
    relatedIds.has(need.id) ? createFacilityMaintenanceNeed({ ...need, status: 'COMPLETED', resolvedAt: completedAt }) : need,
  )
  return { updatedNeeds: Object.freeze(updatedNeeds), closedNeeds: Object.freeze(related) }
}

function previousDay(date: GameDate): GameDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const utcMs = Date.UTC(year, month - 1, day) - 86_400_000
  const previous = new Date(utcMs)
  return `${previous.getUTCFullYear().toString().padStart(4, '0')}-${(previous.getUTCMonth() + 1).toString().padStart(2, '0')}-${previous.getUTCDate().toString().padStart(2, '0')}` as GameDate
}

/**
 * Deliberately NOT a daily-loop simulation. This is a pure, explicit query over project dates — a
 * caller decides when to invoke it (e.g. once per in-game month), and it never mutates anything
 * itself. It answers only "which SCHEDULED projects have reached their planned start" — actually
 * starting one is still an explicit `startFacilityDevelopmentProject` command, per the brief's
 * instruction to prefer commands over automatic decisions that imply a human/institutional choice.
 */
export function projectsEligibleToStartAt(projects: readonly FacilityDevelopmentProject[], onDate: GameDate): readonly FacilityDevelopmentProjectId[] {
  return Object.freeze(
    projects
      .filter((project) => project.status === 'SCHEDULED' && compareGameDates(project.plannedStartDate, onDate) <= 0)
      .map((project) => project.id)
      .sort((a, b) => a.localeCompare(b)),
  )
}

export type { FacilityServiceability }
