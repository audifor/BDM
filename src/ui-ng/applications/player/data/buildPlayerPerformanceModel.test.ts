import { describe, expect, it } from 'vitest'

import { completeMatch, createNewGame, prepareUserMatch } from '@/app/game'

import {
  buildPerformanceViewSnapshot,
  buildPlayerPerformanceModel,
  findGameLogRow,
  selectPerformanceSnapshot,
} from './buildPlayerPerformanceModel'
import { defaultPlayerIdForNg } from './buildPlayerWorkspaceModel'

describe('buildPlayerPerformanceModel', () => {
  it('returns empty snapshot when player has zero appearances', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerPerformanceModel(world, playerId)

    expect(model.allSeasonSnapshot.status).toBe('empty')
    expect(model.allSeasonSnapshot.productionPrimary).toEqual([])
    expect(model.allSeasonSnapshot.shooting).toEqual([])
    expect(model.allSeasonSnapshot.gameLogs).toEqual([])
    expect(model.allSeasonSnapshot.recentForm).toEqual([])
  })

  it('derives per-game averages and shooting percentages from real match logs', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const model = buildPlayerPerformanceModel(updated, playerId)
    const snapshot = model.allSeasonSnapshot

    expect(snapshot.status).toBe('available')
    expect(snapshot.gameLogs).toHaveLength(1)
    expect(snapshot.productionPrimary.find((cell) => cell.label === 'PTS')?.value).toBe(
      snapshot.gameLogs[0]!.points.toFixed(1),
    )

    const fgLine = snapshot.shooting.find((line) => line.label === 'FG')
    expect(fgLine?.percentage).not.toBeNull()
    expect(Number(fgLine?.percentage)).toBeGreaterThanOrEqual(0)
  })

  it('returns empty shooting arrays when there are no appearances', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const snapshot = buildPlayerPerformanceModel(world, playerId).allSeasonSnapshot

    expect(snapshot.status).toBe('empty')
    expect(snapshot.shooting).toEqual([])
  })

  it('formats 3P% and FT% with safe zero-attempt handling', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const seasonStats = updated.matchStatLogsByGameId[simulation.gameId]!.playerLines.find(
      (line) => line.playerId === playerId,
    )!
    const snapshot = buildPlayerPerformanceModel(updated, playerId).allSeasonSnapshot

    const threeLine = snapshot.shooting.find((line) => line.label === '3PT')
    const ftLine = snapshot.shooting.find((line) => line.label === 'FT')

    if (seasonStats.stats.threePointAttempted === 0) {
      expect(threeLine?.percentage).toBeNull()
    } else {
      expect(threeLine?.percentage).toMatch(/^\d+\.\d$/)
    }

    if (seasonStats.stats.freeThrowsAttempted === 0) {
      expect(ftLine?.percentage).toBeNull()
    } else {
      expect(ftLine?.percentage).toMatch(/^\d+\.\d$/)
    }
  })

  it('keeps recent form aligned with the newest game log entry', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const snapshot = buildPlayerPerformanceModel(updated, playerId).allSeasonSnapshot

    expect(snapshot.gameLogs).toHaveLength(1)
    expect(snapshot.recentForm).toHaveLength(1)
    expect(snapshot.recentForm[0]?.gameId).toBe(snapshot.gameLogs[0]?.gameId)
  })

  it('filters by competition when multiple competition ids exist in logs', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const model = buildPlayerPerformanceModel(updated, playerId)
    const competitionId = updated.matchStatLogsByGameId[simulation.gameId]!.competitionId

    const filtered = selectPerformanceSnapshot(model, updated, playerId, competitionId)
    expect(filtered.status).toBe('available')
    expect(filtered.gameLogs.every((row) => row.competitionId === competitionId)).toBe(true)
  })

  it('finds selected game rows in the transformed log', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const model = buildPlayerPerformanceModel(updated, playerId)
    const gameId = model.allSeasonSnapshot.gameLogs[0]!.gameId

    expect(findGameLogRow(model.allSeasonSnapshot, gameId)?.points).toBeGreaterThanOrEqual(0)
    expect(findGameLogRow(model.allSeasonSnapshot, null)).toBeUndefined()
  })

  it('maps optional opponent and competition names safely', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const row = buildPlayerPerformanceModel(updated, playerId).allSeasonSnapshot.gameLogs[0]

    expect(row?.opponent.length).toBeGreaterThan(0)
    expect(row?.competition.length).toBeGreaterThan(0)
    expect(row?.result).toMatch(/^[WLT] \d+-\d+$/)
  })
})
