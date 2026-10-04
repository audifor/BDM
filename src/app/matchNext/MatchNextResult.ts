import type { GameWorld } from '@/domain/world'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { PlayerGameStatsSnapshot } from '@/domain/stats/MatchStatLog'
import type { MatchNextEvent, MatchSetup, MatchState } from '@/engine/match-next'

export type MatchNextTeamStats = Omit<PlayerGameStatsSnapshot, 'playerId' | 'secondsPlayed' | 'plusMinus'>

export interface MatchNextPbpLine {
  readonly sequence: number
  readonly t: number
  readonly period: number
  readonly gameClockTenths: number
  readonly teamId?: TeamId
  readonly playerId?: PlayerId
  readonly targetPlayerId?: PlayerId
  readonly substitutionReason?: string
  readonly type: 'score' | 'miss' | 'rebound' | 'pass' | 'turnover' | 'drive' | 'period' | 'substitution' | 'foul' | 'freeThrow' | 'steal' | 'block'
  readonly text: string
}

export interface MatchNextResult {
  readonly engine: 'match-next'
  readonly gameId: MatchState['gameId']
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly matchSeed: number
  readonly score: { readonly home: number; readonly away: number }
  readonly events: readonly MatchNextEvent[]
  readonly playByPlay: readonly MatchNextPbpLine[]
  readonly playerStats: readonly PlayerGameStatsSnapshot[]
  readonly teamStats: { readonly home: MatchNextTeamStats; readonly away: MatchNextTeamStats }
  readonly possessionSummary: {
    readonly total: number
    readonly home: number
    readonly away: number
    readonly offensiveRebounds: number
  }
  readonly finalState: MatchState
}

export function createMatchNextResult(setup: MatchSetup, finalState: MatchState): MatchNextResult {
  if (!finalState.isComplete || !finalState.events.some((event) => event.type === 'gameEnd')) throw new Error('Match Next result requires a completed state')
  if (finalState.gameId !== setup.gameId || finalState.homeTeamId !== setup.homeTeamId || finalState.awayTeamId !== setup.awayTeamId) throw new Error('Completed Match Next state does not match setup')
  const playerStats = derivePlayerStats(setup, finalState)
  const homeIds = new Set(setup.homeSquad)
  const awayIds = new Set(setup.awaySquad)
  return {
    engine: 'match-next',
    gameId: finalState.gameId,
    homeTeamId: finalState.homeTeamId,
    awayTeamId: finalState.awayTeamId,
    matchSeed: setup.matchSeed,
    score: { ...finalState.score },
    events: finalState.events.map((event) => ({ ...event })),
    playByPlay: projectMatchNextPlayByPlay(finalState.events),
    playerStats,
    teamStats: {
      home: sumStats(playerStats.filter((line) => homeIds.has(line.playerId))),
      away: sumStats(playerStats.filter((line) => awayIds.has(line.playerId))),
    },
    possessionSummary: {
      total: finalState.possessions.length,
      home: finalState.possessions.filter((item) => item.teamId === setup.homeTeamId).length,
      away: finalState.possessions.filter((item) => item.teamId === setup.awayTeamId).length,
      offensiveRebounds: finalState.possessions.reduce((total, item) => total + item.offensiveRebounds, 0),
    },
    finalState,
  }
}

export function projectMatchNextPlayByPlay(events: readonly MatchNextEvent[]): readonly MatchNextPbpLine[] {
  const lines: MatchNextPbpLine[] = []
  const add = (event: MatchNextEvent, type: MatchNextPbpLine['type'], text: string, playerId?: PlayerId, targetPlayerId?: PlayerId, substitutionReason?: string) => {
    lines.push({ sequence: event.sequence, t: event.t, period: event.period, gameClockTenths: event.gameClockTenths, ...(event.teamId ? { teamId: event.teamId } : {}), ...(playerId ? { playerId } : {}), ...(targetPlayerId ? { targetPlayerId } : {}), ...(substitutionReason === undefined ? {} : { substitutionReason }), type, text })
  }
  for (const event of events) {
    if (event.type === 'passReceived' && event.passerPlayerId && event.receiverPlayerId) add(event, 'pass', 'passed to', event.passerPlayerId, event.receiverPlayerId)
    if (event.type === 'steal' && event.playerId) add(event, 'steal', `stole the ball (${(event.stealKind ?? 'steal').toLocaleLowerCase().replace('_', ' ')})`, event.playerId, event.victimPlayerId)
    if (event.type === 'turnover' && event.playerId) add(event, 'turnover', `turnover (${(event.turnoverType ?? 'turnover').toLocaleLowerCase().replace('_', ' ')})`, event.playerId)
    if (event.type === 'foul' && event.playerId) add(event, 'foul', `${(event.foulType ?? 'personal').toLocaleLowerCase().replace('_', ' ')} foul`, event.playerId, event.victimPlayerId)
    if (event.type === 'freeThrowMade' && event.playerId) add(event, 'score', `made free throw ${event.freeThrowIndex ?? 1} of ${event.freeThrowTotal ?? 1}`, event.playerId)
    if (event.type === 'freeThrowMissed' && event.playerId) add(event, 'freeThrow', `missed free throw ${event.freeThrowIndex ?? 1} of ${event.freeThrowTotal ?? 1}`, event.playerId)
    if (event.type === 'shotBlocked' && event.playerId) add(event, 'block', 'blocked the shot of', event.playerId, event.shooterPlayerId)
    if (event.type === 'shotMade' && event.shooterPlayerId && event.points) add(event, 'score', `made ${event.points}-point shot`, event.shooterPlayerId)
    if (event.type === 'shotMissed' && event.shooterPlayerId) add(event, 'miss', 'missed shot', event.shooterPlayerId)
    if (event.type === 'reboundSecured' && event.playerId && event.reboundType) add(event, 'rebound', `${event.reboundType} rebound`, event.playerId)
    if (event.type === 'looseBallRecovered' && event.playerId) add(event, 'rebound', 'recovered loose ball', event.playerId)
    if (event.type === 'actionResolved' && event.actionKind === 'DRIVE' && event.actionOutcome) add(event, 'drive', `drive ${event.actionOutcome.toLocaleLowerCase()}`, event.playerId)
    if (event.type === 'periodStart') add(event, 'period', 'period started')
    if (event.type === 'jumpBallResolved' && event.playerId) add(event, 'period', 'won the opening tip', event.playerId)
    if (event.type === 'periodEnd') add(event, 'period', 'period ended')
    if (event.type === 'substitution' && event.playerId && event.outgoingPlayerId) {
      add(event, 'substitution', 'substitution', event.playerId, event.outgoingPlayerId, event.substitutionReason)
    }
  }
  return lines
}

