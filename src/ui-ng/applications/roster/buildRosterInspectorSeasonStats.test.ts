import { describe, expect, it } from 'vitest'

import { completeMatch, createNewGame, prepareUserMatch } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { boxScoreValuation } from '@/engine/stats/boxScoreValuation'
import { calculatePlayerStatAverages, getPlayerSeasonStats } from '@/engine/stats/PlayerHistory'

import { buildRosterInspectorSeasonStats } from './buildRosterInspectorSeasonStats'

describe('buildRosterInspectorSeasonStats', () => {
  it('omits plus-minus and shows dashes before any games are played', () => {
    const world = createNewGame()
    const playerId = getUserTeam(world)!.rosterPlayerIds[0]!
    const stats = buildRosterInspectorSeasonStats(world, playerId)

    expect(stats.map((item) => item.label)).toEqual(['PTS', 'REB', 'AST', 'MIN', 'VAL'])
    expect(stats.every((item) => item.value === '—')).toBe(true)
  })

  it('adds per-game box stats and plus-minus after a completed match', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const season = getPlayerSeasonStats(updated, playerId, updated.currentSeasonId)
    const averages = calculatePlayerStatAverages(season)
    const stats = buildRosterInspectorSeasonStats(updated, playerId)

    expect(stats).toEqual([
      { label: 'PTS', value: averages.ppg.toFixed(1) },
      { label: 'REB', value: averages.rpg.toFixed(1) },
      { label: 'AST', value: averages.apg.toFixed(1) },
      { label: 'MIN', value: averages.mpg.toFixed(1) },
      { label: 'VAL', value: (boxScoreValuation(season) / season.gamesPlayed).toFixed(1) },
      {
        label: '+/-',
        value: `${averages.plusMinusPerGame > 0 ? '+' : ''}${averages.plusMinusPerGame.toFixed(1)}`,
      },
    ])
  })
})
