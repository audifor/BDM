import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createScheduledTrainingSession } from '@/domain/training'
import { getPlayerRosterTeamId } from '@/domain/world'
import { assignTrainingModuleToPlayer } from '@/engine/training'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

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

  it('keeps a legacy session without a module valid', () => {
    const world = createNewGame()
    const saved = serializeGameWorldV1(world, savedAt)
    const payload = JSON.parse(JSON.stringify(saved.payload)) as Record<string, unknown>

    expect(payload.scheduledTrainingSessions).toEqual([])
    expect(
      deserializeGameWorldV1({ ...saved, payload }).scheduledTrainingSessionsById,
    ).toEqual({})
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