export function createMatchStatLogFromMatchNext(world: GameWorld, result: MatchNextResult) {
  const game = world.games[result.gameId]
  if (!game) throw new Error(`Cannot create Match Next stats for missing Game ${result.gameId}`)
  if (game.homeTeamId !== result.homeTeamId || game.awayTeamId !== result.awayTeamId) throw new Error('Match Next result does not match Game teams')
  const homePoints = sumStat(result.playerStats.filter((line) => world.teams[game.homeTeamId]!.rosterPlayerIds.includes(line.playerId)), 'points')
  const awayPoints = sumStat(result.playerStats.filter((line) => world.teams[game.awayTeamId]!.rosterPlayerIds.includes(line.playerId)), 'points')
  if (homePoints !== result.score.home || awayPoints !== result.score.away) throw new Error(`Match Next player points do not match final score: ${homePoints}-${awayPoints} vs ${result.score.home}-${result.score.away}`)
  return {
    gameId: game.id,
    competitionId: game.competitionId,
    seasonId: game.seasonId,
    gameDate: game.date,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    finalScore: { ...result.score },
    playerLines: result.playerStats.map((stats) => {
      const isHome = world.teams[game.homeTeamId]!.rosterPlayerIds.includes(stats.playerId)
      const teamId = isHome ? game.homeTeamId : game.awayTeamId
      return {
        playerId: stats.playerId,
        teamId,
        opponentTeamId: isHome ? game.awayTeamId : game.homeTeamId,
        isHome,
        started: result.finalState.players.some((player) => player.playerId === stats.playerId && player.started === true),
        stats: { ...stats },
      }
    }),
  }
}

