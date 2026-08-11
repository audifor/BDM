import { describe, expect, it } from 'vitest'

import { createGameWorld, type GameWorld } from '@/domain/world'
import { playerIdFromString } from '@/domain/ids'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource, type RandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'

import { MATCH_RULES_V2, MatchSimulationError, calculateActiveLineups, calculateDefensiveAssignments, createMatchPlayerProfile, createMatchSession, simulateMatchDetailed, stepMatchSession, substitutePlayer, toMatchSimulation, type MatchLineups, type SimulateMatchOptions } from './index'

describe('MatchSession', () => {
  it('produces the same complete simulation through stepping as through the wrapper', () => {
    const { world, game } = createScheduledGameWorld()
    const whole = simulateMatchDetailed(createOptions(world, game.id, 12345, 67890))
    const stepped = toMatchSimulation(runToComplete(createMatchSession(createOptions(world, game.id, 12345, 67890))))

    expect(stepped).toEqual(whole)
    expect(regressionSummary(whole)).toEqual({ finalScore: { home: 70, away: 72 }, eventCount: 212, homeTurnovers: 8, awayTurnovers: 11, homeRebounds: 22, awayRebounds: 26, homeAssists: 18, awayAssists: 16 })
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

  it('validates squads and initial lineups against them', () => {
    const { world, game } = createScheduledGameWorld()
    const options = createOptions(world, game.id, 1, 2)

    expect(() => createMatchSession({ ...options, squads: { ...options.squads, home: options.squads.home.slice(0, 4) } })).toThrow('Home squad must contain at least 5 players')
    expect(() => createMatchSession({ ...options, squads: { ...options.squads, home: [...options.squads.home.slice(0, 5), options.squads.home[0]!] } })).toThrow('Home squad cannot contain duplicate players')
    expect(() => createMatchSession({ ...options, squads: { ...options.squads, away: [...options.squads.away.slice(0, 5), options.squads.away[0]!] } })).toThrow('Away squad cannot contain duplicate players')
    expect(() => createMatchSession({ ...options, squads: { ...options.squads, away: [...options.squads.away.slice(0, 4), options.squads.home[0]!] } })).toThrow('Home and away squads cannot share players')
    expect(() => createMatchSession({ ...options, lineups: { ...options.lineups, home: [...options.lineups.home.slice(0, 4), options.squads.home[5]!] }, squads: { ...options.squads, home: options.squads.home.slice(0, 5) } })).toThrow('Home lineup players must belong to the home squad')
    expect(() => createMatchSession({ ...options, playerProfiles: { ...options.playerProfiles, home: options.playerProfiles.home.slice(1) } })).toThrow('Home player profiles must contain exactly one profile per squad player')
    expect(() => createMatchSession({ ...options, playerProfiles: { ...options.playerProfiles, home: [...options.playerProfiles.home.slice(0, -1), options.playerProfiles.home[0]!] } })).toThrow('Home player profiles cannot contain duplicates')
  })

  it('records valid substitutions and permits re-entry without advancing match state', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession(createOptions(world, game.id, 12345, 67890))
    const playerOutId = session.state.activeLineups.home[0]!
    const playerInId = session.state.squads.home[5]!
    const substituted = substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId, playerInId })
    const event = substituted.state.events.at(-1)!

    expect(substituted.state.initialLineups).toEqual(session.state.activeLineups)
    expect(substituted.state.activeLineups.home).toEqual([playerInId, ...session.state.activeLineups.home.slice(1)])
    expect(event).toMatchObject({ type: 'substitution', teamId: session.state.homeTeamId, playerOutId, playerInId, clockSecondsRemaining: session.state.clockSecondsRemaining, homeScore: session.state.homeScore, awayScore: session.state.awayScore, sequence: session.state.nextSequence })
    const reentered = substitutePlayer(substituted, { teamId: session.state.homeTeamId, playerOutId: playerInId, playerInId: playerOutId })
    expect(reentered.state.activeLineups).toEqual(session.state.activeLineups)
  })

  it('rejects invalid substitutions and substitutions after completion', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession(createOptions(world, game.id, 12345, 67890))
    const active = session.state.activeLineups.home[0]!
    const bench = session.state.squads.home[5]!
    const rival = session.state.squads.away[5]!
    expect(() => substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId: bench, playerInId: active })).toThrow('player out must be active')
    expect(() => substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId: active, playerInId: active })).toThrow('must differ')
    expect(() => substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId: active, playerInId: session.state.activeLineups.home[1]! })).toThrow('already active')
    expect(() => substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId: active, playerInId: playerIdFromString('not-in-squad') })).toThrow('must belong to that team squad')
    expect(() => substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId: active, playerInId: rival })).toThrow('opposing team')
    const complete = runToComplete(session)
    expect(() => substitutePlayer(complete, { teamId: complete.state.homeTeamId, playerOutId: active, playerInId: bench })).toThrow('completed')
  })

  it('does not consume RNG and uses the active lineup for subsequent actors', () => {
    const { world, game } = createScheduledGameWorld()
    const baseline = createMatchSession(createOptions(world, game.id, 12345, 67890))
    const first = stepMatchSession(baseline)
    const outId = baseline.state.activeLineups.home[0]!
    const inId = baseline.state.squads.home[5]!
    const restored = substitutePlayer(substitutePlayer(createMatchSession(createOptions(world, game.id, 12345, 67890)), { teamId: baseline.state.homeTeamId, playerOutId: outId, playerInId: inId }), { teamId: baseline.state.homeTeamId, playerOutId: inId, playerInId: outId })
    const second = stepMatchSession(restored)
    expect(second.newEvents.map(withoutSequence)).toEqual(first.newEvents.map(withoutSequence))

    const subbed = substitutePlayer(createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new FirstSportingRandom(), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() }), { teamId: game.homeTeamId, playerOutId: createOptions(world, game.id, 1, 1).lineups.home[0]!, playerInId: world.teams[game.homeTeamId]!.rosterPlayerIds[5]! })
    const afterSub = stepMatchSession(subbed)
    const sporting = afterSub.newEvents.find((event) => event.type === 'shotMade' || event.type === 'shotMissed' || event.type === 'turnover')!
    expect(sporting).toMatchObject({ teamId: game.homeTeamId, playerId: subbed.state.activeLineups.home[0] })
    if (sporting.type === 'shotMade' || sporting.type === 'shotMissed') {
      const assignments = calculateDefensiveAssignments(subbed.state.activeLineups.home, subbed.state.activeLineups.away, [...subbed.state.playerProfiles.home, ...subbed.state.playerProfiles.away])
      expect(sporting.defenderPlayerId).toBe(assignments.find((assignment) => assignment.offensivePlayerId === sporting.playerId)?.defensivePlayerId)
      expect(subbed.state.activeLineups.away).toContain(sporting.defenderPlayerId)
    }
  })

  it('projects active lineups from an ordered partial substitution stream', () => {
    const { world, game } = createScheduledGameWorld()
    const initial = lineupsFor(world, game)
    const squad = squadsFor(world, game)
    const first = { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'substitution' as const, teamId: game.homeTeamId, playerOutId: initial.home[0]!, playerInId: squad.home[5]!, homeScore: 0, awayScore: 0 }
    const second = { ...first, sequence: 2, playerOutId: initial.home[1]!, playerInId: squad.home[6]! }
    const third = { ...first, sequence: 3, playerOutId: squad.home[5]!, playerInId: initial.home[0]! }
    expect(calculateActiveLineups(initial, game.homeTeamId, game.awayTeamId, [first])).toEqual({ home: [squad.home[5]!, ...initial.home.slice(1)], away: initial.away })
    expect(calculateActiveLineups(initial, game.homeTeamId, game.awayTeamId, [first, second, third]).home).toEqual([initial.home[0]!, squad.home[6]!, ...initial.home.slice(2)])
    expect(() => calculateActiveLineups(initial, game.homeTeamId, game.awayTeamId, [first, first])).toThrow('player out must be active')
  })
})

