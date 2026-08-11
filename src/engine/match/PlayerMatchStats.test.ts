import { describe, expect, it } from 'vitest'

import { createNewGame, prepareUserMatch } from '@/app/game'
import { gameIdFromString, playerIdFromString, teamIdFromString, type PlayerId } from '@/domain/ids'

import { calculateMatchPlayerStats } from './PlayerMatchStats'
import type { MatchEvent, MatchSimulation } from './MatchEngine'

const HOME_PLAYERS = Array.from({ length: 5 }, (_, index) => playerIdFromString(`home-player-${index}`))
const AWAY_PLAYERS = Array.from({ length: 5 }, (_, index) => playerIdFromString(`away-player-${index}`))
const HOME_BENCH_PLAYER = playerIdFromString('home-bench-player')
const HOME_TEAM_ID = teamIdFromString('home-team')
const AWAY_TEAM_ID = teamIdFromString('away-team')

describe('PlayerMatchStats', () => {
  it('derives made 2s, made 3s, misses, turnovers, and zero-action players', () => {
    const simulation = createSimulation([
      madeShot(HOME_PLAYERS[0]!, 2, HOME_PLAYERS[1]!),
      madeShot(HOME_PLAYERS[1]!, 3),
      madeShot(HOME_PLAYERS[2]!, 2),
      missedShot(HOME_PLAYERS[3]!),
      turnover(HOME_PLAYERS[4]!),
      rebound(HOME_PLAYERS[0]!, 'offensive'),
      rebound(AWAY_PLAYERS[0]!, 'defensive'),
      foul(AWAY_PLAYERS[1]!),
      freeThrow(HOME_PLAYERS[0]!, true),
      freeThrow(HOME_PLAYERS[0]!, false),
    ])
    const stats = calculateMatchPlayerStats(simulation)

    expect(stats).toHaveLength(10)
    expect(stats.map((stat) => stat.playerId)).toEqual([...HOME_PLAYERS, ...AWAY_PLAYERS])
    expect(new Set(stats.map((stat) => stat.playerId)).size).toBe(10)
    expect(stats[0]).toMatchObject({ points: 3, fieldGoalsMade: 1, fieldGoalsAttempted: 1, turnovers: 0, offensiveRebounds: 1, defensiveRebounds: 0, rebounds: 1, assists: 0, freeThrowsMade: 1, freeThrowsAttempted: 2, foulsCommitted: 0 })
    expect(stats[1]).toMatchObject({ points: 3, fieldGoalsMade: 1, fieldGoalsAttempted: 1, turnovers: 0, offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0, assists: 1 })
    expect(stats[2]).toMatchObject({ points: 2, fieldGoalsMade: 1, fieldGoalsAttempted: 1, turnovers: 0 })
    expect(stats[3]).toMatchObject({ points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 1, turnovers: 0 })
    expect(stats[4]).toMatchObject({ points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, turnovers: 1 })
    expect(stats[5]).toMatchObject({ points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, turnovers: 0, offensiveRebounds: 0, defensiveRebounds: 1, rebounds: 1, assists: 0 })
  })

  it('reconstructs a complete simulation and does not mutate it', () => {
    const simulation = prepareUserMatch(createNewGame())
    const before = JSON.stringify(simulation)
    const stats = calculateMatchPlayerStats(simulation)
    const homePlayers = new Set(simulation.lineups.home)
    for (const event of simulation.events) if (event.type === 'substitution' && event.teamId === simulation.homeTeamId) homePlayers.add(event.playerInId)
    const fieldGoals = simulation.events.filter((event) => event.type === 'shotMade')

    expect(stats.filter((stat) => homePlayers.has(stat.playerId)).reduce((total, stat) => total + stat.points, 0)).toBe(simulation.finalScore.home)
    expect(stats.filter((stat) => !homePlayers.has(stat.playerId)).reduce((total, stat) => total + stat.points, 0)).toBe(simulation.finalScore.away)
    expect(stats.reduce((total, stat) => total + stat.fieldGoalsMade, 0)).toBe(fieldGoals.length)
    expect(stats.reduce((total, stat) => total + stat.fieldGoalsAttempted, 0)).toBe(fieldGoals.length + simulation.events.filter((event) => event.type === 'shotMissed').length)
    expect(stats.reduce((total, stat) => total + stat.turnovers, 0)).toBe(simulation.events.filter((event) => event.type === 'turnover').length)
    expect(stats.reduce((total, stat) => total + stat.rebounds, 0)).toBe(simulation.events.filter((event) => event.type === 'rebound').length)
    expect(stats.reduce((total, stat) => total + stat.assists, 0)).toBe(simulation.events.filter((event) => event.type === 'shotMade' && event.assistPlayerId !== undefined).length)
    expect(stats.every((stat) => stat.rebounds === stat.offensiveRebounds + stat.defensiveRebounds)).toBe(true)
    expect(stats.reduce((total, stat) => total + stat.freeThrowsMade, 0)).toBe(simulation.events.filter((event) => event.type === 'freeThrowMade').length)
    expect(stats.reduce((total, stat) => total + stat.freeThrowsAttempted, 0)).toBe(simulation.events.filter((event) => event.type === 'freeThrowMade' || event.type === 'freeThrowMissed').length)
    expect(stats.reduce((total, stat) => total + stat.foulsCommitted, 0)).toBe(simulation.events.filter((event) => event.type === 'foul').length)
    expect(JSON.stringify(simulation)).toBe(before)
  })

  it('projects only the explicit revealed event subset', () => {
    const simulation = createSimulation([madeShot(HOME_PLAYERS[0]!, 2), rebound(HOME_PLAYERS[1]!, 'offensive'), freeThrow(HOME_PLAYERS[2]!, true), foul(AWAY_PLAYERS[0]!), madeShot(HOME_PLAYERS[2]!, 3, HOME_PLAYERS[3]!)])
    const partialStats = calculateMatchPlayerStats(simulation, simulation.events.slice(0, 1))

    expect(partialStats[0]!.points).toBe(2)
    expect(partialStats[1]!.points).toBe(0)
    expect(partialStats[1]!.rebounds).toBe(0)
    expect(partialStats[3]!.assists).toBe(0)
    expect(partialStats[2]!.freeThrowsMade).toBe(0)
    expect(partialStats[5]!.foulsCommitted).toBe(0)
    expect(calculateMatchPlayerStats(simulation, simulation.events)).toEqual(calculateMatchPlayerStats(simulation))
  })

  it('rejects sporting events attributed to a Player outside the lineups', () => {
    const simulation = createSimulation([madeShot(playerIdFromString('outside-lineup'), 2)])

    expect(() => calculateMatchPlayerStats(simulation)).toThrow('Sporting event references Player outside active MatchSimulation lineup: outside-lineup')
  })

  it('reveals an incoming bench player only at their substitution and keeps one row on re-entry', () => {
    const firstSubstitution = substitution(HOME_PLAYERS[0]!, HOME_BENCH_PLAYER)
    const reentry = substitution(HOME_BENCH_PLAYER, HOME_PLAYERS[0]!)
    const simulation = createSimulation([firstSubstitution, reentry])

    expect(calculateMatchPlayerStats(simulation, []).map((stat) => stat.playerId)).not.toContain(HOME_BENCH_PLAYER)
    const afterFirst = calculateMatchPlayerStats(simulation, [firstSubstitution])
    expect(afterFirst.find((stat) => stat.playerId === HOME_BENCH_PLAYER)).toMatchObject({ points: 0, fieldGoalsAttempted: 0, rebounds: 0 })
    expect(calculateMatchPlayerStats(simulation).filter((stat) => stat.playerId === HOME_PLAYERS[0]!)).toHaveLength(1)
  })

  it('derives seconds from clock deltas, substitutions, same-clock events, and re-entry', () => {
    const bench = HOME_BENCH_PLAYER
    const simulation = createSimulation([
      periodStart(1, 600),
      substitutionAt(2, 300, HOME_PLAYERS[0]!, bench),
      substitutionAt(3, 120, bench, HOME_PLAYERS[0]!),
      foulAt(4, 120, AWAY_PLAYERS[0]!),
      periodEnd(5, 0),
      gameEnd(6, 0),
    ])
    const stats = calculateMatchPlayerStats(simulation)
    expect(stats.find((stat) => stat.playerId === HOME_PLAYERS[0]!)?.secondsPlayed).toBe(420)
    expect(stats.find((stat) => stat.playerId === bench)?.secondsPlayed).toBe(180)
    expect(stats.find((stat) => stat.playerId === AWAY_PLAYERS[0]!)?.secondsPlayed).toBe(600)
    expect(stats.reduce((sum, stat) => HOME_PLAYERS.includes(stat.playerId) || stat.playerId === bench ? sum + stat.secondsPlayed : sum, 0)).toBe(3000)
    expect(stats.filter((stat) => stat.playerId === bench)).toHaveLength(1)
  })

  it('does not invent time between same-clock foul/free-throw events and rejects impossible timelines', () => {
    const simulation = createSimulation([periodStart(1, 600), foul(AWAY_PLAYERS[0]!), freeThrowAt(3, 300, HOME_PLAYERS[0]!, true), freeThrowAt(4, 300, HOME_PLAYERS[0]!, false), periodEnd(5, 0)])
    const stats = calculateMatchPlayerStats(simulation)
    expect(stats.find((stat) => stat.playerId === HOME_PLAYERS[0]!)?.secondsPlayed).toBe(600)
    expect(() => calculateMatchPlayerStats(createSimulation([periodStart(1, 600), turnoverAt(2, 240), turnoverAt(3, 300)]) )).toThrow('clock cannot increase')
    expect(() => calculateMatchPlayerStats(createSimulation([periodStart(1, -1)]) )).toThrow('clock cannot be negative')
    expect(() => calculateMatchPlayerStats(createSimulation([periodStart(1, 600), periodStartAt(2, 2, 600), turnoverAtPeriod(3, 1, 500)]) )).toThrow('period cannot move backwards')
  })

  it('keeps partial minutes anti-spoiler and gives a productive regulation match 12000 player-seconds per team', () => {
    const simulation = prepareUserMatch(createNewGame())
    const stats = calculateMatchPlayerStats(simulation)
    const homeIds = new Set(simulation.lineups.home)
    const awayIds = new Set(simulation.lineups.away)
    for (const event of simulation.events) if (event.type === 'substitution' && event.teamId === simulation.homeTeamId) homeIds.add(event.playerInId)
    for (const event of simulation.events) if (event.type === 'substitution' && event.teamId === simulation.awayTeamId) awayIds.add(event.playerInId)
    expect(stats.filter((stat) => homeIds.has(stat.playerId)).reduce((sum, stat) => sum + stat.secondsPlayed, 0)).toBe(12000)
    expect(stats.filter((stat) => awayIds.has(stat.playerId)).reduce((sum, stat) => sum + stat.secondsPlayed, 0)).toBe(12000)
    const firstSubstitutionIndex = simulation.events.findIndex((event) => event.type === 'substitution')
    const partial = calculateMatchPlayerStats(simulation, simulation.events.slice(0, firstSubstitutionIndex))
    expect(partial).toHaveLength(simulation.squads.home.length + simulation.squads.away.length)
  })

  it('keeps advanced shooting and plus-minus invariants for a complete match', () => {
    const simulation = prepareUserMatch(createNewGame())
    const stats = calculateMatchPlayerStats(simulation)
    for (const stat of stats) {
      expect(stat.fieldGoalsMade).toBe(stat.twoPointMade + stat.threePointMade)
      expect(stat.fieldGoalsAttempted).toBe(stat.twoPointAttempted + stat.threePointAttempted)
      expect(stat.points).toBe(stat.twoPointMade * 2 + stat.threePointMade * 3 + stat.freeThrowsMade)
      expect(stat.rebounds).toBe(stat.offensiveRebounds + stat.defensiveRebounds)
    }
    const homePlusMinus = stats.filter((stat) => simulation.squads.home.includes(stat.playerId)).reduce((sum, stat) => sum + stat.plusMinus, 0)
    const awayPlusMinus = stats.filter((stat) => simulation.squads.away.includes(stat.playerId)).reduce((sum, stat) => sum + stat.plusMinus, 0)
    expect(homePlusMinus).toBe(5 * (simulation.finalScore.home - simulation.finalScore.away))
    expect(awayPlusMinus).toBe(-homePlusMinus)
  })
})

