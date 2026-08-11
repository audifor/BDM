import type { PlayerId, TeamId } from '@/domain/ids'

import { calculateActiveLineups, type MatchEvent, type MatchLineups, type MatchSimulation } from './MatchEngine'

export interface PlayerMatchStats {
  readonly playerId: PlayerId
  readonly secondsPlayed: number
  readonly points: number
  readonly fieldGoalsMade: number
  readonly fieldGoalsAttempted: number
  readonly twoPointMade: number
  readonly twoPointAttempted: number
  readonly threePointMade: number
  readonly threePointAttempted: number
  readonly freeThrowsMade: number
  readonly freeThrowsAttempted: number
  readonly offensiveRebounds: number
  readonly defensiveRebounds: number
  readonly rebounds: number
  readonly assists: number
  readonly steals: number
  readonly blocks: number
  readonly turnovers: number
  readonly foulsCommitted: number
  readonly plusMinus: number
}

export interface TeamMatchStats extends Omit<PlayerMatchStats, 'playerId' | 'secondsPlayed' | 'plusMinus'> {}

/** Derives the complete boxscore from visible timeline events and transient MatchSquads. */
export function calculateMatchPlayerStats(simulation: MatchSimulation, events: readonly MatchEvent[] = simulation.events): readonly PlayerMatchStats[] {
  const playerIds = [...simulation.squads.home, ...simulation.squads.away]
  const stats = new Map(playerIds.map((playerId) => [playerId, emptyStats(playerId)]))
  let active = simulation.lineups
  let period: number | undefined
  let previousClock: number | undefined
  let homeScore = 0
  let awayScore = 0
  for (const event of events) {
    if (period !== undefined && event.period < period) throw new Error('Match event period cannot move backwards')
    if (event.clockSecondsRemaining < 0) throw new Error('Match event clock cannot be negative')
    if (period !== undefined && event.period > period && event.type !== 'periodStart') throw new Error('Match event period must start explicitly')
    if (event.type === 'periodStart') { period = event.period; previousClock = event.clockSecondsRemaining; continue }
    if (period === undefined) period = event.period
    if (previousClock !== undefined && event.period === period && event.clockSecondsRemaining > previousClock) throw new Error('Match event clock cannot increase within a period')
    const elapsed = previousClock === undefined ? 0 : Math.max(0, previousClock - event.clockSecondsRemaining)
    addSeconds(stats, active, elapsed)
    previousClock = event.clockSecondsRemaining
    if (event.type === 'substitution') { if (!stats.has(event.playerInId)) { playerIds.push(event.playerInId); stats.set(event.playerInId, emptyStats(event.playerInId)) }; active = calculateActiveLineups(active, simulation.homeTeamId, simulation.awayTeamId, [event]); continue }
    const scoreDeltaHome = event.homeScore - homeScore
    const scoreDeltaAway = event.awayScore - awayScore
    if (scoreDeltaHome !== 0 || scoreDeltaAway !== 0) addPlusMinus(stats, active, scoreDeltaHome - scoreDeltaAway)
    homeScore = event.homeScore; awayScore = event.awayScore
    if (!('playerId' in event)) continue
    const teamLineup = event.teamId === simulation.homeTeamId ? active.home : event.teamId === simulation.awayTeamId ? active.away : undefined
    if (teamLineup === undefined || !teamLineup.includes(event.playerId)) throw new Error(`Sporting event references Player outside active MatchSimulation lineup: ${event.playerId}`)
    set(stats, event.playerId, applyEvent(stats.get(event.playerId)!, event))
    if (event.type === 'shotMade' && event.assistPlayerId !== undefined) credit(stats, event.assistPlayerId, active, event.teamId, 'assists')
    if (event.type === 'turnover' && event.stealPlayerId !== undefined) credit(stats, event.stealPlayerId, active, otherTeam(event.teamId, simulation), 'steals')
    if (event.type === 'shotMissed' && event.blockedByPlayerId !== undefined) {
      if (event.blockedByPlayerId !== event.defenderPlayerId) throw new Error('ShotMissed block must belong to primary defender')
      credit(stats, event.blockedByPlayerId, active, otherTeam(event.teamId, simulation), 'blocks')
    }
  }
  return playerIds.map((playerId) => stats.get(playerId)!)
}