function runToComplete(initialSession: ReturnType<typeof createMatchSession>) {
  let session = initialSession
  while (!session.state.isComplete) session = stepMatchSession(session).session
  return session
}

function withoutSequence(event: { readonly sequence: number }) { const { sequence: _sequence, ...rest } = event; return rest }

function regressionSummary(simulation: ReturnType<typeof simulateMatchDetailed>) {
  const count = (predicate: (event: (typeof simulation.events)[number]) => boolean) => simulation.events.filter(predicate).length
  return {
    finalScore: simulation.finalScore,
    eventCount: simulation.events.length,
    homeTurnovers: count((event) => event.type === 'turnover' && event.teamId === simulation.homeTeamId),
    awayTurnovers: count((event) => event.type === 'turnover' && event.teamId === simulation.awayTeamId),
    homeRebounds: count((event) => event.type === 'rebound' && event.teamId === simulation.homeTeamId),
    awayRebounds: count((event) => event.type === 'rebound' && event.teamId === simulation.awayTeamId),
    homeAssists: count((event) => event.type === 'shotMade' && event.teamId === simulation.homeTeamId && event.assistPlayerId !== undefined),
    awayAssists: count((event) => event.type === 'shotMade' && event.teamId === simulation.awayTeamId && event.assistPlayerId !== undefined),
  }
}

