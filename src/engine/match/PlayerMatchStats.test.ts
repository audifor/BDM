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
})

function createSimulation(events: readonly MatchEvent[]): MatchSimulation {
  return {
    gameId: gameIdFromString('test-game'),
    homeTeamId: HOME_TEAM_ID,
    awayTeamId: AWAY_TEAM_ID,
    lineups: { home: HOME_PLAYERS, away: AWAY_PLAYERS },
    events,
    finalScore: { home: 0, away: 0 },
  }
}

function madeShot(playerId: typeof HOME_PLAYERS[number], points: 2 | 3, assistPlayerId?: typeof HOME_PLAYERS[number]): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'shotMade', teamId: HOME_TEAM_ID, playerId, ...(assistPlayerId === undefined ? {} : { assistPlayerId }), points, homeScore: 0, awayScore: 0 }
}

function missedShot(playerId: typeof HOME_PLAYERS[number]): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'shotMissed', teamId: HOME_TEAM_ID, playerId, homeScore: 0, awayScore: 0 }
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
