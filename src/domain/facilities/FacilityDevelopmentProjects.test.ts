import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld, GameWorldValidationError } from '@/domain/world'
import {
  activeDevelopmentProjectsAt,
  createFacility,
  createFacilityComponent,
  createFacilityDevelopmentProject,
  createFacilityDevelopmentProjectPhase,
  createFacilityMaintenanceNeed,
  createPlace,
  currentProjectPhaseAt,
  developmentProjectsForFacility,
  developmentProjectsForOrganization,
  facilitiesUnderDevelopmentAt,
  facilitiesUnderRenovationAt,
  isDevelopmentProjectDelayedAt,
  isValidFacilityDevelopmentProjectTransition,
  projectPhases,
  projectsAffectingComponentAt,
} from './index'

function fixture() {
  const world = createNewGame()
  const organization = Object.values(world.organizationsById)[0]!
  const place = createPlace({ id: 'place:dev-1', kind: 'CAMPUS', name: 'Development Campus 1' })
  const facility = createFacility({ id: 'facility:dev-1', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Existing Training Center' })
  const court = createFacilityComponent({ id: 'component:dev-court-1', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
  const base = updateGameWorld(world, { places: [place], facilities: [facility], facilityComponents: [court] })
  return { world: base, organization, place, facility, court }
}

describe('Club Facilities & Infrastructure V2 — Construction, Renovation & Development Projects (CFI6) — domain', () => {
  it('1. creates a planned NEW_FACILITY project with no facilityId yet', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:new-facility-1',
      organizationId: f.organization.id,
      projectType: 'NEW_FACILITY',
      scope: { kind: 'CREATE_FACILITY', placeId: f.place.id, facilityType: 'TRAINING_CENTER', canonicalName: 'New Performance Center', initialComponents: [{ type: 'PRACTICE_COURT' }, { type: 'PRACTICE_COURT' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-12-01',
      createdAt: '2029-11-01',
    })
    expect(project.status).toBe('PLANNED')
    expect(project.facilityId).toBeNull()
  })

  it('rejects a CREATE_FACILITY project that already references an existing facilityId', () => {
    const f = fixture()
    expect(() => createFacilityDevelopmentProject({
      id: 'project:invalid-facility-id',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'NEW_FACILITY',
      scope: { kind: 'CREATE_FACILITY', placeId: f.place.id, facilityType: 'TRAINING_CENTER', canonicalName: 'X', initialComponents: [{ type: 'PRACTICE_COURT' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-12-01',
      createdAt: '2029-11-01',
    })).toThrow(RangeError)
  })

  it('rejects a non-CREATE_FACILITY project with no facilityId', () => {
    expect(() => createFacilityDevelopmentProject({
      id: 'project:missing-facility-id',
      organizationId: 'organization:x',
      projectType: 'COMPONENT_ADDITION',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })).toThrow(RangeError)
  })

  it('rejects a project type that is incompatible with its scope kind', () => {
    expect(() => createFacilityDevelopmentProject({
      id: 'project:incompatible',
      organizationId: 'organization:x',
      facilityId: 'facility:x',
      projectType: 'DEMOLITION',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })).toThrow(RangeError)
  })

  it('4. lifecycle transitions follow the explicit allowed-transition graph', () => {
    expect(isValidFacilityDevelopmentProjectTransition('PLANNED', 'APPROVED')).toBe(true)
    expect(isValidFacilityDevelopmentProjectTransition('APPROVED', 'SCHEDULED')).toBe(true)
    expect(isValidFacilityDevelopmentProjectTransition('SCHEDULED', 'IN_PROGRESS')).toBe(true)
    expect(isValidFacilityDevelopmentProjectTransition('IN_PROGRESS', 'COMPLETED')).toBe(true)
    expect(isValidFacilityDevelopmentProjectTransition('IN_PROGRESS', 'PAUSED')).toBe(true)
    expect(isValidFacilityDevelopmentProjectTransition('PAUSED', 'IN_PROGRESS')).toBe(true)
  })

  it('blocks COMPLETED -> IN_PROGRESS and CANCELLED -> COMPLETED transitions', () => {
    expect(isValidFacilityDevelopmentProjectTransition('COMPLETED', 'IN_PROGRESS')).toBe(false)
    expect(isValidFacilityDevelopmentProjectTransition('CANCELLED', 'COMPLETED')).toBe(false)
  })

  it('rejects a CANCELLED status with no cancelledAt date', () => {
    expect(() => createFacilityDevelopmentProject({
      id: 'project:invalid-cancel',
      organizationId: 'organization:x',
      facilityId: 'facility:x',
      projectType: 'COMPONENT_ADDITION',
      status: 'CANCELLED',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })).toThrow(RangeError)
  })

  it('16. supports a multi-phase project with sequential phases', () => {
    const project = createFacilityDevelopmentProject({
      id: 'project:multi-phase',
      organizationId: 'organization:x',
      facilityId: 'facility:x',
      projectType: 'RECONFIGURATION',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2032-01-01',
      createdAt: '2029-11-01',
    })
    const phase1 = createFacilityDevelopmentProjectPhase({ id: 'phase:1', projectId: project.id, sequence: 1, name: 'Construction', plannedStart: '2030-01-01', plannedCompletion: '2030-06-01' })
    const phase2 = createFacilityDevelopmentProjectPhase({ id: 'phase:2', projectId: project.id, sequence: 2, name: 'Commissioning', plannedStart: '2030-06-01', plannedCompletion: '2030-08-01' })
    const ordered = projectPhases([phase2, phase1], project.id)
    expect(ordered.map((phase) => phase.sequence)).toEqual([1, 2])
  })

  it('17. currentProjectPhaseAt resolves the first non-terminal phase in sequence order', () => {
    const phase1 = createFacilityDevelopmentProjectPhase({ id: 'phase:current-1', projectId: 'project:current', sequence: 1, status: 'COMPLETED', plannedStart: '2030-01-01', plannedCompletion: '2030-03-01', actualStart: '2030-01-01', actualCompletion: '2030-03-01' })
    const phase2 = createFacilityDevelopmentProjectPhase({ id: 'phase:current-2', projectId: 'project:current', sequence: 2, status: 'IN_PROGRESS', plannedStart: '2030-03-01', plannedCompletion: '2030-06-01', actualStart: '2030-03-01' })
    const current = currentProjectPhaseAt([phase1, phase2], 'project:current' as never)
    expect(current?.id).toBe('phase:current-2')
  })

  it('rejects duplicate phase sequence numbers for the same project via GameWorld validation', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:dup-phase',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'FACILITY_RENOVATION',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const phaseA = createFacilityDevelopmentProjectPhase({ id: 'phase:dup-a', projectId: project.id, sequence: 1, plannedStart: '2030-01-01', plannedCompletion: '2030-03-01' })
    const phaseB = createFacilityDevelopmentProjectPhase({ id: 'phase:dup-b', projectId: project.id, sequence: 1, plannedStart: '2030-03-01', plannedCompletion: '2030-06-01' })
    expect(() => updateGameWorld(f.world, { facilityDevelopmentProjects: [project], facilityDevelopmentProjectPhases: [phaseA, phaseB] })).toThrow(GameWorldValidationError)
  })

  it('rejects a non-contiguous phase sequence (1, 3) for the same project', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:gap-phase',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'FACILITY_RENOVATION',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const phaseA = createFacilityDevelopmentProjectPhase({ id: 'phase:gap-a', projectId: project.id, sequence: 1, plannedStart: '2030-01-01', plannedCompletion: '2030-03-01' })
    const phaseC = createFacilityDevelopmentProjectPhase({ id: 'phase:gap-c', projectId: project.id, sequence: 3, plannedStart: '2030-03-01', plannedCompletion: '2030-06-01' })
    expect(() => updateGameWorld(f.world, { facilityDevelopmentProjects: [project], facilityDevelopmentProjectPhases: [phaseA, phaseC] })).toThrow(GameWorldValidationError)
  })

  it('rejects a phase referencing an unknown project', () => {
    const f = fixture()
    const phase = createFacilityDevelopmentProjectPhase({ id: 'phase:orphan', projectId: 'project:does-not-exist', sequence: 1, plannedStart: '2030-01-01', plannedCompletion: '2030-03-01' })
    expect(() => updateGameWorld(f.world, { facilityDevelopmentProjectPhases: [phase] })).toThrow(GameWorldValidationError)
  })

  it('20. isDevelopmentProjectDelayedAt is true once plannedCompletionDate has passed for a non-terminal project', () => {
    const project = createFacilityDevelopmentProject({
      id: 'project:delayed',
      organizationId: 'organization:x',
      facilityId: 'facility:x',
      projectType: 'FACILITY_RENOVATION',
      status: 'IN_PROGRESS',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: 'component:x', resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-05',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    expect(isDevelopmentProjectDelayedAt(project, parseGameDate('2030-11-15'))).toBe(true)
    expect(isDevelopmentProjectDelayedAt(project, parseGameDate('2030-03-01'))).toBe(false)
  })

  it('a COMPLETED project is never considered delayed regardless of how late it actually finished', () => {
    const project = createFacilityDevelopmentProject({
      id: 'project:late-but-done',
      organizationId: 'organization:x',
      facilityId: 'facility:x',
      projectType: 'FACILITY_RENOVATION',
      status: 'COMPLETED',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: 'component:x', resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-05',
      plannedCompletionDate: '2030-06-01',
      actualCompletionDate: '2030-11-15',
      createdAt: '2029-11-01',
    })
    expect(isDevelopmentProjectDelayedAt(project, parseGameDate('2031-01-01'))).toBe(false)
  })

  it('developmentProjectsForFacility / developmentProjectsForOrganization return full immutable history, not just active projects', () => {
    const f = fixture()
    const cancelled = createFacilityDevelopmentProject({
      id: 'project:history-cancelled',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'FACILITY_RENOVATION',
      status: 'CANCELLED',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 90 },
      plannedStartDate: '2028-01-01',
      plannedCompletionDate: '2028-06-01',
      createdAt: '2027-11-01',
      cancelledAt: '2028-02-01',
    })
    expect(developmentProjectsForFacility([cancelled], f.facility.id)).toHaveLength(1)
    expect(developmentProjectsForOrganization([cancelled], f.organization.id)).toHaveLength(1)
  })

  it('activeDevelopmentProjectsAt excludes a PLANNED project whose plannedStartDate is still in the future', () => {
    const project = createFacilityDevelopmentProject({
      id: 'project:future',
      organizationId: 'organization:x',
      facilityId: 'facility:x',
      projectType: 'FACILITY_RENOVATION',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: 'component:x', resultingCondition: 90 },
      plannedStartDate: '2035-01-01',
      plannedCompletionDate: '2035-06-01',
      createdAt: '2029-11-01',
    })
    expect(activeDevelopmentProjectsAt([project], parseGameDate('2030-01-01'))).toHaveLength(0)
    expect(activeDevelopmentProjectsAt([project], parseGameDate('2035-06-01'))).toHaveLength(1)
  })

  it('projectsAffectingComponentAt finds a project whose RECONFIGURE_FACILITY scope renovates the given component', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:affects-component',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'RECONFIGURATION',
      status: 'IN_PROGRESS',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [], renovations: [{ componentId: f.court.id, resultingCondition: 85 }], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    expect(projectsAffectingComponentAt([project], f.court.id, parseGameDate('2030-03-01')).map((p) => p.id)).toEqual(['project:affects-component'])
  })

  it('facilitiesUnderDevelopmentAt / facilitiesUnderRenovationAt distinguish plain expansion from renovation-flavored projects', () => {
    const expansion = createFacilityDevelopmentProject({
      id: 'project:expansion-flavor', organizationId: 'organization:x', facilityId: 'facility:expansion', projectType: 'FACILITY_EXPANSION',
      status: 'IN_PROGRESS', scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01', actualStartDate: '2030-01-01', plannedCompletionDate: '2030-06-01', createdAt: '2029-11-01',
    })
    const renovation = createFacilityDevelopmentProject({
      id: 'project:renovation-flavor', organizationId: 'organization:x', facilityId: 'facility:renovation', projectType: 'FACILITY_RENOVATION',
      status: 'IN_PROGRESS', scope: { kind: 'RENOVATE_COMPONENT', componentId: 'component:x', resultingCondition: 85 },
      plannedStartDate: '2030-01-01', actualStartDate: '2030-01-01', plannedCompletionDate: '2030-06-01', createdAt: '2029-11-01',
    })
    const onDate = parseGameDate('2030-03-01')
    expect([...facilitiesUnderDevelopmentAt([expansion, renovation], onDate)].sort()).toEqual(['facility:expansion', 'facility:renovation'])
    expect(facilitiesUnderRenovationAt([expansion, renovation], onDate)).toEqual(['facility:renovation'])
  })

  it('26. a maintenance need unrelated to a project remains open after the project is created (world stored, not yet completed)', () => {
    const f = fixture()
    const unrelatedNeed = createFacilityMaintenanceNeed({ id: 'need:unrelated', facilityId: f.facility.id, detectedAt: '2030-01-01', type: 'STRUCTURAL', severity: 'MODERATE', status: 'OPEN', source: 'roof-leak' })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [unrelatedNeed] })
    expect(world.facilityMaintenanceNeedsById[unrelatedNeed.id]!.status).toBe('OPEN')
  })

  it('rejects a project scope referencing a component from a different Facility', () => {
    const f = fixture()
    const otherPlace = createPlace({ id: 'place:dev-other', kind: 'CITY', name: 'Other City' })
    const otherFacility = createFacility({ id: 'facility:dev-other', placeId: otherPlace.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Other Arena' })
    const otherCourt = createFacilityComponent({ id: 'component:dev-other-court', facilityId: otherFacility.id, type: 'MAIN_COURT', status: 'ACTIVE' })
    const project = createFacilityDevelopmentProject({
      id: 'project:cross-facility',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'FACILITY_RENOVATION',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: otherCourt.id, resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    expect(() => updateGameWorld(f.world, {
      places: [otherPlace],
      facilities: [otherFacility],
      facilityComponents: [otherCourt],
      facilityDevelopmentProjects: [project],
    })).toThrow(GameWorldValidationError)
  })

  it('rejects a project scope renovating a component that does not exist', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:missing-component',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'FACILITY_RENOVATION',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: 'component:does-not-exist', resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    expect(() => updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })).toThrow(GameWorldValidationError)
  })

  it('rejects duplicate project IDs', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:dup',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'FACILITY_RENOVATION',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    expect(() => updateGameWorld(f.world, { facilityDevelopmentProjects: [project, project] })).toThrow(GameWorldValidationError)
  })

  it('rejects a project referencing an unknown Organization', () => {
    const f = fixture()
    const project = createFacilityDevelopmentProject({
      id: 'project:bad-org',
      organizationId: 'organization:does-not-exist',
      facilityId: f.facility.id,
      projectType: 'FACILITY_RENOVATION',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    expect(() => updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })).toThrow(GameWorldValidationError)
  })
})
