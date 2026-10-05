import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString, type PlayerId, type TeamId } from '@/domain/ids'
import { createScheduledTrainingSession } from '@/domain/training'
import { getAvailableRosterPlayers, updateGameWorld, type GameWorld } from '@/domain/world'
import { canTeamTrainOnDate, executeScheduledTrainingSessions, scheduleTrainingSession } from '@/engine/training'
import { trainingInjuryProbability } from '@/engine/injury/TrainingInjuries'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

/**
 * MX0.2 Blocker A: Training is an injury producer like a match, and it must honor the same canonical
 * playable-minimum rule -- never leaving a club unable to dress five available Players. When it did not,
 * the canonical result-application chain (which re-derives TeamStrength from availability) failed the whole
 * day transition for an otherwise valid AI club.
 */
function trainedSessionIdFor(playerId: PlayerId): string {
  const probability = trainingInjuryProbability({ riskWeight: 1.2, intensity: 'high', durationMinutes: 240, fatigue: 95, recurrence: 1, participationMultiplier: 1 })
  return Array.from({ length: 2000 }, (_, index) => `mx02-floor-injury-${index}`)
    .find((candidate) => new SeededRandomSource(hashStringToSeed(`training-injury-occurrence-v1:${candidate}:${playerId}`)).nextFloat(0, 1) < probability)!
}

function exhaustToAvailable(world: GameWorld, teamId: TeamId, keep: number): GameWorld {
  const injuries = getAvailableRosterPlayers(world, teamId, world.currentDate).slice(keep).map((player, index) => createInjury({
    id: injuryIdFromString(`mx02-floor:${teamId}:${player.id}`), playerId: player.id, kind: 'ankleSprain', severity: 'minor',
    injuredOn: world.currentDate, expectedReturnDate: addDays(world.currentDate, 20 + index),
  }))
  return updateGameWorld(world, { injuries: [...Object.values(world.injuriesById), ...injuries] })
}

describe('MX0.2 training playable-minimum floor', () => {
  it('records the session injury while the club can still dress five, and suppresses it at the floor', { timeout: 180_000 }, () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams).find((team) => team.rosterPlayerIds.length >= 6)!.id
    const playerId = base.teams[teamId]!.rosterPlayerIds[0]!
    const date = Array.from({ length: 20 }, (_, index) => addDays(base.currentDate, index + 1)).find((candidate) => canTeamTrainOnDate(base, teamId, candidate))!
    const sessionId = trainedSessionIdFor(playerId)
    const session = createScheduledTrainingSession({ id: sessionId, teamId, playerId, date, startTime: '09:00', durationMinutes: 240, scope: 'individual', definitionId: 'strength', intensity: 'high' })

    // Above the floor the same seeded session does record the injury, proving the roll succeeds.
    const above = updateGameWorld(scheduleTrainingSession(updateGameWorld(base, { careerFatigueByPlayerId: { ...base.careerFatigueByPlayerId, [playerId]: 95 } }), session), { currentDate: date })
    const aboveExecuted = executeScheduledTrainingSessions(above)
    expect(Object.values(aboveExecuted.injuriesById).some((injury) => injury.sourceTrainingSessionId === sessionId)).toBe(true)

    // At the floor the same club keeps five available Players: the injury is not recorded.
    const atFloor = updateGameWorld(exhaustToAvailable(base, teamId, 5), { careerFatigueByPlayerId: { ...base.careerFatigueByPlayerId, [playerId]: 95 } })
    expect(getAvailableRosterPlayers(atFloor, teamId, atFloor.currentDate)).toHaveLength(5)
    const floorSession = scheduleTrainingSession(atFloor, session)
    const floorExecuted = executeScheduledTrainingSessions(updateGameWorld(floorSession, { currentDate: date }))

    expect(Object.values(floorExecuted.injuriesById).some((injury) => injury.sourceTrainingSessionId === sessionId)).toBe(false)
    expect(getAvailableRosterPlayers(floorExecuted, teamId, floorExecuted.currentDate).length).toBeGreaterThanOrEqual(5)
  })
})
