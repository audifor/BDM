import { describe, expect, it } from 'vitest'

import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource, type RandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'
import { createGameWorld, type GameWorld } from '@/domain/world'

import { MATCH_RULES_V2, simulateMatchDetailed, type MatchEvent, type MatchLineups } from './index'

describe('possession-based MatchEngine v2', () => {
  it('derives the final score exactly from shotMade events', () => {
    const { world, game } = createScheduledGameWorld()
    const simulation = simulate(world, game.id, 12_345)
    const madeShots = simulation.events.filter((event) => event.type === 'shotMade')

    expect(madeShots.reduce((sum, event) => sum + (event.teamId === simulation.homeTeamId ? event.points : 0), 0)).toBe(simulation.finalScore.home)
    expect(madeShots.reduce((sum, event) => sum + (event.teamId === simulation.awayTeamId ? event.points : 0), 0)).toBe(simulation.finalScore.away)
    expect(madeShots.every((event) => [1, 2, 3].includes(event.points))).toBe(true)
    expect(simulation.events.at(-1)).toMatchObject({ type: 'gameEnd', homeScore: simulation.finalScore.home, awayScore: simulation.finalScore.away })
  })

  it('has chronological events, balanced periods, and non-scoring misses and turnovers', () => {
    const { world, game } = createScheduledGameWorld()
    const simulation = simulate(world, game.id, 4_321)
    const starts = simulation.events.filter((event) => event.type === 'periodStart')
    const ends = simulation.events.filter((event) => event.type === 'periodEnd')

    expect(starts).toHaveLength(4)
    expect(ends).toHaveLength(4)
    expect(simulation.events.filter((event) => event.type === 'gameEnd')).toHaveLength(1)
    for (let index = 0; index < simulation.events.length; index += 1) {
      const event = simulation.events[index]!
      const periodSeconds = event.period <= 4 ? MATCH_RULES_V2.periodSeconds : MATCH_RULES_V2.overtimeSeconds
      expect(event.sequence).toBe(index + 1)
      expect(event.clockSecondsRemaining).toBeGreaterThanOrEqual(0)
      expect(event.clockSecondsRemaining).toBeLessThanOrEqual(periodSeconds)
      if (index > 0 && simulation.events[index - 1]!.period === event.period) {
        expect(event.clockSecondsRemaining).toBeLessThanOrEqual(simulation.events[index - 1]!.clockSecondsRemaining)
      }
      if (event.type === 'shotMissed' || event.type === 'turnover') {
        expect(event.homeScore).toBe(simulation.events[index - 1]!.homeScore)
        expect(event.awayScore).toBe(simulation.events[index - 1]!.awayScore)
      }
      if (event.type === 'shotMissed') {
        const rebound = simulation.events[index + 1]!
        expect(rebound).toMatchObject({ type: 'rebound', homeScore: event.homeScore, awayScore: event.awayScore })
      }
      if (event.type === 'rebound') {
        expect(simulation.events[index - 1]).toMatchObject({ type: 'shotMissed' })
      }
      if (event.type === 'shotMade' || event.type === 'turnover') {
        expect(simulation.events[index + 1]?.type).not.toBe('rebound')
      }
    }
  })

  it('is deterministic, non-mutating, and produces a non-tied final score', () => {
    const { world, game } = createScheduledGameWorld()
    const before = JSON.stringify(world)
    const first = simulate(world, game.id, 98_765)

    expect(first).toEqual(simulate(world, game.id, 98_765))
    expect(first).not.toEqual(simulate(world, game.id, 54_321))
    expect(first.finalScore.home).not.toBe(first.finalScore.away)
    expect(JSON.stringify(world)).toBe(before)
  })

  it('enters overtime after a tied regulation and resolves it with a winner', () => {
    const { world, game } = createScheduledGameWorld()
    const simulation = simulateWithRandom(world, game.id, new OvertimeRandom())
    const overtimeStarts = simulation.events.filter((event) => event.type === 'periodStart' && event.period === 5)

    expect(overtimeStarts).toHaveLength(1)
    expect(overtimeStarts[0]?.clockSecondsRemaining).toBe(MATCH_RULES_V2.overtimeSeconds)
    expect(simulation.events.filter((event) => event.type === 'periodEnd')).toHaveLength(5)
    expect(simulation.finalScore.home).not.toBe(simulation.finalScore.away)
  })

  it('gives strength 80 a clear majority over strength 20 across deterministic seeds', () => {
    const { world, game } = createScheduledGameWorld()
    const homeWins = Array.from({ length: 200 }, (_, seed) => simulateWithStrengths(world, game.id, seed + 1, 80, 20))
      .filter((simulation) => simulation.finalScore.home > simulation.finalScore.away).length

    expect(homeWins).toBeGreaterThan(140)
  })

  it('keeps 50 vs 50 broadly balanced across deterministic seeds', () => {
    const { world, game } = createScheduledGameWorld()
    const homeWins = Array.from({ length: 200 }, (_, seed) => simulate(world, game.id, seed + 1))
      .filter((simulation) => simulation.finalScore.home > simulation.finalScore.away).length

    expect(homeWins).toBeGreaterThan(40)
    expect(homeWins).toBeLessThan(160)
  })

  it('uses defensive and offensive rebounds to determine the next attacking team', () => {
    const { world, game } = createScheduledGameWorld()
    const defensive = simulateWithRandom(world, game.id, new FirstReboundRandom('defensive'))
    const offensive = simulateWithRandom(world, game.id, new FirstReboundRandom('offensive'))

    assertFirstRebound(defensive, 'defensive')
    assertFirstRebound(offensive, 'offensive')
  })

  it('attributes rebounders and assists to valid non-scorer lineup players', () => {
    const { world, game } = createScheduledGameWorld()
    const simulation = simulateWithRandom(world, game.id, new SeededRandomSource(12345), 50, 50, new AlwaysAssistsRandom())

    for (const event of simulation.events.filter((event) => event.type === 'rebound')) {
      const lineup = event.teamId === simulation.homeTeamId ? simulation.lineups.home : simulation.lineups.away
      expect(lineup).toContain(event.playerId)
    }
    for (const event of simulation.events) {
      if (event.type !== 'shotMade' || event.points === 1) continue
      expect(event.assistPlayerId).toBeDefined()
      const lineup = event.teamId === simulation.homeTeamId ? simulation.lineups.home : simulation.lineups.away
      expect(lineup).toContain(event.assistPlayerId)
      expect(event.assistPlayerId).not.toBe(event.playerId)
    }
    expect(simulation.events.every((event) => event.type !== 'shotMade' || event.points !== 1 || event.assistPlayerId === undefined)).toBe(true)
  })
})

