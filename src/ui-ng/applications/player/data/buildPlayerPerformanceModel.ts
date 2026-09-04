import type { CompetitionId, GameId, PlayerId, SeasonId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import {
  calculatePlayerStatAverages,
  getPlayerGameLogs,
  getPlayerSeasonStats,
  type PlayerAggregateStats,
} from '@/engine/stats/PlayerHistory'

import { opponentShortCode } from './presentationHelpers'

export type PerformanceCompetitionFilter = 'all' | CompetitionId

export interface PerformanceStatCell {
  readonly label: string
  readonly value: string
}

export interface PerformanceShootingLine {
  readonly label: string
  readonly madePerGame: string
  readonly attemptedPerGame: string
  readonly percentage: string | null
}

export interface PlayerGameLogRow {
  readonly gameId: GameId
  readonly competitionId: CompetitionId
  readonly date: string
  readonly opponent: string
  readonly competition: string
  readonly homeAway: 'H' | 'A'
  readonly result: string
  readonly started: boolean
  readonly minutes: number
  readonly points: number
  readonly rebounds: number
  readonly assists: number
  readonly steals: number
  readonly blocks: number
  readonly turnovers: number
  readonly fouls: number
  readonly fg: string
  readonly threePt: string
  readonly ft: string
  readonly plusMinus: number
}

export interface PerformanceRecentGame {
  readonly gameId: GameId
  readonly date: string
  readonly opponent: string
  readonly points: number
}

export interface PerformanceCompetitionOption {
  readonly id: PerformanceCompetitionFilter
  readonly label: string
}

export interface PerformanceViewSnapshot {
  readonly status: 'empty' | 'available'
  readonly seasonLabel: string
  readonly contextLabel: string
  readonly competitionOptions: readonly PerformanceCompetitionOption[]
  readonly productionPrimary: readonly PerformanceStatCell[]
  readonly productionSecondary: readonly PerformanceStatCell[]
  readonly playingTime: readonly PerformanceStatCell[]
  readonly shooting: readonly PerformanceShootingLine[]
  readonly recentForm: readonly PerformanceRecentGame[]
  readonly seasonAveragePoints: number | undefined
  readonly gameLogs: readonly PlayerGameLogRow[]
}

export interface PlayerPerformanceModel {
  readonly seasonId: SeasonId
  readonly seasonLabel: string
  readonly baseContextLabel: string
  readonly allSeasonSnapshot: PerformanceViewSnapshot
}

function perGame(total: number, gamesPlayed: number): number {
  return gamesPlayed === 0 ? 0 : total / gamesPlayed
}

function formatPercentage(made: number, attempted: number): string | null {
  if (attempted === 0) return null
  return ((made / attempted) * 100).toFixed(1)
}

function formatMadeAttempt(made: number, attempted: number): string {
  return `${made}/${attempted}`
}

function formatOneDecimal(value: number): string {
  return value.toFixed(1)
}

function aggregateFromLogs(
  playerId: PlayerId,
  logs: readonly ReturnType<typeof getPlayerGameLogs>[number][],
): PlayerAggregateStats & { readonly playerId: PlayerId } {
  const total = {
    playerId,
    secondsPlayed: 0,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    twoPointMade: 0,
    twoPointAttempted: 0,
    threePointMade: 0,
    threePointAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    foulsCommitted: 0,
    plusMinus: 0,
    gamesPlayed: 0,
    gamesStarted: 0,
  }

  for (const line of logs) {
    const stats = line.stats
    if (stats.secondsPlayed <= 0) continue
    total.gamesPlayed += 1
    total.gamesStarted += line.started ? 1 : 0
    total.secondsPlayed += stats.secondsPlayed
    total.points += stats.points
    total.fieldGoalsMade += stats.fieldGoalsMade
    total.fieldGoalsAttempted += stats.fieldGoalsAttempted
    total.twoPointMade += stats.twoPointMade
    total.twoPointAttempted += stats.twoPointAttempted
    total.threePointMade += stats.threePointMade
    total.threePointAttempted += stats.threePointAttempted
    total.freeThrowsMade += stats.freeThrowsMade
    total.freeThrowsAttempted += stats.freeThrowsAttempted
    total.offensiveRebounds += stats.offensiveRebounds
    total.defensiveRebounds += stats.defensiveRebounds
    total.rebounds += stats.rebounds
    total.assists += stats.assists
    total.steals += stats.steals
    total.blocks += stats.blocks
    total.turnovers += stats.turnovers
    total.foulsCommitted += stats.foulsCommitted
    total.plusMinus += stats.plusMinus
  }

  return total
}

function buildGameLogRow(
  world: GameWorld,
  line: ReturnType<typeof getPlayerGameLogs>[number],
): PlayerGameLogRow {
  const opponent = world.teams[line.opponentTeamId]
  const competition = world.competitions[line.competitionId]
  const playerScore = line.isHome ? line.finalScore.home : line.finalScore.away
  const opponentScore = line.isHome ? line.finalScore.away : line.finalScore.home
  const win = playerScore > opponentScore
  const loss = playerScore < opponentScore
  const resultPrefix = win ? 'W' : loss ? 'L' : 'T'

  return {
    gameId: line.gameId,
    competitionId: line.competitionId,
    date: line.gameDate,
    opponent: opponent === undefined ? '—' : opponentShortCode(opponent.name),
    competition: competition?.name ?? '—',
    homeAway: line.isHome ? 'H' : 'A',
    result: `${resultPrefix} ${playerScore}-${opponentScore}`,
    started: line.started,
    minutes: Math.round(line.stats.secondsPlayed / 60),
    points: line.stats.points,
    rebounds: line.stats.rebounds,
    assists: line.stats.assists,
    steals: line.stats.steals,
    blocks: line.stats.blocks,
    turnovers: line.stats.turnovers,
    fouls: line.stats.foulsCommitted,
    fg: formatMadeAttempt(line.stats.fieldGoalsMade, line.stats.fieldGoalsAttempted),
    threePt: formatMadeAttempt(line.stats.threePointMade, line.stats.threePointAttempted),
    ft: formatMadeAttempt(line.stats.freeThrowsMade, line.stats.freeThrowsAttempted),
    plusMinus: line.stats.plusMinus,
  }
}

export function buildPerformanceViewSnapshot(
  world: GameWorld,
  playerId: PlayerId,
  seasonId: SeasonId,
  logs: readonly ReturnType<typeof getPlayerGameLogs>[number][],
  competitionFilter: PerformanceCompetitionFilter,
): PerformanceViewSnapshot {
  const season = world.seasons[seasonId]
  const filteredLogs =
    competitionFilter === 'all'
      ? logs
      : logs.filter((line) => line.competitionId === competitionFilter)

  const competitionIds = [...new Set(logs.map((line) => line.competitionId))].sort((a, b) =>
    a.localeCompare(b),
  )
  const competitionOptions: PerformanceCompetitionOption[] = [
    { id: 'all', label: 'All competitions' },
    ...competitionIds.map((id) => ({
      id,
      label: world.competitions[id]?.name ?? id,
    })),
  ]

  const contextCompetition =
    competitionFilter === 'all'
      ? undefined
      : world.competitions[competitionFilter]?.name
  const contextLabel =
    contextCompetition === undefined
      ? season?.label ?? 'Current season'
      : `${season?.label ?? 'Current season'} · ${contextCompetition}`

  if (filteredLogs.every((line) => line.stats.secondsPlayed <= 0)) {
    return {
      status: 'empty',
      seasonLabel: season?.label ?? 'Current season',
      contextLabel,
      competitionOptions,
      productionPrimary: [],
      productionSecondary: [],
      playingTime: [],
      shooting: [],
      recentForm: [],
      seasonAveragePoints: undefined,
      gameLogs: [],
    }
  }

  const aggregate = aggregateFromLogs(playerId, filteredLogs)
  const averages = calculatePlayerStatAverages(aggregate)
  const gameLogs = filteredLogs
    .filter((line) => line.stats.secondsPlayed > 0)
    .map((line) => buildGameLogRow(world, line))

  const recentForm = gameLogs.slice(0, 8).map((row) => ({
    gameId: row.gameId,
    date: row.date,
    opponent: row.opponent,
    points: row.points,
  }))

  return {
    status: 'available',
    seasonLabel: season?.label ?? 'Current season',
    contextLabel,
    competitionOptions,
    productionPrimary: [
      { label: 'PTS', value: formatOneDecimal(averages.ppg) },
      { label: 'REB', value: formatOneDecimal(averages.rpg) },
      { label: 'AST', value: formatOneDecimal(averages.apg) },
      { label: 'STL', value: formatOneDecimal(averages.spg) },
      { label: 'BLK', value: formatOneDecimal(averages.bpg) },
      { label: 'TOV', value: formatOneDecimal(averages.turnoversPerGame) },
    ],
    productionSecondary: [
      { label: '+/-', value: formatOneDecimal(averages.plusMinusPerGame) },
      { label: 'PF', value: formatOneDecimal(averages.foulsPerGame) },
    ],
    playingTime: [
      { label: 'GP', value: String(aggregate.gamesPlayed) },
      { label: 'GS', value: String(aggregate.gamesStarted) },
      { label: 'MIN', value: formatOneDecimal(averages.mpg) },
    ],
    shooting: [
      {
        label: 'FG',
        madePerGame: formatOneDecimal(perGame(aggregate.fieldGoalsMade, aggregate.gamesPlayed)),
        attemptedPerGame: formatOneDecimal(perGame(aggregate.fieldGoalsAttempted, aggregate.gamesPlayed)),
        percentage: formatPercentage(aggregate.fieldGoalsMade, aggregate.fieldGoalsAttempted),
      },
      {
        label: '3PT',
        madePerGame: formatOneDecimal(perGame(aggregate.threePointMade, aggregate.gamesPlayed)),
        attemptedPerGame: formatOneDecimal(perGame(aggregate.threePointAttempted, aggregate.gamesPlayed)),
        percentage: formatPercentage(aggregate.threePointMade, aggregate.threePointAttempted),
      },
      {
        label: 'FT',
        madePerGame: formatOneDecimal(perGame(aggregate.freeThrowsMade, aggregate.gamesPlayed)),
        attemptedPerGame: formatOneDecimal(perGame(aggregate.freeThrowsAttempted, aggregate.gamesPlayed)),
        percentage: formatPercentage(aggregate.freeThrowsMade, aggregate.freeThrowsAttempted),
      },
    ],
    recentForm,
    seasonAveragePoints: averages.ppg,
    gameLogs,
  }
}

export function buildPlayerPerformanceModel(
  world: GameWorld,
  playerId: PlayerId,
): PlayerPerformanceModel {
  const seasonId = world.currentSeasonId
  const season = world.seasons[seasonId]
  const seasonLogs = getPlayerGameLogs(world, playerId).filter((line) => line.seasonId === seasonId)
  const primaryCompetition =
    season === undefined ? undefined : world.competitions[season.competitionId]?.name
  const baseContextLabel =
    primaryCompetition === undefined
      ? season?.label ?? 'Current season'
      : `${primaryCompetition} · ${season?.label ?? 'Current season'}`

  return {
    seasonId,
    seasonLabel: season?.label ?? 'Current season',
    baseContextLabel,
    allSeasonSnapshot: buildPerformanceViewSnapshot(world, playerId, seasonId, seasonLogs, 'all'),
  }
}

export function selectPerformanceSnapshot(
  model: PlayerPerformanceModel,
  world: GameWorld,
  playerId: PlayerId,
  competitionFilter: PerformanceCompetitionFilter,
): PerformanceViewSnapshot {
  if (competitionFilter === 'all') {
    return model.allSeasonSnapshot
  }

  const seasonLogs = getPlayerGameLogs(world, playerId).filter(
    (line) => line.seasonId === model.seasonId,
  )
  return buildPerformanceViewSnapshot(world, playerId, model.seasonId, seasonLogs, competitionFilter)
}

export function findGameLogRow(
  snapshot: PerformanceViewSnapshot,
  gameId: GameId | null,
): PlayerGameLogRow | undefined {
  if (gameId === null) return undefined
  return snapshot.gameLogs.find((row) => row.gameId === gameId)
}

/** Exposed for tests — verifies season aggregate matches engine helper when unfiltered. */
export function seasonAggregateMatchesEngine(
  world: GameWorld,
  playerId: PlayerId,
  seasonId: SeasonId,
): boolean {
  const engineStats = getPlayerSeasonStats(world, playerId, seasonId)
  const logs = getPlayerGameLogs(world, playerId).filter((line) => line.seasonId === seasonId)
  const aggregate = aggregateFromLogs(playerId, logs)
  return (
    engineStats.gamesPlayed === aggregate.gamesPlayed &&
    engineStats.points === aggregate.points &&
    engineStats.rebounds === aggregate.rebounds
  )
}
