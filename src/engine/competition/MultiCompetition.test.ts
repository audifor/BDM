import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { getCompetitions, getCompetitionsForTeam, getGamesForCompetition } from '@/domain/world'
import { canTeamTrainOnDate } from '@/engine/training'
import { calculateStandingsForCompetition } from './standings'
import { finalizeSeason, getCompetitionChampion, isCompetitionComplete, isSeasonComplete } from '@/engine/season'
import { applyMatchResult } from '@/engine/match'

describe('multi-competition world', () => {
  it('keeps schedules, standings and results isolated by CompetitionId', () => {
    const world = createNewGame()
    const [primary, secondary] = getCompetitions(world)
    const primaryGames = getGamesForCompetition(world, primary!.id)
    const secondaryGames = getGamesForCompetition(world, secondary!.id)
    const beforeSecondary = calculateStandingsForCompetition(world, secondary!.id)
    const result = applyScore(world, primaryGames[0]!)

    expect(getCompetitionsForTeam(world, primary!.participantTeamIds[0]!).map((competition) => competition.id)).toEqual([primary!.id, secondary!.id])
    expect(primaryGames).toHaveLength(56)
    expect(secondaryGames).toHaveLength(12)
    expect(new Set([...primaryGames, ...secondaryGames].map((game) => game.id)).size).toBe(68)
    expect(calculateStandingsForCompetition(result, secondary!.id)).toEqual(beforeSecondary)
    expect(calculateStandingsForCompetition(result, primary!.id).some((line) => line.played === 1)).toBe(true)
    expect(canTeamTrainOnDate(world, secondary!.participantTeamIds[0]!, secondaryGames[0]!.date)).toBe(false)
  })

  it('finalizes one competition and its champion while the other remains active', () => {
    const world = createNewGame()
    const [, secondary] = getCompetitions(world)
    const completed = finalizeSeason(getGamesForCompetition(world, secondary!.id).reduce(applyScore, world), Object.values(world.seasons).find((season) => season.competitionId === secondary!.id)!.id)

    expect(isCompetitionComplete(completed, secondary!.id)).toBe(true)
    expect(getCompetitionChampion(completed, secondary!.id)).toBe(calculateStandingsForCompetition(completed, secondary!.id)[0]!.teamId)
    expect(isSeasonComplete(completed, completed.currentSeasonId)).toBe(false)
  })
})

function applyScore(world: ReturnType<typeof createNewGame>, game: ReturnType<typeof getGamesForCompetition>[number]) {
  return applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 90, awayScore: 80 })
}