function createSimulation(events: readonly MatchEvent[]): MatchSimulation {
  return {
    gameId: gameIdFromString('test-game'),
    homeTeamId: HOME_TEAM_ID,
    awayTeamId: AWAY_TEAM_ID,
    lineups: { home: HOME_PLAYERS, away: AWAY_PLAYERS },
    squads: { home: HOME_PLAYERS, away: AWAY_PLAYERS },
    events,
    finalScore: { home: 0, away: 0 },
  }
}

function madeShot(playerId: typeof HOME_PLAYERS[number], points: 2 | 3, assistPlayerId?: typeof HOME_PLAYERS[number]): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'shotMade', teamId: HOME_TEAM_ID, playerId, defenderPlayerId: AWAY_PLAYERS[0]!, ...(assistPlayerId === undefined ? {} : { assistPlayerId }), points, shotZone: points === 3 ? 'threePoint' : 'rim', homeScore: 0, awayScore: 0 }
}

function missedShot(playerId: typeof HOME_PLAYERS[number]): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'shotMissed', teamId: HOME_TEAM_ID, playerId, defenderPlayerId: AWAY_PLAYERS[0]!, shotZone: 'rim', homeScore: 0, awayScore: 0 }
}

function turnover(playerId: typeof HOME_PLAYERS[number]): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'turnover', teamId: HOME_TEAM_ID, playerId, homeScore: 0, awayScore: 0 }
}

