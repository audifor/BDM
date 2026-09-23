import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import {
  componentConditionAt,
  componentServiceabilityAt,
  createFacility,
  createFacilityComponent,
  createFacilityComponentConditionRecord,
  createFacilityDevelopmentProject,
  createFacilityMaintenanceNeed,
  createPlace,
  facilityHasUsableCapabilityAt,
  maintenanceNeedsForComponentAt,
} from '@/domain/facilities'
import { updateGameWorld } from '@/domain/world'
import {
  cancelFacilityDevelopmentProject,
  completeFacilityDevelopmentProject,
  pauseFacilityDevelopmentProject,
  projectsEligibleToStartAt,
  resumeFacilityDevelopmentProject,
  startFacilityDevelopmentProject,
} from './FacilityDevelopmentEngine'

function fixture() {
  const world = createNewGame()
  const organization = Object.values(world.organizationsById)[0]!
  const place = createPlace({ id: 'place:engine-dev-1', kind: 'CAMPUS', name: 'Engine Dev Campus 1' })
  const facility = createFacility({ id: 'facility:engine-dev-1', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Engine Dev Center 1' })
  const court = createFacilityComponent({ id: 'component:engine-dev-court', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
  const strengthRoom = createFacilityComponent({ id: 'component:engine-dev-strength', facilityId: facility.id, type: 'STRENGTH_ROOM', status: 'ACTIVE' })
  const base = updateGameWorld(world, { places: [place], facilities: [facility], facilityComponents: [court, strengthRoom] })
  return { world: base, organization, place, facility, court, strengthRoom }
}

function scheduledProject(overrides: Partial<Parameters<typeof createFacilityDevelopmentProject>[0]>) {
  return createFacilityDevelopmentProject({
    id: 'project:x',
    organizationId: 'organization:x',
    facilityId: 'facility:x',
    projectType: 'COMPONENT_ADDITION',
    status: 'SCHEDULED',
    scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
    plannedStartDate: '2030-01-01',
    plannedCompletionDate: '2030-06-01',
    createdAt: '2029-11-01',
    ...overrides,
  } as never)
}

describe('Club Facilities & Infrastructure V2 — Construction, Renovation & Development Projects (CFI6) — engine', () => {
  it('2/3/4. starts a NEW_FACILITY project (PLANNED -> UNDER_CONSTRUCTION) and completing it activates the Facility (-> ACTIVE)', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:new-facility',
      organizationId: f.organization.id,
      projectType: 'NEW_FACILITY',
      scope: { kind: 'CREATE_FACILITY', placeId: f.place.id, facilityType: 'TRAINING_CENTER', canonicalName: 'Brand New Center', initialComponents: [{ type: 'PRACTICE_COURT' }, { type: 'PRACTICE_COURT' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-12-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })

    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    const startedProject = started.world.facilityDevelopmentProjectsById[project.id]!
    expect(startedProject.status).toBe('IN_PROGRESS')
    expect(startedProject.facilityId).not.toBeNull()
    const newFacility = started.world.facilitiesById[startedProject.facilityId!]!
    expect(newFacility.status).toBe('UNDER_CONSTRUCTION')
    expect(started.outcome.createdFacilityIds).toEqual([startedProject.facilityId])

    const completed = completeFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-11-01'))
    expect(completed.world.facilityDevelopmentProjectsById[project.id]!.status).toBe('COMPLETED')
    const activatedFacility = completed.world.facilitiesById[startedProject.facilityId!]!
    expect(activatedFacility.status).toBe('ACTIVE')
    expect(completed.outcome.createdComponentIds).toHaveLength(2)
  })

  it('5/6. adding a component produces a derived capability once the project completes', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:add-hydro',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_ADDITION',
      status: 'IN_PROGRESS',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-05-01'))
    expect(result.outcome.createdComponentIds).toHaveLength(1)
    expect(facilityHasUsableCapabilityAt(Object.values(result.world.facilityComponentsById), Object.values(result.world.facilityComponentConditionRecordsById), f.facility.id, 'RECOVERY_HYDROTHERAPY' as never, parseGameDate('2030-05-01'))).toBeDefined()
  })

  it('7/12. component renovation preserves identity and writes a new CFI4 condition record with an explicit resulting condition', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:renovate-court',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_RENOVATION',
      status: 'IN_PROGRESS',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 85, updatedTechnicalStandard: 'ADVANCED' },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-03-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-02-15'))

    expect(result.world.facilityComponentsById[f.court.id]).toBeDefined()
    expect(result.outcome.updatedComponentIds).toEqual([f.court.id])
    const record = componentConditionAt(Object.values(result.world.facilityComponentConditionRecordsById), f.court.id, parseGameDate('2030-02-15'))
    expect(record?.physicalCondition).toBe(85)
    expect(record?.technicalStandard).toBe('ADVANCED')
  })

  it('8/9. component replacement changes identity, preserving the old component history', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:replace-strength',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_REPLACEMENT',
      status: 'IN_PROGRESS',
      scope: { kind: 'REPLACE_COMPONENT', retiredComponentId: f.strengthRoom.id, replacement: { type: 'STRENGTH_ROOM', name: 'New Strength Room' }, resultingCondition: 100 },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-03-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-02-01'))

    expect(result.outcome.retiredComponentIds).toEqual([f.strengthRoom.id])
    expect(result.outcome.createdComponentIds).toHaveLength(1)
    const newComponentId = result.outcome.createdComponentIds[0]!
    expect(newComponentId).not.toBe(f.strengthRoom.id)

    const retired = result.world.facilityComponentsById[f.strengthRoom.id]!
    expect(retired.status).toBe('CLOSED')
    expect(retired.closedAt).toBe('2030-02-01')
    // Old component identity's own history remains queryable before the replacement date.
    expect(result.world.facilityComponentsById[f.strengthRoom.id]!.id).toBe(f.strengthRoom.id)
  })

  it('10. removes/decommissions a component without deleting its history', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:remove-strength',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_REMOVAL',
      status: 'IN_PROGRESS',
      scope: { kind: 'REMOVE_COMPONENT', componentId: f.strengthRoom.id },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-02-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-20'))

    expect(result.outcome.retiredComponentIds).toEqual([f.strengthRoom.id])
    const removed = result.world.facilityComponentsById[f.strengthRoom.id]!
    expect(removed.status).toBe('CLOSED')
    expect(removed.closedAt).toBe('2030-01-20')
    // Still queryable historically before the closure date.
    const stillActiveBefore = Object.values(result.world.facilityComponentsById).filter((component) => component.id === f.strengthRoom.id)
    expect(stillActiveBefore).toHaveLength(1)
  })

  it('11. modernization changes technical standard without creating a new component', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:modernize',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'FACILITY_MODERNIZATION',
      status: 'IN_PROGRESS',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.strengthRoom.id, updatedTechnicalStandard: 'SPECIALIST', resultingCondition: 95 },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-02-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-25'))

    expect(result.outcome.createdComponentIds).toHaveLength(0)
    const record = componentConditionAt(Object.values(result.world.facilityComponentConditionRecordsById), f.strengthRoom.id, parseGameDate('2030-01-25'))
    expect(record?.technicalStandard).toBe('SPECIALIST')
  })

  it('13. partial closure: a project affecting only one component does not touch the Facility lifecycle', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:partial-closure',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_RENOVATION',
      status: 'IN_PROGRESS',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-02-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = world.facilitiesById[f.facility.id]!.status
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-25'))
    expect(started).toBe('ACTIVE')
    expect(result.world.facilitiesById[f.facility.id]!.status).toBe('ACTIVE')
  })

  it('14. a facility-wide RECONFIGURE_FACILITY project changes Facility lifecycle to UNDER_RENOVATION on start', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:facility-wide',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'RECONFIGURATION',
      status: 'SCHEDULED',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    expect(started.world.facilitiesById[f.facility.id]!.status).toBe('UNDER_RENOVATION')
  })

  it('15. completion restores serviceability via the explicit resulting condition (not necessarily 100)', () => {
    const f = fixture()
    const damaged = createFacilityComponentConditionRecord({ id: 'condition:before-renovation', componentId: f.court.id, effectiveFrom: '2029-01-01', physicalCondition: 40, serviceability: 'SEVERELY_LIMITED' })
    const worldWithDamage = updateGameWorld(f.world, { facilityComponentConditionRecords: [damaged] })
    const project = createFacilityDevelopmentProject({
      id: 'project:restore-serviceability',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_RENOVATION',
      status: 'IN_PROGRESS',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 76 },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-02-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(worldWithDamage, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-20'))
    expect(componentServiceabilityAt(Object.values(result.world.facilityComponentConditionRecordsById), f.court.id, parseGameDate('2030-01-20'))).toBe('FULL')
    expect(componentConditionAt(Object.values(result.world.facilityComponentConditionRecordsById), f.court.id, parseGameDate('2030-01-20'))?.physicalCondition).toBe(76)
    expect(componentConditionAt(Object.values(result.world.facilityComponentConditionRecordsById), f.court.id, parseGameDate('2030-01-20'))?.physicalCondition).not.toBe(100)
  })

  it('18/19. a project can be paused and then resumed', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:pause-resume',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_ADDITION',
      status: 'IN_PROGRESS',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const paused = pauseFacilityDevelopmentProject(world, project.id)
    expect(paused.world.facilityDevelopmentProjectsById[project.id]!.status).toBe('PAUSED')
    const resumed = resumeFacilityDevelopmentProject(paused.world, project.id)
    expect(resumed.world.facilityDevelopmentProjectsById[project.id]!.status).toBe('IN_PROGRESS')
  })

  it('21. cancellation is preserved historically, never deletes the project', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:cancel-me',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_ADDITION',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const cancelled = cancelFacilityDevelopmentProject(world, project.id, parseGameDate('2029-12-01'))
    expect(cancelled.world.facilityDevelopmentProjectsById[project.id]).toBeDefined()
    expect(cancelled.world.facilityDevelopmentProjectsById[project.id]!.status).toBe('CANCELLED')
    expect(cancelled.world.facilityDevelopmentProjectsById[project.id]!.cancelledAt).toBe('2029-12-01')
  })

  it('22/23. completion is atomic and idempotent: completing twice is rejected rather than duplicating world truth', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:idempotent',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_ADDITION',
      status: 'IN_PROGRESS',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const first = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-05-01'))
    expect(first.outcome.createdComponentIds).toHaveLength(1)
    // A second completion attempt is rejected by the status-transition guard (COMPLETED cannot be completed again).
    expect(() => completeFacilityDevelopmentProject(first.world, project.id, parseGameDate('2030-05-02'))).toThrow(RangeError)
    expect(Object.keys(first.world.facilityComponentsById).filter((id) => id.startsWith('facility-component:project:idempotent'))).toHaveLength(1)
  })

  it('24. multiple simultaneous projects on different components of the same facility both apply independently', () => {
    const f = fixture()
    const projectA = createFacilityDevelopmentProject({
      id: 'project:simultaneous-a', organizationId: f.organization.id, facilityId: f.facility.id, projectType: 'COMPONENT_RENOVATION',
      status: 'IN_PROGRESS', scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 88 },
      plannedStartDate: '2030-01-01', actualStartDate: '2030-01-01', plannedCompletionDate: '2030-02-01', createdAt: '2029-11-01',
    })
    const projectB = createFacilityDevelopmentProject({
      id: 'project:simultaneous-b', organizationId: f.organization.id, facilityId: f.facility.id, projectType: 'COMPONENT_RENOVATION',
      status: 'IN_PROGRESS', scope: { kind: 'RENOVATE_COMPONENT', componentId: f.strengthRoom.id, resultingCondition: 92 },
      plannedStartDate: '2030-01-01', actualStartDate: '2030-01-01', plannedCompletionDate: '2030-02-01', createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [projectA, projectB] })
    const resultA = completeFacilityDevelopmentProject(world, projectA.id, parseGameDate('2030-01-15'))
    const resultB = completeFacilityDevelopmentProject(resultA.world, projectB.id, parseGameDate('2030-01-16'))
    expect(componentConditionAt(Object.values(resultB.world.facilityComponentConditionRecordsById), f.court.id, parseGameDate('2030-01-16'))?.physicalCondition).toBe(88)
    expect(componentConditionAt(Object.values(resultB.world.facilityComponentConditionRecordsById), f.strengthRoom.id, parseGameDate('2030-01-16'))?.physicalCondition).toBe(92)
  })

  it('27. a maintenance need related to the intervened component is resolved explicitly by the completed project', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:related-to-renovation', facilityId: f.facility.id, componentId: f.court.id, detectedAt: '2029-12-01', type: 'SURFACE', severity: 'MODERATE', status: 'OPEN', source: 'inspection' })
    const worldWithNeed = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need] })
    const project = createFacilityDevelopmentProject({
      id: 'project:resolves-need',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_RENOVATION',
      status: 'IN_PROGRESS',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-02-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(worldWithNeed, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-20'))
    expect(result.world.facilityMaintenanceNeedsById[need.id]!.status).toBe('COMPLETED')
  })

  it('an unrelated maintenance need on a different component is left open by the same completion', () => {
    const f = fixture()
    const unrelatedNeed = createFacilityMaintenanceNeed({ id: 'need:unrelated-2', facilityId: f.facility.id, componentId: f.strengthRoom.id, detectedAt: '2029-12-01', type: 'STRUCTURAL', severity: 'MAJOR', status: 'OPEN', source: 'roof-leak' })
    const worldWithNeed = updateGameWorld(f.world, { facilityMaintenanceNeeds: [unrelatedNeed] })
    const project = createFacilityDevelopmentProject({
      id: 'project:leaves-unrelated-need',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_RENOVATION',
      status: 'IN_PROGRESS',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-02-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(worldWithNeed, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-20'))
    expect(result.world.facilityMaintenanceNeedsById[unrelatedNeed.id]!.status).toBe('OPEN')
  })

  it('28. demolition preserves historical component identity — components are CLOSED, never deleted', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:demolish',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'DEMOLITION',
      status: 'IN_PROGRESS',
      scope: { kind: 'DEMOLISH_FACILITY', facilityId: f.facility.id },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-03-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-02-15'))
    expect(result.world.facilitiesById[f.facility.id]!.status).toBe('DEMOLISHED')
    expect(result.world.facilityComponentsById[f.court.id]!.status).toBe('CLOSED')
    expect(result.world.facilityComponentsById[f.court.id]!.id).toBe(f.court.id)
  })

  it('29. a decommissioned/demolished facility remains queryable historically (its record is never removed from GameWorld)', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:demolish-2',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'DEMOLITION',
      status: 'IN_PROGRESS',
      scope: { kind: 'DEMOLISH_FACILITY', facilityId: f.facility.id },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-03-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-02-15'))
    expect(result.world.facilitiesById[f.facility.id]).toBeDefined()
  })

  it('30. project outcome contains affected entities explicitly', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:outcome-shape',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_ADDITION',
      status: 'IN_PROGRESS',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-05-01'))
    expect(result.outcome.projectId).toBe(project.id)
    expect(result.outcome.previousStatus).toBe('IN_PROGRESS')
    expect(result.outcome.newStatus).toBe('COMPLETED')
    expect(result.outcome.createdComponentIds).toHaveLength(1)
  })

  it('a RECONFIGURE_FACILITY completion flags requiresTemporaryRelocation as a seam, without scheduling anything', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:relocation-seam',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'RECONFIGURATION',
      status: 'IN_PROGRESS',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const result = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-05-01'))
    expect(result.outcome.requiresTemporaryRelocation).toBe(true)
  })

  it('rejects starting a project that is already IN_PROGRESS', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:already-started',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_ADDITION',
      status: 'IN_PROGRESS',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    expect(() => startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-05'))).toThrow(RangeError)
  })

  it('rejects completing a project that has not started', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:not-started',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_ADDITION',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    expect(() => completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-05-01'))).toThrow(RangeError)
  })

  it('projectsEligibleToStartAt returns only SCHEDULED projects whose plannedStartDate has arrived, without starting them', () => {
    const eligible = scheduledProject({ id: 'project:eligible' })
    const notYet = scheduledProject({ id: 'project:not-yet', plannedStartDate: '2035-01-01', plannedCompletionDate: '2035-06-01' })
    const ids = projectsEligibleToStartAt([eligible, notYet], parseGameDate('2030-01-01'))
    expect(ids).toEqual(['project:eligible'])
  })

  it('33. project queries and completion behave identically after a reload (deterministic, no hidden state)', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:reload-check',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_RENOVATION',
      status: 'IN_PROGRESS',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 80 },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-02-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const resultA = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-20'))
    const resultB = completeFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-20'))
    expect(resultA.outcome).toEqual(resultB.outcome)
  })
})
