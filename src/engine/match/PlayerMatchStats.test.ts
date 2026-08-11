import { describe, expect, it } from 'vitest'

import { createNewGame, prepareUserMatch } from '@/app/game'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'

import { calculateMatchPlayerStats } from './PlayerMatchStats'
import type { MatchEvent, MatchSimulation } from './MatchEngine'

const HOME_PLAYERS = Array.from({ length: 5 }, (_, index) => playerIdFromString(`home-player-${index}`))
const AWAY_PLAYERS = Array.from({ length: 5 }, (_, index) => playerIdFromString(`away-player-${index}`))
const HOME_TEAM_ID = teamIdFromString('home-team')
const AWAY_TEAM_ID = teamIdFromString('away-team')

describe('PlayerMatchStats', () => {
  it('derives made 2s, made 3s, made 1s, misses, turnovers, and zero-action players', () => {
    const simulation = createSimulation([
      madeShot(HOME_PLAYERS[0]!, 2),
      madeShot(HOME_PLAYERS[1]!, 3),
      madeShot(HOME_PLAYERS[2]!, 1),
      missedShot(HOME_PLAYERS[3]!),
      turnover(HOME_PLAYERS[4]!),
    ])
    const stats = calculateMatchPlayerStats(simulation)

    expect(stats).toHaveLength(10)
    expect(stats.map((stat) => stat.playerId)).toEqual([...HOME_PLAYERS, ...AWAY_PLAYERS])
    expect(new Set(stats.map((stat) => stat.playerId)).size).toBe(10)
    expect(stats[0]).toMatchObject({ points: 2, fieldGoalsMade: 1, fieldGoalsAttempted: 1, turnovers: 0 })
    expect(stats[1]).toMatchObject({ points: 3, fieldGoalsMade: 1, fieldGoalsAttempted: 1, turnovers: 0 })
    expect(stats[2]).toMatchObject({ points: 1, fieldGoalsMade: 0, fieldGoalsAttempted: 0, turnovers: 0 })
    expect(stats[3]).toMatchObject({ points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 1, turnovers: 0 })
    expect(stats[4]).toMatchObject({ points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, turnovers: 1 })
    expect(stats[5]).toMatchObject({ points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, turnovers: 0 })
  })

  it('reconstructs a complete simulation and does not mutate it', () => {
    const simulation = prepareUserMatch(createNewGame())
    const before = JSON.stringify(simulation)
    const stats = calculateMatchPlayerStats(simulation)
    const homePlayers = new Set(simulation.lineups.home)
    const fieldGoals = simulation.events.filter((event) => event.type === 'shotMade' && event.points !== 1)

    expect(stats.filter((stat) => homePlayers.has(stat.playerId)).reduce((total, stat) => total + stat.points, 0)).toBe(simulation.finalScore.home)
    expect(stats.filter((stat) => !homePlayers.has(stat.playerId)).reduce((total, stat) => total + stat.points, 0)).toBe(simulation.finalScore.away)
    expect(stats.reduce((total, stat) => total + stat.fieldGoalsMade, 0)).toBe(fieldGoals.length)
    expect(stats.reduce((total, stat) => total + stat.fieldGoalsAttempted, 0)).toBe(fieldGoals.length + simulation.events.filter((event) => event.type === 'shotMissed').length)
    expect(stats.reduce((total, stat) => total + stat.turnovers, 0)).toBe(simulation.events.filter((event) => event.type === 'turnover').length)
    expect(JSON.stringify(simulation)).toBe(before)
  })

  it('projects only the explicit revealed event subset', () => {
    const simulation = createSimulation([madeShot(HOME_PLAYERS[0]!, 2), madeShot(HOME_PLAYERS[1]!, 3)])
    const partialStats = calculateMatchPlayerStats(simulation, simulation.events.slice(0, 1))

    expect(partialStats[0]!.points).toBe(2)
    expect(partialStats[1]!.points).toBe(0)
    expect(calculateMatchPlayerStats(simulation, simulation.events)).toEqual(calculateMatchPlayerStats(simulation))
  })

  it('rejects sporting events attributed to a Player outside the lineups', () => {
    const simulation = createSimulation([madeShot(playerIdFromString('outside-lineup'), 2)])

    expect(() => calculateMatchPlayerStats(simulation)).toThrow('Sporting event references Player outside MatchSimulation lineups: outside-lineup')
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

function madeShot(playerId: typeof HOME_PLAYERS[number], points: 1 | 2 | 3): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'shotMade', teamId: HOME_TEAM_ID, playerId, points, homeScore: 0, awayScore: 0 }
}

function missedShot(playerId: typeof HOME_PLAYERS[number]): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'shotMissed', teamId: HOME_TEAM_ID, playerId, homeScore: 0, awayScore: 0 }
}

function turnover(playerId: typeof HOME_PLAYERS[number]): MatchEvent {
  return { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'turnover', teamId: HOME_TEAM_ID, playerId, homeScore: 0, awayScore: 0 }
}
