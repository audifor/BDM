import type { PlayerId } from '@/domain/ids'

import { calculateActiveLineups, type MatchEvent, type MatchLineups, type MatchSimulation } from './MatchEngine'

export interface PlayerMatchStats {
  readonly playerId: PlayerId
  readonly secondsPlayed: number
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
  let activeLineups: MatchLineups = simulation.lineups
  let currentPeriod: number | undefined
  let previousClock: number | undefined

  for (const event of events) {
    validateTimelineEvent(event, currentPeriod, previousClock)
    if (event.clockSecondsRemaining < 0) throw new Error('Match event clock cannot be negative')
    if (event.type === 'periodStart') {
      if (currentPeriod !== undefined && event.period <= currentPeriod) throw new Error('Match event period must advance chronologically')
      currentPeriod = event.period
      previousClock = event.clockSecondsRemaining
      continue
    }
    if (currentPeriod === undefined) currentPeriod = event.period
    const elapsed = previousClock === undefined ? 0 : previousClock - event.clockSecondsRemaining
    if (elapsed > 0) addSecondsPlayed(statsByPlayerId, activeLineups, elapsed)
    previousClock = event.clockSecondsRemaining

    if (event.type === 'substitution') {
      activeLineups = calculateActiveLineups(activeLineups, simulation.homeTeamId, simulation.awayTeamId, [event])
      if (!statsByPlayerId.has(event.playerInId)) {
        playerIds.push(event.playerInId)
        statsByPlayerId.set(event.playerInId, emptyStats(event.playerInId))
      }
      continue
    }
    if (event.type !== 'shotMade' && event.type !== 'shotMissed' && event.type !== 'turnover' && event.type !== 'rebound' && event.type !== 'foul' && event.type !== 'freeThrowMade' && event.type !== 'freeThrowMissed') continue

    const activeLineup = event.teamId === simulation.homeTeamId ? activeLineups.home : event.teamId === simulation.awayTeamId ? activeLineups.away : undefined
    if (activeLineup === undefined || !activeLineup.includes(event.playerId)) {
      throw new Error(`Sporting event references Player outside active MatchSimulation lineup: ${event.playerId}`)
    }

    const stats = statsByPlayerId.get(event.playerId)
    if (stats === undefined) {
      throw new Error(`Sporting event references Player outside MatchSimulation lineups: ${event.playerId}`)
    }

    statsByPlayerId.set(event.playerId, applyEvent(stats, event))

    if (event.type === 'shotMade' && event.assistPlayerId !== undefined) {
      const assisterStats = statsByPlayerId.get(event.assistPlayerId)
      if (assisterStats === undefined || !activeLineup.includes(event.assistPlayerId)) {
        throw new Error(`ShotMade assist references Player outside active MatchSimulation lineup: ${event.assistPlayerId}`)
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
    secondsPlayed: 0,
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

function addSecondsPlayed(statsByPlayerId: Map<PlayerId, PlayerMatchStats>, activeLineups: MatchLineups, seconds: number): void {
  for (const playerId of [...activeLineups.home, ...activeLineups.away]) {
    const stats = statsByPlayerId.get(playerId)
    if (stats === undefined) throw new Error(`Active lineup references unknown Player: ${playerId}`)
    statsByPlayerId.set(playerId, { ...stats, secondsPlayed: stats.secondsPlayed + seconds })
  }
}

function validateTimelineEvent(event: MatchEvent, currentPeriod: number | undefined, previousClock: number | undefined): void {
  if (currentPeriod !== undefined && event.period < currentPeriod) throw new Error('Match event period cannot move backwards')
  if (currentPeriod !== undefined && event.period > currentPeriod && event.type !== 'periodStart') throw new Error('Match event period must start explicitly')
  if (event.type !== 'periodStart' && currentPeriod === event.period && previousClock !== undefined && event.clockSecondsRemaining > previousClock) {
    throw new Error('Match event clock cannot increase within a period')
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
