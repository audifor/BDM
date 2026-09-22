import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import {
  createFacility,
  createFacilityComponent,
  createFacilityDevelopmentProject,
  createPlace,
  facilityStatusAt,
} from '@/domain/facilities'
import { updateGameWorld } from '@/domain/world'
import {
  cancelFacilityDevelopmentProject,
  completeFacilityDevelopmentProject,
  startFacilityDevelopmentProject,
} from './FacilityDevelopmentEngine'

function fixture(initialStatus: 'ACTIVE' | 'TEMPORARILY_CLOSED' | 'PARTIALLY_CLOSED' = 'ACTIVE') {
  const world = createNewGame()
  const organization = Object.values(world.organizationsById)[0]!
  const place = createPlace({ id: 'place:lifecycle-fix-1', kind: 'CAMPUS', name: 'Lifecycle Fix Campus 1' })
  const facility = createFacility({ id: 'facility:lifecycle-fix-1', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: initialStatus, canonicalName: 'Lifecycle Fix Center 1' })
  const court = createFacilityComponent({ id: 'component:lifecycle-fix-court', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
  const base = updateGameWorld(world, { places: [place], facilities: [facility], facilityComponents: [court] })
  return { world: base, organization, place, facility, court }
}

describe('Club Facilities & Infrastructure V2 — CFI6a — Facility lifecycle restoration after project completion', () => {
  it('1. a facility-wide renovation (RECONFIGURE_FACILITY) transitions ACTIVE -> UNDER_RENOVATION on start and restores ACTIVE on completion', () => {
    const f = fixture('ACTIVE')
    const project = createFacilityDevelopmentProject({
      id: 'project:facility-wide-renovation',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'RECONFIGURATION',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })

    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    expect(started.world.facilitiesById[f.facility.id]!.status).toBe('UNDER_RENOVATION')
    expect(started.world.facilityDevelopmentProjectsById[project.id]!.facilityLifecyclePriorStatus).toBe('ACTIVE')

    const completed = completeFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-05-01'))
    expect(completed.world.facilitiesById[f.facility.id]!.status).toBe('ACTIVE')
  })

  it('1b. FACILITY_EXPANSION realized as a facility-wide RECONFIGURE_FACILITY scope also restores the correct prior status', () => {
    const f = fixture('ACTIVE')
    const project = createFacilityDevelopmentProject({
      id: 'project:expansion-facility-wide',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'FACILITY_EXPANSION',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    expect(started.world.facilitiesById[f.facility.id]!.status).toBe('UNDER_RENOVATION')
    const completed = completeFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-05-01'))
    expect(completed.world.facilitiesById[f.facility.id]!.status).toBe('ACTIVE')
  })

  it('1c. a facility that was TEMPORARILY_CLOSED before the renovation is restored to TEMPORARILY_CLOSED, never assumed ACTIVE', () => {
    const f = fixture('TEMPORARILY_CLOSED')
    const project = createFacilityDevelopmentProject({
      id: 'project:restore-non-active',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'RECONFIGURATION',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    expect(started.world.facilitiesById[f.facility.id]!.status).toBe('UNDER_RENOVATION')
    expect(started.world.facilityDevelopmentProjectsById[project.id]!.facilityLifecyclePriorStatus).toBe('TEMPORARILY_CLOSED')

    const completed = completeFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-05-01'))
    expect(completed.world.facilitiesById[f.facility.id]!.status).toBe('TEMPORARILY_CLOSED')
  })

  it('2. lifecycle history is preserved after completion: the UNDER_RENOVATION period still resolves at its own dates', () => {
    const f = fixture('ACTIVE')
    const project = createFacilityDevelopmentProject({
      id: 'project:history-preserved',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'RECONFIGURATION',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    const completed = completeFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-05-01'))

    const records = Object.values(completed.world.facilityStatusRecordsById)
    expect(facilityStatusAt(records, completed.world.facilitiesById[f.facility.id]!, parseGameDate('2029-12-01'))).toBe('ACTIVE')
    expect(facilityStatusAt(records, completed.world.facilitiesById[f.facility.id]!, parseGameDate('2030-03-01'))).toBe('UNDER_RENOVATION')
    expect(facilityStatusAt(records, completed.world.facilitiesById[f.facility.id]!, parseGameDate('2030-05-01'))).toBe('ACTIVE')
    // The original UNDER_RENOVATION record itself was never edited or removed.
    expect(records.some((record) => record.status === 'UNDER_RENOVATION' && record.effectiveFrom === '2030-01-01')).toBe(true)
  })

  it('3. a component-only renovation does not unnecessarily alter Facility lifecycle', () => {
    const f = fixture('ACTIVE')
    const project = createFacilityDevelopmentProject({
      id: 'project:component-only',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'COMPONENT_RENOVATION',
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 90 },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-02-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    expect(started.world.facilitiesById[f.facility.id]!.status).toBe('ACTIVE')
    expect(started.world.facilityDevelopmentProjectsById[project.id]!.facilityLifecyclePriorStatus).toBeNull()

    const completed = completeFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-01-20'))
    expect(completed.world.facilitiesById[f.facility.id]!.status).toBe('ACTIVE')
    // No spurious status record was written at all for a component-only project.
    const statusRecordsForFacility = Object.values(completed.world.facilityStatusRecordsById).filter((record) => record.facilityId === f.facility.id)
    expect(statusRecordsForFacility).toHaveLength(0)
  })

  it('4. new facility construction continues behaving correctly (PLANNED/UNDER_CONSTRUCTION -> ACTIVE, unaffected by the fix)', () => {
    const f = fixture('ACTIVE')
    const project = createFacilityDevelopmentProject({
      id: 'project:new-facility-unaffected',
      organizationId: f.organization.id,
      projectType: 'NEW_FACILITY',
      scope: { kind: 'CREATE_FACILITY', placeId: f.place.id, facilityType: 'TRAINING_CENTER', canonicalName: 'Brand New Center', initialComponents: [{ type: 'PRACTICE_COURT' }] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-12-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    const newFacilityId = started.world.facilityDevelopmentProjectsById[project.id]!.facilityId!
    expect(started.world.facilitiesById[newFacilityId]!.status).toBe('UNDER_CONSTRUCTION')
    // A brand-new facility has no "prior status" to restore — it never existed before.
    expect(started.world.facilityDevelopmentProjectsById[project.id]!.facilityLifecyclePriorStatus).toBeNull()

    const completed = completeFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-11-01'))
    expect(completed.world.facilitiesById[newFacilityId]!.status).toBe('ACTIVE')
  })

  it('5. demolition does not restore ACTIVE (or any prior status) after completion', () => {
    const f = fixture('ACTIVE')
    const project = createFacilityDevelopmentProject({
      id: 'project:demolition-no-restore',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'DEMOLITION',
      scope: { kind: 'DEMOLISH_FACILITY', facilityId: f.facility.id },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-03-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    expect(started.world.facilitiesById[f.facility.id]!.status).toBe('UNDER_RENOVATION')

    const completed = completeFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-02-15'))
    expect(completed.world.facilitiesById[f.facility.id]!.status).toBe('DEMOLISHED')
  })

  it('a CANCELLED facility-wide renovation restores the prior lifecycle rather than leaving the Facility stuck UNDER_RENOVATION', () => {
    const f = fixture('ACTIVE')
    const project = createFacilityDevelopmentProject({
      id: 'project:cancelled-renovation',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'RECONFIGURATION',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    expect(started.world.facilitiesById[f.facility.id]!.status).toBe('UNDER_RENOVATION')

    const cancelled = cancelFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-03-01'))
    expect(cancelled.world.facilitiesById[f.facility.id]!.status).toBe('ACTIVE')
    expect(cancelled.world.facilityDevelopmentProjectsById[project.id]!.status).toBe('CANCELLED')
  })

  it('a CANCELLED renovation of a facility that was PARTIALLY_CLOSED before it started restores PARTIALLY_CLOSED, not ACTIVE', () => {
    const f = fixture('PARTIALLY_CLOSED')
    const project = createFacilityDevelopmentProject({
      id: 'project:cancelled-partially-closed',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'RECONFIGURATION',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    const cancelled = cancelFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-03-01'))
    expect(cancelled.world.facilitiesById[f.facility.id]!.status).toBe('PARTIALLY_CLOSED')
  })

  it('a project cancelled before it ever started leaves the Facility completely untouched', () => {
    const f = fixture('ACTIVE')
    const project = createFacilityDevelopmentProject({
      id: 'project:cancelled-before-start',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'RECONFIGURATION',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const cancelled = cancelFacilityDevelopmentProject(world, project.id, parseGameDate('2029-12-01'))
    expect(cancelled.world.facilitiesById[f.facility.id]!.status).toBe('ACTIVE')
    const statusRecordsForFacility = Object.values(cancelled.world.facilityStatusRecordsById).filter((record) => record.facilityId === f.facility.id)
    expect(statusRecordsForFacility).toHaveLength(0)
  })

  it('6. repeated completion remains idempotent: a second completion attempt is rejected, and lifecycle is restored exactly once', () => {
    const f = fixture('ACTIVE')
    const project = createFacilityDevelopmentProject({
      id: 'project:idempotent-lifecycle',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'RECONFIGURATION',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    const completed = completeFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-05-01'))
    expect(completed.world.facilitiesById[f.facility.id]!.status).toBe('ACTIVE')

    expect(() => completeFacilityDevelopmentProject(completed.world, project.id, parseGameDate('2030-05-02'))).toThrow(RangeError)
    // Exactly one ACTIVE-restoration status record exists, not two.
    const activeRestorationRecords = Object.values(completed.world.facilityStatusRecordsById).filter(
      (record) => record.facilityId === f.facility.id && record.status === 'ACTIVE' && record.effectiveFrom === '2030-05-01',
    )
    expect(activeRestorationRecords).toHaveLength(1)
  })

  it('7. the lifecycle resolver returns the correct status before, during and after a facility-wide renovation', () => {
    const f = fixture('ACTIVE')
    const project = createFacilityDevelopmentProject({
      id: 'project:resolver-check',
      organizationId: f.organization.id,
      facilityId: f.facility.id,
      projectType: 'RECONFIGURATION',
      scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
      plannedStartDate: '2030-01-01',
      plannedCompletionDate: '2030-06-01',
      createdAt: '2029-11-01',
    })
    const world = updateGameWorld(f.world, { facilityDevelopmentProjects: [project] })
    const started = startFacilityDevelopmentProject(world, project.id, parseGameDate('2030-01-01'))
    const completed = completeFacilityDevelopmentProject(started.world, project.id, parseGameDate('2030-05-01'))
    const records = Object.values(completed.world.facilityStatusRecordsById)
    const facility = completed.world.facilitiesById[f.facility.id]!

    expect(facilityStatusAt(records, facility, parseGameDate('2029-06-01'))).toBe('ACTIVE')
    expect(facilityStatusAt(records, facility, parseGameDate('2030-02-15'))).toBe('UNDER_RENOVATION')
    expect(facilityStatusAt(records, facility, parseGameDate('2030-12-01'))).toBe('ACTIVE')
  })
})
