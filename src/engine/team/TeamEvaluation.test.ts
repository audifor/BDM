import { describe, expect, it } from 'vitest'
import { generateWorld } from '@/engine/world'
import { createPlayer } from '@/domain/player'
import { countryIdFromString, playerIdFromString } from '@/domain/ids'
import { calculatePlayerImpact, calculateTeamStrength, selectStartingFive } from './index'

describe('roster team evaluation', () => {
  const playerWith = (ratings: Record<string, number>) => createPlayer({ id: playerIdFromString('controlled-player'), firstName: 'Test', lastName: 'Player', gender: 'male', nationalityId: countryIdFromString('country'), basketball: { primaryPosition: 'PG', ratings: { finishing: ratings.finishing ?? 50, shooting: ratings.shooting ?? 50, playmaking: ratings.playmaking ?? 50, perimeterDefense: ratings.perimeterDefense ?? 50, interiorDefense: ratings.interiorDefense ?? 50, rebounding: ratings.rebounding ?? 50, athleticism: ratings.athleticism ?? 50 } }, bio: { dateOfBirth: '2008-06-14', heightCm: 188, weightKg: 86 } })

  it('returns exact endpoint and weighted impacts', () => {
    expect(calculatePlayerImpact(playerWith({ finishing:0, shooting:0, playmaking:0, perimeterDefense:0, interiorDefense:0, rebounding:0, athleticism:0 }))).toBe(1.9)
    expect(calculatePlayerImpact(playerWith({ finishing:100, shooting:100, playmaking:100, perimeterDefense:100, interiorDefense:100, rebounding:100, athleticism:100 }))).toBe(98.2)
    expect(calculatePlayerImpact(playerWith({ finishing:80, shooting:70, playmaking:60, perimeterDefense:50, interiorDefense:40, rebounding:30, athleticism:20 }))).toBe(51.2)
  })

  it.each(['shooting','playmaking','perimeterDefense','rebounding','athleticism'])('increases impact when %s increases', (rating) => {
    expect(calculatePlayerImpact(playerWith({ [rating]: 80 }))).toBeGreaterThan(calculatePlayerImpact(playerWith({ [rating]: 50 })))
  })
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
