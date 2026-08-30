import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { advanceDay } from '@/engine/calendar'
import { cancelScheduledTrainingSession, dailyLoadStatusForTeam, dailyScheduledLoad, executeScheduledTrainingSessions, scheduleTrainingSession } from '@/engine/training'
import { updateGameWorld } from '@/domain/world'
import { createScheduledTrainingSession } from '@/domain/training'

describe('ScheduledTrainingEngine', () => {
  it('schedules a session and rejects a colliding one', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const session = createScheduledTrainingSession({ id: 's1', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = scheduleTrainingSession(world, session)
    expect(scheduled.scheduledTrainingSessionsById['s1']).toBeDefined()

    const colliding = createScheduledTrainingSession({ id: 's2', teamId, date: world.currentDate, startTime: '09:30', durationMinutes: 60, scope: 'team', definitionId: 'midRange', intensity: 'normal' })
    expect(() => scheduleTrainingSession(scheduled, colliding)).toThrow(RangeError)
  })

  it('accepts a non-overlapping session', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const first = createScheduledTrainingSession({ id: 's1', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const second = createScheduledTrainingSession({ id: 's2', teamId, date: world.currentDate, startTime: '10:00', durationMinutes: 60, scope: 'team', definitionId: 'midRange', intensity: 'normal' })
    const scheduled = scheduleTrainingSession(scheduleTrainingSession(world, first), second)
    expect(Object.keys(scheduled.scheduledTrainingSessionsById)).toHaveLength(2)
  })

  it('cancels a scheduled session', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const session = createScheduledTrainingSession({ id: 's1', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = scheduleTrainingSession(world, session)
    expect(cancelScheduledTrainingSession(scheduled, 's1').scheduledTrainingSessionsById['s1']).toBeUndefined()
  })

  it('executes a due individual session exactly once, applying development stimulus and fatigue, and never re-executes on repeat calls', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const beforeRatings = world.players[playerId]!.basketball.ratings
    const beforeFatigue = world.careerFatigueByPlayerId[playerId] ?? 0
    const session = createScheduledTrainingSession({ id: 's1', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'high' })
    const scheduled = scheduleTrainingSession(world, session)

    const executedOnce = executeScheduledTrainingSessions(scheduled)
    expect(executedOnce.scheduledTrainingSessionsById['s1']!.status).toBe('completed')
    expect(executedOnce.players[playerId]!.basketball.ratings).toEqual(beforeRatings)
    expect(executedOnce.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting).toBeGreaterThan(0)
    expect(executedOnce.careerFatigueByPlayerId[playerId]!).toBeGreaterThan(beforeFatigue)

    const executedTwice = executeScheduledTrainingSessions(executedOnce)
    expect(executedTwice).toEqual(executedOnce)
  })

  it('executes deterministically: advancing the same seeded world identically produces the same training result', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const session = createScheduledTrainingSession({ id: 's1', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = scheduleTrainingSession(world, session)
    const first = executeScheduledTrainingSessions(scheduled)
    const second = executeScheduledTrainingSessions(scheduled)
    expect(first).toEqual(second)
  })

  it('applies team cohesion effects for tactical sessions', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const before = world.teamCohesionByTeamId[teamId]!
    const session = createScheduledTrainingSession({ id: 's1', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'teamCohesion', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(scheduleTrainingSession(world, session))
    expect(executed.teamCohesionByTeamId[teamId]!).toBeGreaterThan(before)
  })

  it('applies morale effects for morale-bearing definitions', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const before = world.moraleByPersonId[playerId]!.value
    const session = createScheduledTrainingSession({ id: 's1', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'composure', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(scheduleTrainingSession(world, session))
    expect(executed.moraleByPersonId[playerId]!.value).toBeGreaterThan(before)
  })

  it('documented scaling contract: development/fatigue scale with intensity, morale/cohesion are fixed per-session deltas regardless of intensity', () => {
    const worldA = createNewGame()
    const teamAId = Object.values(worldA.teams)[0]!.id
    const playerAId = worldA.teams[teamAId]!.rosterPlayerIds[0]!
    const low = executeScheduledTrainingSessions(scheduleTrainingSession(worldA, createScheduledTrainingSession({ id: 's1', teamId: teamAId, date: worldA.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId: playerAId, definitionId: 'threePoint', intensity: 'light' })))
    const worldB = createNewGame()
    const teamBId = Object.values(worldB.teams)[0]!.id
    const playerBId = worldB.teams[teamBId]!.rosterPlayerIds[0]!
    const high = executeScheduledTrainingSessions(scheduleTrainingSession(worldB, createScheduledTrainingSession({ id: 's1', teamId: teamBId, date: worldB.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId: playerBId, definitionId: 'threePoint', intensity: 'high' })))
    expect(high.developmentStimulusByPlayerId[playerBId]!.byRating.threePointShooting!).toBeGreaterThan(low.developmentStimulusByPlayerId[playerAId]!.byRating.threePointShooting!)
    expect(high.careerFatigueByPlayerId[playerBId]! - worldB.careerFatigueByPlayerId[playerBId]!).toBeGreaterThan(low.careerFatigueByPlayerId[playerAId]! - worldA.careerFatigueByPlayerId[playerAId]!)

    const cohesionLow = executeScheduledTrainingSessions(scheduleTrainingSession(worldA, createScheduledTrainingSession({ id: 's2', teamId: teamAId, date: worldA.currentDate, startTime: '11:00', durationMinutes: 60, scope: 'team', definitionId: 'teamCohesion', intensity: 'light' })))
    const cohesionHigh = executeScheduledTrainingSessions(scheduleTrainingSession(worldB, createScheduledTrainingSession({ id: 's2', teamId: teamBId, date: worldB.currentDate, startTime: '11:00', durationMinutes: 60, scope: 'team', definitionId: 'teamCohesion', intensity: 'high' })))
    expect(cohesionHigh.teamCohesionByTeamId[teamBId]!).toBe(cohesionLow.teamCohesionByTeamId[teamAId]!)
  })

  it('recovery definitions reduce fatigue instead of increasing it', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const withFatigue = updateGameWorld(world, { careerFatigueByPlayerId: { ...world.careerFatigueByPlayerId, [playerId]: 50 } })
    const session = createScheduledTrainingSession({ id: 's1', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 30, scope: 'individual', playerId, definitionId: 'rest', intensity: 'light' })
    const executed = executeScheduledTrainingSessions(scheduleTrainingSession(withFatigue, session))
    expect(executed.careerFatigueByPlayerId[playerId]!).toBeLessThan(50)
  })

  it('computes daily scheduled load and classifies OK/HIGH/VERY_HIGH', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    expect(dailyScheduledLoad(world, teamId, world.currentDate)).toBe(0)
    expect(dailyLoadStatusForTeam(world, teamId, world.currentDate)).toBe('OK')

    const heavy = [
      { id: 's1', startTime: '08:00' },
      { id: 's2', startTime: '10:00' },
      { id: 's3', startTime: '12:00' },
      { id: 's4', startTime: '14:00' },
      { id: 's5', startTime: '16:00' },
      { id: 's6', startTime: '18:00' },
      { id: 's7', startTime: '20:00' },
    ].reduce((next, { id, startTime }) => scheduleTrainingSession(next, createScheduledTrainingSession({ id, teamId, date: world.currentDate, startTime, durationMinutes: 120, scope: 'team', definitionId: 'strength', intensity: 'high' })), world)
    expect(dailyLoadStatusForTeam(heavy, teamId, world.currentDate)).toBe('VERY_HIGH')
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
