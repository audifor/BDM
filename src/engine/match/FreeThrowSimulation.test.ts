import { describe, expect, it } from 'vitest'

import { createGameWorld, type GameWorld } from '@/domain/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource, type RandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'

import { calculateDefensiveAssignments, createMatchPlayerProfile, simulateMatchDetailed, type MatchLineups } from './index'

describe('shooting fouls and free throws', () => {
  it.each([
    [[false, false], 0],
    [[true, false], 1],
    [[true, true], 2],
  ] as const)('produces the expected %i points from two free throws', (freeThrowOutcomes, expectedPoints) => {
    const { world, game } = createScheduledGameWorld()
    const simulation = simulateWithFoul(world, game.id, freeThrowOutcomes)
    const foulIndex = simulation.events.findIndex((event) => event.type === 'foul')
    const foul = simulation.events[foulIndex]!
    const firstFreeThrow = simulation.events[foulIndex + 1]!
    const secondFreeThrow = simulation.events[foulIndex + 2]!

    if (foul.type !== 'foul') throw new Error('Expected shooting foul')

    expect(foul).toMatchObject({ type: 'foul', teamId: game.awayTeamId, foulType: 'shooting' })
    expect([firstFreeThrow.type, secondFreeThrow.type]).toHaveLength(2)
    expect([firstFreeThrow.type, secondFreeThrow.type].every((type) => type === 'freeThrowMade' || type === 'freeThrowMissed')).toBe(true)
    if (firstFreeThrow.type !== 'freeThrowMade' && firstFreeThrow.type !== 'freeThrowMissed') throw new Error('Expected first free throw')
    if (secondFreeThrow.type !== 'freeThrowMade' && secondFreeThrow.type !== 'freeThrowMissed') throw new Error('Expected second free throw')

    expect(firstFreeThrow.teamId).toBe(game.homeTeamId)
    expect(secondFreeThrow.teamId).toBe(game.homeTeamId)
    expect(firstFreeThrow.playerId).toBe(secondFreeThrow.playerId)
    expect(firstFreeThrow.clockSecondsRemaining).toBe(foul.clockSecondsRemaining)
    expect(secondFreeThrow.clockSecondsRemaining).toBe(foul.clockSecondsRemaining)
    expect(firstFreeThrow.sequence).toBe(foul.sequence + 1)
    expect(secondFreeThrow.sequence).toBe(foul.sequence + 2)
    expect(simulation.lineups.home).toContain(firstFreeThrow.playerId)
    expect(simulation.lineups.away).toContain(foul.playerId)
    expect(firstFreeThrow.homeScore - foul.homeScore + (secondFreeThrow.homeScore - firstFreeThrow.homeScore)).toBe(expectedPoints)
    expect(firstFreeThrow.awayScore).toBe(foul.awayScore)
    expect(secondFreeThrow.awayScore).toBe(foul.awayScore)
    expect(simulation.events[foulIndex + 3]?.type).not.toBe('rebound')
    const shooterProfile = world.players[firstFreeThrow.playerId]!
    const offense = game.homeTeamId === firstFreeThrow.teamId ? simulation.lineups.home : simulation.lineups.away
    const defense = game.homeTeamId === firstFreeThrow.teamId ? simulation.lineups.away : simulation.lineups.home
    const profiles = [...offense, ...defense].map((playerId) => createMatchPlayerProfile(world.players[playerId]!))
    expect(foul.playerId).toBe(calculateDefensiveAssignments(offense, defense, profiles).find((assignment) => assignment.offensivePlayerId === shooterProfile.id)?.defensivePlayerId)
  })

  it('keeps fouls and free throw outcomes independent from actor RNG', () => {
    const { world, game } = createScheduledGameWorld()
    const first = simulate(world, game.id, new SeededRandomSource(12345), new SeededRandomSource(1))
    const second = simulate(world, game.id, new SeededRandomSource(12345), new SeededRandomSource(2))

    expect(first.finalScore).toEqual(second.finalScore)
    expect(first.events.filter((event) => event.type === 'foul').length).toBe(second.events.filter((event) => event.type === 'foul').length)
    expect(first.events.filter((event) => event.type === 'foul').map((event) => event.playerId)).toEqual(second.events.filter((event) => event.type === 'foul').map((event) => event.playerId))
    expect(first.events.filter((event) => event.type === 'freeThrowMade' || event.type === 'freeThrowMissed').map((event) => event.type)).toEqual(second.events.filter((event) => event.type === 'freeThrowMade' || event.type === 'freeThrowMissed').map((event) => event.type))
  })

  it('is deterministic and never generates abstract one-point field goals', () => {
    const { world, game } = createScheduledGameWorld()
    const first = simulate(world, game.id, new SeededRandomSource(54321), new SeededRandomSource(67890))

    expect(first).toEqual(simulate(world, game.id, new SeededRandomSource(54321), new SeededRandomSource(67890)))
    expect(first.events.filter((event) => event.type === 'shotMade').every((event) => event.points === 2 || event.points === 3)).toBe(true)
  })
})

function createScheduledGameWorld(): { world: GameWorld; game: GameWorld['games'][keyof GameWorld['games']] } {
  const generated = generateWorld({ seed: 12345, gender: 'female' })
  const games = generateRoundRobinSchedule({ world: generated, seasonId: Object.values(generated.seasons)[0]!.id })
  return { world: createGameWorld({ currentDate: generated.currentDate, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games }), game: games[0]! }
}

function simulateWithFoul(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], freeThrowOutcomes: readonly boolean[]) {
  return simulate(world, gameId, new FirstFoulRandom(freeThrowOutcomes), new SeededRandomSource(12345))
}

function simulate(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], random: RandomSource, actorRandom: RandomSource) {
  const game = world.games[gameId]!
  return simulateMatchDetailed({ world, gameId, homeStrength: { teamId: game.homeTeamId, value: 50 }, awayStrength: { teamId: game.awayTeamId, value: 50 }, lineups: lineupsFor(world, game), squads: squadsFor(world, game), playerProfiles: { home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)), away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)) }, random, decisionRandom: new SeededRandomSource(13579), actorRandom })
}

function squadsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]) { return { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds } }

function lineupsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]): MatchLineups {
  return { home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5), away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5) }
}

class FirstFoulRandom implements RandomSource {
  private readonly remainingRandom = new SeededRandomSource(67890)
  private isFirstOutcome = true
  private freeThrowIndex = 0

  public constructor(private readonly freeThrowOutcomes: readonly boolean[]) {}

  next(): number {
    if (this.isFirstOutcome) {
      this.isFirstOutcome = false
      return 0.05
    }
    return this.remainingRandom.next()
  }
  nextInt(minInclusive: number, maxInclusive: number): number { return this.remainingRandom.nextInt(minInclusive, maxInclusive) }
  nextFloat(minInclusive: number, maxExclusive: number): number { return this.remainingRandom.nextFloat(minInclusive, maxExclusive) }
  chance(probability: number): boolean {
    if (probability === 0.5) return true
    if (probability === 0.75 && this.freeThrowIndex < this.freeThrowOutcomes.length) return this.freeThrowOutcomes[this.freeThrowIndex++]!
    return this.remainingRandom.chance(probability)
  }
  pick<Item>(items: readonly Item[]): Item { return this.remainingRandom.pick(items) }
}
