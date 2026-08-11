import { describe, expect, it } from 'vitest'
import { generateWorld } from '@/engine/world'
import { calculatePlayerImpact, calculateTeamStrength, selectStartingFive } from './index'

describe('roster team evaluation', () => {
  it('derives bounded deterministic player impacts without mutation', () => {
    const player = Object.values(generateWorld({ seed: 12345, gender: 'male' }).players)[0]!
    const before = JSON.stringify(player)
    expect(calculatePlayerImpact(player)).toBeGreaterThanOrEqual(0)
    expect(calculatePlayerImpact(player)).toBeLessThanOrEqual(100)
    expect(calculatePlayerImpact(player)).toBe(calculatePlayerImpact(player))
    expect(JSON.stringify(player)).toBe(before)
  })

  it('selects five unique positional starters and derives their average strength', () => {
    const world = generateWorld({ seed: 12345, gender: 'male' })
    const team = Object.values(world.teams)[0]!
    const starters = selectStartingFive(world, team.id)
    const strength = calculateTeamStrength(world, team.id)
    expect(starters).toHaveLength(5)
    expect(new Set(starters)).toHaveLength(5)
    expect(starters).toEqual(expect.arrayContaining(team.rosterPlayerIds.filter((id) => starters.includes(id))))
    expect(starters.map((id) => world.players[id]!.basketball.primaryPosition)).toEqual(['PG','SG','SF','PF','C'])
    expect(strength.value).toBe(starters.reduce((sum, id) => sum + calculatePlayerImpact(world.players[id]!), 0) / 5)
  })

  it('produces varied deterministic strengths for generated teams', () => {
    const first = generateWorld({ seed: 12345, gender: 'male' })
    const second = generateWorld({ seed: 12345, gender: 'male' })
    const values = Object.values(first.teams).map((team) => calculateTeamStrength(first, team.id).value)
    expect(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100)).toBe(true)
    expect(Math.max(...values)).toBeGreaterThan(Math.min(...values))
    expect(Object.values(first.teams).map((team) => selectStartingFive(first, team.id))).toEqual(Object.values(second.teams).map((team) => selectStartingFive(second, team.id)))
  })
})
