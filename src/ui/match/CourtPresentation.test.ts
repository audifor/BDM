import { describe, expect, it } from 'vitest'

import { createNewGame, prepareUserMatch } from '@/app/game'

import { attacksRight, createCourtPresentation } from './CourtPresentation'

describe('CourtPresentation', () => {
  it('creates ten deterministic, bounded player tokens for either possession', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const first = createCourtPresentation({ homeTeamId: simulation.homeTeamId, awayTeamId: simulation.awayTeamId, lineups: simulation.lineups, attackingTeamId: simulation.homeTeamId, period: 1, players: world.players, events: [], progress: .5 })
    const second = createCourtPresentation({ homeTeamId: simulation.homeTeamId, awayTeamId: simulation.awayTeamId, lineups: simulation.lineups, attackingTeamId: simulation.homeTeamId, period: 1, players: world.players, events: [], progress: .5 })

    expect(first).toEqual(second)
    expect(first).toHaveLength(10)
    expect(new Set(first.map((token) => token.player.id)).size).toBe(10)
    expect(first.every((token) => token.x >= 0 && token.x <= 100 && token.y >= 0 && token.y <= 100)).toBe(true)
  })

  it('uses the decided home/away directions across regulation and overtime', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    expect(attacksRight(simulation.homeTeamId, simulation.homeTeamId, 1)).toBe(true)
    expect(attacksRight(simulation.awayTeamId, simulation.homeTeamId, 2)).toBe(false)
    expect(attacksRight(simulation.homeTeamId, simulation.homeTeamId, 3)).toBe(false)
    expect(attacksRight(simulation.homeTeamId, simulation.homeTeamId, 5)).toBe(false)
  })
})
