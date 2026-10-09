import { describe, expect, it } from 'vitest'
import { acceptedYouthTrainingFixture } from '@/app/youth/testFixtures'
import { createFacilityComponent, createFacilityComponentConditionRecord, createFacilityUsageRight, createFacilityDevelopmentProject } from '@/domain/facilities'
import { createPlayer } from '@/domain/player'
import { createTeam } from '@/domain/team'
import { playerIdFromString } from '@/domain/ids'
import { createScheduledTrainingSession } from '@/domain/training'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { addDays } from '@/domain/date'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { advanceDayWithTrace } from '@/engine/calendar'
import { cancelScheduledTrainingSession, executeScheduledTrainingSessions, scheduleTrainingSession } from '@/engine/training/ScheduledTrainingEngine'
import { allocationAlternatives, allocationTimeAlternatives, evaluatePhysicalAllocation, physicalAllocations, releaseTrainingPhysicalAllocation, requestTrainingPhysicalAllocation } from './PhysicalAllocationEngine'
const save = (world: GameWorld) => serializeGameWorldV4(world, '2032-10-01T00:00:00.000Z')
export function allocationFixture(gender: 'male' | 'female' = 'female', amount = 10) {
  const f = acceptedYouthTrainingFixture(gender)
  const seed = f.world.players[f.playerId]!
  const extra = Array.from({ length: 11 }, (_, i) => createPlayer({ ...seed, id: playerIdFromString(`c1:player:${i}`), personId: undefined }))
  const ids = [f.playerId, ...extra.map(player => player.id)]
  const component = createFacilityComponent({ ...f.component, specification: { kind: 'CAPACITY', amount, unit: 'SIMULTANEOUS_PLAYERS' } })
  const session = createScheduledTrainingSession({ ...f.world.scheduledTrainingSessionsById['t:training']!, selectedPlayerIds: ids.slice(0, 8) })
  const second = createScheduledTrainingSession({ id: 'c1:senior', teamId: f.senior.id, date: f.date, startTime: '10:30', durationMinutes: 60,
    scope: 'individual', playerId: f.senior.rosterPlayerIds[0]!, definitionId: 'threePoint', intensity: 'normal' })
  const world = updateGameWorld(f.world, { players: [...Object.values(f.world.players), ...extra],
    teams: Object.values(f.world.teams).map(team => team.id === f.youth.id ? createTeam({ ...team, rosterPlayerIds: ids }) : team),
    facilityComponents: [component], facilityUsageRights: [...Object.values(f.world.facilityUsageRightsById), createFacilityUsageRight({ ...f.teamRight, id: 'c1:senior-right', teamId: f.senior.id })],
    scheduledTrainingSessionsById: { ...f.world.scheduledTrainingSessionsById, [session.id]: session, [second.id]: second },
  })
  return { ...f, world: deserializeGameWorldV4(save(world)), component, session, second, ids }
}
const book = (f: ReturnType<typeof allocationFixture>, world = f.world, sessionId = f.session.id, requestId = 'manager:choice') => requestTrainingPhysicalAllocation(world, { sessionId, requestId, componentId: f.component.id, confirm: true })
const economicFacts = (world: GameWorld) => Object.fromEntries(Object.entries(world).filter(([key]) => /financ|governance|treasury|payroll|budget|revenue|expense|salary|ledger|payable|receivable|regulat/i.test(key)))
describe('BS17D-C1 canonical physical reservations and real Training consequences', () => {
  it('does not create a physical requirement for an independent Training module', () => {
    const f = allocationFixture()
    const session = { ...f.session, definitionId: 'teamCohesion' }
    const input = updateGameWorld(f.world, { scheduledTrainingSessionsById: { [session.id]: session }, facilityComponentConditionRecords: Object.values(f.world.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability: 'OUT_OF_SERVICE' })) })
    const requested = book(f, input)
    expect(physicalAllocations(requested)[0]?.status).toBe('PENDING')
    const executed = executeScheduledTrainingSessions(updateGameWorld(requested, { currentDate: f.date }))
    expect(executed.scheduledTrainingSessionsById[session.id]?.status).toBe('completed')
    expect(executed.scheduledTrainingSessionsById[session.id]?.physicalAttempt?.status).toBe('NOT_REQUIRED')
  })
  it('keeps an unknown interval unverified rather than fabricating a slot', () => {
    const f = allocationFixture()
    expect(evaluatePhysicalAllocation(f.world, { ...f.session, startTime: undefined } as unknown as typeof f.session, f.component.id)).toMatchObject({ status: 'UNVERIFIED_PHYSICAL_CONTEXT', reason: 'UNKNOWN_INTERVAL' })
  })
  it('distinguishes a missing selected component from a completely unknown legacy infrastructure', () => {
    const f = allocationFixture()
    expect(evaluatePhysicalAllocation(f.world, f.session, 'c1:missing' as typeof f.component.id)).toMatchObject({ status: 'BLOCKED', reason: 'COMPONENT_NOT_FOUND' })
    const unknown = updateGameWorld(f.world, { facilityComponents: [createFacilityComponent({ ...f.component, specification: null })], facilityComponentConditionRecords: [] })
    expect(evaluatePhysicalAllocation(unknown, f.session, f.component.id).status).toBe('UNVERIFIED_PHYSICAL_CONTEXT')
  })
  it('retains executed physical occupancy across midnight for a later overlapping request', () => {
    const f = allocationFixture()
    const first = { ...f.session, startTime: '23:30' }
    const second = { ...f.second, date: addDays(f.date, 1), startTime: '00:15', durationMinutes: 30 }
    const initial = updateGameWorld(f.world, { scheduledTrainingSessionsById: { [first.id]: first, [second.id]: second } })
    const booked = book(f, initial)
    const executed = executeScheduledTrainingSessions(updateGameWorld(booked, { currentDate: f.date }))
    expect(executed.scheduledTrainingSessionsById[first.id]?.status).toBe('completed')
    const requested = book(f, deserializeGameWorldV4(save(executed)), second.id, 'after-execution')
    expect(requested.scheduledTrainingSessionsById[second.id]?.physicalAllocations?.[0]?.status).toBe('BLOCKED')
  })
  it('uses peak overlapping occupancy rather than adding groups that occupy different intervals', () => {
    const f = allocationFixture()
    const component = createFacilityComponent({ ...f.component, occupancySharing: 'SHARED_CAPACITY' })
    const a = { ...f.session, selectedPlayerIds: f.ids.slice(0, 5), durationMinutes: 30 }
    const b = { ...f.second, startTime: '10:30', durationMinutes: 30 }
    const world = updateGameWorld(f.world, { facilityComponents: [component], scheduledTrainingSessionsById: { [a.id]: a, [b.id]: b } })
    const booked = book(f, book(f, world), b.id, 'b')
    const candidate = { ...f.second, id: 'c1:probe', startTime: '10:00', durationMinutes: 60 }
    expect(evaluatePhysicalAllocation(booked, candidate, component.id)).toMatchObject({ status: 'AVAILABLE', occupancy: 5, demand: 1 })
  })
  it('rejects malformed and overbooked Save evidence without inventing reservations for an old payload', () => {
    const f = allocationFixture(), booked = book(f)
    const envelope = save(booked)
    const invalid = structuredClone(envelope)
    const session = invalid.payload.scheduledTrainingSessions!.find(item => item.id === f.session.id)!
    ;(session.physicalAllocations as unknown as { demand: number }[])[0]!.demand = 11
    expect(() => deserializeGameWorldV4(invalid)).toThrow()
    const missingSource = structuredClone(envelope)
    const owner = missingSource.payload.scheduledTrainingSessions!.find(item => item.id === f.session.id)!
    ;(owner.physicalAllocations as unknown as { componentId: string }[])[0]!.componentId = 'c1:invalid-ref'
    expect(() => deserializeGameWorldV4(missingSource)).toThrow()
    expect(physicalAllocations(deserializeGameWorldV4(save(f.world)))).toEqual([])
    const overbooked = structuredClone(envelope)
    const other = overbooked.payload.scheduledTrainingSessions!.find(item => item.id === f.second.id)!
    ;(other as Record<string, unknown>).physicalAllocations = [{ ...physicalAllocations(booked)[0]!, id: 'forged:second', sessionId: f.second.id, teamId: f.second.teamId, startTime: f.second.startTime, demand: 1 }]
    expect(() => deserializeGameWorldV4(overbooked)).toThrow(/Incompatible confirmed/)
  })
  it('keeps request/release commands and their history idempotent', () => {
    const f = allocationFixture()
    const input = { sessionId: f.session.id, componentId: f.component.id, requestId: 'same-identity' }
    const pending = requestTrainingPhysicalAllocation(f.world, input)
    expect(requestTrainingPhysicalAllocation(pending, input)).toBe(pending)
    const reserved = requestTrainingPhysicalAllocation(pending, { ...input, confirm: true })
    const allocation = physicalAllocations(reserved)[0]!
    const released = releaseTrainingPhysicalAllocation(reserved, f.session.id, allocation.id)
    expect(releaseTrainingPhysicalAllocation(released, f.session.id, allocation.id)).toBe(released)
    expect(requestTrainingPhysicalAllocation(released, { ...input, confirm: true })).toBe(released)
    expect(() => updateGameWorld(released, { scheduledTrainingSessionsById: { ...released.scheduledTrainingSessionsById, [f.session.id]: { ...released.scheduledTrainingSessionsById[f.session.id]!, physicalAllocations: [] } } })).toThrow(/history must be preserved/)
  })
  it.each(['male', 'female'] as const)('confirms eight explicit %s youth participants against ten and executes/reloads exactly once', gender => {
    const f = allocationFixture(gender), before = save(f.world), reserved = book(f)
    expect(physicalAllocations(reserved)).toHaveLength(1)
    expect(physicalAllocations(reserved)[0]).toMatchObject({ status: 'CONFIRMED', demand: 8, capacityAtConfirmation: 10 })
    expect(save(f.world)).toEqual(before)
    expect(book(f, reserved)).toBe(reserved)
    const loaded = deserializeGameWorldV4(save(reserved))
    expect(save(loaded)).toEqual(save(reserved))
    const day = advanceDayWithTrace(loaded)
    expect(day.status).not.toBe('FAILED')
    expect(day.phases.filter(phase => phase.phaseId === 'TRAINING')).toHaveLength(1)
    expect(day.world.scheduledTrainingSessionsById[f.session.id]?.execution?.participants).toHaveLength(8)
    expect(physicalAllocations(day.world)[0]).toMatchObject({ status: 'RELEASED' })
    expect(physicalAllocations(day.world)[0]?.history.at(-1)?.reason).toBe('TRAINING_EXECUTED')
    expect(executeScheduledTrainingSessions(day.world)).toEqual(day.world)
    expect(day.world.players).toEqual(f.world.players)
    expect(day.world.talentMaterializationsByCandidateKey).toEqual(f.world.talentMaterializationsByCandidateKey)
  })
  it('changes only nominal capacity: twelve cannot reserve ten; twelve can reserve twelve', () => {
    const f = allocationFixture()
    const input = updateGameWorld(f.world, { scheduledTrainingSessionsById: { [f.session.id]: { ...f.session, selectedPlayerIds: f.ids } } })
    const low = book(f, input)
    const high = book(f, updateGameWorld(input, { facilityComponents: [createFacilityComponent({ ...f.component, specification: { kind: 'CAPACITY', amount: 12, unit: 'SIMULTANEOUS_PLAYERS' } })] }))
    expect(physicalAllocations(low)[0]).toMatchObject({ status: 'BLOCKED' })
    expect(physicalAllocations(low)[0]?.history.at(-1)?.reason).toBe('INSUFFICIENT_CAPACITY')
    const lowDay = executeScheduledTrainingSessions(updateGameWorld(low, { currentDate: f.date }))
    const highDay = executeScheduledTrainingSessions(updateGameWorld(high, { currentDate: f.date }))
    expect(lowDay.scheduledTrainingSessionsById[f.session.id]?.status).toBe('scheduled')
    expect(Object.keys(lowDay.developmentStimulusEventsById)).toEqual(Object.keys(input.developmentStimulusEventsById))
    expect(lowDay.careerFatigueByPlayerId).toEqual(input.careerFatigueByPlayerId)
    expect(highDay.scheduledTrainingSessionsById[f.session.id]?.status).toBe('completed')
    expect(economicFacts(low)).toEqual(economicFacts(input))
    expect(economicFacts(high)).toEqual(economicFacts(input))
  })
  it.each(['unknown-capacity', 'unknown-demand', 'incompatible-unit', 'LIMITED'] as const)('keeps %s unverified, without a fictional reservation or sporting penalty', kind => {
    const f = allocationFixture()
    const component = kind === 'unknown-capacity' ? createFacilityComponent({ ...f.component, specification: null })
      : kind === 'incompatible-unit' ? createFacilityComponent({ ...f.component, specification: { kind: 'CAPACITY', amount: 10, unit: 'SEATS' } }) : f.component
    const session = kind === 'unknown-demand' ? { ...f.session, selectedPlayerIds: undefined } : f.session
    const world = updateGameWorld(f.world, { facilityComponents: [component], scheduledTrainingSessionsById: { [session.id]: session },
      ...(kind === 'LIMITED' ? { facilityComponentConditionRecords: Object.values(f.world.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability: 'LIMITED' })) } : {}),
    })
    const requested = book(f, world)
    expect(physicalAllocations(requested)[0]?.status).toBe('PENDING')
    expect(evaluatePhysicalAllocation(requested, session, component.id).status).toBe('UNVERIFIED_PHYSICAL_CONTEXT')
    const executed = executeScheduledTrainingSessions(updateGameWorld(requested, { currentDate: f.date }))
    expect(executed.scheduledTrainingSessionsById[session.id]?.status).toBe('completed')
    expect(executed.scheduledTrainingSessionsById[session.id]?.physicalAttempt?.status).toBe('UNVERIFIED_PHYSICAL_CONTEXT')
    expect(physicalAllocations(executed).some(item => item.status === 'CONFIRMED')).toBe(false)
  })
  it.each(['10:00', '10:30', '11:00'] as const)('keeps confirmed prior allocation at %s; consecutive intervals remain compatible', time => {
    const f = allocationFixture()
    const world = updateGameWorld(f.world, { scheduledTrainingSessionsById: { [f.session.id]: f.session, [f.second.id]: { ...f.second, startTime: time } } })
    const first = book(f, world), next = book(f, first, f.second.id, 'second')
    expect(next.scheduledTrainingSessionsById[f.session.id]?.physicalAllocations).toEqual(first.scheduledTrainingSessionsById[f.session.id]?.physicalAllocations)
    expect(next.scheduledTrainingSessionsById[f.second.id]?.physicalAllocations?.[0]?.status).toBe(time === '11:00' ? 'CONFIRMED' : 'BLOCKED')
  })
  it('does not choose a winner between simultaneous pending requests', () => {
    const f = allocationFixture()
    const pending = requestTrainingPhysicalAllocation(f.world, { sessionId: f.session.id, componentId: f.component.id, requestId: 'a' })
    const both = requestTrainingPhysicalAllocation(pending, { sessionId: f.second.id, componentId: f.component.id, requestId: 'b' })
    const attempts = requestTrainingPhysicalAllocation(both, { sessionId: f.session.id, componentId: f.component.id, requestId: 'a', confirm: true })
    expect(physicalAllocations(attempts).every(item => item.status === 'PENDING')).toBe(true)
    expect(physicalAllocations(attempts)[0]?.history.at(-1)?.reason).toBe('PENDING_PRIORITY_DECISION')
    const released = releaseTrainingPhysicalAllocation(attempts, f.second.id, physicalAllocations(attempts).find(item => item.sessionId === f.second.id)!.id)
    const chosen = requestTrainingPhysicalAllocation(released, { sessionId: f.session.id, componentId: f.component.id, requestId: 'a', confirm: true })
    expect(physicalAllocations(chosen).filter(item => item.status === 'CONFIRMED')).toHaveLength(1)
  })
  it('requires explicit shareability rather than treating two small groups as automatically compatible', () => {
    const f = allocationFixture()
    const exclusive = book(f, book(f), f.second.id, 'b')
    expect(exclusive.scheduledTrainingSessionsById[f.second.id]?.physicalAllocations?.[0]?.status).toBe('BLOCKED')
    const shared = updateGameWorld(f.world, { facilityComponents: [createFacilityComponent({ ...f.component, occupancySharing: 'SHARED_CAPACITY' })] })
    const accepted = book(f, book(f, shared), f.second.id, 'b')
    expect(physicalAllocations(accepted).filter(item => item.status === 'CONFIRMED')).toHaveLength(2)
    const tight = updateGameWorld(f.world, { facilityComponents: [createFacilityComponent({ ...f.component, occupancySharing: 'SHARED_CAPACITY', specification: { kind: 'CAPACITY', unit: 'SIMULTANEOUS_PLAYERS', amount: 8 } })] })
    expect(book(f, book(f, tight), f.second.id, 'b').scheduledTrainingSessionsById[f.second.id]?.physicalAllocations?.[0]?.status).toBe('BLOCKED')
    expect(save(deserializeGameWorldV4(save(accepted)))).toEqual(save(accepted))
    const pendingA = requestTrainingPhysicalAllocation(shared, { sessionId: f.session.id, componentId: f.component.id, requestId: 'a' })
    const pendingBoth = requestTrainingPhysicalAllocation(pendingA, { sessionId: f.second.id, componentId: f.component.id, requestId: 'b' })
    const one = requestTrainingPhysicalAllocation(pendingBoth, { sessionId: f.session.id, componentId: f.component.id, requestId: 'a', confirm: true })
    const both = requestTrainingPhysicalAllocation(one, { sessionId: f.second.id, componentId: f.component.id, requestId: 'b', confirm: true })
    expect(physicalAllocations(both).filter(item => item.status === 'CONFIRMED')).toHaveLength(2)
  })
  it('offers a real alternate component and requires manager selection before moving', () => {
    const f = allocationFixture()
    const alternate = createFacilityComponent({ ...f.component, id: 'c1:alternate' })
    const condition = createFacilityComponentConditionRecord({ ...Object.values(f.world.facilityComponentConditionRecordsById)[0]!, id: 'c1:alternate-condition', componentId: alternate.id })
    const world = updateGameWorld(f.world, { facilityComponents: [f.component, alternate], facilityComponentConditionRecords: [...Object.values(f.world.facilityComponentConditionRecordsById), condition] })
    const first = book(f, world)
    expect(allocationAlternatives(first, f.second)).toEqual([alternate.id])
    const moved = requestTrainingPhysicalAllocation(first, { sessionId: f.second.id, componentId: alternate.id, requestId: 'explicit:alternate', confirm: true })
    expect(moved.scheduledTrainingSessionsById[f.second.id]?.physicalAllocations?.[0]?.componentId).toBe(alternate.id)
    expect(allocationAlternatives(book(f), f.second)).toEqual([])
    expect(allocationTimeAlternatives(book(f), f.second, f.component.id)).toEqual([{ date: f.date, startTime: '11:00' }])
  })
  it('blocks parent/child double booking, even when the parent explicitly supports shared capacity', () => {
    const f = allocationFixture()
    const child = createFacilityComponent({ ...f.component, id: 'c1:child', parentComponentId: f.component.id })
    const condition = createFacilityComponentConditionRecord({ ...Object.values(f.world.facilityComponentConditionRecordsById)[0]!, id: 'c1:child-condition', componentId: child.id })
    const world = updateGameWorld(f.world, { facilityComponents: [f.component, child], facilityComponentConditionRecords: [...Object.values(f.world.facilityComponentConditionRecordsById), condition] })
    const first = book(f, world)
    const second = requestTrainingPhysicalAllocation(first, { sessionId: f.second.id, componentId: child.id, requestId: 'child', confirm: true })
    expect(second.scheduledTrainingSessionsById[f.second.id]?.physicalAllocations?.[0]?.status).toBe('BLOCKED')
  })
  it.each(['expired', 'Organization-only', 'midnight-expiry'] as const)('respects %s rights without ownership inheritance', mode => {
    const f = allocationFixture()
    const rights = mode === 'Organization-only' ? [f.organizationRight] : [createFacilityUsageRight({ ...f.teamRight, validTo: mode === 'expired' ? f.world.currentDate : f.date })]
    const session = mode === 'midnight-expiry' ? { ...f.session, startTime: '23:30', durationMinutes: 60 } : f.session
    const world = updateGameWorld(f.world, { facilityUsageRights: rights, scheduledTrainingSessionsById: { [session.id]: session } })
    expect(evaluatePhysicalAllocation(world, session, f.component.id)).toMatchObject({ status: 'BLOCKED', reason: 'NO_ACCESS_DURING_INTERVAL' })
  })
  it('revalidates a breakdown after confirmation, blocks stimuli and permits explicit restoration/rescheduling exactly once', () => {
    const f = allocationFixture(), confirmed = book(f)
    const broken = updateGameWorld(confirmed, { facilityComponentConditionRecords: Object.values(f.world.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability: 'OUT_OF_SERVICE' })) })
    const failed = executeScheduledTrainingSessions(updateGameWorld(broken, { currentDate: f.date }))
    expect(failed.scheduledTrainingSessionsById[f.session.id]?.status).toBe('scheduled')
    expect(failed.scheduledTrainingSessionsById[f.session.id]?.physicalAttempt?.status).toBe('VERIFIED_UNAVAILABLE')
    const restored = updateGameWorld(failed, { facilityComponentConditionRecords: Object.values(f.world.facilityComponentConditionRecordsById) })
    const rescheduled = scheduleTrainingSession(restored, { ...restored.scheduledTrainingSessionsById[f.session.id]!, date: addDays(f.date, 1) })
    expect(physicalAllocations(rescheduled).filter(item => item.status === 'CONFIRMED')).toHaveLength(1)
    const executed = executeScheduledTrainingSessions(updateGameWorld(deserializeGameWorldV4(save(rescheduled)), { currentDate: addDays(f.date, 1) }))
    expect(executed.scheduledTrainingSessionsById[f.session.id]?.status).toBe('completed')
    expect(executeScheduledTrainingSessions(executed)).toEqual(executed)
  })
  it('preserves the original booking atomically when the new interval is occupied', () => {
    const f = allocationFixture()
    const second = { ...f.second, startTime: '12:00' }
    const world = updateGameWorld(f.world, { scheduledTrainingSessionsById: { [f.session.id]: f.session, [second.id]: second } })
    const confirmed = book(f, book(f, world), second.id, 'b'), before = save(confirmed)
    expect(() => scheduleTrainingSession(confirmed, { ...confirmed.scheduledTrainingSessionsById[f.session.id]!, startTime: '12:00' })).toThrow(/preserves previous reservation/)
    expect(save(confirmed)).toEqual(before)
    const pending = requestTrainingPhysicalAllocation(book(f, world), { sessionId: second.id, componentId: f.component.id, requestId: 'pending' })
    const pendingBefore = save(pending)
    expect(() => scheduleTrainingSession(pending, { ...pending.scheduledTrainingSessionsById[f.session.id]!, startTime: '12:00' })).toThrow(/preserves previous reservation/)
    expect(save(pending)).toEqual(pendingBefore)
  })
  it('reevaluates a changed explicit participant selection before effects', () => {
    const f = allocationFixture(), confirmed = book(f)
    const changed = updateGameWorld(confirmed, { scheduledTrainingSessionsById: { ...confirmed.scheduledTrainingSessionsById, [f.session.id]: { ...confirmed.scheduledTrainingSessionsById[f.session.id]!, selectedPlayerIds: f.ids } } })
    const executed = executeScheduledTrainingSessions(updateGameWorld(changed, { currentDate: f.date }))
    expect(executed.scheduledTrainingSessionsById[f.session.id]?.status).toBe('scheduled')
    expect(executed.scheduledTrainingSessionsById[f.session.id]?.physicalAttempt?.resources[0]?.reason).toBe('INSUFFICIENT_CAPACITY')
  })
  it('cancels/releases idempotently without removing legitimate source/history or executing a cancelled session', () => {
    const f = allocationFixture(), confirmed = book(f)
    const cancelled = cancelScheduledTrainingSession(confirmed, f.session.id)
    expect(cancelled.scheduledTrainingSessionsById[f.session.id]?.status).toBe('cancelled')
    expect(physicalAllocations(cancelled)[0]?.status).toBe('CANCELLED')
    expect(save(cancelScheduledTrainingSession(cancelled, f.session.id))).toEqual(save(cancelled))
    expect(save(deserializeGameWorldV4(save(cancelled)))).toEqual(save(cancelled))
    const executed = executeScheduledTrainingSessions(updateGameWorld(cancelled, { currentDate: f.date }))
    expect(executed.scheduledTrainingSessionsById[f.session.id]?.execution).toBeUndefined()
  })
  it('keeps partial works scoped and retains continuity for a legacy session without a physical request', () => {
    const f = allocationFixture()
    const project = createFacilityDevelopmentProject({ id: 'c1:work', organizationId: f.senior.organizationId, facilityId: f.facility.id, projectType: 'RECONFIGURATION', createdAt: f.world.currentDate, plannedStartDate: f.world.currentDate, plannedCompletionDate: addDays(f.date, 2), status: 'IN_PROGRESS', actualStartDate: f.world.currentDate, scope: { kind: 'RENOVATE_COMPONENT', componentId: f.component.id, resultingCondition: 90 } })
    const works = updateGameWorld(book(f), { facilityDevelopmentProjects: [project] })
    expect(evaluatePhysicalAllocation(works, f.session, f.component.id)).toMatchObject({ status: 'BLOCKED', reason: 'PHYSICAL_WORK' })
    const legacy = updateGameWorld(f.world, { facilityComponents: [], facilityUsageRights: [], facilityComponentConditionRecords: [] })
    const executed = executeScheduledTrainingSessions(updateGameWorld(legacy, { currentDate: f.date }))
    expect(executed.scheduledTrainingSessionsById[f.session.id]?.status).toBe('completed')
    expect(physicalAllocations(executed)).toEqual([])
  })
})

