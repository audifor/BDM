import { describe, expect, it } from 'vitest'

import { createGameWorld, updateGameWorld } from '@/domain/world'
import { calculateStaffRoleProficiencyByRoleId } from '@/domain/staff'
import { calculateStandings } from '@/engine/competition/standings'
import { getPlayerCareerStats, getPlayerSeasonStats } from '@/engine/stats/PlayerHistory'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'

import { createNewGame } from './createNewGame'
import { simulateAndApplyGame } from './playUserGame'
import { getCurrentSeason } from './selectors'
import { startNextSeason } from './startNextSeason'
import { advanceGameDay } from './advanceGameDay'

describe('startNextSeason', () => {
  it('requires a finalized current season', () => {
    expect(() => startNextSeason(createNewGame())).toThrow('not complete')
  })

  it('requires an existing history record even when the games are complete', () => {
    const completed = completeCurrentSeason(createNewGame())
    const withoutHistory = updateGameWorld(completed, { seasonHistory: [] })
    expect(() => startNextSeason(withoutHistory)).toThrow('history record')
  }, 10_000)

  it('creates a deterministic new season without replacing canonical history', () => {
    const completed = completeCurrentSeason(createNewGame())
    const priorGames = Object.values(completed.games)
    const priorLogs = Object.values(completed.matchStatLogsByGameId)
    const priorHistory = Object.values(completed.seasonHistoryBySeasonId)
    const priorPlayers = Object.values(completed.players)
    const next = startNextSeason(completed)
    const nextSeason = getCurrentSeason(next)
    const newGames = Object.values(next.games).filter((game) => game.seasonId === nextSeason.id)

    expect(nextSeason.id).toBe('generated-season-0004')
    expect(nextSeason.startDate).toBe('2033-10-01')
    expect(next.currentDate).toBe(nextSeason.startDate)
    expect(Object.values(next.seasons).filter((season) => next.ecosystems[next.competitions[season.competitionId]!.ecosystemId]!.category === 'men')).toHaveLength(5)
    expect(Object.values(next.games)).toHaveLength(priorGames.length + 56)
    expect(new Set(Object.keys(next.games)).size).toBe(Object.keys(next.games).length)
    expect(newGames).toHaveLength(56)
    expect(newGames.every((game) => game.status === 'scheduled' && game.result === null)).toBe(true)
    expect(Object.values(next.games).filter((game) => game.seasonId !== nextSeason.id)).toEqual(priorGames)
    expect(Object.values(next.matchStatLogsByGameId)).toEqual(priorLogs)
    expect(Object.values(next.seasonHistoryBySeasonId)).toEqual(priorHistory)
    expect(next.teamFinancesByTeamId).toEqual(completed.teamFinancesByTeamId)
    expect(Object.values(next.players)).toHaveLength(priorPlayers.length)
    expect(Object.values(next.players).every((player) => priorPlayers.some((prior) => prior.id === player.id))).toBe(true)
    expect(Object.values(next.players).map((player) => player.development)).toEqual(priorPlayers.map((player) => player.development))
    expect(Object.values(next.players).some((player) => JSON.stringify(player.basketball.ratings) !== JSON.stringify(priorPlayers.find((prior) => prior.id === player.id)!.basketball.ratings))).toBe(true)
    expect(calculateStandings(next, nextSeason.id).every((line) => line.played === 0 && line.wins === 0 && line.losses === 0 && line.pointsFor === 0)).toBe(true)
    expect(() => advanceGameDay(next)).not.toThrow()
  })

  it('keeps career stats, resets season projections, finalizes season two, and supports season three', () => {
    const completed = completeCurrentSeason(createNewGame())
    const playerId = Object.values(completed.players)[0]!.id
    const career = getPlayerCareerStats(completed, playerId)
    let next = startNextSeason(completed)
    const seasonTwo = getCurrentSeason(next)
    expect(getPlayerSeasonStats(next, playerId, seasonTwo.id).gamesPlayed).toBe(0)
    expect(getPlayerCareerStats(next, playerId)).toEqual(career)
    next = simulateAndApplyGame(next, Object.values(next.games).find((game) => game.seasonId === seasonTwo.id)!)
    expect(getPlayerSeasonStats(next, playerId, seasonTwo.id).gamesPlayed).toBeLessThanOrEqual(1)
    expect(getPlayerCareerStats(next, playerId).gamesPlayed).toBeGreaterThanOrEqual(career.gamesPlayed)
    next = completeCurrentSeason(next)
    expect(Object.values(next.seasonHistoryBySeasonId).filter((history) => next.ecosystems[next.competitions[next.seasons[history.seasonId]!.competitionId]!.ecosystemId]!.category === 'men')).toHaveLength(5)
    expect(getCurrentSeason(next).id).toBe(seasonTwo.id)
    expect(getCurrentSeason(startNextSeason(next)).id).toBe('generated-season-0006')
  })

  it('round-trips multiple seasons and accepts legacy single-season V1 without currentSeasonId', () => {
    const next = startNextSeason(completeCurrentSeason(createNewGame()))
    const envelope = serializeGameWorldV1(next, '2033-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(envelope)
    const single = serializeGameWorldV1(createNewGame(), '2032-10-01T00:00:00.000Z').payload
    const primarySeasonId = single.currentSeasonId
    const primaryCompetitionId = (single.seasons.find((season) => season.id === primarySeasonId) as { competitionId: string }).competitionId
    const { currentSeasonId: _currentSeasonId, ...legacyPayload } = { ...single, competitions: single.competitions.filter((competition) => competition.id === primaryCompetitionId), seasons: single.seasons.filter((season) => season.id === primarySeasonId), games: single.games.filter((game) => game.seasonId === primarySeasonId) }

    const roundTrip = serializeGameWorldV1(loaded, envelope.savedAt).payload
    for (const key of Object.keys(envelope.payload) as (keyof typeof envelope.payload)[]) {
      if (key === 'careerFatigue' || key === 'developmentStimulus') continue
      expect(roundTrip[key], key).toEqual(envelope.payload[key])
    }
    expect(loaded.currentSeasonId).toBe(next.currentSeasonId)
    expect(deserializeGameWorldV1({ schemaVersion: 1, savedAt: '2032-10-01T00:00:00.000Z', payload: legacyPayload }).currentSeasonId).toBe('generated-season-0001')
  })

  it('startNextSeason preserves staff people exactly', () => {
    const completed = completeCurrentSeason(createNewGame())

    expect(startNextSeason(completed).staffPeopleById).toEqual(completed.staffPeopleById)
  })

  it('startNextSeason preserves staff assignments exactly', () => {
    const completed = completeCurrentSeason(createNewGame())

    expect(startNextSeason(completed).teamStaffAssignmentsById).toEqual(completed.teamStaffAssignmentsById)
  })

  it('multi-season save/load preserves staff people exactly', () => {
    const next = startNextSeason(completeCurrentSeason(createNewGame()))
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(next, '2033-10-01T00:00:00.000Z'))

    expect(loaded.staffPeopleById).toEqual(next.staffPeopleById)
    for (const person of Object.values(next.staffPeopleById)) {
      expect(loaded.staffPeopleById[person.id]!.professional.attributes).toEqual(person.professional.attributes)
    }
  })

  it('multi-season save/load preserves staff assignments exactly', () => {
    const next = startNextSeason(completeCurrentSeason(createNewGame()))
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(next, '2033-10-01T00:00:00.000Z'))

    expect(loaded.teamStaffAssignmentsById).toEqual(next.teamStaffAssignmentsById)
    for (const assignment of Object.values(next.teamStaffAssignmentsById)) {
      const loadedAssignment = loaded.teamStaffAssignmentsById[assignment.id]!
      expect(loadedAssignment.assignedOn).toBe(assignment.assignedOn)
      expect(calculateStaffRoleProficiencyByRoleId(loaded.staffPeopleById[loadedAssignment.staffPersonId]!, loadedAssignment.role)).toBe(calculateStaffRoleProficiencyByRoleId(next.staffPeopleById[assignment.staffPersonId]!, assignment.role))
    }
  })
})

function completeCurrentSeason(world: ReturnType<typeof createNewGame>) {
  return Object.values(world.games).filter((game) => game.status === 'scheduled').reduce((current, game) => simulateAndApplyGame(current, game), world)
}
