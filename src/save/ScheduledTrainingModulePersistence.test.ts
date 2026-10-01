import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createScheduledTrainingSession } from '@/domain/training'
import { updateGameWorld } from '@/domain/world'
import { getPlayerRosterTeamId } from '@/domain/world'
import { assignTrainingModuleToPlayer, createOrUpdateUserTrainingModule, deleteUserTrainingModule, executeScheduledTrainingSessions, nextEligibleTrainingDate } from '@/engine/training'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T12:00:00.000Z'

function userTeamPlayerId(world: ReturnType<typeof createNewGame>) {
  return Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!.rosterPlayerIds[0]!
}

describe('scheduled training session module', () => {
  it('records the module a session was scheduled from', () => {
    const world = createNewGame()
    const playerId = userTeamPlayerId(world)
    const teamId = getPlayerRosterTeamId(world, playerId)!
    const scheduled = assignTrainingModuleToPlayer(world, {
      teamId,
      playerId,
      moduleId: 'threePoint',
      date: '2032-10-02' as never,
      startTime: '09:00',
      sessionId: 'session:1',
    })
    const session = scheduled.scheduledTrainingSessionsById['session:1']!

    expect(session.moduleId).toBe('threePoint')
    expect(session.definitionId).toBe('threePoint')
  })

  it('round-trips the module id', () => {
    const world = createNewGame()
    const playerId = userTeamPlayerId(world)
    const teamId = getPlayerRosterTeamId(world, playerId)!
    const scheduled = assignTrainingModuleToPlayer(world, {
      teamId,
      playerId,
      moduleId: 'threePoint',
      date: '2032-10-02' as never,
      startTime: '09:00',
      sessionId: 'session:1',
    })

    const loaded = deserializeGameWorldV1(
      JSON.parse(JSON.stringify(serializeGameWorldV1(scheduled, savedAt))) as unknown,
    )

    expect(loaded.scheduledTrainingSessionsById['session:1']!.moduleId).toBe('threePoint')
  })

  it('round-trips completed execution evidence, executor identity, and stimulus provenance', () => {
    const world = createNewGame()
    const playerId = userTeamPlayerId(world)
    const teamId = getPlayerRosterTeamId(world, playerId)!
    const date = nextEligibleTrainingDate(world.currentDate)
    const staffId = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === teamId)!.staffPersonId
    const withModule = createOrUpdateUserTrainingModule(world, { id: 'user-arc-work', name: 'Personal Arc Work', baseDefinitionId: 'threePoint', scope: 'individual', intensity: 'normal' })
    const scheduled = assignTrainingModuleToPlayer(withModule, { teamId, playerId, moduleId: 'user-arc-work', date, startTime: '09:00', sessionId: 'history-roundtrip', assignedStaffPersonIds: [staffId] })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduled, { currentDate: date }))
    const completed = deleteUserTrainingModule(executed, 'user-arc-work')
    const saved = serializeGameWorldV1(completed, savedAt)
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)

    expect(loaded.scheduledTrainingSessionsById['history-roundtrip']!.execution).toEqual(completed.scheduledTrainingSessionsById['history-roundtrip']!.execution)
    expect(loaded.scheduledTrainingSessionsById['history-roundtrip']!.execution!.moduleName).toBe('Personal Arc Work')
    expect(loaded.developmentStimulusEventsById).toEqual(completed.developmentStimulusEventsById)
    expect(loaded.scheduledTrainingSessionsById['history-roundtrip']!.assignedStaffPersonIds).toBeUndefined()
    expect(loaded.scheduledTrainingSessionsById['history-roundtrip']!.execution!.executingStaffPersonIds).toEqual([staffId])

    const loadedV4 = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(completed, savedAt))) as unknown)
    expect(loadedV4.scheduledTrainingSessionsById['history-roundtrip']!.execution).toEqual(completed.scheduledTrainingSessionsById['history-roundtrip']!.execution)
    expect(loadedV4.developmentStimulusEventsById).toEqual(completed.developmentStimulusEventsById)
  })

  it('keeps a legacy session without a module valid', () => {
    const world = createNewGame()
    const saved = serializeGameWorldV1(world, savedAt)
    const payload = JSON.parse(JSON.stringify(saved.payload)) as Record<string, unknown>

    expect(payload.scheduledTrainingSessions).toEqual([])
    expect(
      deserializeGameWorldV1({ ...saved, payload }).scheduledTrainingSessionsById,
    ).toEqual({})
    expect(deserializeGameWorldV1({ ...saved, payload }).developmentStimulusEventsById).toEqual({})
  })

  it('rejects a blank module id on the canonical creation boundary', () => {
    expect(() =>
      createScheduledTrainingSession({
        id: 'session:blank',
        teamId: 'team:1' as never,
        date: '2032-10-02' as never,
        startTime: '09:00',
        durationMinutes: 60,
        scope: 'individual',
        playerId: 'player:1' as never,
        definitionId: 'threePoint',
        moduleId: '   ',
        intensity: 'normal',
      }),
    ).toThrow(RangeError)
  })
})