// Permanent acceptance regressions: these assert the required behavior, not the diagnostic bypass.
describe('BS17D-C1 P1 consumption closure', () => {
  function releasedConflict() {
    const f = allocationFixture()
    let world = book(f)
    const previous = physicalAllocations(world)[0]!
    world = releaseTrainingPhysicalAllocation(world, f.session.id, previous.id)
    world = book(f, world, f.second.id, 'senior')
    return { f, world, previous }
  }
  function expectBlocked(world: GameWorld, id: string) {
    const session = world.scheduledTrainingSessionsById[id]!
    expect(session.status).toBe('scheduled')
    expect(session.execution).toBeUndefined()
    expect(session.physicalAttempt?.status).toBe('VERIFIED_UNAVAILABLE')
    expect(session.physicalAttempt?.resources.some(resource => resource.reason === 'RESOURCE_OCCUPIED')).toBe(true)
    expect(Object.values(world.developmentStimulusEventsById).some(event => event.sourceId === id)).toBe(false)
  }
  it('F1-A prevents an unallocated individual from consuming another Team exclusive reservation', () => {
    const f = allocationFixture(), world = book(f)
    expect(evaluatePhysicalAllocation(world, f.second, f.component.id).reason).toBe('RESOURCE_OCCUPIED')
    const output = executeScheduledTrainingSessions(updateGameWorld(world, { currentDate: f.date }))
    expect(output.scheduledTrainingSessionsById[f.session.id]?.status).toBe('completed')
    expectBlocked(output, f.second.id)
  })
  it('F1-B release does not permit consumption of a later confirmed reservation', () => {
    const { f, world, previous } = releasedConflict()
    const output = executeScheduledTrainingSessions(updateGameWorld(world, { currentDate: f.date }))
    expectBlocked(output, f.session.id)
    expect(output.scheduledTrainingSessionsById[f.second.id]?.status).toBe('completed')
    expect(physicalAllocations(output).find(item => item.id === previous.id)?.status).toBe('RELEASED')
  })
  it('F1-C Save/reload preserves the confirmed authority and blocks released consumption', () => {
    const { f, world, previous } = releasedConflict()
    const restored = deserializeGameWorldV4(save(world))
    expect(physicalAllocations(restored)).toEqual(physicalAllocations(world))
    const output = executeScheduledTrainingSessions(updateGameWorld(restored, { currentDate: f.date }))
    expectBlocked(output, f.session.id)
    expect(output.scheduledTrainingSessionsById[f.second.id]?.status).toBe('completed')
    expect(physicalAllocations(output).find(item => item.id === previous.id)?.history).toEqual(previous.history.concat({ onDate: world.currentDate, status: 'RELEASED', reason: 'MANAGER_RELEASED' }))
    expect(executeScheduledTrainingSessions(output)).toEqual(output)
  })
})

