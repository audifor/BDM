import { describe, expect, it } from 'vitest'

import { completeMatch, createNewGame, prepareUserMatch } from '@/app/game'

import {
  buildPerformanceFilterBar,
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
    expect(model.allSeasonSnapshot.kpiStrip).toEqual([])
    expect(model.allSeasonSnapshot.efficiencyMetrics).toEqual([])
    expect(model.allSeasonSnapshot.shotProfile.zones).toEqual([])
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
    expect(snapshot.kpiStrip.find((cell) => cell.label === 'PTS')?.value).toBe(
      snapshot.gameLogs[0]!.points.toFixed(1),
    )
    expect(snapshot.gameLogs[0]!.fgPercentage).not.toBeNull()
    expect(Number(snapshot.gameLogs[0]!.fgPercentage)).toBeGreaterThanOrEqual(0)
  })

  it('returns empty shooting arrays when there are no appearances', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const snapshot = buildPlayerPerformanceModel(world, playerId).allSeasonSnapshot

    expect(snapshot.status).toBe('empty')
    expect(snapshot.efficiencyMetrics).toEqual([])
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

    const threeLine = snapshot.efficiencyMetrics.find((metric) => metric.label === '3P%')
    const ftLine = snapshot.efficiencyMetrics.find((metric) => metric.label === 'FT%')

    if (seasonStats.stats.threePointAttempted === 0) {
      expect(threeLine?.value).toBe('—')
      expect(threeLine?.detail).toBe('0.0 / 0.0')
    } else {
      expect(threeLine?.value).toMatch(/^\d+\.\d$/)
    }

    if (seasonStats.stats.freeThrowsAttempted === 0) {
      expect(ftLine?.value).toBe('—')
    } else {
      expect(ftLine?.value).toMatch(/^\d+\.\d$/)
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
    // The form chart plots the same valuation the KPI strip and the log row report.
    expect(snapshot.recentForm[0]?.valuation).toBe(snapshot.gameLogs[0]?.valuation)
    expect(snapshot.kpiStrip.find((cell) => cell.label === 'VAL')?.value).toBe(
      snapshot.gameLogs[0]!.valuation.toFixed(1),
    )
  })

  it('derives the shooting efficiency percentages and declares the ones it cannot', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const snapshot = buildPlayerPerformanceModel(updated, playerId).allSeasonSnapshot
    const line = updated.matchStatLogsByGameId[simulation.gameId]!.playerLines.find(
      (entry) => entry.playerId === playerId,
    )!

    expect(snapshot.efficiencyMetrics.map((metric) => metric.label)).toEqual([
      'FG%',
      '2P%',
      '3P%',
      'FT%',
      'eFG%',
      'TS%',
      'USG%',
      'AST%',
      'TOV%',
    ])
    const ef = snapshot.efficiencyMetrics.find((metric) => metric.label === 'eFG%')!
    const expectedEf =
      line.stats.fieldGoalsAttempted === 0
        ? '—'
        : ((line.stats.fieldGoalsMade + 0.5 * line.stats.threePointMade) /
            line.stats.fieldGoalsAttempted *
            100
          ).toFixed(1)
    expect(ef.value).toBe(expectedEf)
    expect(snapshot.gaps.map((gap) => gap.label)).toContain('Shot profile by location')
    expect(snapshot.gaps.map((gap) => gap.label)).toContain('First half / second half')
    for (const gap of snapshot.gaps) {
      expect(gap.reason.length).toBeGreaterThan(0)
    }
  })

  it('splits the tracked games by venue and keeps the split totals consistent', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const snapshot = buildPlayerPerformanceModel(updated, playerId).allSeasonSnapshot
    const home = snapshot.splits.find((row) => row.id === 'home')
    const away = snapshot.splits.find((row) => row.id === 'away')

    // Both venues are listed, as the reference does, and exactly one of them holds the game.
    expect([home, away].filter((row) => row !== undefined)).toHaveLength(2)
    const played = [home, away].filter((row) => row !== undefined && row.games > 0)
    expect(played).toHaveLength(1)
    expect(played[0]!.games).toBe(1)
    expect(Number(played[0]!.points)).toBe(snapshot.gameLogs[0]!.points)
    expect(Number(played[0]!.valuation)).toBe(snapshot.gameLogs[0]!.valuation)

    // The halves are listed with the reason the save cannot fill them.
    const halves = snapshot.splits.filter((row) => row.id === 'first-half' || row.id === 'second-half')
    expect(halves).toHaveLength(2)
    for (const half of halves) {
      expect(half.games).toBe(0)
      expect(half.points).toBe('—')
      expect(half.reason).toContain('final totals')
    }
    expect(snapshot.splitsNote).toContain('current competition table')
  })

  it('filters by competition when multiple competition ids exist in logs', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const model = buildPlayerPerformanceModel(updated, playerId)
    const competitionId = updated.matchStatLogsByGameId[simulation.gameId]!.competitionId

    const filtered = selectPerformanceSnapshot(model, updated, playerId, {
      seasonId: model.seasonId,
      competition: competitionId,
      phase: 'all',
      split: 'all',
    })
    expect(filtered.status).toBe('available')
    expect(filtered.gameLogs.every((row) => row.competitionId === competitionId)).toBe(true)
  })

  it('filters by venue and by result through the same snapshot builder', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const model = buildPlayerPerformanceModel(updated, playerId)
    const row = model.allSeasonSnapshot.gameLogs[0]!

    const homeFilter = selectPerformanceSnapshot(model, updated, playerId, {
      seasonId: model.seasonId,
      competition: 'all',
      phase: 'all',
      split: 'home',
    })
    const awayFilter = selectPerformanceSnapshot(model, updated, playerId, {
      seasonId: model.seasonId,
      competition: 'all',
      phase: 'all',
      split: 'away',
    })
    const wins = selectPerformanceSnapshot(model, updated, playerId, {
      seasonId: model.seasonId,
      competition: 'all',
      phase: 'all',
      split: 'wins',
    })
    const losses = selectPerformanceSnapshot(model, updated, playerId, {
      seasonId: model.seasonId,
      competition: 'all',
      phase: 'all',
      split: 'losses',
    })

    expect([homeFilter, awayFilter].filter((entry) => entry.gameLogs.length === 1)).toHaveLength(1)
    const won = row.outcome === 'W'
    expect(wins.status === 'empty' ? [] : wins.gameLogs).toHaveLength(won ? 1 : 0)
    expect(losses.status === 'empty' ? [] : losses.gameLogs).toHaveLength(won ? 0 : 1)
  })

  it('builds the KPI strip and the advanced efficiency from the same box score', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const snapshot = buildPlayerPerformanceModel(updated, playerId).allSeasonSnapshot
    const line = updated.matchStatLogsByGameId[simulation.gameId]!.playerLines.find(
      (entry) => entry.playerId === playerId,
    )!

    expect(snapshot.kpiStrip.map((cell) => cell.label)).toEqual([
      'GP',
      'GS',
      'MIN',
      'PTS',
      'REB',
      'AST',
      'STL',
      'BLK',
      'TOV',
      'VAL',
    ])
    expect(snapshot.kpiStrip.find((cell) => cell.label === 'GP')?.value).toBe('1')
    expect(snapshot.kpiStrip.find((cell) => cell.label === 'PTS')?.value).toBe(
      line.stats.points.toFixed(1),
    )

    expect(snapshot.efficiencyMetrics.map((metric) => metric.label)).toEqual([
      'FG%',
      '2P%',
      '3P%',
      'FT%',
      'eFG%',
      'TS%',
      'USG%',
      'AST%',
      'TOV%',
    ])
    // The four shooting families carry the volume behind the percentage.
    expect(snapshot.efficiencyMetrics.filter((metric) => metric.detail !== null)).toHaveLength(4)
    const turnoverRate = snapshot.efficiencyMetrics.find((metric) => metric.label === 'TOV%')!
    const possessions =
      line.stats.fieldGoalsAttempted + 0.44 * line.stats.freeThrowsAttempted + line.stats.turnovers
    expect(turnoverRate.value).toBe(possessions === 0 ? '—' : ((100 * line.stats.turnovers) / possessions).toFixed(1))
    // Usage and assist rate come from the team totals of the same game, never from a placeholder.
    const usage = snapshot.efficiencyMetrics.find((metric) => metric.label === 'USG%')!
    expect(usage.value).not.toBe('—')
    expect(Number(usage.value)).toBeGreaterThan(0)
  })

  it('draws the shot profile from the two zones the save records', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const snapshot = buildPlayerPerformanceModel(updated, playerId).allSeasonSnapshot
    const line = updated.matchStatLogsByGameId[simulation.gameId]!.playerLines.find(
      (entry) => entry.playerId === playerId,
    )!

    expect(snapshot.shotProfile.zones.map((zone) => zone.id)).toEqual(['inside-arc', 'outside-arc'])
    const inside = snapshot.shotProfile.zones[0]!
    const outside = snapshot.shotProfile.zones[1]!
    expect(inside.made).toBe(line.stats.twoPointMade)
    expect(inside.attempted).toBe(line.stats.twoPointAttempted)
    expect(outside.made).toBe(line.stats.threePointMade)
    expect(outside.attempted).toBe(line.stats.threePointAttempted)
    expect(snapshot.shotProfile.totalAttempts).toBe(line.stats.fieldGoalsAttempted)
    const shares = snapshot.shotProfile.zones.reduce((sum, zone) => sum + zone.share, 0)
    // The shares describe the recorded attempts: they add up to the whole (or to zero attempts).
    expect(line.stats.fieldGoalsAttempted === 0 ? shares : Math.abs(shares - 100) <= 1).toBeTruthy()
    expect(snapshot.shotProfile.note).toContain('no shot coordinates')
  })

  it('offers only filters the save can honour', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const model = buildPlayerPerformanceModel(updated, playerId)

    const bar = buildPerformanceFilterBar(updated, playerId, model.seasonId, {
      competition: 'all',
      phase: 'all',
      split: 'all',
    })

    expect(bar.map((filter) => filter.id)).toEqual(['season', 'competition', 'phase', 'split'])
    expect(bar.find((filter) => filter.id === 'season')?.valueLabel).toBe(model.seasonLabel)
    expect(bar.find((filter) => filter.id === 'competition')?.valueLabel).toBe('All Competitions')
    expect(bar.find((filter) => filter.id === 'phase')?.valueLabel).toBe('All Phases')
    expect(bar.find((filter) => filter.id === 'split')?.options.map((option) => option.id)).toEqual([
      'all',
      'home',
      'away',
      'wins',
      'losses',
    ])
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
    expect(row?.opponentName.length).toBeGreaterThan(0)
    expect(row?.competition.length).toBeGreaterThan(0)
    expect(row?.result).toMatch(/^[WLT] \d+-\d+$/)
    expect(row?.dateLabel.length).toBeGreaterThan(0)
    // The inspector note is a reading of the recorded numbers, not authored commentary.
    expect(row?.summary).toContain(String(row?.points))
    expect(row?.summary).toContain(String(row?.rebounds))
  })
})
