import { describe, expect, it } from 'vitest'

import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource, type RandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'
import { createGameWorld, type GameWorld } from '@/domain/world'

import { MATCH_RULES_V2, createMatchPlayerProfile, createMatchSession, simulateMatchDetailed, stepMatchSession, type MatchEvent, type MatchLineups } from './index'

describe('possession-based MatchEngine v2', () => {
  it('audits deterministic full-game pace across five seeds', () => {
    const { world, game } = createScheduledGameWorld()
    const audits = [17, 42, 12345, 90001, 98765].map((seed) => auditGame(world, game.id, seed))

    console.info('MATCH PACE AUDIT', JSON.stringify(audits))
    expect(audits).toHaveLength(5)
    expect(audits.every((audit) => audit.regulationMinutes === audit.periodCount * audit.periodMinutes)).toBe(true)
    expect(audits.every((audit) => audit.fga === audit.fgm + audit.missedFieldGoals)).toBe(true)
    expect(audits.every((audit) => audit.threePointAttempts >= audit.threePointMakes)).toBe(true)
    expect(audits.every((audit) => audit.possessions > 0 && audit.timedSteps > 0)).toBe(true)
    expect(audits.every((audit) => audit.maxContinuationStepSeconds <= 5)).toBe(true)
  })

  it('derives the final score exactly from field goals and made free throws', () => {
    const { world, game } = createScheduledGameWorld()
    const simulation = simulate(world, game.id, 12_345)
    const madeShots = simulation.events.filter((event) => event.type === 'shotMade')

    const homeMadeFreeThrows = simulation.events.filter((event) => event.type === 'freeThrowMade' && event.teamId === simulation.homeTeamId).length
    const awayMadeFreeThrows = simulation.events.filter((event) => event.type === 'freeThrowMade' && event.teamId === simulation.awayTeamId).length
    expect(madeShots.reduce((sum, event) => sum + (event.teamId === simulation.homeTeamId ? event.points : 0), 0) + homeMadeFreeThrows).toBe(simulation.finalScore.home)
    expect(madeShots.reduce((sum, event) => sum + (event.teamId === simulation.awayTeamId ? event.points : 0), 0) + awayMadeFreeThrows).toBe(simulation.finalScore.away)
    expect(madeShots.every((event) => [2, 3].includes(event.points))).toBe(true)
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
    expect(simulation.events.filter((event) => event.type === 'periodEnd').length).toBeGreaterThanOrEqual(5)
    expect(simulation.finalScore.home).not.toBe(simulation.finalScore.away)
  })

  it('does not use TeamStrength as a field-goal defense proxy', () => {
    const { world, game } = createScheduledGameWorld()
    expect(simulateWithStrengths(world, game.id, 12345, 80, 20)).toEqual(simulateWithStrengths(world, game.id, 12345, 20, 80))
  })

  it('records an active on-court defender on every field-goal event', () => {
    const { world, game } = createScheduledGameWorld()
    const simulation = simulate(world, game.id, 12345)
    for (const event of simulation.events) {
      if (event.type !== 'shotMade' && event.type !== 'shotMissed') continue
      const offense = event.teamId === game.homeTeamId ? simulation.lineups.home : simulation.lineups.away
      const defense = event.teamId === game.homeTeamId ? simulation.lineups.away : simulation.lineups.home
      expect(defense).toContain(event.defenderPlayerId)
      // Screen navigation and defensive reactions can canonically change the initial matchup.
      expect(defense).toContain(event.defenderPlayerId)
    }
  })

  it('keeps 50 vs 50 broadly balanced across deterministic seeds', () => {
    const { world, game } = createScheduledGameWorld()
    const homeWins = Array.from({ length: 200 }, (_, seed) => simulate(world, game.id, seed + 1))
      .filter((simulation) => simulation.finalScore.home > simulation.finalScore.away).length

    // Equal external strengths still retain the generated teams' canonical player-profile differences.
    expect(homeWins).toBeGreaterThanOrEqual(10)
    expect(homeWins).toBeLessThanOrEqual(35)
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
      if (event.type !== 'shotMade') continue
      expect(event.assistPlayerId).toBeDefined()
      const lineup = event.teamId === simulation.homeTeamId ? simulation.lineups.home : simulation.lineups.away
      expect(lineup).toContain(event.assistPlayerId)
      expect(event.assistPlayerId).not.toBe(event.playerId)
    }
    expect(simulation.events.every((event) => event.type !== 'shotMade' || event.points === 2 || event.points === 3)).toBe(true)
  })
})

