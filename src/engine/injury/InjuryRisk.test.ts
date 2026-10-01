import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { isPlayerAvailable } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { reviewReturnToPlay } from './ReturnToPlayEngine'
import { createScheduledTrainingSession } from '@/domain/training'
import { canTeamTrainOnDate, executeScheduledTrainingSessions, scheduleTrainingSession } from '@/engine/training'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { createDeterministicInjury, recurrenceRiskMultiplier } from './index'
import { injuryProbability as matchInjuryProbability } from './PostMatchInjuries'
import { trainingInjuryProbability } from './TrainingInjuries'

describe('BS12D injury risk', () => {
  it('keeps load risk bounded and orders low, normal, high training while increasing post-match odds with fatigue', () => {
    const low = trainingInjuryProbability({ riskWeight: .5, intensity: 'light', durationMinutes: 30, fatigue: 0, recurrence: 1, participationMultiplier: 1 })
    const normal = trainingInjuryProbability({ riskWeight: 1, intensity: 'normal', durationMinutes: 60, fatigue: 40, recurrence: 1, participationMultiplier: 1 })
    const high = trainingInjuryProbability({ riskWeight: 1.3, intensity: 'high', durationMinutes: 120, fatigue: 100, recurrence: 1.4, participationMultiplier: 1 })
    expect(low).toBeGreaterThan(0)
    expect(low).toBeLessThan(normal)
    expect(normal).toBeLessThan(high)
    expect(high).toBeLessThanOrEqual(.05)
    expect(trainingInjuryProbability({ riskWeight: 1.3, intensity: 'high', durationMinutes: 120, fatigue: 100, recurrence: 1.4, participationMultiplier: .5 })).toBe(high / 2)
    expect(matchInjuryProbability(2400, 0, 1)).toBeLessThan(matchInjuryProbability(2400, 100, 1))

    const recurrence = trainingInjuryProbability({ riskWeight: 1, intensity: 'normal', durationMinutes: 60, fatigue: 40, recurrence: 1.16, participationMultiplier: 1 })
    const random = new SeededRandomSource(hashStringToSeed('bs12d-injury-frequency-sanity-v1'))
    let lowHits = 0, normalHits = 0, highHits = 0, recurringHits = 0, noHistoryHits = 0
    for (let index = 0; index < 100_000; index += 1) {
      const roll = random.nextFloat(0, 1)
      if (roll < low) lowHits += 1
      if (roll < normal) normalHits += 1
      if (roll < high) highHits += 1
      if (roll < recurrence) recurringHits += 1
      if (roll < normal) noHistoryHits += 1
    }
    expect(lowHits).toBeLessThan(normalHits)
    expect(normalHits).toBeLessThan(highHits)
    expect(noHistoryHits).toBeLessThan(recurringHits)
  })

  it('adds a capped related recurrence modifier and creates a canonical Training InjuryRecord through the shared factory', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const priorDate = addDays(world.currentDate, -30)
    const returnDate = addDays(world.currentDate, -24)
    const prior = createInjury({ id: injuryIdFromString('prior-ankle'), playerId, kind: 'ankleSprain', severity: 'minor', injuredOn: priorDate, expectedReturnDate: returnDate, returnToPlay: { reviewDueOn: returnDate, clearedOn: returnDate, reviews: [] } })
    const withHistory = updateGameWorld(world, { injuries: [prior] })
    expect(recurrenceRiskMultiplier(withHistory, playerId, 'ankleSprain', world.currentDate)).toBe(1.16)
    expect(recurrenceRiskMultiplier(withHistory, playerId, 'hamstringStrain', world.currentDate)).toBe(1)
    const oldRelated = Array.from({ length: 8 }, (_, index) => {
      const injuredOn = addDays(world.currentDate, -400 - index * 10)
      const expectedReturnDate = addDays(injuredOn, 5)
      return createInjury({ id: injuryIdFromString(`old-ankle-${index}`), playerId, kind: 'ankleSprain', severity: 'minor', injuredOn, expectedReturnDate, returnToPlay: { reviewDueOn: expectedReturnDate, clearedOn: expectedReturnDate, reviews: [] } })
    })
    expect(recurrenceRiskMultiplier(updateGameWorld(world, { injuries: oldRelated }), playerId, 'ankleSprain', world.currentDate)).toBe(1.4)

    const teamId = team.id
    const date = Array.from({ length: 21 }, (_, index) => addDays(world.currentDate, index + 1)).find((candidate) => canTeamTrainOnDate(world, teamId, candidate))!
    const probability = trainingInjuryProbability({ riskWeight: 1.2, intensity: 'high', durationMinutes: 120, fatigue: 100, recurrence: 1, participationMultiplier: 1 })
    let sessionId = ''
    for (let index = 0; index < 20000; index += 1) {
      const candidate = `training-risk:${index}`
      if (new SeededRandomSource(hashStringToSeed(`training-injury-occurrence-v1:${candidate}:${playerId}`)).nextFloat(0, 1) < probability) { sessionId = candidate; break }
    }
    expect(sessionId).not.toBe('')
    const session = createScheduledTrainingSession({ id: sessionId, teamId, date, startTime: '09:00', durationMinutes: 120, scope: 'team', definitionId: 'strength', intensity: 'high', participationByPlayerId: { [playerId]: 'FULL' } })
    const due = updateGameWorld(scheduleTrainingSession(world, session), { currentDate: date, careerFatigueByPlayerId: { ...world.careerFatigueByPlayerId, [playerId]: 100 } })
    const once = executeScheduledTrainingSessions(due)
    const twice = executeScheduledTrainingSessions(once)
    const injury = Object.values(once.injuriesById).find((item) => item.sourceTrainingSessionId === sessionId)
    expect(injury).toBeDefined()
    expect(injury).toMatchObject({ source: 'TRAINING', sourceTrainingSessionId: sessionId, playerId })
    expect(injury?.returnToPlay?.reviewDueOn).toBe(injury?.expectedReturnDate)
    expect(isPlayerAvailable(once, playerId, date)).toBe(false)
    const dueForReview = updateGameWorld(once, { currentDate: injury!.expectedReturnDate })
    expect(isPlayerAvailable(dueForReview, playerId, injury!.expectedReturnDate)).toBe(false)
    const reviewed = reviewReturnToPlay(dueForReview, { injuryId: injury!.id, decision: 'CLEAR_FOR_PLAY', actor: { kind: 'USER', coachId: world.userCoachId } })
    expect(reviewed.ok).toBe(true)
    if (reviewed.ok) expect(isPlayerAvailable(reviewed.world, playerId, injury!.expectedReturnDate)).toBe(true)
    expect(twice).toEqual(once)
    expect(createDeterministicInjury({ playerId, injuredOn: date, source: 'TRAINING', sourceId: sessionId })).toEqual(injury)
    expect(matchInjuryProbability(0, 100)).toBe(0)
  })
})
