import { describe, expect, it } from 'vitest'

import { addDays, createGameDate } from '@/domain/date'
import { playerIdFromString } from '@/domain/ids'
import { getTeamCoach } from '@/domain/world'
import { getPlayerPotentialBand } from '@/domain/player'

import { generateWorld } from './index'

describe('WorldGenerator', () => {
  it('generates the fixed-size starter universe', () => {
    const world = generateWorld({ seed: 12345, gender: 'male' })

    expect(Object.keys(world.countries)).toHaveLength(1)
    expect(Object.keys(world.coaches)).toHaveLength(8)
    expect(Object.keys(world.players)).toHaveLength(96)
    expect(Object.keys(world.teams)).toHaveLength(8)
    expect(Object.values(world.teams).every((team) => team.rosterPlayerIds.length === 12)).toBe(true)
    expect(Object.keys(world.competitions)).toHaveLength(1)
    expect(Object.keys(world.seasons)).toHaveLength(1)
    expect(Object.keys(world.games)).toHaveLength(0)
    expect(Object.values(world.players).every((player) => Number.isInteger(player.potential.ceiling) && player.potential.ceiling >= 0 && player.potential.ceiling <= 100)).toBe(true)
    expect(new Set(Object.values(world.players).map((player) => getPlayerPotentialBand(player.potential))).size).toBeGreaterThan(1)
  })

  it('assigns every player and coach to exactly one team', () => {
    const world = generateWorld({ seed: 12345, gender: 'male' })
    const rosterPlayerIds = Object.values(world.teams).flatMap((team) => team.rosterPlayerIds)
    const coachIds = Object.values(world.teams).map((team) => team.coachId)

    expect(rosterPlayerIds).toHaveLength(96)
    expect(new Set(rosterPlayerIds)).toHaveLength(96)
    expect(new Set(coachIds)).toHaveLength(8)
    expect(coachIds).not.toContain(undefined)
  })

  it('puts all teams in the competition and chooses the first team coach as the user coach', () => {
    const world = generateWorld({ seed: 12345, gender: 'male' })
    const teams = Object.values(world.teams)
    const competition = Object.values(world.competitions)[0]!

    expect(competition.participantTeamIds).toHaveLength(8)
    expect(new Set(competition.participantTeamIds)).toEqual(new Set(teams.map((team) => team.id)))
    expect(world.userCoachId).toBe(teams[0]!.coachId)
    expect(getTeamCoach(world, teams[0]!.id)).toMatchObject({ id: world.userCoachId })
  })

  it.each(['male', 'female'] as const)('generates a coherent %s world', (gender) => {
    const world = generateWorld({ seed: 12345, gender })

    expect(Object.values(world.players).every((player) => player.gender === gender)).toBe(true)
    expect(Object.values(world.teams).every((team) => team.gender === gender)).toBe(true)
    expect(Object.values(world.coaches).every((coach) => coach.gender === gender)).toBe(true)
    expect(Object.values(world.competitions).every((competition) => competition.gender === gender)).toBe(true)
  })

  it('is reproducible for the same seed and configuration', () => {
    const options = { seed: 12345, gender: 'female' as const }

    expect(generateWorld(options)).toEqual(generateWorld(options))
    expect(generateWorld(options)).toEqual(generateWorld(options))
  })

  it('changes generated content for a different seed without changing deterministic IDs', () => {
    const first = generateWorld({ seed: 1, gender: 'female' })
    const second = generateWorld({ seed: 2, gender: 'female' })

    expect(first).not.toEqual(second)
    expect(Object.keys(first.players)).toEqual(Object.keys(second.players))
    expect(Object.keys(first.teams)).toEqual(Object.keys(second.teams))
    expect(first.players[playerIdFromString('generated-player-0001')]!.id).toBe('generated-player-0001')
  })

  it('uses the configured start date and a fixed deterministic season length', () => {
    const startDate = createGameDate(2040, 3, 15)
    const world = generateWorld({ seed: 12345, gender: 'male', startDate })
    const season = Object.values(world.seasons)[0]!

    expect(world.currentDate).toBe(startDate)
    expect(season.startDate).toBe(startDate)
    expect(season.endDate).toBe(addDays(startDate, 272))
  })

  it('generates unique non-empty team names and non-empty person names', () => {
    const world = generateWorld({ seed: 12345, gender: 'male' })
    const teamNames = Object.values(world.teams).map((team) => team.name)
    const people = [...Object.values(world.coaches), ...Object.values(world.players)]

    expect(new Set(teamNames)).toHaveLength(8)
    expect(teamNames.every((name) => name.length > 0)).toBe(true)
    expect(people.every((person) => person.firstName.length > 0 && person.lastName.length > 0)).toBe(true)
  })

  it('serializes cleanly and produces identical JSON for the same seed', () => {
    const options = { seed: 12345, gender: 'female' as const }
    const firstJson = JSON.stringify(generateWorld(options))
    const secondJson = JSON.stringify(generateWorld(options))

    expect(JSON.parse(firstJson)).toMatchObject({ currentDate: '2032-10-01' })
    expect(firstJson).toBe(secondJson)
  })

  it('generates valid, diverse positional profiles without changing procedural names', () => {
    const world = generateWorld({ seed: 12345, gender: 'male', startDate: createGameDate(2032, 10, 1) })
    const players = Object.values(world.players)
    expect(Object.values(world.teams).every((team) => {
      const positions = team.rosterPlayerIds.map((id) => world.players[id]!.basketball.primaryPosition)
      return ['PG','SG','SF','PF','C'].every((position) => positions.filter((value) => value === position).length === ({ PG:2, SG:3, SF:2, PF:3, C:2 }[position] ?? 0))
    })).toBe(true)
    for (const player of players) {
      expect(Object.keys(player.basketball.ratings)).toEqual(['finishing','shooting','playmaking','perimeterDefense','interiorDefense','rebounding','athleticism'])
      expect(Object.values(player.basketball.ratings).every((rating) => Number.isInteger(rating) && rating >= 0 && rating <= 100)).toBe(true)
    }
    expect(new Set(players.map((player) => JSON.stringify(player.basketball.ratings))).size).toBeGreaterThan(8)
    expect(world.teams[Object.keys(world.teams)[0] as keyof typeof world.teams]!.name).toBe('Ironhollow Vipers')
  })

  it('has intrateam diversity and broad position trends', () => {
    const world = generateWorld({ seed: 12345, gender: 'male' })
    const firstTeam = Object.values(world.teams)[0]!
    const roster = firstTeam.rosterPlayerIds.map((id) => world.players[id]!)
    expect(new Set(roster.map((player) => JSON.stringify(player.basketball.ratings))).size).toBeGreaterThan(1)
    expect(new Set(roster.filter((player) => player.basketball.primaryPosition === 'SG').map((player) => JSON.stringify(player.basketball.ratings))).size).toBeGreaterThan(1)
    const average = (position: string, rating: keyof typeof roster[number]['basketball']['ratings']) => { const players = Object.values(world.players).filter((player) => player.basketball.primaryPosition === position); return players.reduce((sum, player) => sum + player.basketball.ratings[rating], 0) / players.length }
    expect(average('PG', 'playmaking')).toBeGreaterThan(average('C', 'playmaking'))
    expect(average('C', 'rebounding')).toBeGreaterThan(average('PG', 'rebounding'))
    expect(average('SG', 'shooting')).toBeGreaterThan(average('C', 'shooting'))
    expect(average('C', 'interiorDefense')).toBeGreaterThan(average('PG', 'interiorDefense'))
  })
})
