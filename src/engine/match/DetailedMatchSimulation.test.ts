import { describe, expect, it } from 'vitest'

import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'
import { createGameWorld, type GameWorld } from '@/domain/world'

import { PROTOTYPE_PERIOD_SECONDS, simulateMatchDetailed } from './index'

describe('detailed MatchEngine simulation', () => {
  it('creates a complete ordered event stream matching the final score', () => {
    const { world, game } = createScheduledGameWorld()
    const simulation = simulate(world, game.id, 12_345)
    const scoreEvents = simulation.events.filter((event) => event.type === 'score')
    const gameEnd = simulation.events.at(-1)!

    expect(simulation.events.filter((event) => event.type === 'periodStart')).toHaveLength(4)
    expect(simulation.events.filter((event) => event.type === 'periodEnd')).toHaveLength(4)
    expect(simulation.events.filter((event) => event.type === 'gameEnd')).toHaveLength(1)
    expect(gameEnd).toMatchObject({ type: 'gameEnd', homeScore: simulation.finalScore.home, awayScore: simulation.finalScore.away })
    expect(scoreEvents.reduce((sum, event) => sum + (event.teamId === simulation.homeTeamId ? event.points : 0), 0)).toBe(simulation.finalScore.home)
    expect(scoreEvents.reduce((sum, event) => sum + (event.teamId === simulation.awayTeamId ? event.points : 0), 0)).toBe(simulation.finalScore.away)
    expect(simulation.finalScore.home).not.toBe(simulation.finalScore.away)
    expect(scoreEvents.every((event) => [1, 2, 3].includes(event.points))).toBe(true)
  })

  it('uses increasing sequences, valid clocks, and descending score clocks within each period', () => {
    const { world, game } = createScheduledGameWorld()
    const simulation = simulate(world, game.id, 4_321)

    for (let index = 0; index < simulation.events.length; index += 1) {
      const event = simulation.events[index]!
      expect(event.sequence).toBe(index + 1)
      expect(event.clockSecondsRemaining).toBeGreaterThanOrEqual(0)
      expect(event.clockSecondsRemaining).toBeLessThanOrEqual(PROTOTYPE_PERIOD_SECONDS)
      if (event.type === 'score') {
        const earlierScores = simulation.events.slice(0, index).filter((candidate) => candidate.type === 'score' && candidate.period === event.period)
        expect(event.clockSecondsRemaining).toBeLessThan(earlierScores.at(-1)?.clockSecondsRemaining ?? PROTOTYPE_PERIOD_SECONDS)
      }
    }
  })

  it('never regresses scores and is identical for the same seed', () => {
    const { world, game } = createScheduledGameWorld()
    const first = simulate(world, game.id, 98_765)
    const second = simulate(world, game.id, 98_765)
    const different = simulate(world, game.id, 54_321)

    expect(first).toEqual(second)
    expect(first).not.toEqual(different)
    for (let index = 1; index < first.events.length; index += 1) {
      expect(first.events[index]!.homeScore).toBeGreaterThanOrEqual(first.events[index - 1]!.homeScore)
      expect(first.events[index]!.awayScore).toBeGreaterThanOrEqual(first.events[index - 1]!.awayScore)
    }
  })

  it.each([1, 2, 3, 4, 5])('assigns every point for seed %s without mutating the world', (seed) => {
    const { world, game } = createScheduledGameWorld()
    const before = JSON.stringify(world)
    const simulation = simulate(world, game.id, seed)

    expect(JSON.stringify(world)).toBe(before)
    expect(simulation.events.filter((event) => event.type === 'score').every((event) => event.points > 0)).toBe(true)
    expect(simulation.events.at(-1)).toMatchObject({ homeScore: simulation.finalScore.home, awayScore: simulation.finalScore.away })
  })
})

function createScheduledGameWorld(): { world: GameWorld; game: GameWorld['games'][keyof GameWorld['games']] } {
  const generated = generateWorld({ seed: 12345, gender: 'male' })
  const games = generateRoundRobinSchedule({ world: generated, seasonId: Object.values(generated.seasons)[0]!.id })
  return {
    world: createGameWorld({ currentDate: generated.currentDate, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games }),
    game: games[0]!,
  }
}

function simulate(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], seed: number) {
  const game = world.games[gameId]!
  return simulateMatchDetailed({ world, gameId, homeStrength: { teamId: game.homeTeamId, value: 50 }, awayStrength: { teamId: game.awayTeamId, value: 50 }, random: new SeededRandomSource(seed) })
}