describe('BS17D-C1 P1 complementary consumption paths', () => {
  it('keeps two known unreserved exclusive consumers unresolved regardless of iteration order', () => {
    const f = allocationFixture()
    for (const sessions of [[f.session, f.second], [f.second, f.session]]) {
      const world = updateGameWorld(f.world, { scheduledTrainingSessionsById: Object.fromEntries(sessions.map(item => [item.id, item])), currentDate: f.date })
      const output = executeScheduledTrainingSessions(world)
      expect(Object.values(output.scheduledTrainingSessionsById).every(item => item.status === 'scheduled')).toBe(true)
      expect(Object.values(output.scheduledTrainingSessionsById).every(item => item.physicalAttempt?.resources.some(resource => resource.reason === 'PENDING_PRIORITY_DECISION'))).toBe(true)
      expect(Object.values(output.developmentStimulusEventsById).filter(item => item.sourceId === f.session.id || item.sourceId === f.second.id)).toHaveLength(0)
    }
  })
  it.each(['available', 'unknown', 'independent'] as const)('preserves unreserved %s continuity without an implicit reservation', mode => {
    const f = allocationFixture()
    const session = { ...f.session, ...(mode === 'independent' ? { definitionId: 'teamCohesion' } : {}) }
    const world = updateGameWorld(f.world, { scheduledTrainingSessionsById: { [session.id]: session }, ...(mode === 'unknown' ? { facilityComponents: [], facilityUsageRights: [], facilityComponentConditionRecords: [] } : {}), currentDate: f.date })
    const output = executeScheduledTrainingSessions(world)
    expect(output.scheduledTrainingSessionsById[session.id]?.status).toBe('completed')
    expect(physicalAllocations(output)).toEqual([])
    if (mode === 'unknown') expect(output.scheduledTrainingSessionsById[session.id]?.physicalAttempt?.status).toBe('UNVERIFIED_PHYSICAL_CONTEXT')
  })
  it('allows consecutive unreserved sessions without confusing same-day use with overlap', () => {
    const f = allocationFixture()
    const world = updateGameWorld(f.world, { scheduledTrainingSessionsById: { [f.session.id]: f.session, [f.second.id]: { ...f.second, startTime: '11:00' } }, currentDate: f.date })
    expect(Object.values(executeScheduledTrainingSessions(world).scheduledTrainingSessionsById).every(item => item.status === 'completed')).toBe(true)
  })
  it.each([10, 8])('shares only explicitly divisible capacity %s without iteration priority', capacity => {
    const f = allocationFixture()
    const world = updateGameWorld(f.world, { facilityComponents: [createFacilityComponent({ ...f.component, occupancySharing: 'SHARED_CAPACITY', specification: { kind: 'CAPACITY', unit: 'SIMULTANEOUS_PLAYERS', amount: capacity } })], currentDate: f.date })
    const output = executeScheduledTrainingSessions(world)
    expect([f.session.id, f.second.id].every(id => output.scheduledTrainingSessionsById[id]?.status === (capacity === 10 ? 'completed' : 'scheduled'))).toBe(true)
  })
  it('retains a released explicit resource and offers an alternative without moving automatically', () => {
    const f = allocationFixture()
    const alternate = createFacilityComponent({ ...f.component, id: 'fix:alternate' })
    const condition = createFacilityComponentConditionRecord({ ...Object.values(f.world.facilityComponentConditionRecordsById)[0]!, id: 'fix:alternate-condition', componentId: alternate.id })
    let world = updateGameWorld(f.world, { facilityComponents: [f.component, alternate], facilityComponentConditionRecords: [...Object.values(f.world.facilityComponentConditionRecordsById), condition] })
    world = book(f, world)
    world = releaseTrainingPhysicalAllocation(world, f.session.id, physicalAllocations(world)[0]!.id)
    world = book(f, world, f.second.id, 'senior')
    const output = executeScheduledTrainingSessions(updateGameWorld(world, { currentDate: f.date }))
    expect(output.scheduledTrainingSessionsById[f.session.id]?.status).toBe('scheduled')
    expect(allocationAlternatives(output, f.session)).toContain(alternate.id)
    const tomorrow = scheduleTrainingSession(output, { ...output.scheduledTrainingSessionsById[f.session.id]!, date: addDays(f.date, 1) })
    const chosen = requestTrainingPhysicalAllocation(tomorrow, { sessionId: f.session.id, componentId: alternate.id, requestId: 'manager:alternative', confirm: true })
    const executed = executeScheduledTrainingSessions(updateGameWorld(deserializeGameWorldV4(save(chosen)), { currentDate: addDays(f.date, 1) }))
    expect(executed.scheduledTrainingSessionsById[f.session.id]?.status).toBe('completed')
    expect(executeScheduledTrainingSessions(executed)).toEqual(executed)
  })
  it('does not revive cancelled work when its old resource is confirmed by another Team', () => {
    const f = allocationFixture()
    const cancelled = cancelScheduledTrainingSession(book(f), f.session.id)
    const world = book(f, cancelled, f.second.id, 'senior')
    const output = executeScheduledTrainingSessions(updateGameWorld(world, { currentDate: f.date }))
    expect(output.scheduledTrainingSessionsById[f.session.id]?.status).toBe('cancelled')
    expect(output.scheduledTrainingSessionsById[f.session.id]?.execution).toBeUndefined()
    expect(output.scheduledTrainingSessionsById[f.second.id]?.status).toBe('completed')
  })
  it.each(['expired', 'insufficient', 'incompatible-unit', 'unknown-demand'] as const)('checks the unreserved %s physical context', mode => {
    const f = allocationFixture()
    const session = { ...f.session, ...(mode === 'unknown-demand' ? { selectedPlayerIds: undefined } : {}) }
    const world = updateGameWorld(f.world, { scheduledTrainingSessionsById: { [session.id]: session }, currentDate: f.date,
      ...(mode === 'expired' ? { facilityUsageRights: [createFacilityUsageRight({ ...f.teamRight, validTo: f.world.currentDate })] } : {}),
      ...(mode === 'insufficient' || mode === 'incompatible-unit' ? { facilityComponents: [createFacilityComponent({ ...f.component, specification: { kind: 'CAPACITY', unit: mode === 'insufficient' ? 'SIMULTANEOUS_PLAYERS' : 'SEATS', amount: 5 } })] } : {}) })
    const output = executeScheduledTrainingSessions(world)
    expect(output.scheduledTrainingSessionsById[session.id]?.status).toBe(mode === 'expired' || mode === 'insufficient' ? 'scheduled' : 'completed')
  })
})