function derivePlayerStats(setup: MatchSetup, state: MatchState): PlayerGameStatsSnapshot[] {
  const totals = new Map<PlayerId, PlayerGameStatsSnapshot>([...setup.homeSquad, ...setup.awaySquad].map((playerId) => [playerId, emptyStats(playerId)]))
  for (const squad of [setup.homeSquad, setup.awaySquad]) {
    for (const [playerId, seconds] of wholeSecondsPlayed(squad, state.courtTimeTenthsByPlayerId ?? {})) update(totals, playerId, { secondsPlayed: seconds })
  }
  let homeLineup = new Set(setup.initialLineups.home)
  let awayLineup = new Set(setup.initialLineups.away)
  let homeScore = 0
  let awayScore = 0
  for (const event of state.events) {
    if (event.type === 'shotReleased' && event.shooterPlayerId) update(totals, event.shooterPlayerId, {
      fieldGoalsAttempted: 1,
      ...(event.points === 3 ? { threePointAttempted: 1 } : { twoPointAttempted: 1 }),
    })
    if (event.type === 'shotMade' && event.shooterPlayerId && event.points) update(totals, event.shooterPlayerId, {
      points: event.points,
      fieldGoalsMade: 1,
      ...(event.points === 3 ? { threePointMade: 1 } : { twoPointMade: 1 }),
    })
    if (event.type === 'reboundSecured' && event.playerId && event.reboundType) update(totals, event.playerId, {
      rebounds: 1,
      ...(event.reboundType === 'offensive' ? { offensiveRebounds: 1 } : { defensiveRebounds: 1 }),
    })
    if (event.type === 'freeThrowMade' && event.shooterPlayerId) update(totals, event.shooterPlayerId, { points: 1, freeThrowsMade: 1, freeThrowsAttempted: 1 })
    if (event.type === 'freeThrowMissed' && event.shooterPlayerId) update(totals, event.shooterPlayerId, { freeThrowsAttempted: 1 })
    if (event.type === 'steal' && event.playerId) update(totals, event.playerId, { steals: 1 })
    if (event.type === 'shotBlocked' && event.playerId) update(totals, event.playerId, { blocks: 1 })
    if (event.type === 'turnover' && event.playerId) update(totals, event.playerId, { turnovers: 1 })
    if (event.type === 'foul' && event.playerId) update(totals, event.playerId, { foulsCommitted: 1 })
    if (event.type === 'assist' && event.playerId) update(totals, event.playerId, { assists: 1 })
    const scored = event.type === 'shotMade' || event.type === 'freeThrowMade' ? event.points ?? 0 : 0
    const scoreDeltaHome = event.teamId === setup.homeTeamId ? scored : 0
    const scoreDeltaAway = event.teamId === setup.awayTeamId ? scored : 0
    if (scoreDeltaHome !== 0 || scoreDeltaAway !== 0) {
      const margin = scoreDeltaHome - scoreDeltaAway
      for (const playerId of homeLineup) update(totals, playerId, { plusMinus: margin })
      for (const playerId of awayLineup) update(totals, playerId, { plusMinus: -margin })
      homeScore += scoreDeltaHome
      awayScore += scoreDeltaAway
    }
    if (event.type === 'substitution' && event.playerId !== undefined && event.outgoingPlayerId !== undefined) {
      const lineup = event.teamId === setup.homeTeamId ? homeLineup : event.teamId === setup.awayTeamId ? awayLineup : undefined
      if (lineup === undefined || !lineup.has(event.outgoingPlayerId) || lineup.has(event.playerId)) throw new Error('Match Next substitution event does not match the active lineup')
      lineup.delete(event.outgoingPlayerId)
      lineup.add(event.playerId)
    }
  }
  if (homeScore !== state.score.home || awayScore !== state.score.away) throw new Error('Match Next score does not match canonical shot events')
  return [...totals.values()]
}

function emptyStats(playerId: PlayerId): PlayerGameStatsSnapshot {
  return { playerId, secondsPlayed: 0, points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, twoPointMade: 0, twoPointAttempted: 0, threePointMade: 0, threePointAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, foulsCommitted: 0, plusMinus: 0 }
}

/**
 * The persisted stat contract (MatchStatLog, Save V4) counts whole seconds, while court time is measured in 0.1 s ticks.
 * Largest-remainder rounding per team keeps every line an integer and the team total equal to its rounded court time (5 x game length).
 */
function wholeSecondsPlayed(squad: readonly PlayerId[], tenthsByPlayerId: Readonly<Record<PlayerId, number>>): Map<PlayerId, number> {
  const exact = squad.map((playerId) => ({ playerId, tenths: tenthsByPlayerId[playerId] ?? 0 }))
  const target = Math.round(exact.reduce((sum, item) => sum + item.tenths, 0) / 10)
  const seconds = new Map(exact.map((item) => [item.playerId, Math.floor(item.tenths / 10)]))
  const missing = target - [...seconds.values()].reduce((sum, value) => sum + value, 0)
  const byRemainder = [...exact].sort((a, b) => (b.tenths % 10) - (a.tenths % 10) || String(a.playerId).localeCompare(String(b.playerId)))
  for (const item of byRemainder.slice(0, Math.max(0, missing))) seconds.set(item.playerId, seconds.get(item.playerId)! + 1)
  return seconds
}

function update(totals: Map<PlayerId, PlayerGameStatsSnapshot>, playerId: PlayerId, delta: Partial<Omit<PlayerGameStatsSnapshot, 'playerId'>>): void {
  const current = totals.get(playerId)
  if (!current) throw new Error(`Match Next event references unknown player ${playerId}`)
  const next = { ...current } as Record<keyof PlayerGameStatsSnapshot, number | PlayerId>
  for (const [key, value] of Object.entries(delta)) {
    const statKey = key as keyof Omit<PlayerGameStatsSnapshot, 'playerId'>
    next[statKey] = (current[statKey] as number) + (value as number)
  }
  totals.set(playerId, next as PlayerGameStatsSnapshot)
}

function sumStats(players: readonly PlayerGameStatsSnapshot[]): MatchNextTeamStats {
  let result = emptyTeamStats()
  for (const player of players) {
    const next = { ...result }
    for (const key of Object.keys(result) as (keyof MatchNextTeamStats)[]) next[key] = result[key] + player[key]
    result = next
  }
  return result
}

function emptyTeamStats(): MatchNextTeamStats {
  const { playerId: _playerId, secondsPlayed: _seconds, plusMinus: _plusMinus, ...stats } = emptyStats('team-total' as PlayerId)
  return stats
}

function sumStat(players: readonly PlayerGameStatsSnapshot[], stat: keyof MatchNextTeamStats): number {
  return players.reduce((sum, player) => sum + player[stat], 0)
}