export function calculateTeamMatchStats(players: readonly PlayerMatchStats[], teamPlayerIds: readonly PlayerId[]): TeamMatchStats {
  return teamPlayerIds.reduce<TeamMatchStats>((total, playerId) => addTotals(total, players.find((player) => player.playerId === playerId) ?? emptyStats(playerId)), emptyTeamStats())
}

function emptyStats(playerId: PlayerId): PlayerMatchStats { return { playerId, secondsPlayed: 0, points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, twoPointMade: 0, twoPointAttempted: 0, threePointMade: 0, threePointAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, foulsCommitted: 0, plusMinus: 0 } }
function emptyTeamStats(): TeamMatchStats { const { playerId: _playerId, secondsPlayed: _seconds, plusMinus: _plusMinus, ...total } = emptyStats('total' as PlayerId); return total }
function set(stats: Map<PlayerId, PlayerMatchStats>, playerId: PlayerId, value: PlayerMatchStats): void { stats.set(playerId, value) }
function addSeconds(stats: Map<PlayerId, PlayerMatchStats>, lineups: MatchLineups, seconds: number): void { for (const id of [...lineups.home, ...lineups.away]) set(stats, id, { ...stats.get(id)!, secondsPlayed: stats.get(id)!.secondsPlayed + seconds }) }
function addPlusMinus(stats: Map<PlayerId, PlayerMatchStats>, lineups: MatchLineups, homeDelta: number): void { for (const id of lineups.home) set(stats, id, { ...stats.get(id)!, plusMinus: stats.get(id)!.plusMinus + homeDelta }); for (const id of lineups.away) set(stats, id, { ...stats.get(id)!, plusMinus: stats.get(id)!.plusMinus - homeDelta }) }
function otherTeam(teamId: TeamId, simulation: MatchSimulation): TeamId { return teamId === simulation.homeTeamId ? simulation.awayTeamId : simulation.homeTeamId }
function credit(stats: Map<PlayerId, PlayerMatchStats>, playerId: PlayerId, active: MatchLineups, teamId: TeamId, field: 'assists' | 'steals' | 'blocks'): void { const lineup = teamId === undefined ? undefined : active.home.includes(playerId) || active.away.includes(playerId); if (!lineup || !stats.has(playerId)) throw new Error(`Stat attribution references Player outside active MatchSimulation lineup: ${playerId}`); const player = stats.get(playerId)!; set(stats, playerId, { ...player, [field]: player[field] + 1 }) }
function applyEvent(stats: PlayerMatchStats, event: Extract<MatchEvent, { readonly playerId: PlayerId }>): PlayerMatchStats {
  if (event.type === 'shotMade' || event.type === 'shotMissed') { const two = event.shotZone !== 'threePoint'; const made = event.type === 'shotMade'; return { ...stats, points: stats.points + (made ? event.points : 0), fieldGoalsMade: stats.fieldGoalsMade + (made ? 1 : 0), fieldGoalsAttempted: stats.fieldGoalsAttempted + 1, twoPointMade: stats.twoPointMade + (two && made ? 1 : 0), twoPointAttempted: stats.twoPointAttempted + (two ? 1 : 0), threePointMade: stats.threePointMade + (!two && made ? 1 : 0), threePointAttempted: stats.threePointAttempted + (!two ? 1 : 0) } }
  if (event.type === 'rebound') return event.reboundType === 'offensive' ? { ...stats, offensiveRebounds: stats.offensiveRebounds + 1, rebounds: stats.rebounds + 1 } : { ...stats, defensiveRebounds: stats.defensiveRebounds + 1, rebounds: stats.rebounds + 1 }
  if (event.type === 'foul') return { ...stats, foulsCommitted: stats.foulsCommitted + 1 }
  if (event.type === 'freeThrowMade') return { ...stats, points: stats.points + 1, freeThrowsMade: stats.freeThrowsMade + 1, freeThrowsAttempted: stats.freeThrowsAttempted + 1 }
  if (event.type === 'freeThrowMissed') return { ...stats, freeThrowsAttempted: stats.freeThrowsAttempted + 1 }
  return { ...stats, turnovers: stats.turnovers + 1 }
}
function addTotals(total: TeamMatchStats, player: PlayerMatchStats): TeamMatchStats { const { playerId: _id, secondsPlayed: _seconds, plusMinus: _plusMinus, ...numbers } = player; return Object.fromEntries(Object.entries(total as Record<string, number>).map(([key, value]) => [key, value + (numbers[key as keyof typeof numbers] as number)])) as TeamMatchStats }
