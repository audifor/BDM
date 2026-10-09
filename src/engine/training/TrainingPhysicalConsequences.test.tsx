import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createScheduledTrainingSession } from '@/domain/training'
import { createFacility, createFacilityComponent, createFacilityComponentConditionRecord, createFacilityDevelopmentProject, createFacilityUsageRight, createPlace, type FacilityServiceability } from '@/domain/facilities'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { getUserTeam } from '@/engine/calendar'
import { executeScheduledTrainingSessions, scheduleTrainingSession, nextEligibleTrainingDate } from './ScheduledTrainingEngine'
import { recoverCareerFatigueForDay } from './TrainingEngine'
import { resolveSportingOperation } from '@/integration/facilitiesSporting/SportingOperationResolver'
import { basketballFacilityContextForTeamAt } from '@/integration/facilitiesSporting'
import { reviewReturnToPlay } from '@/engine/injury/ReturnToPlayEngine'
import { evaluateFitnessTest } from '@/engine/injury/FitnessTest'
import { progressRehabilitationSetbacks } from '@/engine/injury/Rehabilitation'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { TrainingPhysicalExplanation } from '@/ui-ng/applications/training/TrainingPhysicalExplanation'

function fixture(definitionId = 'threePoint', scope: 'team' | 'individual' = 'team') {
  const base = deserializeGameWorldV4(serializeGameWorldV4(createNewGame(), '2026-10-09T00:00:00.000Z'))
  const team = getUserTeam(base)!
  const date = nextEligibleTrainingDate(base.currentDate)
  const place = createPlace({ id: 'p:p0', kind: 'CAMPUS', name: 'Campus' })
  const facility = createFacility({ id: 'f:p0', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Practice Center' })
  const component = createFacilityComponent({ id: 'c:p0', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE', specification: { kind: 'COURT', isFullCourt: true, isIndoor: true } })
  const condition = createFacilityComponentConditionRecord({ id: 'condition:p0', componentId: component.id, effectiveFrom: base.currentDate, physicalCondition: 80, serviceability: 'FULL' })
  const right = createFacilityUsageRight({ id: 'right:p0', facilityId: facility.id, teamId: team.id, purpose: 'OTHER', exclusivity: 'SHARED', validFrom: base.currentDate })
  const physical = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [component], facilityComponentConditionRecords: [condition], facilityUsageRights: [right] })
  const session = createScheduledTrainingSession({ id: 'session:p0', teamId: team.id, date, startTime: '10:00', durationMinutes: 60, scope, ...(scope === 'individual' ? { playerId: team.rosterPlayerIds[0]! } : {}), definitionId, intensity: 'normal' })
  const world = updateGameWorld(scheduleTrainingSession(physical, session), { currentDate: date })
  return { world, base, team, session, facility, component, condition, right }
}
function service(world: GameWorld, value: FacilityServiceability) {
  return updateGameWorld(world, { facilityComponentConditionRecords: Object.values(world.facilityComponentConditionRecordsById).map((r) => createFacilityComponentConditionRecord({ ...r, serviceability: value })) })
}
function attempt(world: GameWorld) { return world.scheduledTrainingSessionsById['session:p0']!.physicalAttempt! }
function result(world: GameWorld) { return executeScheduledTrainingSessions(world) }

describe('BS17D-P0 production Training causality', () => {
  it.each(['team', 'individual'] as const)('executes %s training with rights, blocks OOS without any sporting effects', (scope) => {
    const { world, team, session } = fixture('threePoint', scope)
    const unavailable = service(world, 'OUT_OF_SERVICE')
    expect(basketballFacilityContextForTeamAt(world, team.id, world.currentDate).usablePracticeCourtCount).toBe(1)
    expect(basketballFacilityContextForTeamAt(unavailable, team.id, world.currentDate).usablePracticeCourtCount).toBe(0)
    const availableResult = result(world), blocked = result(unavailable)
    expect(availableResult.scheduledTrainingSessionsById[session.id]!.status).toBe('completed')
    expect(attempt(availableResult).status).toBe('VERIFIED_AVAILABLE')
    expect(blocked.scheduledTrainingSessionsById[session.id]!.status).toBe('scheduled')
    expect(attempt(blocked).status).toBe('VERIFIED_UNAVAILABLE')
    expect(attempt(blocked).resources[0]!.reason).toBe('OUT_OF_SERVICE')
    for (const key of Object.keys(unavailable) as (keyof GameWorld)[]) {
      if (key !== 'scheduledTrainingSessionsById') expect(blocked[key], key).toEqual(unavailable[key])
    }
    expect(availableResult.developmentStimulusEventsById).not.toEqual(world.developmentStimulusEventsById)
    expect(result(blocked)).toEqual(blocked)
    expect(result(availableResult)).toEqual(availableResult)
  })

  it('does not infer Team rights from an Organization-only entitlement', () => {
    const { world, right, team } = fixture()
    const noRights = updateGameWorld(world, { facilityUsageRights: [] })
    const orgOnly = updateGameWorld(world, { facilityUsageRights: [createFacilityUsageRight({ ...right, teamId: null, organizationId: team.organizationId })] })
    expect(attempt(result(noRights)).resources[0]).toMatchObject({ reason: 'NO_ACCESS', hasAccess: false })
    expect(attempt(result(orgOnly)).status).toBe('VERIFIED_UNAVAILABLE')
    expect(attempt(result(world)).status).toBe('VERIFIED_AVAILABLE')
  })

  it('honors temporary rights and their component scope', () => {
    const { world, right, component } = fixture()
    const expired = updateGameWorld(world, { facilityUsageRights: [createFacilityUsageRight({ ...right, validTo: addDays(world.currentDate, -1) })] })
    expect(attempt(result(expired)).status).toBe('VERIFIED_UNAVAILABLE')
    const scoped = updateGameWorld(world, { facilityUsageRights: [createFacilityUsageRight({ ...right, componentIds: [component.id] })] })
    expect(attempt(result(scoped)).status).toBe('VERIFIED_AVAILABLE')
  })

  it('blocks actual work on the required component without closing unrelated resources', () => {
    const { world, component, facility, team } = fixture()
    const project = createFacilityDevelopmentProject({ id: 'project:p0', organizationId: team.organizationId, facilityId: facility.id, projectType: 'RECONFIGURATION', createdAt: world.currentDate, plannedStartDate: world.currentDate, plannedCompletionDate: addDays(world.currentDate, 10), status: 'IN_PROGRESS', actualStartDate: world.currentDate, scope: { kind: 'RENOVATE_COMPONENT', componentId: component.id, resultingCondition: 90 } })
    const work = updateGameWorld(world, { facilityDevelopmentProjects: [project] })
    expect(attempt(result(work)).resources[0]!.reason).toBe('PHYSICAL_WORK')
    expect(result(work).careerFatigueByPlayerId).toEqual(work.careerFatigueByPlayerId)
  })

  it('keeps compatible LIMITED execution unchanged and blocks a concretely incompatible court', () => {
    const { world, component } = fixture('offensiveSystem')
    const limited = service(world, 'LIMITED')
    const compatible = result(limited)
    expect(attempt(compatible).status).toBe('VERIFIED_LIMITED')
    expect(compatible.scheduledTrainingSessionsById['session:p0']!.execution).toEqual(result(world).scheduledTrainingSessionsById['session:p0']!.execution)
    const incompatible = updateGameWorld(limited, { facilityComponents: [createFacilityComponent({ ...component, specification: { kind: 'COURT', isFullCourt: false, isIndoor: true } })] })
    expect(attempt(result(incompatible)).resources[0]!.reason).toBe('INCOMPATIBLE_COURT')
    expect(result(incompatible).developmentStimulusEventsById).toEqual(incompatible.developmentStimulusEventsById)
  })

  it('keeps legacy execution when infrastructure or its condition is unknown', () => {
    const { world, base, session } = fixture()
    const unknown = updateGameWorld(base, { currentDate: world.currentDate, scheduledTrainingSessionsById: { [session.id]: session } })
    const completed = result(unknown)
    expect(attempt(completed).status).toBe('UNVERIFIED_PHYSICAL_CONTEXT')
    expect(completed.scheduledTrainingSessionsById[session.id]!.execution).toEqual(result(world).scheduledTrainingSessionsById[session.id]!.execution)
    const unknownCondition = updateGameWorld(world, { facilityComponentConditionRecords: [] })
    expect(attempt(result(unknownCondition)).status).toBe('UNVERIFIED_PHYSICAL_CONTEXT')
  })

  it.each(['MAIN_COURT', 'SECONDARY_COURT'] as const)('retains known incompatible %s geometry rather than treating it as missing data', (type) => {
    const { world, component } = fixture('offensiveSystem')
    const incompatible = updateGameWorld(service(world, 'LIMITED'), { facilityComponents: [createFacilityComponent({ ...component, type, specification: { kind: 'COURT', isFullCourt: false, isIndoor: true } })] })
    expect(attempt(result(incompatible)).status).toBe('VERIFIED_UNAVAILABLE')
    expect(attempt(result(incompatible)).resources[0]!.reason).toBe('INCOMPATIBLE_COURT')
  })

  it('restores same-day execution and supports canonical rescheduling after a missed date', () => {
    const { world, session } = fixture()
    const blocked = result(service(world, 'OUT_OF_SERVICE'))
    const restored = result(service(blocked, 'FULL'))
    expect(restored.scheduledTrainingSessionsById[session.id]!.execution).toEqual(result(world).scheduledTrainingSessionsById[session.id]!.execution)
    expect(attempt(restored).status).toBe('VERIFIED_AVAILABLE')
    const futureDate = nextEligibleTrainingDate(blocked.currentDate)
    const rescheduled = scheduleTrainingSession(service(blocked, 'FULL'), { ...blocked.scheduledTrainingSessionsById[session.id]!, date: futureDate })
    expect(attempt(rescheduled)).toEqual(attempt(blocked))
    expect(result(updateGameWorld(rescheduled, { currentDate: futureDate })).scheduledTrainingSessionsById[session.id]!.status).toBe('completed')
  })

  it('uses legitimate alternatives before blocking and does not assume a shared reservation', () => {
    const { world, component, right, team } = fixture()
    const other = createFacilityComponent({ ...component, id: 'c:alternative' })
    const alternate = updateGameWorld(service(world, 'OUT_OF_SERVICE'), {
      facilityComponents: [component, other],
      facilityComponentConditionRecords: [...Object.values(service(world, 'OUT_OF_SERVICE').facilityComponentConditionRecordsById), createFacilityComponentConditionRecord({ id: 'condition:alternative', componentId: other.id, effectiveFrom: world.currentDate, physicalCondition: 80, serviceability: 'FULL' })],
    })
    expect(attempt(result(alternate)).status).toBe('VERIFIED_AVAILABLE')
    expect(attempt(result(alternate)).resources).toHaveLength(2)
    const secondTeam = Object.values(world.teams).find((t) => t.id !== team.id)!
    const shared = updateGameWorld(world, { facilityUsageRights: [right, createFacilityUsageRight({ ...right, id: 'right:shared', teamId: secondTeam.id })] })
    const resolution = resolveSportingOperation(shared, { teamId: secondTeam.id, date: world.currentDate, operationId: 'training', requirements: [{ capabilities: ['BASKETBALL_TRAINING'] }], interval: { startTime: '10:00', durationMinutes: 60 }, demand: { amount: 99, unit: 'SIMULTANEOUS_PLAYERS' } })
    expect(resolution.status).toBe('VERIFIED_AVAILABLE')
    expect(resolution.resources[0]!.operationalCapacity).toBeNull()
  })

  it('does not turn nominal comparable capacity into an operational allocator', () => {
    const { world, component, team } = fixture()
    const capacityWorld = updateGameWorld(world, { facilityComponents: [createFacilityComponent({ ...component, specification: { kind: 'CAPACITY', amount: 1, unit: 'SIMULTANEOUS_PLAYERS' } })] })
    const resolution = resolveSportingOperation(capacityWorld, { teamId: team.id, date: world.currentDate, operationId: 'training', requirements: [{ capabilities: ['BASKETBALL_TRAINING'] }], demand: { amount: 12, unit: 'SIMULTANEOUS_PLAYERS' }, interval: { startTime: '10:00', durationMinutes: 60 } })
    expect(resolution.status).toBe('VERIFIED_AVAILABLE')
    expect(resolution.resources[0]).toMatchObject({ nominalCapacity: 1, capacityUnit: 'SIMULTANEOUS_PLAYERS', operationalCapacity: null })
  })

  it.each(['FULL', 'OUT_OF_SERVICE'] as const)('round-trips %s attempts and replays equivalently without double application', (value) => {
    const { world } = fixture()
    const completed = result(service(world, value))
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(completed, '2026-10-09T00:00:00.000Z'))
    expect(loaded.scheduledTrainingSessionsById).toEqual(completed.scheduledTrainingSessionsById)
    expect(result(loaded)).toEqual(result(completed))
    const saved = serializeGameWorldV4(world, '2026-10-09T00:00:00.000Z')
    expect(result(deserializeGameWorldV4(saved))).toEqual(result(world))
  })

  it('explains persisted cause, result, capacity unknown and continuity to the manager', () => {
    const { world } = fixture()
    const blocked = result(service(world, 'OUT_OF_SERVICE'))
    const html = renderToStaticMarkup(<TrainingPhysicalExplanation world={blocked} attempt={attempt(blocked)} />)
    expect(html).toContain('Practice Center')
    expect(html).toContain('OUT_OF_SERVICE')
    expect(html).toContain('Session not executed')
    expect(html).toContain('operational capacity unknown')
  })

  it('rejects forged physical evidence while accepting pre-P0 sessions without the extension', () => {
    const { world, session } = fixture()
    expect(createScheduledTrainingSession(session).physicalAttempt).toBeUndefined()
    const completed = result(world)
    const saved = serializeGameWorldV4(completed, '2026-10-09T00:00:00.000Z')
    const malformed = JSON.parse(JSON.stringify(saved))
    malformed.payload.scheduledTrainingSessions.find((entry: { id: string }) => entry.id === session.id).physicalAttempt.resources[0].operationalCapacity = 100
    expect(() => deserializeGameWorldV4(malformed)).toThrow()
    expect(() => createScheduledTrainingSession({ ...completed.scheduledTrainingSessionsById[session.id]!, physicalAttempt: { ...attempt(completed), status: 'VERIFIED_UNAVAILABLE' } })).toThrow()
    const mutable = JSON.parse(JSON.stringify(attempt(completed)))
    const protectedSession = createScheduledTrainingSession({ ...completed.scheduledTrainingSessionsById[session.id]!, physicalAttempt: mutable })
    mutable.resources[0].reason = 'FORGED'
    mutable.status = 'VERIFIED_UNAVAILABLE'
    expect(protectedSession.physicalAttempt!.status).toBe('VERIFIED_AVAILABLE')
    expect(protectedSession.physicalAttempt!.resources[0]!.reason).toBe('AVAILABLE')
    expect(Object.isFrozen(protectedSession.physicalAttempt!.resources[0])).toBe(true)
  })

  it('preserves rest, Medical fitness/RTP, setbacks and daily recovery with no direct Facilities modifiers', () => {
    const { world, team } = fixture('rest')
    const unavailable = service(world, 'OUT_OF_SERVICE')
    expect(attempt(result(unavailable)).status).toBe('NOT_REQUIRED')
    expect(result(unavailable).careerFatigueByPlayerId).toEqual(result(world).careerFatigueByPlayerId)
    expect(recoverCareerFatigueForDay(unavailable).careerFatigueByPlayerId).toEqual(recoverCareerFatigueForDay(world).careerFatigueByPlayerId)
    const injury = createInjury({ id: injuryIdFromString('injury:p0'), playerId: team.rosterPlayerIds[0]!, kind: 'ankleSprain', severity: 'minor', injuredOn: addDays(world.currentDate, -10), expectedReturnDate: world.currentDate })
    const a = updateGameWorld(world, { injuries: [injury] }), b = updateGameWorld(unavailable, { injuries: [injury] })
    const actor = { kind: 'USER' as const, coachId: world.userCoachId }
    expect(evaluateFitnessTest(a, injury, world.currentDate, actor)).toEqual(evaluateFitnessTest(b, injury, world.currentDate, actor))
    expect(progressRehabilitationSetbacks(a).injuriesById).toEqual(progressRehabilitationSetbacks(b).injuriesById)
    const clearA = reviewReturnToPlay(a, { injuryId: injury.id, decision: 'CLEAR_FOR_PLAY', actor })
    const clearB = reviewReturnToPlay(b, { injuryId: injury.id, decision: 'CLEAR_FOR_PLAY', actor })
    expect(clearA.ok).toBe(true); expect(clearB.ok).toBe(true)
    if (clearA.ok && clearB.ok) expect(clearA.world.injuriesById).toEqual(clearB.world.injuriesById)
    const clinical = resolveSportingOperation(b, { teamId: team.id, date: world.currentDate, operationId: 'clinicalReview', requirements: [] })
    expect(clinical.status).toBe('NOT_REQUIRED')
    expect(b.injuriesById[injury.id]).toEqual(injury)
    expect(result(world).players).toEqual(world.players)
    expect(Object.keys(result(world).players)).toEqual(Object.keys(world.players))
  })
})