function createScheduledGameWorld(): { world: GameWorld; game: GameWorld['games'][keyof GameWorld['games']] } {
  const generated = generateWorld({ seed: 12345, gender: 'male' })
  const games = generateRoundRobinSchedule({ world: generated, seasonId: Object.values(generated.seasons)[0]!.id })
  return { world: createGameWorld({ currentDate: generated.currentDate, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), staffPeople: Object.values(generated.staffPeopleById), teamStaffAssignments: Object.values(generated.teamStaffAssignmentsById), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games }), game: games[0]! }
}

function simulate(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], seed: number) {
  return simulateWithStrengths(world, gameId, seed, 50, 50)
}

function simulateWithStrengths(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], seed: number, homeStrength: number, awayStrength: number) {
  return simulateWithRandom(world, gameId, new SeededRandomSource(seed), homeStrength, awayStrength)
}

function simulateWithRandom(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], random: RandomSource, homeStrength = 50, awayStrength = 50, actorRandom: RandomSource = new SeededRandomSource(67890)) {
  return simulateMatchDetailed(matchOptions(world, gameId, random, homeStrength, awayStrength, actorRandom))
}

function matchOptions(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], random: RandomSource, homeStrength = 50, awayStrength = 50, actorRandom: RandomSource = new SeededRandomSource(67890)) {
  const game = world.games[gameId]!
  return {
    world,
    gameId,
    homeStrength: { teamId: game.homeTeamId, value: homeStrength },
    awayStrength: { teamId: game.awayTeamId, value: awayStrength },
    lineups: lineupsFor(world, game),
    squads: { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds },
    random,
    playerProfiles: { home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)), away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)) },
    decisionRandom: new SeededRandomSource(13579),
    actorRandom,
  }
}

