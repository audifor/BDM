import { describe, expect, it } from 'vitest'
import { generateWorld } from '@/engine/world'
import { createPlayer } from '@/domain/player'
import { countryIdFromString, playerIdFromString } from '@/domain/ids'
import { assignLineupSlot, createDefaultTeamLineup } from '@/domain/tactics'
import { updateGameWorld } from '@/domain/world'
import { createInjury } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { calculatePlayerImpact, calculateTeamStrength, resolveStartingFive, resolveStartingFiveWithRepair, selectStartingFive } from './index'

describe('roster team evaluation', () => {
  const playerWith = (ratings: Record<string, number>) => createPlayer({ id: playerIdFromString('controlled-player'), firstName: 'Test', lastName: 'Player', gender: 'male', nationalityId: countryIdFromString('country'), basketball: { primaryPosition: 'PG', ratings: { finishing: ratings.finishing ?? 50, shooting: ratings.shooting ?? 50, playmaking: ratings.playmaking ?? 50, perimeterDefense: ratings.perimeterDefense ?? 50, interiorDefense: ratings.interiorDefense ?? 50, rebounding: ratings.rebounding ?? 50, athleticism: ratings.athleticism ?? 50 } }, bio: { dateOfBirth: '2008-06-14', heightCm: 188, weightKg: 86 } })

  it('returns exact endpoint and weighted impacts', () => {
    expect(calculatePlayerImpact(playerWith({ finishing:0, shooting:0, playmaking:0, perimeterDefense:0, interiorDefense:0, rebounding:0, athleticism:0 }))).toBe(1.8125)
    expect(calculatePlayerImpact(playerWith({ finishing:100, shooting:100, playmaking:100, perimeterDefense:100, interiorDefense:100, rebounding:100, athleticism:100 }))).toBe(98.3125)
    expect(calculatePlayerImpact(playerWith({ finishing:80, shooting:70, playmaking:60, perimeterDefense:50, interiorDefense:40, rebounding:30, athleticism:20 }))).toBe(52.375)
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

  it('honors a complete explicit lineup even when automatic selection prefers different players', () => {
    const world = generateWorld({ seed: 12345, gender: 'male' })
    const team = Object.values(world.teams)[0]!
    const automatic = selectStartingFive(world, team.id)
    const explicit = team.rosterPlayerIds.filter((id) => !automatic.includes(id)).slice(0, 5)
    expect(explicit).toHaveLength(5)
    let lineup = createDefaultTeamLineup(team.id)
    for (const [index, playerId] of explicit.entries()) lineup = assignLineupSlot(lineup, (['PG', 'SG', 'SF', 'PF', 'C'] as const)[index]!, playerId)
    const prepared = updateGameWorld(world, { lineupsByTeamId: { ...world.lineupsByTeamId, [team.id]: lineup } })

    expect(automatic).not.toEqual(explicit)
    expect(resolveStartingFive(prepared, team.id)).toEqual(explicit)
    expect(calculateTeamStrength(prepared, team.id).value).toBe(explicit.reduce((sum, id) => sum + calculatePlayerImpact(prepared.players[id]!), 0) / 5)
  })

  it('preserves an incomplete saved lineup and deterministically fills its empty slot', () => {
    const world = generateWorld({ seed: 12345, gender: 'male' })
    const team = Object.values(world.teams)[0]!
    let lineup = createDefaultTeamLineup(team.id)
    for (const [index, playerId] of team.rosterPlayerIds.slice(0, 4).entries()) lineup = assignLineupSlot(lineup, (['PG', 'SG', 'SF', 'PF'] as const)[index]!, playerId)
    const prepared = updateGameWorld(world, { lineupsByTeamId: { ...world.lineupsByTeamId, [team.id]: lineup } })

    const starters = resolveStartingFiveWithRepair(prepared, team.id)
    expect(starters.playerIds.slice(0, 4)).toEqual(team.rosterPlayerIds.slice(0, 4))
    expect(starters.playerIds).toHaveLength(5)
    expect(new Set(starters.playerIds).size).toBe(5)
    expect(starters.report.classification).toBe('RECOVERABLE')
  })

  it('preserves available saved starters and fills an injured position from the eligible roster', () => {
    const world = generateWorld({ seed: 12345, gender: 'male' })
    const team = Object.values(world.teams)[0]!
    const savedStarters = selectStartingFive(world, team.id)
    let lineup = createDefaultTeamLineup(team.id)
    for (const [index, playerId] of savedStarters.entries()) lineup = assignLineupSlot(lineup, (['PG', 'SG', 'SF', 'PF', 'C'] as const)[index]!, playerId)
    const injuredPlayerId = savedStarters[0]!
    const injured = updateGameWorld(world, { lineupsByTeamId: { ...world.lineupsByTeamId, [team.id]: lineup }, injuries: [createInjury({ id: injuryIdFromString('lineup-repair-injury'), playerId: injuredPlayerId, kind: 'ankleSprain', severity: 'moderate', injuredOn: world.currentDate, expectedReturnDate: '2099-01-01' as never })] })

    const repaired = resolveStartingFiveWithRepair(injured, team.id)
    expect(repaired.playerIds).toHaveLength(5)
    expect(new Set(repaired.playerIds).size).toBe(5)
    expect(repaired.playerIds).not.toContain(injuredPlayerId)
    expect(savedStarters.slice(1)).toEqual(expect.arrayContaining(repaired.playerIds.filter((id) => savedStarters.includes(id))))
    expect(injured.players[repaired.playerIds[0]!]!.basketball.primaryPosition).toBe('PG')
    expect(repaired.report).toMatchObject({ classification: 'RECOVERABLE', sourceDomain: 'TEAM_LINEUP', worldChanged: false, userActionRequired: false })
    expect(resolveStartingFiveWithRepair(injured, team.id).playerIds).toEqual(repaired.playerIds)
  })

  it('does not fabricate starters when fewer than five eligible players remain', () => {
    const world = generateWorld({ seed: 12345, gender: 'male' })
    const team = Object.values(world.teams)[0]!
    const injured = team.rosterPlayerIds.slice(0, team.rosterPlayerIds.length - 4).map((playerId, index) => createInjury({ id: injuryIdFromString(`lineup-shortage-${index}`), playerId, kind: 'ankleSprain' as const, severity: 'moderate' as const, injuredOn: world.currentDate, expectedReturnDate: '2099-01-01' as never }))
    const short = updateGameWorld(world, { injuries: injured })
    expect(() => resolveStartingFiveWithRepair(short, team.id)).toThrow('Insufficient available players')
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
