import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { createFacilityComponentConditionRecord, createFacilityUsageRight } from '@/domain/facilities'
import { createScheduledTrainingSession } from '@/domain/training'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { demonstrationFixture } from '@/app/youth/recruitingTestFixtures'
import { buildYouthFacilitiesContext } from '@/app/youth/YouthFacilitiesReadModel'
import { recruitingFacilityOptions } from '@/app/youth/RecruitingFacilitiesReadModel'
import { acceptYouthIntake } from '@/engine/youth/YouthPathwayEngine'
import { scheduleTrainingSessionsBatch } from '@/engine/training/ScheduledTrainingEngine'
import { performRecruitingAction } from '@/engine/recruiting'
import { advanceDayWithTrace } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

const save = (world: GameWorld) => serializeGameWorldV4(world, '2032-10-01T00:00:00.000Z')
function fixture() {
  const source = demonstrationFixture(true)
  const intake = acceptYouthIntake(source.world, source.intake)
  if (!intake.ok) throw new Error(intake.reason)
  const date = addDays(intake.world.currentDate, 1)
  const rights = updateGameWorld(intake.world, { facilityUsageRights: [...Object.values(intake.world.facilityUsageRightsById),
    createFacilityUsageRight({ id: 'consolidation:youth-right', facilityId: source.facility.id, teamId: source.youth.id, purpose: 'OTHER', exclusivity: 'SHARED', validFrom: intake.world.currentDate }),
  ] })
  const world = scheduleTrainingSessionsBatch(rights, [createScheduledTrainingSession({ id: 'consolidation:youth-session', teamId: source.youth.id, date,
    startTime: '10:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })])
  // Normalize the existing NCAA compatibility boundary after adding a rostered youth Player, before comparing execution worlds.
  return { ...source, world: deserializeGameWorldV4(save(world)), youthPlayerId: intake.playerId }
}
function visit(world: GameWorld, source: ReturnType<typeof fixture>, selected: boolean) {
  const details = { requestId: 'consolidation:confirmation', type: 'unofficial' as const, startsOn: world.currentDate, endsOn: world.currentDate, lodgingNights: 0,
    ...(selected ? { facilityDemonstration: source.selection } : {}) }
  const result = performRecruitingAction(world, source.recruit.cycleId, source.recruit.id, source.senior.id, 'visit', details)
  if (!result.ok) throw new Error(result.reason)
  return result.value
}
function sharedFacts(world: GameWorld) {
  return { players: world.players, persons: world.personsById, cohorts: world.talentCohortsById, materializations: world.talentMaterializationsByCandidateKey,
    rosters: world.teams, registrations: world.playerRegistrationsById, injuries: world.injuriesById, games: world.games, matchLogs: world.matchStatLogsByGameId,
    rpg: world.recruitProfilesById, interests: world.recruitingInterests,
    economicsAndGovernance: Object.fromEntries(Object.entries(world).filter(([key]) => /financ|governance|treasury|payroll|salary|reservation|revenue|expense|payable|receivable|ledger|budget|debt|nil|scholarship|enforcement|violation/i.test(key))),
  }
}
describe('BS17D consolidated Talent in one canonical GameWorld', () => {
  it.each(['FULL', 'OUT_OF_SERVICE'] as const)('keeps youth Training/context and a recruiting demonstration jointly accessible with %s service, reload and exactly-once behavior', serviceability => {
    const source = fixture()
    const input = updateGameWorld(source.world, { facilityComponentConditionRecords: Object.values(source.world.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability })) })
    const before = save(input)
    const day = advanceDayWithTrace(input)
    expect(day.status).not.toBe('FAILED')
    for (const phase of ['TRAINING', 'RECRUITING', 'CLUB_FINANCE_V2']) expect(day.phases.filter(item => item.phaseId === phase)).toHaveLength(1)
    const selected = visit(day.world, source, true)
    const baseline = visit(day.world, source, false)
    expect(sharedFacts(selected)).toEqual(sharedFacts(baseline))
    expect(selected.players).toEqual(input.players)
    expect(selected.talentMaterializationsByCandidateKey).toEqual(input.talentMaterializationsByCandidateKey)
    const loaded = deserializeGameWorldV4(save(selected))
    expect(save(loaded)).toEqual(save(selected))
    const context = buildYouthFacilitiesContext(loaded, source.senior.id)[0]!
    const training = context.trainingAttempts.find(session => session.id === 'consolidation:youth-session')!
    const demonstration = Object.values(loaded.recruitingVisitsById).find(item => item.requestId === 'consolidation:confirmation')!.facilityDemonstration!
    expect(context.teamId).toBe(source.youth.id)
    expect(loaded.teams[source.youth.id]!.rosterPlayerIds).toContain(source.youthPlayerId)
    expect(training.status).toBe(serviceability === 'FULL' ? 'completed' : 'scheduled')
    expect(training.physicalAttempt?.status).toBe(serviceability === 'FULL' ? 'VERIFIED_AVAILABLE' : 'VERIFIED_UNAVAILABLE')
    expect(demonstration.attempts[0]?.result).toBe(serviceability === 'FULL' ? 'COMPLETED' : 'NOT_EXECUTED')
    expect(Object.values(loaded.developmentStimulusEventsById).filter(event => event.sourceId === training.id && event.playerId === source.youthPlayerId)).toHaveLength(serviceability === 'FULL' ? 1 : 0)
    const options = recruitingFacilityOptions(loaded, source.senior.id)
    expect(options).toContainEqual(expect.objectContaining({ selection: source.selection }))
    expect(visit(loaded, source, true)).toBe(loaded)
    const next = advanceDayWithTrace(loaded)
    expect(Object.values(next.world.recruitingVisitsById).find(item => item.requestId === 'consolidation:confirmation')?.facilityDemonstration).toEqual(demonstration)
    expect(save(input)).toEqual(before)
  })
  it('a single physical condition changes both real operations without changing supply, identity, RPG, Finance, Governance or Medical/match source facts', () => {
    const source = fixture()
    const full = advanceDayWithTrace(source.world)
    const unavailable = advanceDayWithTrace(updateGameWorld(source.world, { facilityComponentConditionRecords: Object.values(source.world.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability: 'OUT_OF_SERVICE' })) }))
    const availableVisit = visit(full.world, source, true), blockedVisit = visit(unavailable.world, source, true)
    expect(sharedFacts(availableVisit)).toEqual(sharedFacts(blockedVisit))
    expect(availableVisit.scheduledTrainingSessionsById['consolidation:youth-session']?.status).toBe('completed')
    expect(blockedVisit.scheduledTrainingSessionsById['consolidation:youth-session']?.status).toBe('scheduled')
    expect(Object.values(availableVisit.recruitingVisitsById).find(item => item.requestId === 'consolidation:confirmation')?.facilityDemonstration?.attempts[0]?.result).toBe('COMPLETED')
    expect(Object.values(blockedVisit.recruitingVisitsById).find(item => item.requestId === 'consolidation:confirmation')?.facilityDemonstration?.attempts[0]?.result).toBe('NOT_EXECUTED')
  })
})
