import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays, parseGameDate } from '@/domain/date'
import { createGame } from '@/domain/game'
import { gameIdFromString, type TeamId } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { advanceDayWithTrace, getUserTeam } from '@/engine/calendar'
import { canTeamTrainOnDate, setTeamTrainingPlan } from './TrainingEngine'
import { executeScheduledTrainingSessionsWithEvidence } from './ScheduledTrainingEngine'
import { scheduleTeamModuleSession } from './TrainingModuleEngine'
import { buildTrainingPlanningContext, progressAiTrainingPlanning } from './TrainingPlanning'

const MONDAY = parseGameDate('2032-10-04')

function aiTeamOf(world = createNewGame()) {
  const userTeam = getUserTeam(world)!
  const team = Object.values(world.teams).find((candidate) => candidate.id !== userTeam.id)!
  return { world, team }
}

function teamGames(world: ReturnType<typeof createNewGame>, teamId: TeamId, dates: readonly { readonly date: ReturnType<typeof parseGameDate>; readonly status?: 'scheduled' | 'completed' }[]) {
  const season = Object.values(world.seasons).find((item) => world.competitions[item.competitionId]?.participantTeamIds.includes(teamId))!
  const competition = world.competitions[season.competitionId]!
  const dateSet = new Set(dates.map(({ date }) => date))
  const existing = Object.values(world.games)
  const otherGames = existing.filter((game) => game.homeTeamId !== teamId && game.awayTeamId !== teamId)
  const opponentTeamId = competition.participantTeamIds.find((candidate) => candidate !== teamId && dates.every(({ date }) => !otherGames.some((game) => game.date === date && (game.homeTeamId === candidate || game.awayTeamId === candidate))))
    ?? competition.participantTeamIds.find((candidate) => candidate !== teamId)!
  const safeOtherGames = otherGames.filter((game) => !(dateSet.has(game.date) && (game.homeTeamId === opponentTeamId || game.awayTeamId === opponentTeamId)))
  const fixtures = dates.map(({ date, status = 'scheduled' }, index) => createGame({
    id: gameIdFromString(`bs12b-fixture:${teamId}:${index}`),
    seasonId: season.id,
    competitionId: competition.id,
    date,
    homeTeamId: teamId,
    awayTeamId: opponentTeamId,
    status,
    result: status === 'completed' ? { homeScore: 80, awayScore: 75 } : null,
  }))
  return updateGameWorld(world, { currentDate: MONDAY, games: [...safeOtherGames, ...fixtures] })
}

function openWeek(world: ReturnType<typeof createNewGame>, teamId: TeamId) {
  return teamGames(world, teamId, [])
}

function sessionsFor(world: ReturnType<typeof createNewGame>, teamId: TeamId) {
  return Object.values(world.scheduledTrainingSessionsById).filter((session) => session.teamId === teamId && session.date > MONDAY)
}

