import { describe, expect, it } from 'vitest'
import { createAcbTestGame, createNewGame } from '@/app/game'
import { advanceDay } from '@/engine/calendar'
import { canTeamTrainOnDate, cancelScheduledTrainingSession, dailyLoadStatusForTeam, dailyScheduledLoad, executeScheduledTrainingSessions, nextEligibleTrainingDate, scheduleTrainingSession, setTrainingParticipation, trainingStaffExecutionMultiplier } from '@/engine/training'
import { updateGameWorld } from '@/domain/world'
import { createScheduledTrainingSession } from '@/domain/training'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { addDays } from '@/domain/date'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { trainingInjuryProbability } from '@/engine/injury/TrainingInjuries'
import { deserializeGameWorldV3, serializeGameWorldV3 } from '@/save/GameWorldSaveV3'
import { sessionsForTrainingWeek } from '@/domain/training'

describe('ScheduledTrainingEngine', () => {
  it('persists eligible executing staff, rejects invalid/overlapping use, and applies bounded deterministic quality', () => {
    const world = createAcbTestGame()
    const teamId = Object.values(world.teams)[0]!.id
    const staff = Object.values(world.teamStaffAssignmentsById).filter((item) => item.teamId === teamId)
    const shooter = staff.find((item) => item.role === 'shootingCoach')!.staffPersonId
    const scout = staff.find((item) => item.role === 'regionalScout')!.staffPersonId
    const date = nextEligibleTrainingDate(world.currentDate)
    const base = { teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'team' as const, definitionId: 'threePoint', intensity: 'normal' as const }
    const scheduled = scheduleTrainingSession(world, createScheduledTrainingSession({ id: 'staff-session', ...base, assignedStaffPersonIds: [shooter] }))
    expect(scheduled.scheduledTrainingSessionsById['staff-session']!.assignedStaffPersonIds).toEqual([shooter])
    expect(trainingStaffExecutionMultiplier(scheduled, scheduled.scheduledTrainingSessionsById['staff-session']!)).toBeGreaterThan(trainingStaffExecutionMultiplier(scheduled, { ...scheduled.scheduledTrainingSessionsById['staff-session']!, assignedStaffPersonIds: [scout] }))
    expect(trainingStaffExecutionMultiplier(scheduled, { ...scheduled.scheduledTrainingSessionsById['staff-session']!, assignedStaffPersonIds: [shooter, scout] })).toBeLessThanOrEqual(1.18)
    expect(() => scheduleTrainingSession(scheduled, createScheduledTrainingSession({ id: 'overlap', ...base, startTime: '09:30', assignedStaffPersonIds: [shooter] }))).toThrow(RangeError)
    const freeAgent = Object.keys(world.staffEmploymentByStaffId).find((id) => world.staffEmploymentByStaffId[id as never]?.status === 'unemployed')!
    expect(() => scheduleTrainingSession(world, createScheduledTrainingSession({ id: 'free', ...base, assignedStaffPersonIds: [freeAgent as never] }))).toThrow(RangeError)
  })

  it('keeps no-staff scheduled sessions exactly on the legacy execution path', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const session = createScheduledTrainingSession({ id: 'legacy', teamId, date: nextEligibleTrainingDate(world.currentDate), startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    expect(trainingStaffExecutionMultiplier(world, session)).toBe(1)
  })
  it('schedules a session and rejects a colliding one', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = scheduleTrainingSession(world, session)
    expect(scheduled.scheduledTrainingSessionsById['s1']).toBeDefined()

    const colliding = createScheduledTrainingSession({ id: 's2', teamId, date, startTime: '09:30', durationMinutes: 60, scope: 'team', definitionId: 'midRange', intensity: 'normal' })
    expect(() => scheduleTrainingSession(scheduled, colliding)).toThrow(RangeError)
  })

  it('accepts a non-overlapping session', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const date = nextEligibleTrainingDate(world.currentDate)
    const first = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const second = createScheduledTrainingSession({ id: 's2', teamId, date, startTime: '10:00', durationMinutes: 60, scope: 'team', definitionId: 'midRange', intensity: 'normal' })
    const scheduled = scheduleTrainingSession(scheduleTrainingSession(world, first), second)
    expect(Object.keys(scheduled.scheduledTrainingSessionsById)).toHaveLength(2)
  })

  it('cancels a scheduled session', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = scheduleTrainingSession(world, session)
    expect(cancelScheduledTrainingSession(scheduled, 's1').scheduledTrainingSessionsById['s1']).toBeUndefined()
  })

  it('rejects scheduling a new session dated today or in the past', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const today = createScheduledTrainingSession({ id: 's1', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    expect(() => scheduleTrainingSession(world, today)).toThrow(RangeError)

    const past = createScheduledTrainingSession({ id: 's2', teamId, date: '2020-01-01' as never, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    expect(() => scheduleTrainingSession(world, past)).toThrow(RangeError)
  })

  it('accepts a session dated the next eligible date', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const session = createScheduledTrainingSession({ id: 's1', teamId, date: nextEligibleTrainingDate(world.currentDate), startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    expect(scheduleTrainingSession(world, session).scheduledTrainingSessionsById['s1']).toBeDefined()
  })

  it('executes a due individual session exactly once, applying development stimulus and fatigue, and never re-executes on repeat calls', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const beforeRatings = world.players[playerId]!.basketball.ratings
    const beforeFatigue = world.careerFatigueByPlayerId[playerId] ?? 0
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'high' })
    const scheduled = updateGameWorld(scheduleTrainingSession(world, session), { currentDate: date })

    const executedOnce = executeScheduledTrainingSessions(scheduled)
    expect(executedOnce.scheduledTrainingSessionsById['s1']!.status).toBe('completed')
    const execution = executedOnce.scheduledTrainingSessionsById['s1']!.execution!
    expect(execution).toMatchObject({ plannedModuleName: 'Three-Point Shooting', moduleName: 'Three-Point Shooting', effectiveIntensity: 'high', executingStaffRoles: [] })
    expect(execution.participants.find((entry) => entry.playerId === playerId)).toMatchObject({ participation: 'FULL', careerFatigueDelta: expect.any(Number) })
    expect(execution.participants.find((entry) => entry.playerId === playerId)!.developmentStimulusEventId).toBe(`training:s1:${playerId}`)
    expect(executedOnce.developmentStimulusEventsById[`training:s1:${playerId}`]!.sourceType).toBe('training')
    expect(() => updateGameWorld(executedOnce, { scheduledTrainingSessionsById: { ...executedOnce.scheduledTrainingSessionsById, s1: { ...executedOnce.scheduledTrainingSessionsById.s1!, execution: { ...execution, moduleName: 'Rewritten history' } } } })).toThrow(/immutable/)
    expect(executedOnce.players[playerId]!.basketball.ratings).toEqual(beforeRatings)
    expect(executedOnce.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting).toBeGreaterThan(0)
    expect(executedOnce.careerFatigueByPlayerId[playerId]!).toBeGreaterThan(beforeFatigue)

    const executedTwice = executeScheduledTrainingSessions(executedOnce)
    expect(executedTwice).toEqual(executedOnce)
  })

  it('respects a user FULL override over a REST recommendation and scales REDUCED effects', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const playerId = base.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(base.currentDate)
    const loaded = updateGameWorld(base, { careerFatigueByPlayerId: { ...base.careerFatigueByPlayerId, [playerId]: 92 } })
    const makeDue = (participation: 'FULL' | 'REDUCED' | 'REST') => {
      const scheduled = scheduleTrainingSession(loaded, createScheduledTrainingSession({ id: 'participation', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' }))
      const chosen = setTrainingParticipation(scheduled, { sessionId: 'participation', playerId, participation })
      return executeScheduledTrainingSessions(updateGameWorld(chosen, { currentDate: date }))
    }
    const full = makeDue('FULL')
    const reduced = makeDue('REDUCED')
    const rest = makeDue('REST')
    const fatigueBefore = loaded.careerFatigueByPlayerId[playerId]!
    const stimulusBefore = loaded.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting!
    expect(full.careerFatigueByPlayerId[playerId]! - fatigueBefore).toBe(5)
    expect(reduced.careerFatigueByPlayerId[playerId]! - fatigueBefore).toBe(2.5)
    expect(rest.careerFatigueByPlayerId[playerId]).toBe(fatigueBefore)
    expect(full.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting).toBeGreaterThan(stimulusBefore)
    expect(reduced.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting).toBeGreaterThan(stimulusBefore)
    expect(rest.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting).toBe(stimulusBefore)
    expect(full.scheduledTrainingSessionsById.participation!.execution!.participants.find((entry) => entry.playerId === playerId)).toMatchObject({ participation: 'FULL', careerFatigueDelta: 5 })
    expect(reduced.scheduledTrainingSessionsById.participation!.execution!.participants.find((entry) => entry.playerId === playerId)).toMatchObject({ participation: 'REDUCED', careerFatigueDelta: 2.5 })
    expect(rest.scheduledTrainingSessionsById.participation!.execution!.participants.find((entry) => entry.playerId === playerId)).toMatchObject({ participation: 'REST', careerFatigueDelta: 0, injuryIds: [] })
  })

  it('skips load and injury exposure for an unavailable player and for a cancelled session', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const playerId = base.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(base.currentDate)
    const injuryDate = addDays(date, -1)
    const injury = createInjury({ id: injuryIdFromString('training-unavailable'), playerId, kind: 'kneeSprain', severity: 'minor', injuredOn: injuryDate, expectedReturnDate: addDays(date, 5) })
    const injured = updateGameWorld(base, { injuries: [injury] })
    const session = createScheduledTrainingSession({ id: 'unavailable-player-session', teamId, date, startTime: '09:00', durationMinutes: 120, scope: 'team', definitionId: 'strength', intensity: 'high' })
    const scheduled = scheduleTrainingSession(injured, session)
    const due = updateGameWorld(scheduled, { currentDate: date })
    const fatigueBefore = due.careerFatigueByPlayerId[playerId]
    const stimulusBefore = due.developmentStimulusByPlayerId[playerId]
    const executed = executeScheduledTrainingSessions(due)
    expect(executed.careerFatigueByPlayerId[playerId]).toBe(fatigueBefore)
    expect(executed.developmentStimulusByPlayerId[playerId]).toEqual(stimulusBefore)
    expect(Object.values(executed.injuriesById).filter((item) => item.sourceTrainingSessionId === session.id)).toHaveLength(0)

    const cancellable = scheduleTrainingSession(base, createScheduledTrainingSession({ id: 'cancelled-no-injury', teamId, date, startTime: '09:00', durationMinutes: 120, scope: 'team', definitionId: 'strength', intensity: 'high' }))
    const cancelledWorld = cancelScheduledTrainingSession(cancellable, 'cancelled-no-injury')
    expect(executeScheduledTrainingSessions(updateGameWorld(cancelledWorld, { currentDate: date })).injuriesById).toEqual(base.injuriesById)
  })

  it('records the InjuryRecord ID created by a completed Training session', () => {
    const base = createNewGame()
    const team = Object.values(base.teams)[0]!
    const playerId = team.rosterPlayerIds[0]!
    const date = Array.from({ length: 20 }, (_, index) => addDays(base.currentDate, index + 1)).find((candidate) => canTeamTrainOnDate(base, team.id, candidate))!
    const loaded = updateGameWorld(base, { careerFatigueByPlayerId: { ...base.careerFatigueByPlayerId, [playerId]: 95 } })
    const probability = trainingInjuryProbability({ riskWeight: 1.2, intensity: 'high', durationMinutes: 240, fatigue: 95, recurrence: 1, participationMultiplier: 1 })
    const sessionId = Array.from({ length: 2000 }, (_, index) => `injury-evidence-${index}`).find((candidate) => new SeededRandomSource(hashStringToSeed(`training-injury-occurrence-v1:${candidate}:${playerId}`)).nextFloat(0, 1) < probability)!
    const session = createScheduledTrainingSession({ id: sessionId, teamId: team.id, playerId, date, startTime: '09:00', durationMinutes: 240, scope: 'individual', definitionId: 'strength', intensity: 'high' })
    const pending = scheduleTrainingSession(loaded, session)
    const completed = executeScheduledTrainingSessions(updateGameWorld(pending, { currentDate: date }))
    const injury = Object.values(completed.injuriesById).find((item) => item.sourceTrainingSessionId === sessionId)!

    expect(completed.scheduledTrainingSessionsById[sessionId]!.execution!.participants.find((item) => item.playerId === playerId)!.injuryIds).toEqual([injury.id])
    expect(injury.source).toBe('TRAINING')
  })

  it('executes deterministically: advancing the same seeded world identically produces the same training result', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = updateGameWorld(scheduleTrainingSession(world, session), { currentDate: date })
    const first = executeScheduledTrainingSessions(scheduled)
    const second = executeScheduledTrainingSessions(scheduled)
    expect(first).toEqual(second)
  })

  it('applies team cohesion effects for tactical sessions', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const before = world.teamCohesionByTeamId[teamId]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'teamCohesion', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(world, session), { currentDate: date }))
    expect(executed.teamCohesionByTeamId[teamId]!).toBeGreaterThan(before)
  })

  it('applies morale effects for morale-bearing definitions', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const before = world.moraleByPersonId[playerId]!.value
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'composure', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(world, session), { currentDate: date }))
    expect(executed.moraleByPersonId[playerId]!.value).toBeGreaterThan(before)
  })

  it('documented scaling contract: development/fatigue scale with intensity, morale/cohesion are fixed per-session deltas regardless of intensity', () => {
    const worldA = createNewGame()
    const teamAId = Object.values(worldA.teams)[0]!.id
    const playerAId = worldA.teams[teamAId]!.rosterPlayerIds[0]!
    const dateA = nextEligibleTrainingDate(worldA.currentDate)
    const low = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(worldA, createScheduledTrainingSession({ id: 's1', teamId: teamAId, date: dateA, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId: playerAId, definitionId: 'threePoint', intensity: 'light' })), { currentDate: dateA }))
    const worldB = createNewGame()
    const teamBId = Object.values(worldB.teams)[0]!.id
    const playerBId = worldB.teams[teamBId]!.rosterPlayerIds[0]!
    const dateB = nextEligibleTrainingDate(worldB.currentDate)
    const high = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(worldB, createScheduledTrainingSession({ id: 's1', teamId: teamBId, date: dateB, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId: playerBId, definitionId: 'threePoint', intensity: 'high' })), { currentDate: dateB }))
    expect(high.developmentStimulusByPlayerId[playerBId]!.byRating.threePointShooting!).toBeGreaterThan(low.developmentStimulusByPlayerId[playerAId]!.byRating.threePointShooting!)
    expect(high.careerFatigueByPlayerId[playerBId]! - worldB.careerFatigueByPlayerId[playerBId]!).toBeGreaterThan(low.careerFatigueByPlayerId[playerAId]! - worldA.careerFatigueByPlayerId[playerAId]!)

    const cohesionLow = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(worldA, createScheduledTrainingSession({ id: 's2', teamId: teamAId, date: dateA, startTime: '11:00', durationMinutes: 60, scope: 'team', definitionId: 'teamCohesion', intensity: 'light' })), { currentDate: dateA }))
    const cohesionHigh = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(worldB, createScheduledTrainingSession({ id: 's2', teamId: teamBId, date: dateB, startTime: '11:00', durationMinutes: 60, scope: 'team', definitionId: 'teamCohesion', intensity: 'high' })), { currentDate: dateB }))
    expect(cohesionHigh.teamCohesionByTeamId[teamBId]!).toBe(cohesionLow.teamCohesionByTeamId[teamAId]!)
  })

  it('recovery definitions reduce fatigue instead of increasing it', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const withFatigue = updateGameWorld(world, { careerFatigueByPlayerId: { ...world.careerFatigueByPlayerId, [playerId]: 50 } })
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 30, scope: 'individual', playerId, definitionId: 'rest', intensity: 'light' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(withFatigue, session), { currentDate: date }))
    expect(executed.careerFatigueByPlayerId[playerId]!).toBeLessThan(50)
  })

  it('computes daily scheduled load and classifies OK/HIGH/VERY_HIGH', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const date = nextEligibleTrainingDate(world.currentDate)
    expect(dailyScheduledLoad(world, teamId, date)).toBe(0)
    expect(dailyLoadStatusForTeam(world, teamId, date)).toBe('OK')

    const heavy = [
      { id: 's1', startTime: '08:00' },
      { id: 's2', startTime: '10:00' },
      { id: 's3', startTime: '12:00' },
      { id: 's4', startTime: '14:00' },
      { id: 's5', startTime: '16:00' },
      { id: 's6', startTime: '18:00' },
      { id: 's7', startTime: '20:00' },
    ].reduce((next, { id, startTime }) => scheduleTrainingSession(next, createScheduledTrainingSession({ id, teamId, date, startTime, durationMinutes: 120, scope: 'team', definitionId: 'strength', intensity: 'high' })), world)
    expect(dailyLoadStatusForTeam(heavy, teamId, date)).toBe('VERY_HIGH')
  })

  it('advanceDay executes eligible scheduled sessions for the new date', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const tomorrow = advanceDay(world).currentDate
    const scheduled = scheduleTrainingSession(world, createScheduledTrainingSession({ id: 's1', teamId, date: tomorrow, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' }))
    const advanced = advanceDay(scheduled)
    expect(advanced.scheduledTrainingSessionsById['s1']!.status).toBe('completed')
  })

  it('keeps one completed session in its original week through +1, +7, +30 days and Save V3 round trips', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const weekDay = new Date(`${date}T00:00:00.000Z`).getUTCDay()
    const weekStart = addDays(date, -(weekDay === 0 ? 6 : weekDay - 1))
    const scheduled = scheduleTrainingSession(world, createScheduledTrainingSession({ id: 'retained-history', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'high' }))
    let current = advanceDay(scheduled)
    expect(current.scheduledTrainingSessionsById['retained-history']).toMatchObject({ status: 'completed', date })
    const originalExecution = current.scheduledTrainingSessionsById['retained-history']!.execution!
    expect(originalExecution).toMatchObject({ plannedModuleName: 'Three-Point Shooting', moduleName: 'Three-Point Shooting', effectiveIntensity: 'high' })

    const reload = (value: typeof current) => deserializeGameWorldV3(serializeGameWorldV3(value, '2026-10-02T00:00:00.000Z'))
    current = reload(current)
    for (let day = 1; day <= 30; day += 1) {
      current = advanceDay(current)
      if (![1, 7, 30].includes(day)) continue
      current = reload(current)
      const retained = current.scheduledTrainingSessionsById['retained-history']!
      expect(retained).toMatchObject({ status: 'completed', date })
      expect(retained.execution).toEqual(originalExecution)
      expect(sessionsForTrainingWeek(Object.values(current.scheduledTrainingSessionsById), teamId, weekStart).filter((session) => session.id === 'retained-history')).toHaveLength(1)
    }
    expect(current.currentDate).toBe(addDays(date, 30))
  }, 90000)

  it('does not allow completed history to be cancelled or rescheduled through the application engine', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 'read-only-history', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    const completed = advanceDay(scheduleTrainingSession(world, session))

    expect(() => cancelScheduledTrainingSession(completed, session.id)).toThrow(/immutable/)
    expect(() => scheduleTrainingSession(completed, createScheduledTrainingSession({ ...session, date: addDays(completed.currentDate, 1) }))).toThrow(/immutable/)
  })

  it('team position-restricted training applies fatigue to every participating player but development stimulus only to eligible players', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const roster = world.teams[teamId]!.rosterPlayerIds
    const eligiblePlayerId = roster.find((id) => ['PF', 'C'].includes(world.players[id]!.basketball.primaryPosition))!
    const ineligiblePlayerId = roster.find((id) => world.players[id]!.basketball.primaryPosition === 'PG')!
    expect(eligiblePlayerId).toBeDefined()
    expect(ineligiblePlayerId).toBeDefined()

    const beforeFatigueEligible = world.careerFatigueByPlayerId[eligiblePlayerId] ?? 0
    const beforeFatigueIneligible = world.careerFatigueByPlayerId[ineligiblePlayerId] ?? 0
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 'team-restricted', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'postScoring', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(world, session), { currentDate: date }))

    // Everyone on the roster still attends and accrues physical fatigue.
    expect(executed.careerFatigueByPlayerId[eligiblePlayerId]!).toBeGreaterThan(beforeFatigueEligible)
    expect(executed.careerFatigueByPlayerId[ineligiblePlayerId]!).toBeGreaterThan(beforeFatigueIneligible)

    // Only the position-eligible player receives the restricted development stimulus.
    expect(executed.developmentStimulusByPlayerId[eligiblePlayerId]!.byRating.postScoring!).toBeGreaterThan(0)
    expect(executed.developmentStimulusByPlayerId[ineligiblePlayerId]!.byRating.postScoring!).toBe(0)
  })

  it('one planned/scheduled training day applies exactly one canonical training workload, not a second legacy workload on top', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const beforeFatigue = world.careerFatigueByPlayerId[playerId] ?? 0
    const tomorrow = advanceDay(world).currentDate
    const scheduled = scheduleTrainingSession(world, createScheduledTrainingSession({ id: 's1', teamId, date: tomorrow, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' }))

    const advanced = advanceDay(scheduled)

    // Exactly one scheduled session executed (the individual one), and the legacy
    // trainingPlansByTeamId pipeline did not also auto-apply a second workload.
    expect(Object.keys(advanced.trainingSessionsById)).toHaveLength(0)
    const stimulusTotal = Object.values(advanced.developmentStimulusByPlayerId[playerId]!.byRating).reduce((sum, value) => sum + value, 0)
    const expectedFatigueDelta = advanced.careerFatigueByPlayerId[playerId]! - beforeFatigue
    // Re-executing the scheduled pipeline alone from the same base should reproduce the
    // exact same fatigue/stimulus state, proving no additional (legacy) workload was applied.
    const onlyScheduled = executeScheduledTrainingSessions(updateGameWorld(scheduled, { currentDate: tomorrow }))
    expect(onlyScheduled.careerFatigueByPlayerId[playerId]).toBe(advanced.careerFatigueByPlayerId[playerId])
    expect(onlyScheduled.developmentStimulusByPlayerId[playerId]).toEqual(advanced.developmentStimulusByPlayerId[playerId])
    expect(stimulusTotal).toBeGreaterThan(0)
    expect(expectedFatigueDelta).toBeGreaterThan(0)
  })
})
