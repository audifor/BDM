import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { createFacilityComponent, createFacilityComponentConditionRecord, createFacilityUsageRight, createFacilityDevelopmentProject } from '@/domain/facilities'
import { createScheduledTrainingSession } from '@/domain/training'
import { updateGameWorld } from '@/domain/world'
import { acceptedYouthTrainingFixture } from '@/app/youth/testFixtures'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { buildFacilityCapacityContext } from './FacilityCapacityReadModel'
import { executeScheduledTrainingSessions } from '@/engine/training/ScheduledTrainingEngine'

const save = (world: ReturnType<typeof acceptedYouthTrainingFixture>['world']) => serializeGameWorldV4(world, '2032-10-01T00:00:00.000Z')
function shared(startTime = '10:30', durationMinutes = 60) {
  const f = acceptedYouthTrainingFixture()
  const right = createFacilityUsageRight({ ...f.teamRight, id: 'capacity:senior-right', teamId: f.senior.id, priority: 'SECONDARY' })
  const session = createScheduledTrainingSession({ id: 'capacity:senior-session', teamId: f.senior.id, date: f.date,
    startTime, durationMinutes, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
  const world = updateGameWorld(f.world, { facilityUsageRights: [...Object.values(f.world.facilityUsageRightsById), right],
    scheduledTrainingSessionsById: { ...f.world.scheduledTrainingSessionsById, [session.id]: session } })
  return { ...f, world, right, session }
}
describe('BS17D-C factual capacity context without an allocation policy', () => {
  it.each(['SIMULTANEOUS_PLAYERS', 'SEATS'] as const)('does not impose a nominal %s limit on the real Training owner', unit => {
    const f = shared()
    const run = (amount: number) => executeScheduledTrainingSessions(updateGameWorld(f.world, {
      currentDate: f.date, facilityComponents: [createFacilityComponent({ ...f.component, specification: { kind: 'CAPACITY', amount, unit } })],
    }))
    const small = run(1), large = run(80)
    // Worlds differ only in nominal capacity. No demand/allocation authority permits a new gate.
    const { facilityComponentsById: smallComponents, ...smallFacts } = small
    const { facilityComponentsById: largeComponents, ...largeFacts } = large
    expect(smallComponents).not.toEqual(largeComponents)
    // Existing P0 attempts retain nominal evidence; sporting/financial world authorities agree.
    const attempts = (world: typeof small) => Object.fromEntries(Object.entries(world.scheduledTrainingSessionsById)
      .map(([id, { physicalAttempt: _physical, ...session }]) => [id, session]))
    expect({ ...smallFacts, scheduledTrainingSessionsById: attempts(small) }).toEqual({ ...largeFacts, scheduledTrainingSessionsById: attempts(large) })
    expect(small.scheduledTrainingSessionsById['t:training']?.status).toBe('completed')
    expect(executeScheduledTrainingSessions(small)).toEqual(small)
  })
  it.each(['SIMULTANEOUS_PLAYERS', 'SEATS'] as const)('preserves nominal %s without treating roster size as comparable operational demand', unit => {
    const f = shared()
    const component = createFacilityComponent({ ...f.component, name: 'Recorded component name', specification: { kind: 'CAPACITY', amount: 8, unit } })
    const world = updateGameWorld(f.world, { facilityComponents: [component] })
    const context = buildFacilityCapacityContext(world, f.youth.id)
    expect(context.components[0]).toMatchObject({ name: 'Recorded component name', nominalCapacity: 8, capacityUnit: unit, operationalCapacity: null })
    expect(context.sessions.every(session => session.simultaneousDemand === null && session.demandUnit === null && session.assignedComponentId === null)).toBe(true)
    expect(context.allocationStatus).toBe('AVAILABLE_VIA_TRAINING_OWNER')
  })
  it('keeps missing capacity unknown and uses the approved explicit individual assignment as one participant', () => {
    const f = shared()
    const world = updateGameWorld(f.world, { scheduledTrainingSessionsById: { [f.session.id]: createScheduledTrainingSession({
      ...f.session, scope: 'individual', playerId: f.playerId, teamId: f.youth.id,
    }) } })
    const context = buildFacilityCapacityContext(world, f.youth.id)
    expect(context.status).toBe('UNVERIFIED_PHYSICAL_CONTEXT')
    expect(context.components[0]).toMatchObject({ nominalCapacity: null, capacityUnit: null, operationalCapacity: null })
    expect(context.sessions[0]).toMatchObject({ targetPlayerId: f.playerId, simultaneousDemand: 1 })
  })
  it.each([['10:30', 1], ['11:00', 0], ['14:00', 0]] as const)('shows timetable evidence at %s without allocating a winner', (time, count) => {
    const f = shared(time)
    const context = buildFacilityCapacityContext(f.world, f.youth.id)
    expect(context.overlaps).toHaveLength(count)
    if (count > 0) expect(context.overlaps[0]?.entitledComponentIds).toEqual([f.component.id])
    expect(context.sessions.every(session => session.assignedComponentId === null)).toBe(true)
  })
  it('observes a real interval crossing midnight without changing either date', () => {
    const f = shared('00:15', 15)
    const world = updateGameWorld(f.world, { scheduledTrainingSessionsById: Object.fromEntries([
      createScheduledTrainingSession({ ...f.session, date: addDays(f.date, 1) }),
      createScheduledTrainingSession({ ...f.session, id: 'capacity:late', teamId: f.youth.id, startTime: '23:30', durationMinutes: 60 }),
    ].map(session => [session.id, session])) })
    const context = buildFacilityCapacityContext(world, f.youth.id)
    expect(context.overlaps).toHaveLength(1)
    expect(context.sessions.map(session => session.date)).toEqual([f.date, addDays(f.date, 1)])
  })
  it('removes shared-use evidence when Team rights expire, retaining the own-team agenda and no Organization inheritance', () => {
    const f = shared()
    const world = updateGameWorld(f.world, { facilityUsageRights: [f.organizationRight,
      createFacilityUsageRight({ ...f.teamRight, validTo: f.world.currentDate }),
      createFacilityUsageRight({ ...f.right, validTo: f.world.currentDate }),
    ] })
    const context = buildFacilityCapacityContext(world, f.youth.id, f.facility.id)
    expect(context.sessions.every(session => session.teamId === f.youth.id && session.entitledComponentIds.length === 0)).toBe(true)
    expect(context.overlaps).toEqual([])
  })
  it('does not equate disjoint component rights with access to the same resource', () => {
    const f = shared()
    const second = createFacilityComponent({ ...f.component, id: 'capacity:second-court' })
    const world = updateGameWorld(f.world, { facilityComponents: [f.component, second], facilityUsageRights: [
      createFacilityUsageRight({ ...f.teamRight, componentIds: [f.component.id] }),
      createFacilityUsageRight({ ...f.right, componentIds: [second.id] }),
    ] })
    expect(buildFacilityCapacityContext(world, f.youth.id, f.facility.id).overlaps).toEqual([])
  })
  it.each(['FULL', 'LIMITED', 'OUT_OF_SERVICE'] as const)('projects %s from canonical physical evidence without changing Training', serviceability => {
    const f = shared()
    const world = updateGameWorld(f.world, { facilityComponentConditionRecords: [
      createFacilityComponentConditionRecord({ ...Object.values(f.world.facilityComponentConditionRecordsById)[0]!, serviceability }),
    ] })
    expect(buildFacilityCapacityContext(world, f.youth.id).components[0]?.status).toBe(serviceability === 'FULL' ? 'AVAILABLE' : serviceability)
    expect(world.scheduledTrainingSessionsById).toEqual(f.world.scheduledTrainingSessionsById)
  })
  it('shows scoped work and restoration without spreading closure to another component', () => {
    const f = shared()
    const second = createFacilityComponent({ ...f.component, id: 'capacity:second-court' })
    const project = createFacilityDevelopmentProject({ id: 'capacity:work', organizationId: f.senior.organizationId, facilityId: f.facility.id,
      projectType: 'RECONFIGURATION', createdAt: f.world.currentDate, plannedStartDate: f.world.currentDate,
      plannedCompletionDate: addDays(f.world.currentDate, 2), status: 'IN_PROGRESS', actualStartDate: f.world.currentDate,
      scope: { kind: 'RENOVATE_COMPONENT', componentId: f.component.id, resultingCondition: 90 } })
    const world = updateGameWorld(f.world, { facilityComponents: [f.component, second], facilityDevelopmentProjects: [project] })
    const context = buildFacilityCapacityContext(world, f.youth.id)
    expect(context.components.find(component => component.componentId === f.component.id)).toMatchObject({ status: 'OUT_OF_SERVICE', affectedProjectIds: [project.id] })
    expect(context.components.find(component => component.componentId === second.id)?.status).toBe('UNKNOWN')
    expect(buildFacilityCapacityContext(f.world, f.youth.id).components[0]?.status).toBe('AVAILABLE')
  })
  it('is reconstructed after Save/reload and repeated reads never mutate any world authority', () => {
    const f = shared()
    const world = deserializeGameWorldV4(save(f.world))
    const before = save(world)
    const context = buildFacilityCapacityContext(world, f.youth.id)
    expect(buildFacilityCapacityContext(deserializeGameWorldV4(before), f.youth.id)).toEqual(context)
    expect(buildFacilityCapacityContext(world, f.youth.id)).toEqual(context)
    expect(save(world)).toEqual(before)
  })
})
