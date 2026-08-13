import { describe, expect, it } from 'vitest'

import type { Game } from '@/domain/game'
import { gameIdFromString } from '@/domain/ids'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'

import {
  applyMatchResult,
  createMatchPlayerProfile,
  MatchResultApplicationError,
  simulateMatch,
  type MatchLineups,
  type MatchSimulationResult,
} from './index'

describe('Match Result Application', () => {
  it('applies a valid result to a new world while preserving game metadata', () => {
    const { world, game } = createScheduledGameWorld()
    const result = resultFor(game, 84, 76)
    const nextWorld = applyMatchResult(world, result)
    const updatedGame = nextWorld.games[game.id]!

    expect(nextWorld).not.toBe(world)
    expect(updatedGame).toEqual({
      ...game,
      status: 'completed',
      result: { homeScore: 84, awayScore: 76 },
    })
    expect(nextWorld.currentDate).toBe(world.currentDate)
    expect(nextWorld.userCoachId).toBe(world.userCoachId)
    expect(nextWorld.schemaVersion).toBe(world.schemaVersion)
    expect(Object.keys(nextWorld.games)).toHaveLength(Object.keys(world.games).length)
    expect(nextWorld.staffPeopleById).toEqual(world.staffPeopleById)
    expect(nextWorld.teamStaffAssignmentsById).toEqual(world.teamStaffAssignmentsById)
  })

  it('does not mutate the original world or its scheduled game', () => {
    const { world, game } = createScheduledGameWorld()
    const before = JSON.stringify(world)

    applyMatchResult(world, resultFor(game, 84, 76))

    expect(JSON.stringify(world)).toBe(before)
    expect(world.games[game.id]).toMatchObject({ status: 'scheduled', result: null })
  })

  it('leaves all other games unchanged', () => {
    const { world, game } = createScheduledGameWorld()
    const otherGame = Object.values(world.games).find((candidate) => candidate.id !== game.id)!
    const nextWorld = applyMatchResult(world, resultFor(game, 84, 76))

    expect(nextWorld.games[otherGame.id]).toEqual(otherGame)
    expect(nextWorld.games[otherGame.id]).toMatchObject({ status: 'scheduled', result: null })
  })

  it('is deterministic for the same world and result', () => {
    const { world, game } = createScheduledGameWorld()
    const result = resultFor(game, 84, 76)

    expect(applyMatchResult(world, result)).toEqual(applyMatchResult(world, result))
  })

  it('rejects missing and completed games', () => {
    const { world, game } = createScheduledGameWorld()
    const result = resultFor(game, 84, 76)
    const completedWorld = applyMatchResult(world, result)

    expect(() => applyMatchResult(world, { ...result, gameId: gameIdFromString('missing-game') })).toThrow(
      MatchResultApplicationError,
    )
    expect(() => applyMatchResult(completedWorld, result)).toThrow(MatchResultApplicationError)
  })

  it('rejects result team identities that do not match the game', () => {
    const { world, game } = createScheduledGameWorld()

    expect(() =>
      applyMatchResult(world, { ...resultFor(game, 84, 76), homeTeamId: game.awayTeamId }),
    ).toThrow(MatchResultApplicationError)
    expect(() =>
      applyMatchResult(world, { ...resultFor(game, 84, 76), awayTeamId: game.homeTeamId }),
    ).toThrow(MatchResultApplicationError)
  })

  it.each([
    ['negative home score', { homeScore: -1, awayScore: 76 }],
    ['negative away score', { homeScore: 84, awayScore: -1 }],
    ['decimal home score', { homeScore: 84.5, awayScore: 76 }],
    ['decimal away score', { homeScore: 84, awayScore: 76.5 }],
    ['NaN score', { homeScore: Number.NaN, awayScore: 76 }],
    ['infinite score', { homeScore: 84, awayScore: Number.POSITIVE_INFINITY }],
    ['tied score', { homeScore: 80, awayScore: 80 }],
  ])('rejects invalid result: %s', (_name, scores) => {
    const { world, game } = createScheduledGameWorld()

    expect(() => applyMatchResult(world, { ...resultFor(game, 84, 76), ...scores })).toThrow(
      MatchResultApplicationError,
    )
  })

  it('runs the complete generation, scheduling, simulation, and application pipeline', () => {
    const { world, game } = createScheduledGameWorld()
    const simulationResult = simulateMatch({
      world,
      gameId: game.id,
      homeStrength: { teamId: game.homeTeamId, value: 60 },
      awayStrength: { teamId: game.awayTeamId, value: 40 },
      lineups: lineupsFor(world, game),
      squads: { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds },
      playerProfiles: { home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)), away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)) },
      random: new SeededRandomSource(12345),
      decisionRandom: new SeededRandomSource(67891),
      actorRandom: new SeededRandomSource(67890),
    })
    const nextWorld = applyMatchResult(world, simulationResult)
    const completedGames = Object.values(nextWorld.games).filter((candidate) => candidate.status === 'completed')
    const scheduledGames = Object.values(nextWorld.games).filter((candidate) => candidate.status === 'scheduled')

    expect(world.games[game.id]).toMatchObject({ status: 'scheduled', result: null })
    expect(completedGames).toHaveLength(1)
    expect(scheduledGames).toHaveLength(55)
    expect(nextWorld.games[game.id]!.result).toEqual({
      homeScore: simulationResult.homeScore,
      awayScore: simulationResult.awayScore,
    })
  })

  it('supports sequential result applications without changing earlier worlds', () => {
    const { world, game: firstGame } = createScheduledGameWorld()
    const secondGame = Object.values(world.games).find((game) => game.id !== firstGame.id)!
    const firstResult = simulateResult(world, firstGame, 10)
    const worldTwo = applyMatchResult(world, firstResult)
    const secondResult = simulateResult(worldTwo, secondGame, 20)
    const worldThree = applyMatchResult(worldTwo, secondResult)

    expect(countCompletedGames(world)).toBe(0)
    expect(countCompletedGames(worldTwo)).toBe(1)
    expect(countCompletedGames(worldThree)).toBe(2)
    expect(world.games[firstGame.id]).toMatchObject({ status: 'scheduled', result: null })
    expect(worldTwo.games[firstGame.id]!.result).toEqual({
      homeScore: firstResult.homeScore,
      awayScore: firstResult.awayScore,
    })
    expect(worldThree.games[secondGame.id]!.result).toEqual({
      homeScore: secondResult.homeScore,
      awayScore: secondResult.awayScore,
    })
  })
})