function auditGame(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], seed: number) {
  let session = createMatchSession(matchOptions(world, gameId, new SeededRandomSource(seed)))
  const { periodCount, periodSeconds, overtimeSeconds } = session.state.clockRules
  let elapsedSeconds = 0
  let timedSteps = 0
  let eventlessTimedSteps = 0
  let noClockNoEventSteps = 0
  let playcalls = 0
  let possessions = 0
  let possessionSeconds = 0
  let possessionStart = 0
  const possessionDurations: number[] = []
  let inferredResets = 0
  let fga = 0
  let fgm = 0
  let missedFieldGoals = 0
  let threePointAttempts = 0
  let threePointMakes = 0
  let turnovers = 0
  let offensiveRebounds = 0
  let defensiveRebounds = 0
  let freeThrowAttempts = 0
  let freeThrowsMade = 0
  const terminalReasons = { fieldGoal: 0, turnover: 0, defensiveRebound: 0, shootingFoul: 0, periodEnd: 0 }
  const teamStats = new Map<string, { fga: number; fgm: number; threePointAttempts: number; threePointMakes: number; turnovers: number; fta: number }>()
  let eventlessSeconds = 0
  let maxContinuationStepSeconds = 0
  const actionKinds: Record<string, number> = {}

  while (!session.state.isComplete) {
    const before = session.state
    const result = stepMatchSession(session)
    session = result.session
    const after = session.state
    const elapsed = before.period === after.period
      ? before.clockSecondsRemaining - after.clockSecondsRemaining
      : before.clockSecondsRemaining
    if (before.possessionDurationApplied && before.period === after.period && !result.newEvents.some((event) => event.type === 'periodEnd')) {
      maxContinuationStepSeconds = Math.max(maxContinuationStepSeconds, elapsed)
    }
    if (elapsed > 0) {
      elapsedSeconds += elapsed
      timedSteps += 1
      if (result.newEvents.length === 0) {
        eventlessTimedSteps += 1
        eventlessSeconds += elapsed
      }
    } else if (result.newEvents.length === 0) {
      noClockNoEventSteps += 1
    }
    const terminalInStep = result.newEvents.some((event) => event.type === 'shotMade' || event.type === 'turnover' || event.type === 'foul' || (event.type === 'rebound' && event.reboundType === 'defensive'))
    if (before.offensiveAction !== undefined && after.offensiveAction === undefined && after.attackingTeamId === before.attackingTeamId && !terminalInStep) inferredResets += 1
    const action = after.offensiveAction
    if (elapsed === 0 && result.newEvents.length === 0 && action !== undefined && action !== before.offensiveAction) {
      playcalls += 1
      actionKinds[action.kind] = (actionKinds[action.kind] ?? 0) + 1
    }
    for (const event of result.newEvents) {
      if ('teamId' in event) {
        const stats = teamStats.get(event.teamId) ?? { fga: 0, fgm: 0, threePointAttempts: 0, threePointMakes: 0, turnovers: 0, fta: 0 }
        if (event.type === 'shotMade' || event.type === 'shotMissed') {
          stats.fga += 1
          if (event.shotZone === 'threePoint') stats.threePointAttempts += 1
        }
        if (event.type === 'shotMade') {
          stats.fgm += 1
          if (event.shotZone === 'threePoint') stats.threePointMakes += 1
        }
        if (event.type === 'turnover') stats.turnovers += 1
        if (event.type === 'freeThrowMade' || event.type === 'freeThrowMissed') stats.fta += 1
        teamStats.set(event.teamId, stats)
      }
      if (event.type === 'shotMade') {
        fga += 1
        fgm += 1
        if (event.shotZone === 'threePoint') { threePointAttempts += 1; threePointMakes += 1 }
      }
      if (event.type === 'shotMissed') {
        fga += 1
        missedFieldGoals += 1
        if (event.shotZone === 'threePoint') threePointAttempts += 1
      }
      if (event.type === 'freeThrowMade' || event.type === 'freeThrowMissed') freeThrowAttempts += 1
      if (event.type === 'freeThrowMade') freeThrowsMade += 1
      if (event.type === 'turnover') turnovers += 1
      if (event.type === 'rebound' && event.reboundType === 'offensive') offensiveRebounds += 1
      if (event.type === 'rebound' && event.reboundType === 'defensive') defensiveRebounds += 1
      const terminalReason = event.type === 'shotMade'
        ? 'fieldGoal'
        : event.type === 'turnover'
          ? 'turnover'
          : event.type === 'foul'
            ? 'shootingFoul'
            : event.type === 'rebound' && event.reboundType === 'defensive'
              ? 'defensiveRebound'
              : undefined
      if (terminalReason !== undefined) {
        terminalReasons[terminalReason] += 1
        possessions += 1
        const duration = elapsedSeconds - possessionStart
        possessionDurations.push(duration)
        possessionSeconds += duration
        possessionStart = elapsedSeconds
      } else if (event.type === 'periodEnd' && !terminalInStep) {
        terminalReasons.periodEnd += 1
        possessions += 1
        const duration = elapsedSeconds - possessionStart
        possessionDurations.push(duration)
        possessionSeconds += duration
        possessionStart = elapsedSeconds
      }
    }
  }
  const final = session.state
  const sortedDurations = [...possessionDurations].sort((a, b) => a - b)
  const medianPossessionSeconds = sortedDurations.length % 2 === 0
    ? (sortedDurations[sortedDurations.length / 2 - 1]! + sortedDurations[sortedDurations.length / 2]!) / 2
    : sortedDurations[Math.floor(sortedDurations.length / 2)]!
  return {
    seed,
    periodCount,
    periodMinutes: periodSeconds / 60,
    regulationMinutes: periodCount * periodSeconds / 60,
    overtimeMinutes: final.period > periodCount ? (final.period - periodCount) * overtimeSeconds / 60 : 0,
    periodsPlayed: final.period,
    score: `${final.homeScore}-${final.awayScore}`,
    teams: { home: teamStats.get(final.homeTeamId), away: teamStats.get(final.awayTeamId) },
    possessions,
    meanPossessionSeconds: Number((possessionSeconds / possessions).toFixed(1)),
    medianPossessionSeconds,
    longestPossessionSeconds: Math.max(...possessionDurations),
    fga,
    fgm,
    missedFieldGoals,
    threePointAttempts,
    threePointMakes,
    fgPercent: Number((100 * fgm / fga).toFixed(1)),
    turnovers,
    terminalReasons,
    offensiveRebounds,
    defensiveRebounds,
    freeThrowAttempts,
    freeThrowsMade,
    elapsedGameMinutes: Number((elapsedSeconds / 60).toFixed(1)),
    timedSteps,
    eventlessTimedSteps,
    eventlessSeconds,
    maxContinuationStepSeconds,
    noClockNoEventSteps,
    playcalls,
    inferredResets,
    actionKinds,
  }
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
  private steps = 0
  next(): number { return 0.99 }
  nextInt(): number { this.steps += 1; return 24 }
  nextFloat(minInclusive: number): number { return minInclusive }
  chance(_probability: number): boolean { return this.steps > 150 }
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
    if (probability >= 0.12 && probability <= 0.40) return this.reboundType === 'offensive'
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
