import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam, advanceDayWithTrace } from '@/engine/calendar'
import { addDays, parseGameDate } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { createPlace, createFacility, createFacilityComponent, createFacilityComponentConditionRecord, createFacilityDevelopmentProject, createFacilityDevelopmentProjectPhase, createFacilityMaintenanceAction, createFacilityUsageRight, componentConditionAt, resolveFacilityStatusAt, activeFacilityComponentsAt } from '@/domain/facilities'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { advanceFacilitiesConditionFromHistory, applyFacilityMaintenanceAction, conditionAfterElapsedPeriod } from './FacilityDeteriorationEngine'
import { startFacilityDevelopmentProject, completeFacilityDevelopmentProject, pauseFacilityDevelopmentProject, resumeFacilityDevelopmentProject, cancelFacilityDevelopmentProject } from './FacilityDevelopmentEngine'
import { componentPhysicalAvailabilityAt, projectPhysicalBlocker } from './FacilityPhysicalOperations'
import { sportingFacilityContextForTeamAt } from '@/integration/facilitiesSporting'
import { completeClubFacilityProject } from '@/app/facilities'

function fixture() {
  const base = createNewGame()
  const team = getUserTeam(base)!
  const date = base.currentDate
  const place = createPlace({ id: 'bs17c:place', kind: 'CAMPUS', name: 'Physical fixture campus' })
  const facility = createFacility({ id: 'bs17c:facility', placeId: place.id, type: 'TRAINING_CENTER', canonicalName: 'Physical fixture center', purposes: ['TRAINING'], status: 'ACTIVE' })
  const courts = [0, 1].map((i) => createFacilityComponent({ id: `bs17c:court:${i}`, facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE', openedAt: date, specification: { kind: 'CAPACITY', unit: 'SIMULTANEOUS_PLAYERS', amount: 12 } }))
  const records = courts.map((c) => createFacilityComponentConditionRecord({ id: `bs17c:condition:${c.id}`, componentId: c.id, effectiveFrom: date, physicalCondition: 90, serviceability: 'FULL' }))
  const right = createFacilityUsageRight({ id: 'bs17c:right', teamId: team.id, facilityId: facility.id, purpose: 'HOME_VENUE', exclusivity: 'SHARED', validFrom: date, validTo: addDays(date, 100) })
  const world = updateGameWorld(base, { places: [...Object.values(base.placesById), place], facilities: [facility], facilityComponents: courts, facilityComponentConditionRecords: records, facilityUsageRights: [right] })
  const project = (id: string, scope: Parameters<typeof createFacilityDevelopmentProject>[0]['scope'], projectType: Parameters<typeof createFacilityDevelopmentProject>[0]['projectType'] = 'RECONFIGURATION') => createFacilityDevelopmentProject({ id, organizationId: team.organizationId, facilityId: facility.id, projectType, createdAt: date, plannedStartDate: date, plannedCompletionDate: addDays(date, 10), scope })
  return { base, world, team, date, facility, courts, project }
}
function reload(world: ReturnType<typeof createNewGame>) { return deserializeGameWorldV4(serializeGameWorldV4(world, '2026-10-09T12:00:00.000Z')) }

describe('BS17C physical operations', () => {
  it('preserves fractional wear across monthly partitions and reload without changing coefficients', () => {
    const f = fixture()
    const end = addDays(f.date, 90)
    let monthly = f.world
    for (const days of [30, 60, 90]) monthly = reload(advanceFacilitiesConditionFromHistory(monthly, addDays(f.date, days)).world)
    const interval = advanceFacilitiesConditionFromHistory(f.world, end).world
    const condition = (w: typeof f.world) => componentConditionAt(Object.values(w.facilityComponentConditionRecordsById), f.courts[0]!.id, end)!.physicalCondition!
    expect(condition(monthly)).toBeCloseTo(condition(interval), 12)
    expect(conditionAfterElapsedPeriod(null, f.courts[0]!, f.date, end)).toBeNull()
    expect(advanceFacilitiesConditionFromHistory(monthly, end).world).toBe(monthly)
  })

  it('orders wear and multiple same-day repairs, preserves history and makes retry a no-op after reload', () => {
    const f = fixture()
    const date = addDays(f.date, 30)
    const worn = advanceFacilitiesConditionFromHistory(f.world, date).world
    const actions = [80, 85].map((value, i) => createFacilityMaintenanceAction({ id: `bs17c:repair:${i}`, facilityId: f.facility.id, componentId: f.courts[0]!.id, type: 'REPAIR', startedAt: date, completedAt: date, outcome: 'SUCCESSFUL', resultingCondition: value }))
    let world = updateGameWorld(worn, { facilityMaintenanceActions: actions })
    for (const action of actions) world = applyFacilityMaintenanceAction(world, action.id).world
    world = reload(world)
    expect(componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), f.courts[0]!.id, date)!.physicalCondition).toBe(85)
    expect(applyFacilityMaintenanceAction(world, actions[0]!.id).world).toBe(world)
    expect(advanceFacilitiesConditionFromHistory(world, date).world).toBe(world)
    expect(advanceFacilitiesConditionFromHistory(world, addDays(date, 30)).world.facilityComponentConditionRecordsById).toBeDefined()
  })

  it('replaces multiple components with unique identities and preserves retired history', () => {
    const f = fixture()
    const p = f.project('bs17c:replace', { kind: 'RECONFIGURE_FACILITY', additions: [], renovations: [], removals: [], replacements: f.courts.map((c) => ({ retiredComponentId: c.id, replacement: { type: 'PRACTICE_COURT' }, resultingCondition: 42 })) })
    const started = startFacilityDevelopmentProject(updateGameWorld(f.world, { facilityDevelopmentProjects: [p] }), p.id, f.date).world
    const date = addDays(f.date, 1)
    const completed = completeFacilityDevelopmentProject(started, p.id, date)
    expect(new Set(completed.outcome.createdComponentIds).size).toBe(2)
    expect(completed.outcome.retiredComponentIds).toEqual(f.courts.map((c) => c.id))
    expect(activeFacilityComponentsAt(Object.values(completed.world.facilityComponentsById), f.facility.id, f.date).map((c) => c.id)).toEqual(f.courts.map((c) => c.id))
    expect(activeFacilityComponentsAt(Object.values(completed.world.facilityComponentsById), f.facility.id, date)).toHaveLength(2)
    expect(reload(completed.world).facilityComponentsById).toEqual(completed.world.facilityComponentsById)
    expect(() => completeFacilityDevelopmentProject(completed.world, p.id, date)).toThrow()
  })

  it('allows disjoint concurrent works and restores prior lifecycle only after the last cancellation, including same-day history', () => {
    const f = fixture()
    const projects = f.courts.map((c, i) => f.project(`bs17c:concurrent:${i}`, { kind: 'RECONFIGURE_FACILITY', additions: [], replacements: [], removals: [], renovations: [{ componentId: c.id, resultingCondition: 80 }] }))
    let world = updateGameWorld(f.world, { facilityDevelopmentProjects: projects })
    for (const p of projects) world = startFacilityDevelopmentProject(world, p.id, f.date).world
    world = pauseFacilityDevelopmentProject(world, projects[0]!.id).world
    world = resumeFacilityDevelopmentProject(world, projects[0]!.id).world
    world = cancelFacilityDevelopmentProject(world, projects[0]!.id, f.date).world
    expect(world.facilitiesById[f.facility.id]!.status).toBe('UNDER_RENOVATION')
    world = cancelFacilityDevelopmentProject(world, projects[1]!.id, f.date).world
    expect(world.facilitiesById[f.facility.id]!.status).toBe('ACTIVE')
    expect(resolveFacilityStatusAt(Object.values(reload(world).facilityStatusRecordsById), f.facility.id, f.date, 'UNKNOWN')).toBe('ACTIVE')
    expect(world.players).toEqual(f.world.players)
    expect(world.financialTransactionsById).toEqual(f.world.financialTransactionsById)
  })

  it('blocks overlapping active or paused scopes and leaves unrelated courts available under shared temporal rights', () => {
    const f = fixture()
    const p = f.project('bs17c:work', { kind: 'RENOVATE_COMPONENT', componentId: f.courts[0]!.id, resultingCondition: 80 }, 'COMPONENT_RENOVATION')
    const q = f.project('bs17c:conflict', { kind: 'REMOVE_COMPONENT', componentId: f.courts[0]!.id }, 'COMPONENT_REMOVAL')
    let world = startFacilityDevelopmentProject(updateGameWorld(f.world, { facilityDevelopmentProjects: [p, q] }), p.id, f.date).world
    world = pauseFacilityDevelopmentProject(world, p.id).world
    expect(projectPhysicalBlocker(world, q, 'START', f.date)).toBe('PHYSICAL_WORK_CONFLICT')
    expect(() => startFacilityDevelopmentProject(world, q.id, f.date)).toThrow(/PHYSICAL_WORK_CONFLICT/)
    expect(componentPhysicalAvailabilityAt(world, f.courts[0]!.id, f.date, f.team.id).status).toBe('OUT_OF_SERVICE')
    expect(componentPhysicalAvailabilityAt(world, f.courts[1]!.id, f.date, f.team.id)).toMatchObject({ status: 'AVAILABLE', capacityUnit: 'SIMULTANEOUS_PLAYERS', nominalCapacity: 12, operationalCapacity: null })
    expect(componentPhysicalAvailabilityAt(world, f.courts[1]!.id, addDays(f.date, 101), f.team.id)).toMatchObject({ access: false, operationalCapacity: null })
    const context = sportingFacilityContextForTeamAt(world, f.team.id, f.date)
    expect(context.basketball.usablePracticeCourtCount).toBe(1)
    expect(context.basketball.courts.find((c) => c.componentId === f.courts[0]!.id)!.serviceability).toBe('OUT_OF_SERVICE')
  })

  it('blocks premature completion of recorded phases, pauses them and never advances a planned duration automatically', () => {
    const f = fixture()
    const p = f.project('bs17c:phased', { kind: 'RENOVATE_COMPONENT', componentId: f.courts[0]!.id, resultingCondition: 80 }, 'COMPONENT_RENOVATION')
    const phase = createFacilityDevelopmentProjectPhase({ id: 'bs17c:phase', projectId: p.id, sequence: 1, plannedStart: f.date, plannedCompletion: addDays(f.date, 1), status: 'IN_PROGRESS', actualStart: f.date })
    let world = startFacilityDevelopmentProject(updateGameWorld(f.world, { facilityDevelopmentProjects: [p], facilityDevelopmentProjectPhases: [phase] }), p.id, f.date).world
    expect(() => completeFacilityDevelopmentProject(world, p.id, addDays(f.date, 2))).toThrow(/PHYSICAL_PHASES_INCOMPLETE/)
    expect(completeClubFacilityProject(world, { teamId: f.team.id, projectId: p.id }).reasons).toEqual(['PHYSICAL_PHASES_INCOMPLETE'])
    world = pauseFacilityDevelopmentProject(world, p.id).world
    expect(world.facilityDevelopmentProjectPhasesById[phase.id]!.status).toBe('PAUSED')
    world = reload(world)
    const traced = advanceDayWithTrace(world)
    expect(traced.world.facilityDevelopmentProjectsById[p.id]!.status).toBe('PAUSED')
    expect(traced.world.facilityDevelopmentProjectPhasesById[phase.id]).toEqual(world.facilityDevelopmentProjectPhasesById[phase.id])
  })

  it('does not turn unknown condition, nominal capacity or CFI4 defaults into operational proof', () => {
    const f = fixture()
    const unknown = updateGameWorld(f.world, { facilityComponentConditionRecords: [] })
    expect(componentPhysicalAvailabilityAt(unknown, f.courts[0]!.id, f.date)).toMatchObject({ status: 'UNKNOWN', nominalCapacity: 12, operationalCapacity: null })
    expect(advanceFacilitiesConditionFromHistory(unknown, addDays(f.date, 90)).world).toBe(unknown)
    const limited = updateGameWorld(f.world, { facilityComponentConditionRecords: [createFacilityComponentConditionRecord({ id: 'limited', componentId: f.courts[0]!.id, effectiveFrom: f.date, physicalCondition: 40, serviceability: 'LIMITED' })] })
    expect(componentPhysicalAvailabilityAt(limited, f.courts[0]!.id, f.date)).toMatchObject({ status: 'LIMITED', operationalCapacity: null })
  })

  it('opens a need once, repairs before a same-day wear retry and keeps lower condition serviceability honest', () => {
    const f = fixture()
    const initial = createFacilityComponentConditionRecord({ id: 'threshold', componentId: f.courts[0]!.id, effectiveFrom: f.date, physicalCondition: 61, serviceability: 'FULL' })
    const date = addDays(f.date, 30)
    const worn = advanceFacilitiesConditionFromHistory(updateGameWorld(f.world, { facilityComponentConditionRecords: [initial] }), date)
    expect(worn.openedNeeds).toHaveLength(1)
    expect(advanceFacilitiesConditionFromHistory(worn.world, addDays(date, 30)).openedNeeds).toEqual([])
    const action = createFacilityMaintenanceAction({ id: 'threshold:repair', needId: worn.openedNeeds[0]!.id, facilityId: f.facility.id, componentId: f.courts[0]!.id, type: 'REPAIR', startedAt: date, completedAt: date, outcome: 'SUCCESSFUL', resultingCondition: 40 })
    const repaired = applyFacilityMaintenanceAction(updateGameWorld(worn.world, { facilityMaintenanceActions: [action] }), action.id)
    expect(repaired.needClosed).toBe(true)
    expect(componentConditionAt(Object.values(repaired.world.facilityComponentConditionRecordsById), f.courts[0]!.id, date)!.serviceability).toBe('LIMITED')
    expect(advanceFacilitiesConditionFromHistory(reload(repaired.world), date).openedNeeds).toEqual([])
  })

  it('rejects a superseded same-day observation that could resurrect after its successor expires', () => {
    const f = fixture()
    const records = [
      createFacilityComponentConditionRecord({ id: 'old-open', componentId: f.courts[0]!.id, effectiveFrom: f.date, sequence: 0, serviceability: 'FULL', physicalCondition: 90 }),
      createFacilityComponentConditionRecord({ id: 'new-closed', componentId: f.courts[0]!.id, effectiveFrom: f.date, effectiveTo: f.date, sequence: 1, serviceability: 'FULL', physicalCondition: 80 }),
    ]
    expect(() => updateGameWorld(f.world, { facilityComponentConditionRecords: records })).toThrow(/overlapping/)
  })

  it('records explicit same-day completion without ID collision but cannot infer completion from planned dates', () => {
    const f = fixture()
    const p = createFacilityDevelopmentProject({ id: 'bs17c:new', organizationId: f.team.organizationId, projectType: 'NEW_FACILITY', createdAt: f.date, plannedStartDate: f.date, plannedCompletionDate: addDays(f.date, 50), scope: { kind: 'CREATE_FACILITY', placeId: 'bs17c:place', facilityType: 'MEDICAL_CENTER', canonicalName: 'Commanded medical facility', purposes: ['MEDICAL_TREATMENT'], initialComponents: [{ type: 'MEDICAL_ROOM' }] } })
    const started = startFacilityDevelopmentProject(updateGameWorld(f.world, { facilityDevelopmentProjects: [p] }), p.id, f.date).world
    const completed = completeFacilityDevelopmentProject(started, p.id, f.date).world
    const id = completed.facilityDevelopmentProjectsById[p.id]!.facilityId!
    const loaded = reload(completed)
    expect(resolveFacilityStatusAt(Object.values(loaded.facilityStatusRecordsById), id, f.date, 'UNKNOWN')).toBe('ACTIVE')
    expect(loaded.facilitiesById[id]!.physical.openedOn).toBeNull()
    expect(loaded.facilityUsageRightsById).toEqual(f.world.facilityUsageRightsById)
  })
})
