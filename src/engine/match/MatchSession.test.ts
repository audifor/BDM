import { describe, expect, it } from 'vitest'

import { createGameWorld, type GameWorld } from '@/domain/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource, type RandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'

import { MATCH_RULES_V2, MatchSimulationError, createMatchSession, simulateMatchDetailed, stepMatchSession, toMatchSimulation, type MatchLineups, type SimulateMatchOptions } from './index'

describe('MatchSession', () => {
  it('produces the same complete simulation through stepping as through the wrapper', () => {
    const { world, game } = createScheduledGameWorld()
    const whole = simulateMatchDetailed(createOptions(world, game.id, 12345, 67890))
    const stepped = toMatchSimulation(runToComplete(createMatchSession(createOptions(world, game.id, 12345, 67890))))

    expect(stepped).toEqual(whole)
    expect({ finalScore: whole.finalScore, eventCount: whole.events.length }).toEqual({ finalScore: { home: 68, away: 77 }, eventCount: 221 })
  })

  it('advances one logical unit without mutating the previous sporting state', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession(createOptions(world, game.id, 12345, 67890))
    const before = JSON.stringify(session.state)
    const result = stepMatchSession(session)

    expect(JSON.stringify(session.state)).toBe(before)
    expect(result.newEvents.length).toBeGreaterThan(0)
    expect(result.session.state.events.length).toBeGreaterThan(session.state.events.length)
    expect(result.session.state.clockSecondsRemaining).toBeLessThanOrEqual(session.state.clockSecondsRemaining)
  })

  it('resumes after five steps with the same final simulation as uninterrupted stepping', () => {
    const { world, game } = createScheduledGameWorld()
    let resumed = createMatchSession(createOptions(world, game.id, 12345, 67890))
    for (let step = 0; step < 5; step += 1) resumed = stepMatchSession(resumed).session
    const resumedSimulation = toMatchSimulation(runToComplete(resumed))
    const uninterruptedSimulation = toMatchSimulation(runToComplete(createMatchSession(createOptions(world, game.id, 12345, 67890))))

    expect(resumedSimulation).toEqual(uninterruptedSimulation)
  })

  it('handles overtime incrementally and rejects a step after completion', () => {
    const { world, game } = createScheduledGameWorld()
    const completeSession = runToComplete(createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new OvertimeRandom() }))
    const simulation = toMatchSimulation(completeSession)

    expect(simulation.events.some((event) => event.type === 'periodStart' && event.period === 5)).toBe(true)
    expect(completeSession.state.isComplete).toBe(true)
    expect(simulation.events.at(-1)).toMatchObject({ type: 'gameEnd' })
    expect(() => stepMatchSession(completeSession)).toThrow(MatchSimulationError)
  })

  it('keeps sequences monotonic and clocks valid across multiple steps', () => {
    const { world, game } = createScheduledGameWorld()
    let session = createMatchSession(createOptions(world, game.id, 12345, 67890))
    for (let step = 0; step < 10; step += 1) session = stepMatchSession(session).session

    for (let index = 0; index < session.state.events.length; index += 1) {
      const event = session.state.events[index]!
      expect(event.sequence).toBe(index + 1)
      expect(event.clockSecondsRemaining).toBeGreaterThanOrEqual(0)
    }
  })
})

function runToComplete(initialSession: ReturnType<typeof createMatchSession>) {
  let session = initialSession
  while (!session.state.isComplete) session = stepMatchSession(session).session
  return session
}

function createScheduledGameWorld(): { world: GameWorld; game: GameWorld['games'][keyof GameWorld['games']] } {
  const generated = generateWorld({ seed: 12345, gender: 'female' })
  const games = generateRoundRobinSchedule({ world: generated, seasonId: Object.values(generated.seasons)[0]!.id })
  return { world: createGameWorld({ currentDate: generated.currentDate, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games }), game: games[0]! }
}

function createOptions(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], sportingSeed: number, actorSeed: number): SimulateMatchOptions {
  const game = world.games[gameId]!
  return { world, gameId, homeStrength: { teamId: game.homeTeamId, value: 50 }, awayStrength: { teamId: game.awayTeamId, value: 50 }, lineups: lineupsFor(world, game), random: new SeededRandomSource(sportingSeed), actorRandom: new SeededRandomSource(actorSeed) }
}

function lineupsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]): MatchLineups {
  return { home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5), away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5) }
}

class OvertimeRandom implements RandomSource {
  private outcomes = 0
  next(): number { this.outcomes += 1; return this.outcomes <= 100 ? 0.99 : this.outcomes === 101 ? 0.3 : 0.99 }
  nextInt(): number { return 24 }
  nextFloat(minInclusive: number): number { return minInclusive }
  chance(probability: number): boolean { return probability === 0.25 || probability === 0.5 }
  pick<Item>(items: readonly Item[]): Item { return items[0]! }
}
