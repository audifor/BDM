import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { applyUserCoachCreation } from '@/app/game/UserCoachCreator'
import { advanceGameDayWithResult } from '@/app/game/advanceGameDay'
import { createScheduledTrainingSession } from '@/domain/training'
import { getRelationshipDimensions, relationshipKey } from '@/domain/relationships'
import { updateGameWorld } from '@/domain/world'
import { executeScheduledTrainingSessions, nextEligibleTrainingDate, scheduleTrainingSession } from '@/engine/training/ScheduledTrainingEngine'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { decidePlayerTrainingFeedback, getPendingPlayerTrainingFeedback, playerFeedbackInboxId, queueVerifiedPlayerTrainingFeedback } from './PlayerTrainingFeedback'

const coach = {
  firstName: 'Celia', lastName: 'Mora', dateOfBirth: '1987-05-01', gender: 'female' as const,
  background: 'academyCoach' as const, ambition: 'talentDeveloper' as const,
  disposition: 'loyal' as const, coachingStyle: 'developer' as const,
}

function prepared() {
  const initial = applyUserCoachCreation(createAcbTestGame(), coach)
  const team = Object.values(initial.teams).find(item => item.coachId === initial.userCoachId)!
  const playerId = team.rosterPlayerIds[0]!
  const date = nextEligibleTrainingDate(initial.currentDate)
  const session = createScheduledTrainingSession({
    id: 'bs19c-p8-verified-individual', teamId: team.id, date, startTime: '09:00', durationMinutes: 60,
    scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal',
  })
  return { initial, scheduled: scheduleTrainingSession(initial, session), team, playerId, date, session }
}

function completed() {
  const fixture = prepared()
  const world = executeScheduledTrainingSessions(updateGameWorld(fixture.scheduled, { currentDate: fixture.date }))
  const execution = world.scheduledTrainingSessionsById[fixture.session.id]!.execution!
  const evidenceId = execution.participants.find(p => p.playerId === fixture.playerId)?.developmentStimulusEventId!
  if (!evidenceId || !world.developmentStimulusEventsById[evidenceId]) throw new Error('Verified training evidence required')
  return { ...fixture, world, evidenceId }
}

