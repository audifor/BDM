import { describe, expect, it } from 'vitest'

import { updateGameWorld } from '@/domain/world'
import { completeMatch, createNewGame, prepareUserMatch } from '@/app/game'
import { createMatchStatLog } from '@/engine/match'

import { calculatePlayerStatAverages, getPlayerCareerStats, getPlayerGameLogs, getPlayerSeasonStats } from './PlayerHistory'

describe('persistent match statistics projections', () => {
  it('creates an immutable all-squad log atomically with a completed match', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const log = createMatchStatLog(world, simulation.gameId, simulation)
    const updated = completeMatch(world, simulation)

    expect(log.playerLines).toHaveLength(simulation.squads.home.length + simulation.squads.away.length)
    expect(log.playerLines.filter((line) => line.isHome && line.started)).toHaveLength(5)
    expect(updated.games[simulation.gameId]!.status).toBe('completed')
    expect(updated.matchStatLogsByGameId[simulation.gameId]!.finalScore).toEqual(simulation.finalScore)
    expect(() => completeMatch(updated, simulation)).toThrow('already')
  })

  it('invalidates the derived index on canonical log replacement and keeps returned arrays independent', () => {
    const initial = createNewGame()
    const simulation = prepareUserMatch(initial)
    const playerId = simulation.squads.home[0]!
    expect(getPlayerGameLogs(initial, playerId)).toEqual([])
    const completed = completeMatch(initial, simulation)
    const original = getPlayerGameLogs(completed, playerId)
    const copy = getPlayerGameLogs(completed, playerId)
    copy.pop()
    expect(getPlayerGameLogs(completed, playerId)).toEqual(original)
    expect(getPlayerGameLogs(initial, playerId)).toEqual([])
    const log = completed.matchStatLogsByGameId[simulation.gameId]!
    const changed = { ...log, playerLines: log.playerLines.map(line => line.playerId === playerId ? { ...line, stats: { ...line.stats, assists: line.stats.assists + 1 } } : line) }
    const updated = updateGameWorld(completed, { matchStatLogs: [changed] })
    expect(getPlayerGameLogs(updated, playerId)[0]!.stats.assists).toBe(original[0]!.stats.assists + 1)
    expect(getPlayerGameLogs(completed, playerId)).toEqual(original)
  })

  it('derives season and career totals from game logs without mutable counters', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const seasonId = updated.games[simulation.gameId]!.seasonId
    const season = getPlayerSeasonStats(updated, playerId, seasonId)
    const career = getPlayerCareerStats(updated, playerId)

    expect(career.points).toBe(season.points)
    expect(career.secondsPlayed).toBe(season.secondsPlayed)
    expect(getPlayerGameLogs(updated, playerId)).toHaveLength(1)
    expect(calculatePlayerStatAverages(season).fieldGoalPercentage).toBeGreaterThanOrEqual(0)
  })
})
