import { describe, expect, it } from 'vitest'

import { createGameWorld } from '@/domain/world'
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
    const withoutHistory = createGameWorld({ currentDate: completed.currentDate, currentSeasonId: completed.currentSeasonId, userCoachId: completed.userCoachId, countries: Object.values(completed.countries), coaches: Object.values(completed.coaches), players: Object.values(completed.players), teams: Object.values(completed.teams), competitions: Object.values(completed.competitions), seasons: Object.values(completed.seasons), games: Object.values(completed.games), matchStatLogs: Object.values(completed.matchStatLogsByGameId) })
    expect(() => startNextSeason(withoutHistory)).toThrow('history record')
  })

  it('creates a deterministic new season without replacing canonical history', () => {
    const completed = completeCurrentSeason(createNewGame())
    const priorGames = Object.values(completed.games)
    const priorLogs = Object.values(completed.matchStatLogsByGameId)
    const priorHistory = Object.values(completed.seasonHistoryBySeasonId)
    const priorPlayers = Object.values(completed.players)
    const next = startNextSeason(completed)
    const nextSeason = getCurrentSeason(next)
    const newGames = Object.values(next.games).filter((game) => game.seasonId === nextSeason.id)

    expect(nextSeason.id).toBe('generated-season-0002')
    expect(nextSeason.startDate).toBe('2033-10-01')
    expect(next.currentDate).toBe(nextSeason.startDate)
    expect(Object.values(next.seasons)).toHaveLength(2)
    expect(Object.values(next.games)).toHaveLength(priorGames.length + 56)
    expect(new Set(Object.keys(next.games)).size).toBe(Object.keys(next.games).length)
    expect(newGames).toHaveLength(56)
    expect(newGames.every((game) => game.status === 'scheduled' && game.result === null)).toBe(true)
    expect(Object.values(next.games).filter((game) => game.seasonId !== nextSeason.id)).toEqual(priorGames)
    expect(Object.values(next.matchStatLogsByGameId)).toEqual(priorLogs)
    expect(Object.values(next.seasonHistoryBySeasonId)).toEqual(priorHistory)
    const nextPlayersWithPreviousRatings = Object.values(next.players).map((player) => ({ ...player, basketball: { ...player.basketball, ratings: priorPlayers.find((prior) => prior.id === player.id)!.basketball.ratings } }))
    expect(nextPlayersWithPreviousRatings).toEqual(priorPlayers)
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
    expect(Object.values(next.seasonHistoryBySeasonId)).toHaveLength(2)
    expect(getCurrentSeason(next).id).toBe(seasonTwo.id)
    expect(getCurrentSeason(startNextSeason(next)).id).toBe('generated-season-0003')
  })

  it('round-trips multiple seasons and accepts legacy single-season V1 without currentSeasonId', () => {
    const next = startNextSeason(completeCurrentSeason(createNewGame()))
    const envelope = serializeGameWorldV1(next, '2033-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(envelope)
    const { currentSeasonId: _currentSeasonId, ...legacyPayload } = serializeGameWorldV1(createNewGame(), '2032-10-01T00:00:00.000Z').payload

    expect(loaded).toEqual(next)
    expect(loaded.currentSeasonId).toBe(next.currentSeasonId)
    expect(deserializeGameWorldV1({ schemaVersion: 1, savedAt: '2032-10-01T00:00:00.000Z', payload: legacyPayload }).currentSeasonId).toBe('generated-season-0001')
  })
})

function completeCurrentSeason(world: ReturnType<typeof createNewGame>) {
  const season = getCurrentSeason(world)
  return Object.values(world.games).filter((game) => game.seasonId === season.id && game.status === 'scheduled').reduce((current, game) => simulateAndApplyGame(current, game), world)
}
