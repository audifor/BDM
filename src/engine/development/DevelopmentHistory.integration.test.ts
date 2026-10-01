import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { createScheduledTrainingSession } from '@/domain/training'
import { executeScheduledTrainingSessions, nextEligibleTrainingDate, scheduleTrainingSession } from '@/engine/training'
import { applyOffseasonDevelopment } from './OffseasonDevelopment'

describe('annual development history integration', () => {
  it('retains actual Training provenance and checkpoint inputs after aggregate stimulus resets', () => {
    const world = createNewGame()
    const team = Object.values(world.teams)[0]!
    const playerId = team.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const scheduled = scheduleTrainingSession(world, createScheduledTrainingSession({ id: 'annual-history-session', teamId: team.id, playerId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', definitionId: 'threePoint', intensity: 'normal' }))
    const trained = executeScheduledTrainingSessions(updateGameWorld(scheduled, { currentDate: date }))
    const stimulusBefore = trained.developmentStimulusByPlayerId[playerId]!.byRating
    const sourceEventsBefore = Object.values(trained.developmentStimulusEventsById).filter((event) => event.playerId === playerId)
    const developed = applyOffseasonDevelopment(trained, { fromSeasonId: trained.currentSeasonId, toSeasonId: trained.currentSeasonId, targetDate: date, cycleId: 'annual-development:test' }).world
    const history = developed.playerRatingHistoryByPlayerId[playerId]!

    expect(developed.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting).toBe(0)
    expect(history.at(-1)!.stimulusByRating).toEqual(Object.fromEntries(Object.entries(stimulusBefore).filter(([, amount]) => amount > 0)))
    expect(Object.values(developed.developmentStimulusEventsById).filter((event) => event.playerId === playerId)).toEqual(sourceEventsBefore)
    expect(history.at(-1)!.truthDeltas).toBeDefined()
    expect(history.at(-1)!.checkpointDate).toBe(date)
    expect(history.at(-1)!.cycleId).toBe('annual-development:test')
  })
})
