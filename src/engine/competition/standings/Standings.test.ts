import { describe, expect, it } from 'vitest'

import { createGame, type Game } from '@/domain/game'
import { createCompetition } from '@/domain/competition'
import { gameIdFromString, seasonIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { applyMatchResult, createMatchPlayerProfile, simulateMatch, type MatchLineups } from '@/engine/match'
import { SeededRandomSource } from '@/engine/random'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { generateWorld } from '@/engine/world'

import { calculateStandings } from './index'

describe('Standings', () => {
  it('returns eight deterministic zero-game entries for a fully scheduled season', () => {
    const { world, seasonId, competition } = createScheduledGameWorld()
    const standings = calculateStandings(world, seasonId)

    expect(standings).toHaveLength(8)
    expect(standings.map((entry) => entry.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(standings.map((entry) => entry.teamId)).toEqual([...competition.participantTeamIds].sort())
    expect(
      standings.every(
        (entry) =>
          entry.played === 0 &&
          entry.wins === 0 &&
          entry.losses === 0 &&
          entry.pointsFor === 0 &&
          entry.pointsAgainst === 0 &&
          entry.pointDifference === 0,
      ),
    ).toBe(true)
  })

  it('calculates a single completed game while retaining zero-game teams', () => {
    const { world, seasonId, games } = createScheduledGameWorld()
    const game = games[0]!
    const nextWorld = applyScore(world, game, 90, 80)
    const standings = calculateStandings(nextWorld, seasonId)

    expect(entryFor(standings, game.homeTeamId)).toMatchObject({
      played: 1,
      wins: 1,
      losses: 0,
      pointsFor: 90,
      pointsAgainst: 80,
      pointDifference: 10,
    })
    expect(entryFor(standings, game.awayTeamId)).toMatchObject({
      played: 1,
      wins: 0,
      losses: 1,
      pointsFor: 80,
      pointsAgainst: 90,
      pointDifference: -10,
    })
    expect(standings.filter((entry) => entry.played === 0)).toHaveLength(6)
  })

  it('accumulates home and away scores across multiple results', () => {
    const { world, seasonId, games } = createScheduledGameWorld()
    const firstGame = games[0]!
    const returnGame = games.find(
      (game) => game.homeTeamId === firstGame.awayTeamId && game.awayTeamId === firstGame.homeTeamId,
    )!
    const afterFirst = applyScore(world, firstGame, 100, 80)
    const afterBoth = applyScore(afterFirst, returnGame, 95, 85)
    const standings = calculateStandings(afterBoth, seasonId)

    expect(entryFor(standings, firstGame.homeTeamId)).toMatchObject({
      played: 2,
      wins: 1,
      losses: 1,
      pointsFor: 185,
      pointsAgainst: 175,
      pointDifference: 10,
    })
    expect(entryFor(standings, firstGame.awayTeamId)).toMatchObject({
      played: 2,
      wins: 1,
      losses: 1,
      pointsFor: 175,
      pointsAgainst: 185,
      pointDifference: -10,
    })
  })

  it('ranks by wins, point difference, points for, then TeamId', () => {
    const { world, seasonId, games } = createScheduledGameWorld()
    const afterFirst = applyScore(world, games[0]!, 100, 90)
    const afterSecond = applyScore(afterFirst, games[1]!, 90, 80)
    const afterThird = applyScore(afterSecond, games[2]!, 95, 80)
    const standings = calculateStandings(afterThird, seasonId)

    expect(standings.slice(0, 3).map((entry) => entry.teamId)).toEqual([
      games[2]!.homeTeamId,
      games[0]!.homeTeamId,
      games[1]!.homeTeamId,
    ])

    const equalFirst = applyScore(world, games[0]!, 90, 80)
    const equalSecond = applyScore(equalFirst, games[1]!, 90, 80)
    const equalEntries = calculateStandings(equalSecond, seasonId).filter(
      (entry) => entry.wins === 1 && entry.pointDifference === 10 && entry.pointsFor === 90,
    )
    expect(equalEntries.map((entry) => entry.teamId)).toEqual(
      [...equalEntries.map((entry) => entry.teamId)].sort(),
    )
  })

  it('consumes the competition tiebreaker order', () => {
    const { world, seasonId, games, competition } = createScheduledGameWorld()
    const customCompetition = createCompetition({ ...competition, rules: { ...competition.rules, standings: { tiebreakers: ['pointsFor', 'wins', 'pointDifference', 'teamId'] } } })
    const customWorld = recreateWorld(world, { competitions: [customCompetition] })
    const afterFirst = applyScore(customWorld, games[0]!, 90, 80)
    const afterSecond = applyScore(afterFirst, games[1]!, 85, 70)

    expect(calculateStandings(afterSecond, seasonId)[0]!.teamId).toBe(games[0]!.homeTeamId)
  })

  it('filters games from another season and ignores scheduled games', () => {
    const { world, seasonId, season, games } = createScheduledGameWorld()
    const otherSeason = createSeason({ ...season, id: seasonIdFromString('other-season') })
    const otherSeasonGame = createGame({
      ...games[0]!,
      id: gameIdFromString('other-season-game'),
      seasonId: otherSeason.id,
      date: otherSeason.endDate,
      status: 'completed',
      result: { homeScore: 90, awayScore: 80 },
    })
    const worldWithOtherSeasonGame = recreateWorld(world, {
      seasons: [...Object.values(world.seasons), otherSeason],
      games: [...Object.values(world.games), otherSeasonGame],
    })

    expect(calculateStandings(worldWithOtherSeasonGame, seasonId).every((entry) => entry.played === 0)).toBe(true)
  })

  it('does not mutate the source world and is deterministic', () => {
    const { world, seasonId, games } = createScheduledGameWorld()
    const completedWorld = applyScore(world, games[0]!, 90, 80)
    const before = JSON.stringify(completedWorld)

    expect(calculateStandings(completedWorld, seasonId)).toEqual(calculateStandings(completedWorld, seasonId))
    expect(JSON.stringify(completedWorld)).toBe(before)
  })

  it('fails explicitly for a missing season', () => {
    const { world } = createScheduledGameWorld()

    expect(() => calculateStandings(world, seasonIdFromString('missing-season'))).toThrow('Season does not exist')
  })

  it('integrates the partial generation, scheduling, simulation, and application pipeline', () => {
    const { world, seasonId, games } = createScheduledGameWorld()
    const initial = calculateStandings(world, seasonId)
    const firstResult = simulateResult(world, games[0]!, 1)
    const worldAfterFirst = applyMatchResult(world, firstResult)
    const afterFirst = calculateStandings(worldAfterFirst, seasonId)
    const secondResult = simulateResult(worldAfterFirst, games[1]!, 2)
    const worldAfterSecond = applyMatchResult(worldAfterFirst, secondResult)
    const afterSecond = calculateStandings(worldAfterSecond, seasonId)

    expect(initial.every((entry) => entry.played === 0)).toBe(true)
    expect(afterFirst.filter((entry) => entry.wins === 1)).toHaveLength(1)
    expect(afterFirst.filter((entry) => entry.losses === 1)).toHaveLength(1)
    expect(afterFirst.filter((entry) => entry.played === 0)).toHaveLength(6)
    expect(afterSecond.reduce((total, entry) => total + entry.played, 0)).toBe(4)
  })

  it('derives valid final standings after simulating a full season', () => {
    const { world, seasonId, games } = createScheduledGameWorld()
    const random = new SeededRandomSource(12345)
    let currentWorld = world

    for (const game of games) {
      currentWorld = applyMatchResult(currentWorld, simulateResult(currentWorld, game, random))
    }

    const standings = calculateStandings(currentWorld, seasonId)
    const total = (field: 'wins' | 'losses' | 'pointsFor' | 'pointsAgainst'): number =>
      standings.reduce((sum, entry) => sum + entry[field], 0)

    expect(standings).toHaveLength(8)
    expect(standings.every((entry) => entry.played === 14 && entry.wins + entry.losses === 14)).toBe(true)
    expect(total('wins')).toBe(56)
    expect(total('losses')).toBe(56)
    expect(total('pointsFor')).toBe(total('pointsAgainst'))
    expect(standings.map((entry) => entry.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('keeps every entry internally consistent', () => {
    const { world, seasonId, games } = createScheduledGameWorld()
    const completedWorld = applyScore(world, games[0]!, 90, 80)

    for (const entry of calculateStandings(completedWorld, seasonId)) {
      expect(entry.played).toBe(entry.wins + entry.losses)
      expect(entry.pointDifference).toBe(entry.pointsFor - entry.pointsAgainst)
    }
  })
})

function createScheduledGameWorld(): {
  world: GameWorld
  seasonId: ReturnType<typeof seasonIdFromString>
  season: ReturnType<typeof createSeason>
  competition: GameWorld['competitions'][keyof GameWorld['competitions']]
  games: Game[]
} {
  const generatedWorld = generateWorld({ seed: 12345, gender: 'female' })
  const season = Object.values(generatedWorld.seasons)[0]!
  const competition = Object.values(generatedWorld.competitions)[0]!
  const games = generateRoundRobinSchedule({ world: generatedWorld, seasonId: season.id })

  return {
    world: recreateWorld(generatedWorld, { games }),
    seasonId: season.id,
    season,
    competition,
    games,
  }
}

function recreateWorld(
  source: GameWorld,
  overrides: Partial<{
    competitions: GameWorld['competitions'][keyof GameWorld['competitions']][]
    seasons: GameWorld['seasons'][keyof GameWorld['seasons']][]
    games: Game[]
  }>,
): GameWorld {
  return createGameWorld({
    currentDate: source.currentDate,
    currentSeasonId: source.currentSeasonId,
    userCoachId: source.userCoachId,
    countries: Object.values(source.countries),
    coaches: Object.values(source.coaches),
    players: Object.values(source.players),
    teams: Object.values(source.teams),
    competitions: overrides.competitions ?? Object.values(source.competitions),
    seasons: overrides.seasons ?? Object.values(source.seasons),
    games: overrides.games ?? Object.values(source.games),
  })
}

function applyScore(world: GameWorld, game: Game, homeScore: number, awayScore: number): GameWorld {
  return applyMatchResult(world, {
    gameId: game.id,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore,
    awayScore,
  })
}

function simulateResult(world: GameWorld, game: Game, random: number | SeededRandomSource) {
  return simulateMatch({
    world,
    gameId: game.id,
    homeStrength: { teamId: game.homeTeamId, value: 50 },
    awayStrength: { teamId: game.awayTeamId, value: 50 },
    lineups: lineupsFor(world, game),
    squads: { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds },
    playerProfiles: { home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)), away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)) },
    random: typeof random === 'number' ? new SeededRandomSource(random) : random,
    decisionRandom: new SeededRandomSource(67891),
    actorRandom: new SeededRandomSource(typeof random === 'number' ? random : 12345),
  })
}

function lineupsFor(world: GameWorld, game: Game): MatchLineups {
  return {
    home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5),
    away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5),
  }
}

function entryFor(
  standings: ReturnType<typeof calculateStandings>,
  teamId: Game['homeTeamId'],
) {
  return standings.find((entry) => entry.teamId === teamId)!
}