describe('BS19C P8 — source-backed coach and player training feedback', () => {
  it('only creates one optional monthly feedback after actual individual training and real development', () => {
    const { initial, scheduled } = prepared()
    expect(queueVerifiedPlayerTrainingFeedback(initial)).toBe(initial)
    expect(queueVerifiedPlayerTrainingFeedback(scheduled)).toBe(scheduled)
    const { world, playerId, evidenceId, session, team } = completed()
    const queued = queueVerifiedPlayerTrainingFeedback(world)
    const pending = getPendingPlayerTrainingFeedback(queued)
    expect(pending).toMatchObject({ playerId, evidenceId, sessionId: session.id, teamId: team.id })
    expect(queued.inboxItemsById[playerFeedbackInboxId(queued.userCoachId, queued.currentDate.slice(0, 7))]).toMatchObject({
      status: 'unread', context: { lifeScenario: 'playerTrainingFeedback', playerId, evidenceId },
    })
    expect(queueVerifiedPlayerTrainingFeedback(queued)).toBe(queued)
    expect(queued.memoriesById).toEqual(world.memoriesById)
    expect(queued.relationshipsByKey).toEqual(world.relationshipsByKey)
  }, 120_000)

  it('recognized real work changes player and coach perspectives, observed PERSON50, morale and both memories, not sport performance', () => {
    const { world, playerId, evidenceId } = completed()
    const queued = queueVerifiedPlayerTrainingFeedback(world)
    const result = decidePlayerTrainingFeedback(queued, 'recognizeWork')
    expect(result.status).toBe('APPLIED')
    if (result.status !== 'APPLIED') throw Error('Expected a real conversation')
    const next = result.world
    const source = `bs19c:player-feedback:${world.userCoachId}:${world.currentDate.slice(0, 7)}`
    expect(getRelationshipDimensions(next.relationshipsByKey[relationshipKey(playerId, world.userCoachId)]).trust).toBeGreaterThan(0)
    expect(getRelationshipDimensions(next.relationshipsByKey[relationshipKey(world.userCoachId, playerId)]).trust).toBeGreaterThan(0)
    expect(next.memoriesById[`memory:${source}:player`]).toMatchObject({
      owner: { kind: 'player', id: playerId }, sourceId: evidenceId,
      context: { choice: 'recognizeWork', evidenceId },
    })
    expect(next.memoriesById[`memory:${source}:coach`]?.owner).toEqual({ kind: 'coach', id: world.userCoachId })
    expect(next.moraleByPersonId[playerId]!.events.find(e => e.id === `morale:${source}:player`)).toMatchObject({
      source: 'developmentEvent', context: { personalityEventKind: 'COACH_PRAISE', sourceEvidenceId: evidenceId },
    })
    expect(next.personalitiesByPersonId[next.userCoachId]).toEqual(next.personalitiesByPersonId[next.coaches[next.userCoachId]!.staffProfileId])
    expect(next.developmentStimulusByPlayerId).toEqual(queued.developmentStimulusByPlayerId)
    expect(next.developmentStimulusEventsById).toEqual(queued.developmentStimulusEventsById)
    expect(next.careerFatigueByPlayerId).toEqual(queued.careerFatigueByPlayerId)
    expect(next.injuriesById).toEqual(queued.injuriesById)
    expect(next.games).toEqual(queued.games)
    expect(getPendingPlayerTrainingFeedback(next)).toBeNull()
    expect(decidePlayerTrainingFeedback(next, 'recognizeWork')).toMatchObject({ status: 'BLOCKED', reason: 'NOT_PENDING', world: next })
    expect(queueVerifiedPlayerTrainingFeedback(next)).toBe(next)
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(next, '2026-10-18T12:00:00.000Z'))
    expect(loaded.memoriesById).toEqual(next.memoriesById)
    expect(loaded.relationshipsByKey[relationshipKey(playerId, world.userCoachId)]).toEqual(next.relationshipsByKey[relationshipKey(playerId, world.userCoachId)])
    expect(loaded.moraleByPersonId[playerId]).toEqual(next.moraleByPersonId[playerId])
    expect(getPendingPlayerTrainingFeedback(loaded)).toBeNull()
  }, 120_000)

  it('demanding a higher standard can disappoint the player without fabricating development or outcome', () => {
    const { world, playerId } = completed()
    const queued = queueVerifiedPlayerTrainingFeedback(world)
    const firm = decidePlayerTrainingFeedback(queued, 'setHigherStandard')
    expect(firm.status).toBe('APPLIED')
    if (firm.status !== 'APPLIED') throw Error('Expected feedback')
    expect(getRelationshipDimensions(firm.world.relationshipsByKey[relationshipKey(playerId, world.userCoachId)]).perceivedSupport).toBeLessThan(0)
    expect(firm.world.moraleByPersonId[playerId]!.value).toBeLessThan(queued.moraleByPersonId[playerId]!.value)
    expect(firm.world.moraleByPersonId[playerId]!.events.some(e => e.context.personalityEventKind === 'COACH_CRITICISM')).toBe(true)
    expect(firm.world.memoriesById[`memory:bs19c:player-feedback:${world.userCoachId}:${world.currentDate.slice(0, 7)}:player`]?.type).toBe('conflict')
    expect(firm.world.developmentStimulusByPlayerId).toEqual(queued.developmentStimulusByPlayerId)
    expect(decidePlayerTrainingFeedback(queued, 'unknown' as never)).toMatchObject({ status: 'BLOCKED', reason: 'INVALID_CHOICE', world: queued })
    expect(decidePlayerTrainingFeedback(queued, 'recognizeWork', 'some-other-coach' as never)).toMatchObject({ status: 'BLOCKED', reason: 'NOT_USER_COACH', world: queued })
  }, 120_000)

  it('the real calendar schedules the player conversation after completed training, once', () => {
    const { scheduled, team, playerId } = prepared()
    const advanced = advanceGameDayWithResult(scheduled)
    expect(advanced.status).toBe('COMPLETED')
    expect(advanced.world.currentDate).toBe(nextEligibleTrainingDate(scheduled.currentDate))
    expect(advanced.phases.some(p => p.phaseId === 'BS19C_PLAYER_TRAINING_FEEDBACK' && p.worldChanged)).toBe(true)
    expect(advanced.world.scheduledTrainingSessionsById['bs19c-p8-verified-individual']?.status).toBe('completed')
    expect(getPendingPlayerTrainingFeedback(advanced.world)).toMatchObject({ playerId, teamId: team.id })
  }, 120_000)

  it('without fictional Coach Creator, a genuine session never manufactures an RPG event', () => {
    const initial = createAcbTestGame()
    const team = Object.values(initial.teams).find(item => item.coachId === initial.userCoachId)!
    const session = createScheduledTrainingSession({
      id: 'p8-legacy-session', teamId: team.id, date: nextEligibleTrainingDate(initial.currentDate),
      startTime: '10:00', durationMinutes: 60, scope: 'individual', playerId: team.rosterPlayerIds[0]!,
      definitionId: 'threePoint', intensity: 'normal',
    })
    const scheduled = scheduleTrainingSession(initial, session)
    const completed = executeScheduledTrainingSessions(updateGameWorld(scheduled, { currentDate: session.date }))
    expect(queueVerifiedPlayerTrainingFeedback(completed)).toBe(completed)
    expect(getPendingPlayerTrainingFeedback(completed)).toBeNull()
  }, 120_000)
})
