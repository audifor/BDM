import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createFacilityComponentConditionRecord, createFacilityUsageRight } from '@/domain/facilities'
import { acceptYouthIntake, promotePathwayPlayer } from '@/engine/youth/YouthPathwayEngine'
import { materializeTalentCandidate } from '@/engine/world/TalentSupply'
import { progressAnnualTalentSupply } from '@/engine/world/AnnualTalentSupply'
import { executeScheduledTrainingSessions } from '@/engine/training/ScheduledTrainingEngine'
import { advanceDayWithTrace } from '@/engine/calendar'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { youthFacilitiesFixture, acceptedYouthTrainingFixture } from './testFixtures'
import { buildYouthFacilitiesContext } from './YouthFacilitiesReadModel'

const savedAt = '2032-10-01T00:00:00.000Z'
const save = (world: GameWorld) => serializeGameWorldV4(world, savedAt)
function condition(world: GameWorld, serviceability: 'FULL' | 'LIMITED' | 'OUT_OF_SERVICE') {
  return updateGameWorld(world, { facilityComponentConditionRecords: Object.values(world.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability })) })
}
function unknown(world: GameWorld) {
  return updateGameWorld(world, { facilities: [], facilityComponents: [], facilityComponentConditionRecords: [], facilityUsageRights: [] })
}
function noTeamRight(world: GameWorld) {
  return updateGameWorld(world, { facilityUsageRights: Object.values(world.facilityUsageRightsById).filter(right => right.id !== 't:team-right') })
}
function financeGovernance(world: GameWorld) {
  return Object.fromEntries(Object.entries(world).filter(([key]) => /financ|governance|treasury|reservation|revenue|expense|payable|receivable|debt|ledger|operatingCost|salary|budget/i.test(key)))
}
function sourceFacts(world: GameWorld) {
  return { players: world.players, persons: world.personsById, rosters: world.teams, cohorts: world.talentCohortsById, materializations: world.talentMaterializationsByCandidateKey, registrations: world.playerRegistrationsById, pathways: world.teamPathwayRelationsById, injuries: world.injuriesById, finances: financeGovernance(world) }
}

