import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame } from '@/app/game'
import { BASKETBALL_POSITIONS } from '@/domain/primitives'
import { getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { calculatePlayerImpact } from '@/engine/team'

import { buildRosterDepthChart, leagueQualityStars } from './buildRosterDepthChart'

describe('buildRosterDepthChart', () => {
  it('counts live roster players by primary position without inventing rows', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const model = buildRosterDepthChart(world, team.id)

    expect(model.rosterCount).toBe(roster.length)
    expect(model.lanes.map((lane) => lane.position)).toEqual([...BASKETBALL_POSITIONS])
    expect(model.lanes.reduce((sum, lane) => sum + lane.count, 0)).toBe(roster.length)

    for (const lane of model.lanes) {
      const expected = roster.filter((player) => player.basketball.primaryPosition === lane.position)
      expect(lane.count).toBe(expected.length)
      expect(lane.players.map((player) => player.id).sort()).toEqual(expected.map((player) => player.id).sort())
      expect(lane.balance).toMatch(/thin|ok|loaded/)
      expect(lane.players.every((player) => player.band === 'unassigned' || player.band === 'starter' || player.band === 'rotation' || player.band === 'bench')).toBe(true)
    }
  })

  it('rates each depth-chart player in 1-5 stars against the league at that position', () => {
    expect(leagueQualityStars(50, [])).toBe(3)
    expect(leagueQualityStars(50, [50, 50, 50])).toBe(3)
    expect(leagueQualityStars(90, [10, 20, 30, 40, 50, 60, 70, 80, 90])).toBe(5)
    expect(leagueQualityStars(10, [10, 20, 30, 40, 50, 60, 70, 80, 90])).toBe(1)

    const world = createAcbTestGame()
    const team = getUserTeam(world)!
    const model = buildRosterDepthChart(world, team.id)
    const rated = model.lanes.flatMap((lane) => lane.players)
    expect(rated.every((player) => player.stars >= 1 && player.stars <= 5)).toBe(true)

    const byImpact = getTeamRoster(world, team.id)
      .map((player) => ({
        id: player.id,
        impact: calculatePlayerImpact(player),
        stars: rated.find((item) => item.id === player.id)!.stars,
        position: player.basketball.primaryPosition,
      }))
      .sort((left, right) => right.impact - left.impact || left.id.localeCompare(right.id))
    const best = byImpact[0]!
    const worstAtSame = [...byImpact].reverse().find((player) => player.position === best.position)
    expect(worstAtSame).toBeDefined()
    expect(best.stars).toBeGreaterThanOrEqual(worstAtSame!.stars)
  })
})