describe('BS12B Training planning', () => {
  it('derives fixture density, rest intervals, Career Fatigue, and existing schedule without mutating the world', () => {
    const { world: base, team } = aiTeamOf()
    const gameDates = [addDays(MONDAY, 2), addDays(MONDAY, 5)]
    const world = teamGames(base, team.id, gameDates.map((date) => ({ date })))
    const before = world
    const context = buildTrainingPlanningContext(world, team.id)

    expect(context.fixtureDensity.gamesNext7Days).toBe(2)
    expect(context.fixtureDensity.isDense).toBe(true)
    expect(context.fixtureDensity.restDaysBetweenUpcomingGames).toEqual([2])
    expect(context.fatigue.average).toBe(0)
    expect(context.scheduledSessionsNext7Days).toBe(0)
    expect(world).toBe(before)
  })

  it('plans focus-based development sessions for an open AI week and is idempotent', () => {
    const { world: base, team } = aiTeamOf()
    const focused = setTeamTrainingPlan(openWeek(base, team.id), team.id, { intensity: 'normal', focus: 'shooting' })
    const first = progressAiTrainingPlanning(focused)
    const sessions = sessionsFor(first.world, team.id)

    expect(sessions).toHaveLength(3)
    expect(sessions.every((session) => session.definitionId === 'threePoint' && session.intensity === 'normal')).toBe(true)
    expect(sessions.every((session) => session.date > MONDAY)).toBe(true)
    expect(progressAiTrainingPlanning(first.world).world).toEqual(first.world)
    expect(first.decisions.find((decision) => decision.teamId === team.id)?.action).toBe('SCHEDULED')
  })

  it('reduces dense-week training and selects recovery away from match dates and their eves', () => {
    const { world: base, team } = aiTeamOf()
    const world = teamGames(base, team.id, [{ date: addDays(MONDAY, 2) }, { date: addDays(MONDAY, 4) }])
    const result = progressAiTrainingPlanning(world)
    const sessions = sessionsFor(result.world, team.id)

    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.moduleId).toBe('activeRecovery')
    expect(sessions[0]!.intensity).toBe('light')
    expect(sessions.every((session) => !Object.values(result.world.games).some((game) => game.date === session.date && (game.homeTeamId === team.id || game.awayTeamId === team.id)))).toBe(true)
    expect(sessions.every((session) => !Object.values(result.world.games).some((game) => game.status === 'scheduled' && game.date === addDays(session.date, 1) && (game.homeTeamId === team.id || game.awayTeamId === team.id)))).toBe(true)
  })

  it('selects low-load recovery for a high-fatigue squad without creating another fatigue or injury authority', () => {
    const { world: base, team } = aiTeamOf()
    const open = openWeek(base, team.id)
    const fatigue = { ...open.careerFatigueByPlayerId }
    for (const playerId of open.teams[team.id]!.rosterPlayerIds) fatigue[playerId] = 92
    const loaded = updateGameWorld(open, { careerFatigueByPlayerId: fatigue })
    const result = progressAiTrainingPlanning(loaded)
    const sessions = sessionsFor(result.world, team.id)

    expect(sessions).toHaveLength(2)
    expect(sessions.every((session) => session.moduleId === 'lowLoadRecovery' && session.intensity === 'light')).toBe(true)
    expect(result.world.careerFatigueByPlayerId).toEqual(loaded.careerFatigueByPlayerId)
    expect(result.world.injuriesById).toEqual(loaded.injuriesById)
    expect(result.world).not.toHaveProperty('trainingFatigue')
  })

  it('leaves user-team sessions and ownership untouched', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const sessionDate = Array.from({ length: 14 }, (_, index) => addDays(MONDAY, index + 1))
      .find((date) => canTeamTrainOnDate(updateGameWorld(world, { currentDate: MONDAY }), userTeam.id, date))!
    const withManualSession = scheduleTeamModuleSession(updateGameWorld(world, { currentDate: MONDAY }), {
      teamId: userTeam.id,
      moduleId: 'teamCohesion',
      date: sessionDate,
      startTime: '11:00',
      durationMinutes: 60,
      sessionId: 'manual-user-session',
      intensity: 'light',
    })
    const result = progressAiTrainingPlanning(withManualSession)

    expect(result.world.scheduledTrainingSessionsById['manual-user-session']).toEqual(withManualSession.scheduledTrainingSessionsById['manual-user-session'])
    expect(Object.values(result.world.scheduledTrainingSessionsById).filter((session) => session.teamId === userTeam.id)).toEqual(
      Object.values(withManualSession.scheduledTrainingSessionsById).filter((session) => session.teamId === userTeam.id),
    )
  })

  it('preserves any existing AI session on a date instead of replacing or duplicating it', () => {
    const { world: base, team } = aiTeamOf()
    const date = addDays(MONDAY, 2)
    const scheduled = scheduleTeamModuleSession(openWeek(base, team.id), {
      teamId: team.id,
      moduleId: 'teamCohesion',
      date,
      startTime: '11:00',
      durationMinutes: 60,
      sessionId: 'existing-ai-session',
      intensity: 'light',
    })
    const planned = progressAiTrainingPlanning(scheduled).world

    expect(planned.scheduledTrainingSessionsById['existing-ai-session']).toEqual(scheduled.scheduledTrainingSessionsById['existing-ai-session'])
    expect(Object.values(planned.scheduledTrainingSessionsById).filter((session) => session.teamId === team.id && session.date === date)).toHaveLength(1)
  })

  it('does not execute a scheduled session if a fixture moves onto its date and reports the conflict', () => {
    const { world: base, team } = aiTeamOf()
    const date = addDays(MONDAY, 1)
    const scheduled = scheduleTeamModuleSession(openWeek(base, team.id), {
      teamId: team.id,
      moduleId: 'threePoint',
      date,
      startTime: '09:00',
      durationMinutes: 60,
      sessionId: 'moved-fixture-conflict',
      intensity: 'normal',
    })
    const withMovedFixture = teamGames(scheduled, team.id, [{ date }])
    expect(() => scheduleTeamModuleSession(withMovedFixture, {
      teamId: team.id,
      moduleId: 'activeRecovery',
      date,
      startTime: '09:00',
      durationMinutes: 45,
      sessionId: 'new-match-day-session',
      intensity: 'light',
    })).toThrow('Training cannot be scheduled on fixture date')
    const due = updateGameWorld(withMovedFixture, { currentDate: date })
    const execution = executeScheduledTrainingSessionsWithEvidence(due)

    expect(execution.matchConflictSessionIds).toEqual(['moved-fixture-conflict'])
    expect(execution.world).toBe(due)
    expect(execution.world.scheduledTrainingSessionsById['moved-fixture-conflict']!.status).toBe('scheduled')
    expect(buildTrainingPlanningContext(execution.world, team.id).warnings).toContain('MATCH_TRAINING_CONFLICT')
  })

  it('runs a normal scheduled session exactly once through the existing executor', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const playerId = userTeam.rosterPlayerIds[0]!
    const date = addDays(MONDAY, 1)
    const noUserFixtures = teamGames(world, userTeam.id, [])
    const scheduled = scheduleTeamModuleSession(noUserFixtures, {
      teamId: userTeam.id,
      moduleId: 'threePoint',
      date,
      startTime: '09:00',
      durationMinutes: 60,
      sessionId: 'scheduled-regression-session',
      intensity: 'normal',
    })
    const due = updateGameWorld(scheduled, { currentDate: date })
    const first = executeScheduledTrainingSessionsWithEvidence(due).world
    const second = executeScheduledTrainingSessionsWithEvidence(first).world

    expect(first.scheduledTrainingSessionsById['scheduled-regression-session']!.status).toBe('completed')
    expect(first.careerFatigueByPlayerId[playerId]).toBeGreaterThan(due.careerFatigueByPlayerId[playerId] ?? 0)
    expect(first.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting).toBeGreaterThan(due.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting)
    expect(first.injuriesById).toEqual(due.injuriesById)
    expect(second).toEqual(first)
  })

  it('plans after the date advance and before the existing due-session executor on the weekly checkpoint', () => {
    const { world: base, team } = aiTeamOf()
    const sunday = addDays(MONDAY, -1)
    const world = updateGameWorld(base, { currentDate: sunday, games: [] })
    const lifecycle = advanceDayWithTrace(world)
    const phaseIds = lifecycle.phases.map((phase) => phase.phaseId)
    const planningIndex = phaseIds.indexOf('AI_TRAINING_PLANNING')
    const trainingIndex = phaseIds.indexOf('TRAINING')
    const plannedSessions = Object.values(lifecycle.world.scheduledTrainingSessionsById).filter((session) => session.teamId === team.id)

    expect(lifecycle.world.currentDate).toBe(MONDAY)
    expect(lifecycle.phases[planningIndex]!.ran).toBe(true)
    expect(planningIndex).toBeLessThan(trainingIndex)
    expect(plannedSessions.length).toBeGreaterThan(0)
    expect(plannedSessions.every((session) => session.date > lifecycle.world.currentDate)).toBe(true)
  })
})
