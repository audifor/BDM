import { describe, expect, it } from 'vitest'

import { createGame } from '@/domain/game'
import { gameIdFromString, teamIdFromString } from '@/domain/ids'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'

import { MatchSimulationError, simulateMatch, simulateMatchDetailed } from './index'

describe('MatchEngine result projection', () => {
  it('projects the final score from the same possession simulation used by MatchViewer', () => {
    const { world, game } = createScheduledGameWorld()
    const options = createOptions(world, game.id, 12_345)
    const detailed = simulateMatchDetailed(options)
    const result = simulateMatch(createOptions(world, game.id, 12_345))

    expect(result).toEqual({ gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: detailed.finalScore.home, awayScore: detailed.finalScore.away })
    expect(result.homeScore).not.toBe(result.awayScore)
  })

  it('is reproducible for the same seed and can differ for another', () => {
    const { world, game } = createScheduledGameWorld()
    expect(simulateMatch(createOptions(world, game.id, 12345))).toEqual(simulateMatch(createOptions(world, game.id, 12345)))
    expect(simulateMatch(createOptions(world, game.id, 12345))).not.toEqual(simulateMatch(createOptions(world, game.id, 54321)))
  })

  it('validates strengths and game status before simulating', () => {
    const { world, game } = createScheduledGameWorld()
    expect(() => simulateMatch({ ...createOptions(world, game.id, 1), homeStrength: { teamId: game.awayTeamId, value: 50 } })).toThrow(MatchSimulationError)
    expect(() => simulateMatch({ ...createOptions(world, game.id, 1), awayStrength: { teamId: game.awayTeamId, value: 101 } })).toThrow(MatchSimulationError)
    expect(() => simulateMatch({ ...createOptions(world, gameIdFromString('missing-game'), 1) })).toThrow('Game does not exist')

    const completedGame = createGame({ ...game, status: 'completed', result: { homeScore: 80, awayScore: 70 } })
    const completedWorld = recreateWorld(world, [completedGame, ...Object.values(world.games).slice(1)])
    expect(() => simulateMatch(createOptions(completedWorld, game.id, 1))).toThrow(MatchSimulationError)
  })

  it('does not mutate GameWorld', () => {
    const { world, game } = createScheduledGameWorld()
    const before = JSON.stringify(world)
    simulateMatch(createOptions(world, game.id, 1))
    expect(JSON.stringify(world)).toBe(before)
  })
})

function createScheduledGameWorld(): { world: GameWorld; game: GameWorld['games'][keyof GameWorld['games']] } {
  const generatedWorld = generateWorld({ seed: 12345, gender: 'female' })
  const games = generateRoundRobinSchedule({ world: generatedWorld, seasonId: Object.values(generatedWorld.seasons)[0]!.id })
  return { world: recreateWorld(generatedWorld, games), game: games[0]! }
}

function createOptions(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], seed: number) {
  const game = world.games[gameId]
  return { world, gameId, homeStrength: { teamId: game?.homeTeamId ?? teamIdFromString('missing-team'), value: 50 }, awayStrength: { teamId: game?.awayTeamId ?? teamIdFromString('missing-team'), value: 50 }, random: new SeededRandomSource(seed) }
}

function recreateWorld(source: GameWorld, games: readonly GameWorld['games'][keyof GameWorld['games']][]): GameWorld {
  return createGameWorld({ currentDate: source.currentDate, userCoachId: source.userCoachId, countries: Object.values(source.countries), coaches: Object.values(source.coaches), players: Object.values(source.players), teams: Object.values(source.teams), competitions: Object.values(source.competitions), seasons: Object.values(source.seasons), games })
}