function createScheduledGameWorld(): { world: GameWorld; game: GameWorld['games'][keyof GameWorld['games']] } {
  const generated = generateWorld({ seed: 12345, gender: 'male' })
  const games = generateRoundRobinSchedule({ world: generated, seasonId: Object.values(generated.seasons)[0]!.id })
  return { world: createGameWorld({ currentDate: generated.currentDate, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games }), game: games[0]! }
}

function simulate(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], seed: number) {
  return simulateWithStrengths(world, gameId, seed, 50, 50)
}

function simulateWithStrengths(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], seed: number, homeStrength: number, awayStrength: number) {
  return simulateWithRandom(world, gameId, new SeededRandomSource(seed), homeStrength, awayStrength)
}

function simulateWithRandom(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], random: RandomSource, homeStrength = 50, awayStrength = 50, actorRandom: RandomSource = new SeededRandomSource(67890)) {
  const game = world.games[gameId]!
  return simulateMatchDetailed({
    world,
    gameId,
    homeStrength: { teamId: game.homeTeamId, value: homeStrength },
    awayStrength: { teamId: game.awayTeamId, value: awayStrength },
    lineups: lineupsFor(world, game),
    random,
    actorRandom,
  })
}

function assertFirstRebound(simulation: ReturnType<typeof simulateMatchDetailed>, reboundType: 'offensive' | 'defensive') {
  const missIndex = simulation.events.findIndex((event) => event.type === 'shotMissed')
  const missedShot = simulation.events[missIndex]!
  const rebound = simulation.events[missIndex + 1]!
  const nextSportingEvent = simulation.events.slice(missIndex + 2).find(isSportingEvent)!

  expect(rebound).toMatchObject({ type: 'rebound', reboundType, homeScore: missedShot.homeScore, awayScore: missedShot.awayScore })
  if (rebound.type !== 'rebound' || missedShot.type !== 'shotMissed') throw new Error('Expected miss followed by rebound')
  const expectedTeamId = reboundType === 'offensive'
    ? missedShot.teamId
    : missedShot.teamId === simulation.homeTeamId ? simulation.awayTeamId : simulation.homeTeamId
  expect(rebound.teamId).toBe(expectedTeamId)
  expect(nextSportingEvent.teamId).toBe(expectedTeamId)
}

function isSportingEvent(event: MatchEvent): event is MatchEvent & { readonly teamId: string } {
  return event.type === 'shotMade' || event.type === 'shotMissed' || event.type === 'turnover' || event.type === 'rebound'
}

function lineupsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]): MatchLineups {
  return {
    home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5),
    away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5),
  }
}

class OvertimeRandom implements RandomSource {
  private outcomes = 0
  next(): number {
    this.outcomes += 1
    return this.outcomes <= 100 ? 0.99 : this.outcomes === 101 ? 0.2 : 0.99
  }
  nextInt(): number { return 24 }
  nextFloat(minInclusive: number): number { return minInclusive }
  chance(): boolean { return true }
  pick<Item>(items: readonly Item[]): Item { return items[0]! }
}

class FirstReboundRandom implements RandomSource {
  private readonly remainingRandom = new SeededRandomSource(12345)
  private isFirstOutcome = true

  public constructor(private readonly reboundType: 'offensive' | 'defensive') {}

  next(): number {
    if (this.isFirstOutcome) {
      this.isFirstOutcome = false
      return 0.99
    }
    return this.remainingRandom.next()
  }
  nextInt(minInclusive: number, maxInclusive: number): number { return this.remainingRandom.nextInt(minInclusive, maxInclusive) }
  nextFloat(minInclusive: number, maxExclusive: number): number { return this.remainingRandom.nextFloat(minInclusive, maxExclusive) }
  chance(probability: number): boolean {
    if (probability === 0.5) return true
    if (probability === 0.25) return this.reboundType === 'offensive'
    return this.remainingRandom.chance(probability)
  }
  pick<Item>(items: readonly Item[]): Item { return this.remainingRandom.pick(items) }
}

class AlwaysAssistsRandom implements RandomSource {
  next(): number { return 0 }
  nextInt(minInclusive: number): number { return minInclusive }
  nextFloat(minInclusive: number): number { return minInclusive }
  chance(): boolean { return true }
  pick<Item>(items: readonly Item[]): Item { return items[0]! }
}
