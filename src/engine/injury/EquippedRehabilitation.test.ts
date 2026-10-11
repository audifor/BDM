import { beforeAll, describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { fireStaffFromTeam } from '@/app/staffCareer/StaffCareerService'
import { createFacilityDevelopmentProject } from '@/domain/facilities/FacilityDevelopmentProject'
import { createInjury } from '@/domain/injury'
import { createFacilityComponent, createFacilityComponentConditionRecord } from '@/domain/facilities'
import { createScheduledTrainingSession } from '@/domain/training'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { advanceDay, advanceDayWithTrace } from '@/engine/calendar'
import { executeScheduledTrainingSessions } from '@/engine/training/ScheduledTrainingEngine'
import { requestTrainingPhysicalAllocation } from '@/engine/facilities/PhysicalAllocationEngine'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { setRehabilitationPlan } from './Rehabilitation'
import { indicateEquippedRehabilitation, scheduleEquippedRehabilitation, cancelEquippedRehabilitation, releaseEquippedMedicalAllocation, executeEquippedRehabilitationForDay, equippedActs, evaluateEquippedRehabilitation } from './EquippedRehabilitation'
import { equippedMedicalFixture } from '@/app/game/testSupport/EquippedMedicalFixture'

let f: ReturnType<typeof equippedMedicalFixture>
beforeAll(() => { f = equippedMedicalFixture() }, 30000)
const act = (world: GameWorld) => equippedActs(world).find(item => item.id === f.indication.id)!
const onDate = (world: GameWorld) => updateGameWorld(world, { currentDate: f.date })
const reload = (world: GameWorld) => deserializeGameWorldV4(serializeGameWorldV4(world, '2026-10-10T00:00:00.000Z'))
const training = (world: GameWorld, startTime = '10:00') => {
  const session = createScheduledTrainingSession({ id: 'm1:training', teamId: f.team.id, date: f.date, startTime, durationMinutes: 60, scope: 'individual', playerId: f.team.rosterPlayerIds[1]!, definitionId: 'threePoint', intensity: 'normal' })
  return updateGameWorld(world, { scheduledTrainingSessionsById: { ...world.scheduledTrainingSessionsById, [session.id]: session } })
}
describe('BS17D-M1 equipped rehabilitation productive authority and causal execution', () => {
  it('requires explicit clinical authorization rather than assignment or advisory quality', () => {
    const noGrant = updateGameWorld(f.world, { staffPeople: Object.values(f.world.staffPeopleById).map(person => person.id === f.staffId ? { ...person, professional: { attributes: person.professional.attributes } } : person) })
    expect(() => indicateEquippedRehabilitation(noGrant, f.indication)).toThrow('NO_VERIFIED_CLINICAL_AUTHORIZATION')
    expect(act(f.indicated).prescribingAuthorizationId).toBe('m1:authorization')
  })
  it('does not indicate for an ineligible injury and never derives acts from plan mode', () => {
    const expired = updateGameWorld(f.world, { currentDate: addDays(f.world.currentDate, 26) })
    expect(() => indicateEquippedRehabilitation(expired, f.indication)).toThrow('No eligible')
    const changed = setRehabilitationPlan(f.world, { injuryId: f.injury.id, mode: 'ACCELERATED_REHAB', actor: { kind: 'USER', coachId: f.world.userCoachId } })
    expect(changed.ok).toBe(true); if (changed.ok) expect(equippedActs(changed.world)).toHaveLength(0)
  })
  it('preserves identity, indication and confirmation idempotency without recording reservation as execution', () => {
    expect(indicateEquippedRehabilitation(f.indicated, f.indication)).toBe(f.indicated)
    expect(scheduleEquippedRehabilitation(f.scheduled, f.schedule)).toBe(f.scheduled)
    expect(act(f.scheduled).status).toBe('SCHEDULED'); expect(act(f.scheduled).fulfilledOn).toBeUndefined()
    expect(act(f.scheduled).physicalAllocations?.[0]).toMatchObject({ consumer: { kind: 'MEDICAL', id: f.indication.id }, status: 'CONFIRMED', demand: null, unit: null, sharingAtConfirmation: 'EXCLUSIVE' })
    expect(() => indicateEquippedRehabilitation(f.indicated, { ...f.indication, requiredEquipmentTags: ['different'] })).toThrow('identity')
  })
  it('executes through Calendar, persists fulfillment and cannot execute twice', () => {
    const day = advanceDayWithTrace(f.scheduled)
    expect(day.failure).toBeUndefined(); expect(act(day.world).status).toBe('COMPLETED')
    expect(act(day.world).history.filter(item => item.status === 'COMPLETED')).toHaveLength(1)
    const loaded = reload(day.world)
    expect(act(loaded)).toEqual(act(day.world)); expect(executeEquippedRehabilitationForDay(loaded)).toBe(loaded)
  })
  it('cancelled indications and sessions cannot execute or revive through scheduling', () => {
    for (const input of [f.indicated, f.scheduled]) {
      const cancelled = cancelEquippedRehabilitation(input, f.indication.id)
      expect(cancelEquippedRehabilitation(cancelled, f.indication.id)).toBe(cancelled)
      expect(() => scheduleEquippedRehabilitation(cancelled, { ...f.schedule, requestId: 'revive' })).toThrow('cannot be scheduled')
      if (input === f.scheduled) expect(scheduleEquippedRehabilitation(cancelled, f.schedule)).toBe(cancelled)
      expect(act(advanceDay(reload(cancelled))).status).toBe('CANCELLED')
    }
  })
  it.each(['OUT_OF_SERVICE', 'LIMITED'] as const)('revalidates %s physical state without healing, fatigue, fitness or RTP effects', serviceability => {
    const changed = updateGameWorld(f.scheduled, { facilityComponentConditionRecords: Object.values(f.scheduled.facilityComponentConditionRecordsById).map(item => item.componentId === f.component.id ? createFacilityComponentConditionRecord({ ...item, serviceability }) : item) })
    const baseline = advanceDay(f.scheduled), blocked = advanceDay(changed)
    expect(act(baseline).status).toBe('COMPLETED'); expect(act(blocked).status).toBe('BLOCKED')
    const clinical = ({ equippedRehabilitationActs: _acts, ...facts }: typeof f.injury) => facts
    expect(clinical(blocked.injuriesById[f.injury.id]!)).toEqual(clinical(baseline.injuriesById[f.injury.id]!))
    for (const key of Object.keys(baseline) as (keyof GameWorld)[]) if (key !== 'injuriesById' && !key.startsWith('facilit')) expect(blocked[key]).toEqual(baseline[key])
  })
  it('allows specifically verified LIMITED function; capability alone and UNKNOWN never fabricate completion', () => {
    const limited = updateGameWorld(f.scheduled, { facilityComponentConditionRecords: Object.values(f.scheduled.facilityComponentConditionRecordsById).map(item => item.componentId === f.component.id ? createFacilityComponentConditionRecord({ ...item, serviceability: 'LIMITED' }) : item), facilityComponents: Object.values(f.scheduled.facilityComponentsById).map(item => item.id === f.component.id ? createFacilityComponent({ ...item, rehabilitationEquipmentEvidence: { ...item.rehabilitationEquipmentEvidence!, functionality: 'LIMITED_COMPATIBLE' } }) : item) })
    expect(act(advanceDay(limited)).status).toBe('COMPLETED')
    const limitedEquipment = updateGameWorld(f.scheduled, { facilityComponents: Object.values(limited.facilityComponentsById) })
    expect(evaluateEquippedRehabilitation(limitedEquipment, act(limitedEquipment), f.component.id).status).toBe('VERIFIED_LIMITED')
    const missing = updateGameWorld(f.scheduled, { facilityComponents: Object.values(f.scheduled.facilityComponentsById).map(item => item.id === f.component.id ? createFacilityComponent({ ...item, rehabilitationEquipmentEvidence: undefined }) : item) })
    expect(act(advanceDay(missing)).status).toBe('BLOCKED'); expect(act(advanceDay(missing)).fulfilledOn).toBeUndefined()
    expect(advanceDay(missing).injuriesById[f.injury.id]!.expectedReturnDate).toBe(f.injury.expectedReturnDate)
    const unknownPhysical = updateGameWorld(f.scheduled, { facilityComponentConditionRecords: [] })
    const pending = advanceDay(unknownPhysical)
    expect(act(pending).history.at(-1)?.reason).toBe('PHYSICAL_CONTEXT_UNKNOWN')
    expect(act(pending).fulfilledOn).toBeUndefined()
    expect(pending.injuriesById[f.injury.id]!.expectedReturnDate).toBe(f.injury.expectedReturnDate)
  })
  it('revalidates expired rights, explicit incompatible equipment and professional grants', () => {
    const noRights = updateGameWorld(f.scheduled, { facilityUsageRights: [] })
    expect(act(advanceDay(noRights)).history.at(-1)?.reason).toBe('NO_ACCESS_DURING_INTERVAL')
    const incompatible = updateGameWorld(f.scheduled, { facilityComponents: Object.values(f.scheduled.facilityComponentsById).map(item => item.id === f.component.id ? createFacilityComponent({ ...item, rehabilitationEquipmentEvidence: { ...item.rehabilitationEquipmentEvidence!, functionality: 'INCOMPATIBLE' } }) : item) })
    expect(act(advanceDay(incompatible)).status).toBe('BLOCKED')
    const revoked = updateGameWorld(f.scheduled, { staffPeople: Object.values(f.scheduled.staffPeopleById).map(person => person.id === f.staffId ? { ...person, professional: { ...person.professional, clinicalAuthorizations: person.professional.clinicalAuthorizations!.map(item => ({ ...item, eligibility: 'REVOKED' as const })) } } : person) })
    expect(act(advanceDay(revoked)).history.at(-1)?.reason).toBe('NO_VERIFIED_CLINICAL_AUTHORIZATION')
  })
  it('Medical confirmed occupancy prevents unreserved Training, including after reload', () => {
    const input = reload(training(f.scheduled))
    const next = advanceDay(input)
    expect(next.scheduledTrainingSessionsById['m1:training']?.status).toBe('scheduled')
    expect(act(next).status).toBe('COMPLETED')
  })
  it('Training confirmed occupancy prevents Medical without its own reservation', () => {
    const released = releaseEquippedMedicalAllocation(f.scheduled, f.indication.id)
    const booked = requestTrainingPhysicalAllocation(training(released), { sessionId: 'm1:training', componentId: f.court.id, requestId: 'prior-training', confirm: true })
    expect(booked.scheduledTrainingSessionsById['m1:training']?.physicalAllocations?.at(-1)?.status).toBe('CONFIRMED')
    const next = advanceDay(reload(booked))
    expect(next.scheduledTrainingSessionsById['m1:training']?.status).toBe('completed')
    expect(act(next).status).toBe('BLOCKED'); expect(act(next).fulfilledOn).toBeUndefined()
  })
  it('unreserved overlapping consumers receive no incidental iteration priority', () => {
    const input = training(releaseEquippedMedicalAllocation(f.scheduled, f.indication.id))
    const next = advanceDay(input)
    expect(next.scheduledTrainingSessionsById['m1:training']?.status).toBe('scheduled'); expect(act(next).status).toBe('BLOCKED')
  })
  it('consecutive intervals coexist, and failed rescheduling preserves the original booking', () => {
    const consecutive = training(f.scheduled, '11:00')
    const next = advanceDay(consecutive)
    expect(act(next).status).toBe('COMPLETED'); expect(next.scheduledTrainingSessionsById['m1:training']?.status).toBe('completed')
    const booked = requestTrainingPhysicalAllocation(consecutive, { sessionId: 'm1:training', componentId: f.court.id, requestId: 'later', confirm: true })
    expect(() => scheduleEquippedRehabilitation(booked, { ...f.schedule, requestId: 'move', interval: { ...f.schedule.interval, startTime: '11:15' } })).toThrow('preserves previous reservation')
    expect(act(booked).interval?.startTime).toBe('10:00')
  })
  it('released/cancelled claims stop reserving resources and restoration can retry unexecuted acts', () => {
    const cancelled = training(cancelEquippedRehabilitation(f.scheduled, f.indication.id))
    expect(executeScheduledTrainingSessions(onDate(cancelled)).scheduledTrainingSessionsById['m1:training']?.status).toBe('completed')
    const noRights = updateGameWorld(onDate(f.scheduled), { facilityUsageRights: [] })
    const blocked = executeEquippedRehabilitationForDay(noRights)
    const restored = updateGameWorld(blocked, { facilityUsageRights: Object.values(f.scheduled.facilityUsageRightsById) })
    expect(act(executeEquippedRehabilitationForDay(restored)).status).toBe('COMPLETED')
  })
  it('keeps old saves free of retroactive acts and protects fulfillment source invariants', () => {
    expect(equippedActs(reload(f.world))).toHaveLength(0)
    expect(() => updateGameWorld(f.indicated, { injuries: [createInjury({ ...f.injury, equippedRehabilitationActs: [{ ...act(f.indicated), status: 'COMPLETED', fulfilledOn: f.date }] })] })).toThrow()
  })
  it('separates permission to indicate from permission to perform and rejects a wrong assignment', () => {
    const onlyIndicate = updateGameWorld(f.scheduled, { staffPeople: Object.values(f.scheduled.staffPeopleById).map(person => person.id === f.staffId ? { ...person, professional: { ...person.professional, clinicalAuthorizations: person.professional.clinicalAuthorizations!.map(item => ({ ...item, actions: ['INDICATE' as const] })) } } : person) })
    expect(act(advanceDay(onlyIndicate)).status).toBe('BLOCKED')
    const unassigned = updateGameWorld(f.world, { teamStaffAssignments: Object.values(f.world.teamStaffAssignmentsById).filter(item => item.id !== f.assignmentId) })
    expect(() => indicateEquippedRehabilitation(unassigned, f.indication)).toThrow('NO_VERIFIED_CLINICAL_AUTHORIZATION')
  })
  it('checks medical-purpose rights and their validity over a midnight-crossing interval', () => {
    const trainingRightsOnly = updateGameWorld(f.scheduled, { facilityUsageRights: Object.values(f.scheduled.facilityUsageRightsById).filter(item => item.purpose !== 'MEDICAL') })
    expect(act(advanceDay(trainingRightsOnly)).history.at(-1)?.reason).toBe('NO_ACCESS_DURING_INTERVAL')
    const overnight = scheduleEquippedRehabilitation(f.indicated, { ...f.schedule, interval: { ...f.schedule.interval, startTime: '23:30' }, requestId: 'overnight' })
    const expires = updateGameWorld(overnight, { facilityUsageRights: Object.values(overnight.facilityUsageRightsById).map(item => ({ ...item, validTo: f.date })) })
    expect(act(advanceDay(expires)).status).toBe('BLOCKED')
    expect(act(advanceDay(overnight)).status).toBe('COMPLETED')
  })
  it('can select a real compatible independent alternative without duplicating the act', () => {
    const alternative = createFacilityComponent({ ...f.component, id: 'm1:independent', parentComponentId: null })
    const input = updateGameWorld(training(releaseEquippedMedicalAllocation(f.scheduled, f.indication.id)), { facilityComponents: [...Object.values(f.scheduled.facilityComponentsById), alternative], facilityComponentConditionRecords: [...Object.values(f.scheduled.facilityComponentConditionRecordsById), createFacilityComponentConditionRecord({ id: 'm1:independent-condition', componentId: alternative.id, effectiveFrom: f.world.currentDate, serviceability: 'FULL', physicalCondition: 80 })] })
    const booked = requestTrainingPhysicalAllocation(input, { sessionId: 'm1:training', componentId: f.court.id, requestId: 'court-owner', confirm: true })
    const moved = scheduleEquippedRehabilitation(booked, { ...f.schedule, componentId: alternative.id, requestId: 'alternate-component' })
    expect(equippedActs(moved)).toHaveLength(1)
    expect(act(moved).physicalAllocations?.at(-1)?.componentId).toBe(alternative.id)
    const next = advanceDay(reload(moved))
    expect(act(next).status).toBe('COMPLETED'); expect(next.scheduledTrainingSessionsById['m1:training']?.status).toBe('completed')
  })
  it('does not equate patients to stations or manufacture a confirmed shared-capacity booking', () => {
    const shared = updateGameWorld(f.indicated, { facilityComponents: Object.values(f.indicated.facilityComponentsById).map(item => item.id === f.component.id ? createFacilityComponent({ ...item, occupancySharing: 'SHARED_CAPACITY', specification: { kind: 'CAPACITY', amount: 1, unit: 'TREATMENT_STATIONS' } }) : item) })
    const requested = scheduleEquippedRehabilitation(shared, f.schedule)
    expect(act(requested).physicalAllocations?.at(-1)).toMatchObject({ status: 'PENDING', demand: null, unit: null })
    expect(act(advanceDay(requested)).status).toBe('COMPLETED')
  })
  it('rejects same-day requests that the next-day Calendar cannot execute', () => {
    expect(() => scheduleEquippedRehabilitation(f.indicated, { ...f.schedule, interval: { ...f.schedule.interval, date: f.world.currentDate } })).toThrow('cannot be scheduled')
  })
  it('rejects missing or perform-only prescribing evidence on Save reload', () => {
    const saved = serializeGameWorldV4(f.scheduled, '2026-10-10T00:00:00.000Z')
    const missing = JSON.parse(JSON.stringify(saved))
    missing.payload.injuries[0].equippedRehabilitationActs[0].prescribingAuthorizationId = 'NO_SUCH_GRANT'
    expect(() => deserializeGameWorldV4(missing)).toThrow()
    const wrongScope = JSON.parse(JSON.stringify(saved))
    wrongScope.payload.injuries[0].equippedRehabilitationActs[0].indicationEvidence.authorization.actions = ['PERFORM']
    expect(() => deserializeGameWorldV4(wrongScope)).toThrow()
  })
  it('replays accepted commands after completion or revocation without new acts or claims', () => {
    const completed = advanceDay(f.scheduled)
    expect(indicateEquippedRehabilitation(completed, f.indication)).toBe(completed)
    expect(scheduleEquippedRehabilitation(completed, f.schedule)).toBe(completed)
    const revoked = updateGameWorld(f.indicated, { staffPeople: Object.values(f.indicated.staffPeopleById).map(person => person.id === f.staffId ? { ...person, professional: { ...person.professional, clinicalAuthorizations: person.professional.clinicalAuthorizations!.map(item => ({ ...item, eligibility: 'REVOKED' as const })) } } : person) })
    expect(indicateEquippedRehabilitation(reload(revoked), f.indication)).toEqual(reload(revoked))
    const departed = updateGameWorld(f.scheduled, { teamStaffAssignments: Object.values(f.scheduled.teamStaffAssignmentsById).filter(item => item.id !== f.assignmentId) })
    expect(act(reload(departed)).indicationEvidence).toEqual(act(f.scheduled).indicationEvidence)
    expect(act(advanceDay(reload(departed))).status).toBe('BLOCKED')
  })

  it('preserves accepted indication after actual Staff departure and revalidates execution permission', () => {
    const employed = updateGameWorld(f.scheduled, { staffEmploymentByStaffId: { ...f.scheduled.staffEmploymentByStaffId, [f.staffId]: { status: 'employed', teamId: f.team.id, roleId: 'rehabilitationSpecialist', startedOn: f.world.currentDate } } })
    const fired = reload(fireStaffFromTeam(employed, f.staffId))
    expect(act(fired).indicationEvidence).toEqual(act(f.scheduled).indicationEvidence)
    expect(act(advanceDay(fired)).status).toBe('BLOCKED')
  })
  it('blocks scoped physical work and permits canonical reprogramming after restoration', () => {
    const project = createFacilityDevelopmentProject({ id: 'm1:work', organizationId: f.team.organizationId, facilityId: f.component.facilityId, projectType: 'RECONFIGURATION', createdAt: f.world.currentDate, plannedStartDate: f.world.currentDate, plannedCompletionDate: addDays(f.date, 10), status: 'IN_PROGRESS', actualStartDate: f.world.currentDate, scope: { kind: 'RENOVATE_COMPONENT', componentId: f.court.id, resultingCondition: 90 } })
    const blocked = advanceDay(updateGameWorld(f.scheduled, { facilityDevelopmentProjects: [project] }))
    expect(act(blocked).history.at(-1)?.reason).toBe('PHYSICAL_WORK')
    const restored = updateGameWorld(blocked, { facilityDevelopmentProjects: [] })
    const rescheduled = scheduleEquippedRehabilitation(restored, { ...f.schedule, requestId: 'after-restoration', interval: { ...f.schedule.interval, date: addDays(restored.currentDate, 1) } })
    expect(act(advanceDay(reload(rescheduled))).status).toBe('COMPLETED')
  })

  it('honors explicit unemployment facts without inventing eligibility', () => {
    const unemployed = updateGameWorld(f.world, { teamStaffAssignments: Object.values(f.world.teamStaffAssignmentsById).filter(item => item.id !== f.assignmentId), staffEmploymentByStaffId: { ...f.world.staffEmploymentByStaffId, [f.staffId]: { status: 'unemployed' } } })
    expect(() => indicateEquippedRehabilitation(unemployed, f.indication)).toThrow('PROFESSIONAL_NOT_EMPLOYED_FOR_TEAM')
  })

})
