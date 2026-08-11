import type { PlayerId } from '@/domain/ids'

import type { MatchEvent, MatchSimulation } from './MatchEngine'

export interface PlayerMatchStats {
  readonly playerId: PlayerId
  readonly points: number
  readonly fieldGoalsMade: number
  readonly fieldGoalsAttempted: number
  readonly turnovers: number
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
    if (event.type !== 'shotMade' && event.type !== 'shotMissed' && event.type !== 'turnover') continue

    const stats = statsByPlayerId.get(event.playerId)
    if (stats === undefined) {
      throw new Error(`Sporting event references Player outside MatchSimulation lineups: ${event.playerId}`)
    }

    statsByPlayerId.set(event.playerId, applyEvent(stats, event))
  }

  return playerIds.map((playerId) => statsByPlayerId.get(playerId)!)
}

function emptyStats(playerId: PlayerId): PlayerMatchStats {
  return { playerId, points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, turnovers: 0 }
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
  return { ...stats, turnovers: stats.turnovers + 1 }
}