function createScheduledGameWorld(): { world: GameWorld; game: Game } {
  const generatedWorld = generateWorld({ seed: 12345, gender: 'female' })
  const seasonId = Object.values(generatedWorld.seasons)[0]!.id
  const games = generateRoundRobinSchedule({ world: generatedWorld, seasonId })
  const world = recreateWorld(generatedWorld, games)

  return { world, game: games[0]! }
}

function recreateWorld(source: GameWorld, games: readonly Game[]): GameWorld {
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
    staffPeople: Object.values(source.staffPeopleById),
    teamStaffAssignments: Object.values(source.teamStaffAssignmentsById),
  })
}

function resultFor(game: Game, homeScore: number, awayScore: number): MatchSimulationResult {
  return {
    gameId: game.id,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore,
    awayScore,
  }
}

function simulateResult(world: GameWorld, game: Game, seed: number): MatchSimulationResult {
  return simulateMatch({
    world,
    gameId: game.id,
    homeStrength: { teamId: game.homeTeamId, value: 55 },
    awayStrength: { teamId: game.awayTeamId, value: 45 },
    lineups: lineupsFor(world, game),
    squads: { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds },
    playerProfiles: { home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)), away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)) },
    random: new SeededRandomSource(seed),
    decisionRandom: new SeededRandomSource(seed + 1),
    actorRandom: new SeededRandomSource(seed),
  })
}

function lineupsFor(world: GameWorld, game: Game): MatchLineups {
  return {
    home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5),
    away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5),
  }
}

function countCompletedGames(world: GameWorld): number {
  return Object.values(world.games).filter((game) => game.status === 'completed').length
}