function rebound(playerId: typeof HOME_PLAYERS[number], reboundType: 'offensive' | 'defensive'): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'rebound', teamId: reboundType === 'offensive' ? HOME_TEAM_ID : AWAY_TEAM_ID, playerId, reboundType, homeScore: 0, awayScore: 0 }
}

function foul(playerId: typeof HOME_PLAYERS[number]): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'foul', teamId: AWAY_TEAM_ID, playerId, foulType: 'shooting', homeScore: 0, awayScore: 0 }
}

function freeThrow(playerId: typeof HOME_PLAYERS[number], made: boolean): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: made ? 'freeThrowMade' : 'freeThrowMissed', teamId: HOME_TEAM_ID, playerId, homeScore: made ? 1 : 0, awayScore: 0 }
}

function substitution(playerOutId: PlayerId, playerInId: PlayerId): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'substitution', teamId: HOME_TEAM_ID, playerOutId, playerInId, homeScore: 0, awayScore: 0 }
}

function periodStart(sequence: number, clockSecondsRemaining: number): MatchEvent { return { sequence, period: 1, clockSecondsRemaining, type: 'periodStart', homeScore: 0, awayScore: 0 } }
function periodStartAt(sequence: number, period: number, clockSecondsRemaining: number): MatchEvent { return { ...periodStart(sequence, clockSecondsRemaining), period } }
function periodEnd(sequence: number, clockSecondsRemaining: 0): MatchEvent { return { sequence, period: 1, clockSecondsRemaining, type: 'periodEnd', homeScore: 0, awayScore: 0 } }
function gameEnd(sequence: number, clockSecondsRemaining: 0): MatchEvent { return { sequence, period: 1, clockSecondsRemaining, type: 'gameEnd', homeScore: 0, awayScore: 0 } }
function substitutionAt(sequence: number, clockSecondsRemaining: number, playerOutId: PlayerId, playerInId: PlayerId): MatchEvent { return { sequence, period: 1, clockSecondsRemaining, type: 'substitution', teamId: HOME_TEAM_ID, playerOutId, playerInId, homeScore: 0, awayScore: 0 } }
function turnoverAt(sequence: number, clockSecondsRemaining: number): MatchEvent { return { sequence, period: 1, clockSecondsRemaining, type: 'turnover', teamId: HOME_TEAM_ID, playerId: HOME_PLAYERS[0]!, homeScore: 0, awayScore: 0 } }
function turnoverAtPeriod(sequence: number, period: number, clockSecondsRemaining: number): MatchEvent { return { ...turnoverAt(sequence, clockSecondsRemaining), period } }
function freeThrowAt(sequence: number, clockSecondsRemaining: number, playerId: PlayerId, made: boolean): MatchEvent { return { sequence, period: 1, clockSecondsRemaining, type: made ? 'freeThrowMade' : 'freeThrowMissed', teamId: HOME_TEAM_ID, playerId, homeScore: made ? 1 : 0, awayScore: 0 } }
function foulAt(sequence: number, clockSecondsRemaining: number, playerId: PlayerId): MatchEvent { return { sequence, period: 1, clockSecondsRemaining, type: 'foul', teamId: AWAY_TEAM_ID, playerId, foulType: 'shooting', homeScore: 0, awayScore: 0 } }
