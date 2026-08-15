import { describe, expect, it } from 'vitest'

import { createCompetition } from '@/domain/competition'
import { defaultLeagueCompetitionRules } from '@/domain/competition'
import { addDays } from '@/domain/date'
import { type Game } from '@/domain/game'
import { seasonIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { generateWorld } from '@/engine/world'

import { generateRoundRobinSchedule } from './index'

describe('ScheduleGenerator', () => {
  it('generates 56 scheduled games in 14 rounds of four', () => {
    const { world, seasonId } = createGeneratedWorld()
    const games = generateRoundRobinSchedule({ world, seasonId })
    const rounds = groupByDate(games)

    expect(games).toHaveLength(56)
    expect(rounds).toHaveLength(14)
    expect(rounds.every((round) => round.length === 4)).toBe(true)
    expect(games.every((game) => game.status === 'scheduled' && game.result === null)).toBe(true)
  })

  it('gives every team 14 games, seven home, seven away, and one game per round', () => {
    const { world, seasonId } = createGeneratedWorld()
    const games = generateRoundRobinSchedule({ world, seasonId })
    const rounds = groupByDate(games)

    for (const team of Object.values(world.teams)) {
      const teamGames = games.filter((game) => game.homeTeamId === team.id || game.awayTeamId === team.id)
      expect(teamGames).toHaveLength(14)
      expect(teamGames.filter((game) => game.homeTeamId === team.id)).toHaveLength(7)
      expect(teamGames.filter((game) => game.awayTeamId === team.id)).toHaveLength(7)
    }

    for (const round of rounds) {
      const roundTeamIds = round.flatMap((game) => [game.homeTeamId, game.awayTeamId])
      expect(new Set(roundTeamIds)).toHaveLength(8)
      expect(round.every((game) => game.homeTeamId !== game.awayTeamId)).toBe(true)
    }
  })

  it('plays every pair twice with one home game for each team', () => {
    const { world, seasonId } = createGeneratedWorld()
    const games = generateRoundRobinSchedule({ world, seasonId })
    const pairGames = new Map<string, Game[]>()

    for (const game of games) {
      const key = [game.homeTeamId, game.awayTeamId].sort().join(':')
      pairGames.set(key, [...(pairGames.get(key) ?? []), game])
    }

    expect(pairGames).toHaveLength(28)
    for (const pair of pairGames.values()) {
      expect(pair).toHaveLength(2)
      expect(pair[0]!.homeTeamId).toBe(pair[1]!.awayTeamId)
      expect(pair[0]!.awayTeamId).toBe(pair[1]!.homeTeamId)
    }

    expect(Object.keys(world.teams)).toHaveLength(8)
  })

  it('derives the return leg by reversing each first-leg matchup', () => {
    const { world, seasonId } = createGeneratedWorld()
    const games = generateRoundRobinSchedule({ world, seasonId })
    const firstLeg = games.slice(0, 28)
    const returnLeg = games.slice(28)

    for (let index = 0; index < firstLeg.length; index += 1) {
      expect(returnLeg[index]!.homeTeamId).toBe(firstLeg[index]!.awayTeamId)
      expect(returnLeg[index]!.awayTeamId).toBe(firstLeg[index]!.homeTeamId)
    }
  })

  it('consumes a different valid meetings-per-pair rule deterministically', () => {
    const { world, competition, season } = createGeneratedWorld()
    const fourMeetings = createCompetition({ ...competition, rules: { ...defaultLeagueCompetitionRules, schedule: { meetingsPerPair: 4, homeAwayBalance: 'equal' } } })
    const customWorld = recreateWorld(world, { competitions: [fourMeetings] })
    const games = generateRoundRobinSchedule({ world: customWorld, seasonId: season.id })

    expect(games).toHaveLength(112)
    for (const teamId of fourMeetings.participantTeamIds) {
      expect(games.filter((game) => game.homeTeamId === teamId)).toHaveLength(14)
      expect(games.filter((game) => game.awayTeamId === teamId)).toHaveLength(14)
    }
    expect(games).toEqual(generateRoundRobinSchedule({ world: customWorld, seasonId: season.id }))
  })

  it('uses season start and four-day default round spacing', () => {
    const { world, seasonId, season } = createGeneratedWorld()
    const games = generateRoundRobinSchedule({ world, seasonId })
    const roundDates = groupByDate(games).map((round) => round[0]!.date)

    expect(roundDates[0]).toBe(season.startDate)
    expect(roundDates).toEqual(Array.from({ length: 14 }, (_, index) => addDays(season.startDate, index * 4)))
    expect(roundDates[13]).toBe(addDays(season.startDate, 52))
  })

  it('supports a custom positive round spacing', () => {
    const { world, seasonId, season } = createGeneratedWorld()
    const games = generateRoundRobinSchedule({ world, seasonId, daysBetweenRounds: 2 })

    expect(groupByDate(games)[1]![0]!.date).toBe(addDays(season.startDate, 2))
  })

  it.each([0, -1, 1.5])('rejects invalid round spacing: %s', (daysBetweenRounds) => {
    const { world, seasonId } = createGeneratedWorld()

    expect(() => generateRoundRobinSchedule({ world, seasonId, daysBetweenRounds })).toThrow(RangeError)
  })

  it('rejects schedules that do not fit in the season', () => {
    const { world, season } = createGeneratedWorld()
    const shortSeason = createSeason({ ...season, endDate: addDays(season.startDate, 51) })
    const shortWorld = recreateWorld(world, { seasons: [shortSeason] })

    expect(() => generateRoundRobinSchedule({ world: shortWorld, seasonId: shortSeason.id })).toThrow(RangeError)
  })

  it('is deterministic and uses contextual unique game IDs', () => {
    const { world, seasonId } = createGeneratedWorld()
    const first = generateRoundRobinSchedule({ world, seasonId })
    const second = generateRoundRobinSchedule({ world, seasonId })

    expect(first).toEqual(second)
    expect(new Set(first.map((game) => game.id))).toHaveLength(56)
    expect(first.every((game) => game.id.includes(seasonId))).toBe(true)
  })

  it('does not mutate GameWorld and integrates into a newly validated world', () => {
    const { world, seasonId } = createGeneratedWorld()
    const games = generateRoundRobinSchedule({ world, seasonId })

    expect(Object.keys(world.games)).toHaveLength(0)
    const rebuiltWorld = recreateWorld(world, { games })
    expect(Object.keys(rebuiltWorld.games)).toHaveLength(56)
  })

  it('rejects competitions with fewer than two or an odd number of teams', () => {
    const { world, competition, season } = createGeneratedWorld()
    const teamIds = competition.participantTeamIds
    const oneTeamCompetition = createCompetition({ ...competition, participantTeamIds: teamIds.slice(0, 1) })
    const oddCompetition = createCompetition({ ...competition, participantTeamIds: teamIds.slice(0, 3) })
    const oneTeamWorld = recreateWorld(world, { competitions: [oneTeamCompetition] })
    const oddTeamWorld = recreateWorld(world, { competitions: [oddCompetition] })

    expect(() => generateRoundRobinSchedule({ world: oneTeamWorld, seasonId: season.id })).toThrow(RangeError)
    expect(() => generateRoundRobinSchedule({ world: oddTeamWorld, seasonId: season.id })).toThrow(RangeError)
  })

  it('fails explicitly for a missing season', () => {
    const { world } = createGeneratedWorld()

    expect(() =>
      generateRoundRobinSchedule({ world, seasonId: seasonIdFromString('missing-season') }),
    ).toThrow('Season does not exist')
  })
})

function createGeneratedWorld(): {
  world: GameWorld
  seasonId: ReturnType<typeof seasonIdFromString>
  season: ReturnType<typeof createSeason>
  competition: ReturnType<typeof createCompetition>
} {
  const world = generateWorld({ seed: 12345, gender: 'female' })
  const season = Object.values(world.seasons)[0]!
  const competition = Object.values(world.competitions)[0]!

  return { world, seasonId: season.id, season, competition }
}

function recreateWorld(
  world: GameWorld,
  overrides: Partial<{
    competitions: ReturnType<typeof createCompetition>[]
    seasons: ReturnType<typeof createSeason>[]
    games: Game[]
  }>,
): GameWorld {
  return createGameWorld({
    currentDate: world.currentDate,
    userCoachId: world.userCoachId,
    countries: Object.values(world.countries),
    coaches: Object.values(world.coaches),
    players: Object.values(world.players),
    teams: Object.values(world.teams),
    competitions: overrides.competitions ?? Object.values(world.competitions),
    seasons: overrides.seasons ?? Object.values(world.seasons),
    games: overrides.games ?? Object.values(world.games),
  })
}

function groupByDate(games: readonly Game[]): Game[][] {
  const rounds = new Map<string, Game[]>()

  for (const game of games) {
    const round = rounds.get(game.date) ?? []
    round.push(game)
    rounds.set(game.date, round)
  }

  return [...rounds.values()]
}
