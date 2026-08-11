import { describe, expect, it } from 'vitest'

import { createGame } from '@/domain/game'
import { gameIdFromString } from '@/domain/ids'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { SeededRandomSource, type RandomSource } from '@/engine/random'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { generateWorld } from '@/engine/world'

import { MatchSimulationError, simulateMatch } from './index'

describe('MatchEngine', () => {
  it('simulates a scheduled game with a valid non-tied final result', () => {
    const { world, game } = createScheduledGameWorld()
    const result = simulateMatch({
      world,
      gameId: game.id,
      homeStrength: { teamId: game.homeTeamId, value: 50 },
      awayStrength: { teamId: game.awayTeamId, value: 50 },
      random: new FixedRandom([0, 0]),
    })

    expect(result).toEqual({
      gameId: game.id,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore: 82,
      awayScore: 78,
    })
    expect(Number.isInteger(result.homeScore)).toBe(true)
    expect(Number.isInteger(result.awayScore)).toBe(true)
    expect(result.homeScore).toBeGreaterThanOrEqual(0)
    expect(result.awayScore).toBeGreaterThanOrEqual(0)
    expect(result.homeScore).not.toBe(result.awayScore)
  })

  it('is reproducible with the same random seed and can differ with another', () => {
    const { world, game } = createScheduledGameWorld()
    const options = {
      world,
      gameId: game.id,
      homeStrength: { teamId: game.homeTeamId, value: 50 },
      awayStrength: { teamId: game.awayTeamId, value: 50 },
    }
    const first = simulateMatch({ ...options, random: new SeededRandomSource(12345) })
    const second = simulateMatch({ ...options, random: new SeededRandomSource(12345) })
    const different = simulateMatch({ ...options, random: new SeededRandomSource(54321) })

    expect(first).toEqual(second)
    expect(first).not.toEqual(different)
  })

  it('applies strength to both scores and home advantage only to the home team', () => {
    const { world, game } = createScheduledGameWorld()
    const strongerHome = simulateMatch({
      world,
      gameId: game.id,
      homeStrength: { teamId: game.homeTeamId, value: 100 },
      awayStrength: { teamId: game.awayTeamId, value: 0 },
      random: new FixedRandom([0, 0]),
    })
    const strongerAway = simulateMatch({
      world,
      gameId: game.id,
      homeStrength: { teamId: game.homeTeamId, value: 0 },
      awayStrength: { teamId: game.awayTeamId, value: 100 },
      random: new FixedRandom([0, 0]),
    })

    expect(strongerHome).toMatchObject({ homeScore: 94, awayScore: 66 })
    expect(strongerAway).toMatchObject({ homeScore: 70, awayScore: 90 })
  })

  it('uses RandomSource to break a tie deterministically', () => {
    const { world, game } = createScheduledGameWorld()
    const random = new FixedRandom([-4, 0], true)
    const result = simulateMatch({
      world,
      gameId: game.id,
      homeStrength: { teamId: game.homeTeamId, value: 50 },
      awayStrength: { teamId: game.awayTeamId, value: 50 },
      random,
    })

    expect(result).toMatchObject({ homeScore: 79, awayScore: 78 })
    expect(random.nextIntCalls).toBe(2)
    expect(random.chanceCalls).toBe(1)
  })

  it('rejects completed and missing games', () => {
    const { world, game } = createScheduledGameWorld()
    const completedGame = createGame({
      ...game,
      status: 'completed',
      result: { homeScore: 80, awayScore: 70 },
    })
    const completedWorld = recreateWorld(world, [completedGame, ...Object.values(world.games).slice(1)])
    const options = {
      homeStrength: { teamId: game.homeTeamId, value: 50 },
      awayStrength: { teamId: game.awayTeamId, value: 50 },
      random: new FixedRandom([0, 0]),
    }

    expect(() => simulateMatch({ ...options, world: completedWorld, gameId: completedGame.id })).toThrow(
      MatchSimulationError,
    )
    expect(() => simulateMatch({ ...options, world, gameId: gameIdFromString('missing-game') })).toThrow(
      'Game does not exist',
    )
  })

  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid home strength: %s',
    (value) => {
      const { world, game } = createScheduledGameWorld()

      expect(() =>
        simulateMatch({
          world,
          gameId: game.id,
          homeStrength: { teamId: game.homeTeamId, value },
          awayStrength: { teamId: game.awayTeamId, value: 50 },
          random: new FixedRandom([0, 0]),
        }),
      ).toThrow(MatchSimulationError)
    },
  )

  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid away strength: %s',
    (value) => {
      const { world, game } = createScheduledGameWorld()

      expect(() =>
        simulateMatch({
          world,
          gameId: game.id,
          homeStrength: { teamId: game.homeTeamId, value: 50 },
          awayStrength: { teamId: game.awayTeamId, value },
          random: new FixedRandom([0, 0]),
        }),
      ).toThrow(MatchSimulationError)
    },
  )

  it('rejects strengths assigned to the wrong teams', () => {
    const { world, game } = createScheduledGameWorld()

    expect(() =>
      simulateMatch({
        world,
        gameId: game.id,
        homeStrength: { teamId: game.awayTeamId, value: 50 },
        awayStrength: { teamId: game.awayTeamId, value: 50 },
        random: new FixedRandom([0, 0]),
      }),
    ).toThrow(MatchSimulationError)
    expect(() =>
      simulateMatch({
        world,
        gameId: game.id,
        homeStrength: { teamId: game.homeTeamId, value: 50 },
        awayStrength: { teamId: game.homeTeamId, value: 50 },
        random: new FixedRandom([0, 0]),
      }),
    ).toThrow(MatchSimulationError)
  })

  it('does not mutate the world, game, teams, or collections', () => {
    const { world, game } = createScheduledGameWorld()
    const before = JSON.stringify(world)

    simulateMatch({
      world,
      gameId: game.id,
      homeStrength: { teamId: game.homeTeamId, value: 50 },
      awayStrength: { teamId: game.awayTeamId, value: 50 },
      random: new FixedRandom([0, 0]),
    })

    expect(JSON.stringify(world)).toBe(before)
    expect(world.games[game.id]).toMatchObject({ status: 'scheduled', result: null })
  })

  it('integrates WorldGenerator, ScheduleGenerator, and MatchEngine without applying the result', () => {
    const { world, game } = createScheduledGameWorld()
    const result = simulateMatch({
      world,
      gameId: game.id,
      homeStrength: { teamId: game.homeTeamId, value: 60 },
      awayStrength: { teamId: game.awayTeamId, value: 40 },
      random: new FixedRandom([0, 0]),
    })

    expect(result.gameId).toBe(game.id)
    expect(result.homeScore).not.toBe(result.awayScore)
    expect(world.games[game.id]).toMatchObject({ status: 'scheduled', result: null })
  })
})

