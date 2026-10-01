import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { createScheduledTrainingSession } from '@/domain/training'
import { canTeamTrainOnDate, executeScheduledTrainingSessions, scheduleTrainingSession } from '@/engine/training'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

describe('BS12D Save evidence', () => {
  it('round-trips explicit team participation and canonical Training injury source evidence', () => {
    const world = createNewGame()
    const team = Object.values(world.teams)[0]!
    const playerId = team.rosterPlayerIds[0]!
    const date = Array.from({ length: 21 }, (_, index) => addDays(world.currentDate, index + 1)).find((candidate) => canTeamTrainOnDate(world, team.id, candidate))!
    const pending = scheduleTrainingSession(world, createScheduledTrainingSession({ id: 'save-training-session', teamId: team.id, date, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal', participationByPlayerId: { [playerId]: 'REST' } }))
    const completed = executeScheduledTrainingSessions(updateGameWorld(pending, { currentDate: date }))
    const completedSession = completed.scheduledTrainingSessionsById['save-training-session']!
    const injuredPlayerId = team.rosterPlayerIds[1]!
    const injury = createInjury({ id: injuryIdFromString('save-training-injury'), playerId: injuredPlayerId, kind: 'ankleSprain', severity: 'minor', injuredOn: date, expectedReturnDate: addDays(date, 5), source: 'TRAINING', sourceTrainingSessionId: completedSession.id })
    const due = updateGameWorld(completed, { injuries: [...Object.values(completed.injuriesById), injury] })
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(serializeGameWorldV1(due, '2026-10-01T00:00:00.000Z'))))
    expect(loaded.scheduledTrainingSessionsById[completedSession.id]?.participationByPlayerId).toEqual({ [playerId]: 'REST' })
    expect(loaded.injuriesById[injury.id]).toMatchObject({ source: 'TRAINING', sourceTrainingSessionId: completedSession.id })

    const legacy = JSON.parse(JSON.stringify(serializeGameWorldV1(due, '2026-10-01T00:00:00.000Z'))) as { payload: { scheduledTrainingSessions: { id: string; participationByPlayerId?: unknown }[]; injuries: { id: string; source?: unknown; sourceTrainingSessionId?: unknown }[] } }
    const legacySession = legacy.payload.scheduledTrainingSessions.find((item) => item.id === completedSession.id)!
    const legacyInjury = legacy.payload.injuries.find((item) => item.id === injury.id)!
    delete legacySession.participationByPlayerId
    delete legacyInjury.source
    delete legacyInjury.sourceTrainingSessionId
    const compatible = deserializeGameWorldV1(legacy)
    expect(compatible.scheduledTrainingSessionsById[completedSession.id]?.participationByPlayerId).toBeUndefined()
    expect(compatible.injuriesById[injury.id]?.source).toBeUndefined()
    expect(compatible.injuriesById[injury.id]?.sourceTrainingSessionId).toBeUndefined()
  })
})
