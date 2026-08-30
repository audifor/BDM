import { describe, expect, it } from 'vitest'

import { getUserTeam } from '@/engine/calendar'
import { createAcbTestGame } from './createAcbTestGame'

describe('createAcbTestGame', () => {
  it('creates the complete ACB 2026/27 regular-season test universe', () => {
    const world = createAcbTestGame({ userTeamKey: 'caz' })
    const userTeam = getUserTeam(world)
    const playerNames = new Set(Object.values(world.players).map((player) => `${player.firstName} ${player.lastName}`))
    const games = Object.values(world.games)

    expect(Object.keys(world.teams)).toHaveLength(18)
    expect(Object.keys(world.players)).toHaveLength(241)
    expect(games).toHaveLength(306)
    expect(new Set(games.map((game) => game.date)).size).toBe(34)
    expect(userTeam?.name).toBe('Casademont Zaragoza')
    expect(userTeam?.coachId).toBe(world.userCoachId)
    expect(playerNames.has('Ricky Rubio')).toBe(true)
    expect(playerNames.has('Facu Campazzo')).toBe(true)
    expect(playerNames.has('Edy Tavares')).toBe(true)
    expect(playerNames.has('Willy Hernangómez')).toBe(true)
    expect(Object.values(world.playerKnowledgeById).filter((record) => record.observerTeamId === userTeam?.id)).toHaveLength(241)
  })

  it('allows any ACB club to become the user team', () => {
    expect(getUserTeam(createAcbTestGame({ userTeamKey: 'rmb' }))?.name).toBe('Real Madrid')
  })

  it('rejects unknown ACB team keys', () => {
    expect(() => createAcbTestGame({ userTeamKey: 'not-a-team' })).toThrow('Unknown ACB test team')
  })
})
