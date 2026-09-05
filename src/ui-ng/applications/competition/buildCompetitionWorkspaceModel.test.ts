import { describe, expect, it } from 'vitest'

import { createNewGame, instantResult } from '@/app/game'
import { addDays, parseGameDate, type GameDate } from '@/domain/date'
import { createGame } from '@/domain/game'
import { gameIdFromString } from '@/domain/ids'
import { createScheduledTrainingSession } from '@/domain/training'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

import {
  boxScoreValuation,
  buildCompetitionWorkspaceModel,
  calendarEventsForMonth,
  isoWeekday,
  monthGrid,
  monthStart,
  monthTitle,
  shiftMonth,
} from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'

function firstOpenDate(world: GameWorld, teamIds: readonly string[], start: GameDate, end: GameDate): GameDate {
  let date = start
  while (date <= end) {
    const busy = Object.values(world.games).some(
      (game) => game.date === date && (teamIds.includes(game.homeTeamId) || teamIds.includes(game.awayTeamId)),
    )
    if (!busy) return date
    date = addDays(date, 1)
  }
  throw new Error('No open calendar date')
}

describe('buildCompetitionWorkspaceModel', () => {
  it('projects the user competition fixtures without inventing cups or stats', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const model = buildCompetitionWorkspaceModel(world, undefined, team.id)

    expect(model).not.toBeNull()
    expect(model!.games.length).toBeGreaterThan(0)
    expect(model!.upcoming.length).toBe(model!.games.length)
    expect(model!.dateGroups).toEqual([])
    expect(model!.leaders).toEqual([])
    expect(model!.statPodiums.map((podium) => podium.id)).toEqual(['points', 'rebounds', 'assists', 'valuation'])
    expect(model!.statPodiums.every((podium) => podium.entries.length === 0)).toBe(true)
    expect(model!.standings.length).toBeGreaterThan(0)
    expect(world.competitions[model!.competitionId]!.participantTeamIds).toContain(team.id)
  })

  it('builds a Monday-first month grid that keeps every day of the month', () => {
    const september = parseGameDate('2026-09-01')
    expect(isoWeekday(september)).toBe(2)
    expect(monthTitle(september)).toBe('Septiembre 2026')
    const cells = monthGrid(september)
    expect(cells).toHaveLength(42)
    expect(isoWeekday(cells[0]!)).toBe(1)
    expect(cells).toContain('2026-09-30')
    expect(shiftMonth(monthStart(september), 1)).toBe('2026-10-01')
  })

  it('puts user matches from other competitions, season milestones and scheduled training on the month calendar', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const base = buildCompetitionWorkspaceModel(world, undefined, team.id)!
    const otherSeason = Object.values(world.seasons).find((season) => {
      if (season.competitionId === base.competitionId) return false
      const participants = season.participantTeamIds ?? world.competitions[season.competitionId]!.participantTeamIds
      return participants.includes(team.id)
    })
    const opponentId =
      otherSeason === undefined
        ? undefined
        : (otherSeason.participantTeamIds ?? world.competitions[otherSeason.competitionId]!.participantTeamIds).find(
            (id) => id !== team.id,
          )
    const extraDate =
      otherSeason === undefined || opponentId === undefined
        ? undefined
        : firstOpenDate(world, [team.id, opponentId], otherSeason.startDate, otherSeason.endDate)

    const withExtras = updateGameWorld(
      extraDate === undefined || otherSeason === undefined || opponentId === undefined
        ? world
        : updateGameWorld(world, {
            games: [
              ...Object.values(world.games),
              createGame({
                id: gameIdFromString('calendar-user-other-comp'),
                seasonId: otherSeason.id,
                competitionId: otherSeason.competitionId,
                date: extraDate,
                homeTeamId: team.id,
                awayTeamId: opponentId,
                status: 'scheduled',
                result: null,
              }),
            ],
          }),
      {
        scheduledTrainingSessionsById: {
          ...world.scheduledTrainingSessionsById,
          'calendar-training': createScheduledTrainingSession({
            id: 'calendar-training',
            teamId: team.id,
            date: world.currentDate,
            startTime: '10:00',
            durationMinutes: 60,
            scope: 'team',
            definitionId: 'catchAndShoot',
            intensity: 'normal',
          }),
        },
      },
    )

    const otherImportant = Object.values(withExtras.games).find(
      (game) =>
        game.competitionId !== base.competitionId &&
        game.homeTeamId !== team.id &&
        game.awayTeamId !== team.id,
    )
    const staged =
      otherImportant === undefined
        ? withExtras
        : updateGameWorld(withExtras, {
            games: Object.values(withExtras.games).map((game) =>
              game.id === otherImportant.id
                ? createGame({
                    id: game.id,
                    seasonId: game.seasonId,
                    competitionId: game.competitionId,
                    date: game.date,
                    homeTeamId: game.homeTeamId,
                    awayTeamId: game.awayTeamId,
                    status: game.status,
                    result: game.result,
                    stakes: 'final',
                  })
                : game,
            ),
          })

    const model = buildCompetitionWorkspaceModel(staged, base.competitionId, team.id)!
    const starts = model.calendarEvents.filter((event) => event.kind === 'milestone' && event.id.startsWith('season-start:'))
    expect(new Set(starts.map((event) => event.label)).size).toBeGreaterThan(1)
    expect(model.calendarEvents.some((event) => event.kind === 'training' && event.id === 'calendar-training')).toBe(true)
    expect(model.calendarEvents.some((event) => event.kind === 'game' && event.involvesUserTeam)).toBe(true)

    if (extraDate !== undefined) {
      expect(
        model.calendarEvents.some(
          (event) => event.kind === 'game' && event.id === 'calendar-user-other-comp' && !event.isSelectedCompetition,
        ),
      ).toBe(true)
    }

    if (otherImportant !== undefined) {
      expect(
        model.calendarEvents.some((event) => event.kind === 'game' && event.id === otherImportant.id && event.tone === 'important-game'),
      ).toBe(true)
    }

    const month = monthStart(parseGameDate(staged.currentDate))
    const mine = calendarEventsForMonth(model.calendarEvents, month, true)
    const all = calendarEventsForMonth(model.calendarEvents, month, false)
    const mineFlat = Object.values(mine).flat()
    const allFlat = Object.values(all).flat()
    expect(mineFlat.some((event) => event.kind === 'training')).toBe(true)
    expect(mineFlat.some((event) => event.kind === 'milestone')).toBe(true)
    expect(mineFlat.every((event) => event.kind !== 'game' || event.tone !== 'league-game')).toBe(true)
    expect(allFlat.some((event) => event.kind === 'game' && event.tone === 'league-game')).toBe(true)
  })

  it('builds top-3 podium cards from completed box scores including FIBA valuation', () => {
    expect(
      boxScoreValuation({
        points: 20,
        rebounds: 8,
        assists: 4,
        steals: 2,
        blocks: 1,
        fieldGoalsMade: 7,
        fieldGoalsAttempted: 12,
        freeThrowsMade: 4,
        freeThrowsAttempted: 5,
        turnovers: 3,
        foulsCommitted: 2,
      }),
    ).toBe(20 + 8 + 4 + 2 + 1 - 5 - 1 - 3 - 2)

    const world = instantResult(createNewGame())
    const team = getUserTeam(world)!
    const model = buildCompetitionWorkspaceModel(world, undefined, team.id)!

    expect(model.leaders.length).toBeGreaterThan(0)
    expect(model.statPodiums.map((podium) => podium.label)).toEqual(['Puntos', 'Rebotes', 'Asistencias', 'Valoración'])
    for (const podium of model.statPodiums) {
      expect(podium.entries.length).toBeGreaterThan(0)
      expect(podium.entries.length).toBeLessThanOrEqual(3)
    }
    expect(model.statPodiums[0]?.entries[0]?.playerId).toBe(model.leaders[0]?.playerId)
  })
})
