import type { PlayerId } from '@/domain/ids'

import type { MatchEvent, MatchSimulation } from './MatchEngine'

export interface PlayerMatchStats {
  readonly playerId: PlayerId
  readonly points: number
  readonly fieldGoalsMade: number
  readonly fieldGoalsAttempted: number
  readonly turnovers: number
  readonly offensiveRebounds: number
  readonly defensiveRebounds: number
  readonly rebounds: number
  readonly assists: number
  readonly freeThrowsMade: number
  readonly freeThrowsAttempted: number
  readonly foulsCommitted: number
}

/** Derives a boxscore from an explicit event subset without mutating the simulation. */
export function calculateMatchPlayerStats(
  simulation: MatchSimulation,
  events: readonly MatchEvent[] = simulation.events,
): readonly PlayerMatchStats[] {
  const playerIds = [...simulation.lineups.home, ...simulation.lineups.away]
  const statsByPlayerId = new Map<PlayerId, PlayerMatchStats>(
    playerIds.map((playerId) => [playerId, emptyStats(playerId)]),
  )

  for (const event of events) {
    if (event.type !== 'shotMade' && event.type !== 'shotMissed' && event.type !== 'turnover' && event.type !== 'rebound' && event.type !== 'foul' && event.type !== 'freeThrowMade' && event.type !== 'freeThrowMissed') continue

    const stats = statsByPlayerId.get(event.playerId)
    if (stats === undefined) {
      throw new Error(`Sporting event references Player outside MatchSimulation lineups: ${event.playerId}`)
    }

    statsByPlayerId.set(event.playerId, applyEvent(stats, event))

    if (event.type === 'shotMade' && event.assistPlayerId !== undefined) {
      const assisterStats = statsByPlayerId.get(event.assistPlayerId)
      if (assisterStats === undefined) {
        throw new Error(`ShotMade assist references Player outside MatchSimulation lineups: ${event.assistPlayerId}`)
      }
      if (event.assistPlayerId === event.playerId) {
        throw new Error(`ShotMade scorer cannot assist themselves: ${event.playerId}`)
      }
      statsByPlayerId.set(event.assistPlayerId, { ...assisterStats, assists: assisterStats.assists + 1 })
    }
  }

  return playerIds.map((playerId) => statsByPlayerId.get(playerId)!)
}

function emptyStats(playerId: PlayerId): PlayerMatchStats {
  return {
    playerId,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    turnovers: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    rebounds: 0,
    assists: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    foulsCommitted: 0,
  }
}

function applyEvent(stats: PlayerMatchStats, event: Extract<MatchEvent, { readonly playerId: PlayerId }>): PlayerMatchStats {
  if (event.type === 'shotMade') {
    const isFieldGoal = event.points === 2 || event.points === 3
    return {
      ...stats,
      points: stats.points + event.points,
      fieldGoalsMade: stats.fieldGoalsMade + (isFieldGoal ? 1 : 0),
      fieldGoalsAttempted: stats.fieldGoalsAttempted + (isFieldGoal ? 1 : 0),
    }
  }
  if (event.type === 'shotMissed') {
    return { ...stats, fieldGoalsAttempted: stats.fieldGoalsAttempted + 1 }
  }
  if (event.type === 'rebound') {
    return event.reboundType === 'offensive'
      ? { ...stats, offensiveRebounds: stats.offensiveRebounds + 1, rebounds: stats.rebounds + 1 }
      : { ...stats, defensiveRebounds: stats.defensiveRebounds + 1, rebounds: stats.rebounds + 1 }
  }
  if (event.type === 'foul') {
    return { ...stats, foulsCommitted: stats.foulsCommitted + 1 }
  }
  if (event.type === 'freeThrowMade') {
    return { ...stats, points: stats.points + 1, freeThrowsMade: stats.freeThrowsMade + 1, freeThrowsAttempted: stats.freeThrowsAttempted + 1 }
  }
  if (event.type === 'freeThrowMissed') {
    return { ...stats, freeThrowsAttempted: stats.freeThrowsAttempted + 1 }
  }
  return { ...stats, turnovers: stats.turnovers + 1 }
}