function createScheduledGameWorld(): { world: GameWorld; game: GameWorld['games'][keyof GameWorld['games']] } {
  const generated = generateWorld({ seed: 12345, gender: 'female' })
  const games = generateRoundRobinSchedule({ world: generated, seasonId: Object.values(generated.seasons)[0]!.id })
  return { world: createGameWorld({ currentDate: generated.currentDate, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games }), game: games[0]! }
}

function createOptions(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], sportingSeed: number, actorSeed: number): SimulateMatchOptions {
  const game = world.games[gameId]!
  return { world, gameId, homeStrength: { teamId: game.homeTeamId, value: 50 }, awayStrength: { teamId: game.awayTeamId, value: 50 }, lineups: lineupsFor(world, game), squads: squadsFor(world, game), playerProfiles: profilesFor(world, game), random: new SeededRandomSource(sportingSeed), decisionRandom: new SeededRandomSource(sportingSeed + 1), actorRandom: new SeededRandomSource(actorSeed) }
}

function profilesFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]) { return { home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)), away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)) } }

function squadsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]) { return { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds } }

function lineupsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]): MatchLineups {
  return { home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5), away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5) }
}

class OvertimeRandom implements RandomSource {
  private outcomes = 0
  next(): number { this.outcomes += 1; return this.outcomes <= 100 ? 0.99 : this.outcomes === 101 ? 0.3 : 0.99 }
  nextInt(): number { return 24 }
  nextFloat(minInclusive: number): number { return minInclusive }
  chance(probability: number): boolean { return probability === 0.25 || probability === 0.5 || (this.outcomes === 101 && probability > 0.1 && probability < 0.9) }
  pick<Item>(items: readonly Item[]): Item { return items[0]! }
}

class FirstSportingRandom implements RandomSource {
  next(): number { return 0.5 }
  nextInt(minInclusive: number): number { return minInclusive }
  nextFloat(minInclusive: number): number { return minInclusive }
  chance(probability: number): boolean { return probability === 0.5 }
  pick<Item>(items: readonly Item[]): Item { return items[0]! }
}

class FirstActorRandom extends FirstSportingRandom {}

class ZeroDecisionRandom extends FirstSportingRandom { next(): number { return 0 } }