describe('BS17D-T canonical youth and Facilities integration', () => {
  it.each(['male', 'female'] as const)('keeps %s intake, candidate identity, materialization and registration independent of physical service/access', gender => {
    const fixture = youthFacilitiesFixture(gender)
    const variants = [fixture.world, condition(fixture.world, 'OUT_OF_SERVICE'), noTeamRight(fixture.world), unknown(fixture.world)]
    const results = variants.map(world => {
      const before = save(world)
      const intake = acceptYouthIntake(world, fixture.intake)
      expect(intake.ok).toBe(true)
      if (!intake.ok) throw new Error(intake.reason)
      expect(save(world)).toEqual(before)
      expect(Object.keys(intake.world.players)).toHaveLength(Object.keys(world.players).length + 1)
      expect(acceptYouthIntake(intake.world, fixture.intake).world).toBe(intake.world)
      expect(materializeTalentCandidate(intake.world, 't:cohort', 1, 'SCOUTING_DISCOVERY')).toMatchObject({ created: false, player: { id: intake.playerId } })
      expect(intake.world.talentMaterializationsByCandidateKey['t:cohort:candidate:000001']?.playerId).toBe(intake.playerId)
      expect(financeGovernance(intake.world)).toEqual(financeGovernance(world))
      const loaded = deserializeGameWorldV4(save(intake.world))
      expect(acceptYouthIntake(loaded, fixture.intake).world).toBe(loaded)
      const promoted = promotePathwayPlayer(loaded, { playerId: intake.playerId, toTeamId: fixture.senior.id, actionId: 't:promote' })
      expect(promoted.ok).toBe(true)
      expect(promoted.world.players[intake.playerId]).toEqual(intake.world.players[intake.playerId])
      return sourceFacts(intake.world)
    })
    for (const result of results.slice(1)) expect(result).toEqual(results[0])
  })

  it.each(['male', 'female'] as const)('a real registered %s youth Player trains through the existing P0 owner; outage blocks only its court module', gender => {
    const fixture = acceptedYouthTrainingFixture(gender)
    const input = updateGameWorld(fixture.world, { currentDate: fixture.date })
    const blockedInput = condition(input, 'OUT_OF_SERVICE')
    const before = save(blockedInput)
    const available = executeScheduledTrainingSessions(input)
    const blocked = executeScheduledTrainingSessions(blockedInput)
    expect(available.scheduledTrainingSessionsById['t:training']).toMatchObject({ status: 'completed', physicalAttempt: { status: 'VERIFIED_AVAILABLE' } })
    expect(blocked.scheduledTrainingSessionsById['t:training']).toMatchObject({ status: 'scheduled', physicalAttempt: { status: 'VERIFIED_UNAVAILABLE' } })
    expect(Object.values(available.developmentStimulusEventsById)).toContainEqual(expect.objectContaining({ playerId: fixture.playerId, sourceId: 't:training' }))
    expect(Object.values(blocked.developmentStimulusEventsById).filter(event => event.sourceId === 't:training')).toHaveLength(0)
    expect(blocked.scheduledTrainingSessionsById['t:independent']).toMatchObject({ status: 'completed', physicalAttempt: { status: 'NOT_REQUIRED' } })
    expect(sourceFacts(available)).toEqual(sourceFacts(blocked))
    expect(sourceFacts(available)).toEqual(sourceFacts(input))
    expect(save(blockedInput)).toEqual(before)
    const restored = executeScheduledTrainingSessions(condition(blocked, 'FULL'))
    expect(restored.scheduledTrainingSessionsById['t:training']).toMatchObject({ status: 'completed', physicalAttempt: { status: 'VERIFIED_AVAILABLE' } })
    expect(restored.scheduledTrainingSessionsById['t:independent']).toEqual(blocked.scheduledTrainingSessionsById['t:independent'])
    expect(executeScheduledTrainingSessions(restored)).toEqual(restored)
    expect(sourceFacts(restored)).toEqual(sourceFacts(input))
  })

  it.each(['UNKNOWN', 'LIMITED', 'DENIED', 'EXPIRED'] as const)('handles %s without inventing youth capacity or changing the supply authority', variant => {
    const fixture = acceptedYouthTrainingFixture()
    const original = updateGameWorld(fixture.world, { currentDate: fixture.date })
    const input = variant === 'UNKNOWN' ? unknown(original) : variant === 'LIMITED' ? condition(original, 'LIMITED') : variant === 'DENIED' ? noTeamRight(original) : updateGameWorld(original, { facilityUsageRights: Object.values(original.facilityUsageRightsById).map(right => createFacilityUsageRight({ ...right, ...(right.id === 't:team-right' ? { validTo: addDays(original.currentDate, -1) } : {}) })) })
    const result = executeScheduledTrainingSessions(input)
    expect(result.scheduledTrainingSessionsById['t:training']).toMatchObject({ status: variant === 'DENIED' || variant === 'EXPIRED' ? 'scheduled' : 'completed', physicalAttempt: { status: variant === 'UNKNOWN' ? 'UNVERIFIED_PHYSICAL_CONTEXT' : variant === 'LIMITED' ? 'VERIFIED_LIMITED' : 'VERIFIED_UNAVAILABLE' } })
    expect(sourceFacts(result)).toEqual(sourceFacts(input))
    expect(sourceFacts(progressAnnualTalentSupply(input))).toEqual(sourceFacts(progressAnnualTalentSupply(original)))
    expect(buildYouthFacilitiesContext(result, fixture.senior.id)[0]?.facilities.flatMap(facility => facility.components).every(component => component.physical.operationalCapacity === null)).toBe(true)
  })

  it('shared Team rights do not invent slots, exclusivity or additional Players', () => {
    const fixture = acceptedYouthTrainingFixture()
    const shared = updateGameWorld(fixture.world, { currentDate: fixture.date, facilityUsageRights: [...Object.values(fixture.world.facilityUsageRightsById), createFacilityUsageRight({ id: 't:senior-right', facilityId: fixture.facility.id, teamId: fixture.senior.id, purpose: 'OTHER', exclusivity: 'SHARED', validFrom: fixture.world.currentDate })] })
    const result = executeScheduledTrainingSessions(shared)
    expect(result.scheduledTrainingSessionsById['t:training']).toMatchObject({ status: 'completed', physicalAttempt: { status: 'VERIFIED_AVAILABLE' } })
    expect(sourceFacts(result)).toEqual(sourceFacts(shared))
    const context = buildYouthFacilitiesContext(result, fixture.senior.id)[0]!
    expect(context.facilities[0]?.components[0]?.physical.operationalCapacity).toBeNull()
    const before = save(result)
    buildYouthFacilitiesContext(result, fixture.senior.id)
    expect(save(result)).toEqual(before)
  })

  it('Calendar executes youth Training once, preserves supply/Finance and reloads a pending physical attempt', () => {
    const fixture = acceptedYouthTrainingFixture()
    const source = condition(fixture.world, 'OUT_OF_SERVICE')
    const before = save(source)
    const day = advanceDayWithTrace(source)
    expect(day.status).not.toBe('FAILED')
    expect(day.phases.filter(phase => phase.phaseId === 'TRAINING')).toHaveLength(1)
    expect(day.phases.filter(phase => phase.phaseId === 'CLUB_FINANCE_V2')).toHaveLength(1)
    expect(day.world.currentDate).toBe(fixture.date)
    expect(day.world.scheduledTrainingSessionsById['t:training']).toMatchObject({ status: 'scheduled', physicalAttempt: { status: 'VERIFIED_UNAVAILABLE' } })
    expect(save(source)).toEqual(before)
    const loaded = deserializeGameWorldV4(save(day.world))
    expect(save(loaded)).toEqual(save(day.world))
    const retried = executeScheduledTrainingSessions(condition(loaded, 'FULL'))
    expect(retried.scheduledTrainingSessionsById['t:training']).toMatchObject({ status: 'completed' })
    const events = Object.values(retried.developmentStimulusEventsById).filter(event => event.sourceId === 't:training')
    expect(events).toHaveLength(1)
    expect(events[0]?.playerId).toBe(fixture.playerId)
    expect(executeScheduledTrainingSessions(deserializeGameWorldV4(save(retried)))).toEqual(retried)
    expect(retried.talentMaterializationsByCandidateKey).toEqual(source.talentMaterializationsByCandidateKey)
    expect(retried.players).toEqual(source.players)
    expect(financeGovernance(retried)).toEqual(financeGovernance(source))
    const next = advanceDayWithTrace(retried)
    expect(Object.values(next.world.developmentStimulusEventsById).filter(event => event.sourceId === 't:training')).toEqual(events)
  })
})