it('invalidates physical consumption queries after confirm, release and rescheduling', () => {
  const f = allocationFixture()
  expect(evaluatePhysicalAllocation(f.world, f.second, f.component.id).status).toBe('AVAILABLE')
  const confirmed = book(f)
  expect(evaluatePhysicalAllocation(confirmed, f.second, f.component.id).reason).toBe('RESOURCE_OCCUPIED')
  const released = releaseTrainingPhysicalAllocation(confirmed, f.session.id, physicalAllocations(confirmed)[0]!.id)
  expect(evaluatePhysicalAllocation(released, f.second, f.component.id).status).toBe('AVAILABLE')
  const repeated = book(f, released, f.session.id, 'new-confirmation')
  expect(evaluatePhysicalAllocation(repeated, f.second, f.component.id).reason).toBe('RESOURCE_OCCUPIED')
  const moved = scheduleTrainingSession(repeated, { ...repeated.scheduledTrainingSessionsById[f.session.id]!, startTime: '14:00' })
  expect(evaluatePhysicalAllocation(moved, f.second, f.component.id).status).toBe('AVAILABLE')
  expect(evaluatePhysicalAllocation(deserializeGameWorldV4(save(moved)), f.second, f.component.id).status).toBe('AVAILABLE')
})

it.each(['overlapping', 'separate'] as const)('respects %s explicit released component scopes without iteration priority', mode => {
  const f = allocationFixture()
  const parent = createFacilityComponent({ ...f.component, occupancySharing: 'SHARED_CAPACITY' })
  const child = createFacilityComponent({ ...parent, id: 'fix:child', parentComponentId: mode === 'overlapping' ? parent.id : null })
  const condition = createFacilityComponentConditionRecord({ ...Object.values(f.world.facilityComponentConditionRecordsById)[0]!, id: 'fix:child-condition', componentId: child.id })
  let world = updateGameWorld(f.world, { facilityComponents: [parent, child], facilityComponentConditionRecords: [...Object.values(f.world.facilityComponentConditionRecordsById), condition] })
  for (const [session, component] of [[f.session, parent], [f.second, child]] as const) {
    world = requestTrainingPhysicalAllocation(world, { sessionId: session.id, componentId: component.id, requestId: 'explicit-scope', confirm: true })
    world = releaseTrainingPhysicalAllocation(world, session.id, physicalAllocations(world).find(item => item.sessionId === session.id)!.id)
  }
  for (const entries of [Object.entries(world.scheduledTrainingSessionsById), Object.entries(world.scheduledTrainingSessionsById).reverse()]) {
    const output = executeScheduledTrainingSessions(updateGameWorld(world, { scheduledTrainingSessionsById: Object.fromEntries(entries), currentDate: f.date }))
    for (const id of [f.session.id, f.second.id]) {
      expect(output.scheduledTrainingSessionsById[id]?.status).toBe(mode === 'overlapping' ? 'scheduled' : 'completed')
      if (mode === 'overlapping') {
        expect(output.scheduledTrainingSessionsById[id]?.execution).toBeUndefined()
        expect(output.scheduledTrainingSessionsById[id]?.physicalAttempt?.resources.some(item => item.reason === 'PENDING_PRIORITY_DECISION')).toBe(true)
      }
    }
  }
})