function createScheduledGameWorld(): { world: GameWorld; game: GameWorld['games'][keyof GameWorld['games']] } {
  const generatedWorld = generateWorld({ seed: 12345, gender: 'female' })
  const seasonId = Object.values(generatedWorld.seasons)[0]!.id
  const games = generateRoundRobinSchedule({ world: generatedWorld, seasonId })
  const world = recreateWorld(generatedWorld, games)

  return { world, game: games[0]! }
}

function recreateWorld(source: GameWorld, games: readonly GameWorld['games'][keyof GameWorld['games']][]): GameWorld {
  return createGameWorld({
    currentDate: source.currentDate,
    userCoachId: source.userCoachId,
    countries: Object.values(source.countries),
    coaches: Object.values(source.coaches),
    players: Object.values(source.players),
    teams: Object.values(source.teams),
    competitions: Object.values(source.competitions),
    seasons: Object.values(source.seasons),
    games,
  })
}

class FixedRandom implements RandomSource {
  public nextIntCalls = 0
  public chanceCalls = 0

  public constructor(
    private readonly integerValues: readonly number[],
    private readonly chanceValue = false,
  ) {}

  public next(): number {
    return 0.5
  }

  public nextInt(_minInclusive: number, _maxInclusive: number): number {
    const value = this.integerValues[this.nextIntCalls] ?? 0
    this.nextIntCalls += 1
    return value
  }

  public nextFloat(minInclusive: number, _maxExclusive: number): number {
    return minInclusive
  }

  public chance(_probability: number): boolean {
    this.chanceCalls += 1
    return this.chanceValue
  }

  public pick<Item>(items: readonly Item[]): Item {
    return items[0]!
  }
}
