import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import {
  createFacility,
  createFacilityComponent,
  createFacilityDevelopmentProject,
  createFacilityDevelopmentProjectPhase,
  createPlace,
} from '@/domain/facilities'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2035-01-01T00:00:00.000Z'

/**
 * CFI6 introduces two new normalized GameWorld collections (`facilityDevelopmentProjectsById`,
 * `facilityDevelopmentProjectPhasesById`). This file adds only the persistence tests those two new
 * collections need, following the exact CFI2S/CFI4/CFI5 Save V4 pattern (per-collection parser with
 * `exactKeys`, canonical factory reconstruction via `createFacilityDevelopmentProjectScope` for the
 * project's own scope field, `hasOwnProperty`-gated backward compatibility) — every prior Facilities
 * collection's round-trip is already covered elsewhere and is unaffected. Deliberately NOT
 * persisted: `FacilityDevelopmentOutcome` (a command return value, never world truth).
 */
describe('GameWorldSaveV4 — Construction, Renovation & Development Projects (CFI6) persistence', () => {
  it('round-trips a NEW_FACILITY project with a CREATE_FACILITY scope and no facilityId yet', () => {
    const base = createNewGame()
    const organization = Object.values(base.organizationsById)[0]!
    const place = createPlace({ id: 'place:dev-save-1', kind: 'CAMPUS', name: 'Dev Save Campus 1' })
    const project = createFacilityDevelopmentProject({
      id: 'project:save-new-facility',
      organizationId: organization.id,
      projectType: 'NEW_FACILITY',
      scope: { kind: 'CREATE_FACILITY', placeId: place.id, facilityType: 'TRAINING_CENTER', canonicalName: 'Saved New Center', initialComponents: [{ type: 'PRACTICE_COURT' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-12-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(base, { places: [place], facilityDevelopmentProjects: [project] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityDevelopmentProjectsById).toEqual(world.facilityDevelopmentProjectsById)
    expect(restored.facilityDevelopmentProjectsById[project.id]!.facilityId).toBeNull()
    expect(restored.facilityDevelopmentProjectsById[project.id]!.scope.kind).toBe('CREATE_FACILITY')
  })

  it('round-trips a RENOVATE_COMPONENT scope with an explicit resultingCondition and updatedTechnicalStandard', () => {
    const base = createNewGame()
    const organization = Object.values(base.organizationsById)[0]!
    const place = createPlace({ id: 'place:dev-save-2', kind: 'CAMPUS', name: 'Dev Save Campus 2' })
    const facility = createFacility({ id: 'facility:dev-save-2', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Dev Save Center 2' })
    const court = createFacilityComponent({ id: 'component:dev-save-2', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const project = createFacilityDevelopmentProject({
      id: 'project:save-renovate',
      organizationId: organization.id,
      facilityId: facility.id,
      projectType: 'COMPONENT_RENOVATION',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: court.id, resultingCondition: 85, updatedTechnicalStandard: 'ADVANCED' },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-03-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [court], facilityDevelopmentProjects: [project] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    const restoredScope = restored.facilityDevelopmentProjectsById[project.id]!.scope
    expect(restoredScope.kind).toBe('RENOVATE_COMPONENT')
    if (restoredScope.kind === 'RENOVATE_COMPONENT') {
      expect(restoredScope.resultingCondition).toBe(85)
      expect(restoredScope.updatedTechnicalStandard).toBe('ADVANCED')
    }
  })

  it('round-trips a RECONFIGURE_FACILITY scope bundling additions, renovations, replacements and removals', () => {
    const base = createNewGame()
    const organization = Object.values(base.organizationsById)[0]!
    const place = createPlace({ id: 'place:dev-save-3', kind: 'CAMPUS', name: 'Dev Save Campus 3' })
    const facility = createFacility({ id: 'facility:dev-save-3', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Dev Save Center 3' })
    const court = createFacilityComponent({ id: 'component:dev-save-3-court', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const strengthRoom = createFacilityComponent({ id: 'component:dev-save-3-strength', facilityId: facility.id, type: 'STRENGTH_ROOM', status: 'ACTIVE' })
    const project = createFacilityDevelopmentProject({
      id: 'project:save-reconfigure',
      organizationId: organization.id,
      facilityId: facility.id,
      projectType: 'RECONFIGURATION',
      scope: {
        kind: 'RECONFIGURE_FACILITY',
        additions: [{ type: 'HYDROTHERAPY_POOL' }],
        renovations: [{ componentId: court.id, resultingCondition: 90 }],
        replacements: [{ retiredComponentId: strengthRoom.id, replacement: { type: 'STRENGTH_ROOM' }, resultingCondition: 100 }],
        removals: [],
      },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2031-01-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [court, strengthRoom], facilityDevelopmentProjects: [project] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    const restoredScope = restored.facilityDevelopmentProjectsById[project.id]!.scope
    expect(restoredScope.kind).toBe('RECONFIGURE_FACILITY')
    if (restoredScope.kind === 'RECONFIGURE_FACILITY') {
      expect(restoredScope.additions).toHaveLength(1)
      expect(restoredScope.renovations).toHaveLength(1)
      expect(restoredScope.replacements).toHaveLength(1)
    }
  })

  it('round-trips a project with a sequence of phases', () => {
    const base = createNewGame()
    const organization = Object.values(base.organizationsById)[0]!
    const place = createPlace({ id: 'place:dev-save-4', kind: 'CAMPUS', name: 'Dev Save Campus 4' })
    const facility = createFacility({ id: 'facility:dev-save-4', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Dev Save Center 4' })
    const project = createFacilityDevelopmentProject({
      id: 'project:save-phases',
      organizationId: organization.id,
      facilityId: facility.id,
      projectType: 'FACILITY_EXPANSION',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2031-01-01',
      createdAt: '2029-11-01',
    })
    const phase1 = createFacilityDevelopmentProjectPhase({ id: 'phase:save-1', projectId: project.id, sequence: 1, name: 'Construction', plannedStart: '2030-01-01', plannedCompletion: '2030-08-01' })
    const phase2 = createFacilityDevelopmentProjectPhase({ id: 'phase:save-2', projectId: project.id, sequence: 2, name: 'Commissioning', plannedStart: '2030-08-01', plannedCompletion: '2031-01-01' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityDevelopmentProjects: [project], facilityDevelopmentProjectPhases: [phase1, phase2] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityDevelopmentProjectPhasesById).toEqual(world.facilityDevelopmentProjectPhasesById)
    expect(Object.keys(restored.facilityDevelopmentProjectPhasesById)).toHaveLength(2)
  })

  it('round-trips a CANCELLED project preserving its cancelledAt date', () => {
    const base = createNewGame()
    const organization = Object.values(base.organizationsById)[0]!
    const place = createPlace({ id: 'place:dev-save-5', kind: 'CAMPUS', name: 'Dev Save Campus 5' })
    const facility = createFacility({ id: 'facility:dev-save-5', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Dev Save Center 5' })
    const project = createFacilityDevelopmentProject({
      id: 'project:save-cancelled',
      organizationId: organization.id,
      facilityId: facility.id,
      projectType: 'FACILITY_EXPANSION',
      status: 'CANCELLED',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2031-01-01',
      createdAt: '2029-11-01',
      cancelledAt: '2029-12-01',
    })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityDevelopmentProjects: [project] })

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.facilityDevelopmentProjectsById[project.id]!.status).toBe('CANCELLED')
    expect(restored.facilityDevelopmentProjectsById[project.id]!.cancelledAt).toBe('2029-12-01')
  })

  it('CFI6a: round-trips facilityLifecyclePriorStatus and the resulting UNDER_RENOVATION status-history record', async () => {
    const { startFacilityDevelopmentProject } = await import('@/engine/facilities')
    const { parseGameDate } = await import('@/domain/date')
    const base = createNewGame()
    const organization = Object.values(base.organizationsById)[0]!
    const place = createPlace({ id: 'place:dev-save-8', kind: 'CAMPUS', name: 'Dev Save Campus 8' })
    const facility = createFacility({ id: 'facility:dev-save-8', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Dev Save Center 8' })
    const project = createFacilityDevelopmentProject({
      id: 'project:save-lifecycle-restoration',
      organizationId: organization.id,
      facilityId: facility.id,
      projectType: 'RECONFIGURATION',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(started.world, savedAt))))
    expect(restored.facilityDevelopmentProjectsById[project.id]!.facilityLifecyclePriorStatus).toBe('ACTIVE')
    expect(restored.facilitiesById[facility.id]!.status).toBe('UNDER_RENOVATION')
    const statusRecords = Object.values(restored.facilityStatusRecordsById).filter((record) => record.facilityId === facility.id)
    expect(statusRecords.some((record) => record.status === 'UNDER_RENOVATION')).toBe(true)
  })

  it('a pre-CFI6a payload (project missing facilityLifecyclePriorStatus entirely) still loads, defaulting it to null', () => {
    const base = createNewGame()
    const organization = Object.values(base.organizationsById)[0]!
    const place = createPlace({ id: 'place:dev-save-9', kind: 'CAMPUS', name: 'Dev Save Campus 9' })
    const facility = createFacility({ id: 'facility:dev-save-9', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Dev Save Center 9' })
    const project = createFacilityDevelopmentProject({
      id: 'project:pre-cfi6a',
      organizationId: organization.id,
      facilityId: facility.id,
      projectType: 'FACILITY_EXPANSION',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2031-01-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityDevelopmentProjects: [project] })
    const saved = serializeGameWorldV4(world, savedAt)

    // Simulate a genuinely pre-CFI6a payload: strip the new field from the serialized project.
    const legacyPayload = JSON.parse(JSON.stringify(saved)) as { schemaVersion: 4; savedAt: string; payload: { facilityDevelopmentProjects: Record<string, unknown>[] } & Record<string, unknown> }
    legacyPayload.payload.facilityDevelopmentProjects = legacyPayload.payload.facilityDevelopmentProjects.map((entry) => {
      const { facilityLifecyclePriorStatus: _omit, ...rest } = entry
      return rest
    })

    const restored = deserializeGameWorldV4(legacyPayload)
    expect(restored.facilityDevelopmentProjectsById[project.id]!.facilityLifecyclePriorStatus).toBeNull()
  })

  it('a pre-CFI6 V4 payload (missing both new collections entirely) still loads with empty, valid defaults', () => {
    const base = createNewGame()
    const place = createPlace({ id: 'place:dev-save-6', kind: 'CITY', name: 'Dev Save City 6' })
    const facility = createFacility({ id: 'facility:dev-save-6', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Dev Save Arena 6' })
    const world = updateGameWorld(base, { places: [place], facilities: [facility] })
    const saved = serializeGameWorldV4(world, savedAt)

    // Simulate a genuinely pre-CFI6 payload: strip the two new collections entirely.
    const legacyPayload = { ...saved, payload: { ...saved.payload } } as { schemaVersion: 4; savedAt: string; payload: Record<string, unknown> }
    delete legacyPayload.payload.facilityDevelopmentProjects
    delete legacyPayload.payload.facilityDevelopmentProjectPhases

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(legacyPayload)))
    expect(restored.facilityDevelopmentProjectsById).toEqual({})
    expect(restored.facilityDevelopmentProjectPhasesById).toEqual({})
    // Backward compatibility does NOT fabricate historical projects for the pre-existing Facility.
    expect(Object.keys(restored.facilityDevelopmentProjectsById)).toHaveLength(0)
  })

  it('project queries behave identically before and after a reload', async () => {
    const base = createNewGame()
    const organization = Object.values(base.organizationsById)[0]!
    const place = createPlace({ id: 'place:dev-save-7', kind: 'CAMPUS', name: 'Dev Save Campus 7' })
    const facility = createFacility({ id: 'facility:dev-save-7', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Dev Save Center 7' })
    const project = createFacilityDevelopmentProject({
      id: 'project:save-reload-query',
      organizationId: organization.id,
      facilityId: facility.id,
      projectType: 'FACILITY_EXPANSION',
      status: 'IN_PROGRESS',
      scope: { kind: 'ADD_COMPONENT', components: [{ type: 'HYDROTHERAPY_POOL' }] },
      plannedStartDate: '2030-01-01',
      actualStartDate: '2030-01-01',
      plannedCompletionDate: '2031-01-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityDevelopmentProjects: [project] })
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))

    const { activeDevelopmentProjectsAt, developmentProjectsForFacility } = await import('@/domain/facilities')
    const { parseGameDate } = await import('@/domain/date')
    const onDate = parseGameDate('2030-06-01')
    expect(developmentProjectsForFacility(Object.values(restored.facilityDevelopmentProjectsById), facility.id)).toHaveLength(1)
    expect(activeDevelopmentProjectsAt(Object.values(restored.facilityDevelopmentProjectsById), onDate)).toHaveLength(1)
  })
})
