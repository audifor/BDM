import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays, parseGameDate } from '@/domain/date'
import { getGamesForTeam, updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { nextEligibleTrainingDate, scheduleTeamModuleSession } from '@/engine/training'
import {
  automaticTeamTrainingDefinitionId,
  scheduleAutomaticTeamTrainingWeek,
} from './AutomaticTeamTraining'
import { setTeamTrainingPlan } from './TrainingEngine'

function mondayOf(date: ReturnType<typeof parseGameDate>) {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const weekday = jsDay === 0 ? 7 : jsDay
  return addDays(date, -(weekday - 1))
}

describe('scheduleAutomaticTeamTrainingWeek', () => {
  it('maps each training focus to one stable catalog definition', () => {
    expect(automaticTeamTrainingDefinitionId('balanced')).toBe('teamCohesion')
    expect(automaticTeamTrainingDefinitionId('shooting')).toBe('threePoint')
    expect(automaticTeamTrainingDefinitionId('athleticism')).toBe('conditioning')
  })

  it('fills future non-match days from the team plan and leaves match days empty', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const match = getGamesForTeam(base, team.id).find((game) => game.date > base.currentDate)
    expect(match).toBeDefined()
    const weekStart = mondayOf(match!.date)
    const world = setTeamTrainingPlan(updateGameWorld(base, { currentDate: addDays(weekStart, -1) }), team.id, {
      intensity: 'high',
      focus: 'shooting',
    })

    const scheduled = scheduleAutomaticTeamTrainingWeek(world, { teamId: team.id, weekStart })
    const autoSessions = Object.values(scheduled.scheduledTrainingSessionsById).filter((session) =>
      session.id.startsWith(`auto:${team.id}:`),
    )

    expect(autoSessions.length).toBeGreaterThan(0)
    expect(autoSessions.every((session) => session.definitionId === 'threePoint')).toBe(true)
    expect(autoSessions.every((session) => session.intensity === 'high')).toBe(true)
    expect(autoSessions.some((session) => session.date === match!.date)).toBe(false)
    expect(scheduleAutomaticTeamTrainingWeek(scheduled, { teamId: team.id, weekStart })).toEqual(scheduled)
  })

  it('does not replace a team session already scheduled that week', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const date = nextEligibleTrainingDate(world.currentDate)
    const weekStart = mondayOf(date)
    const existing = scheduleTeamModuleSession(world, {
      teamId: team.id,
      moduleId: 'teamCohesion',
      date,
      startTime: '11:00',
      durationMinutes: 60,
      sessionId: 'manual-keep',
      intensity: 'light',
    })

    const filled = scheduleAutomaticTeamTrainingWeek(existing, { teamId: team.id, weekStart })
    expect(filled.scheduledTrainingSessionsById['manual-keep']?.startTime).toBe('11:00')
    expect(filled.scheduledTrainingSessionsById[`auto:${team.id}:${date}`]).toBeUndefined()
  })
})
