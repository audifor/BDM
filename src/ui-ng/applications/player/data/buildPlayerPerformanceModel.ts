import type { CompetitionId, GameId, PlayerId, SeasonId, TeamId } from '@/domain/ids'
import { getPlayerRosterTeamId, type GameWorld } from '@/domain/world'
import { calculateStandingsForCompetition } from '@/engine/competition/standings'
import { boxScoreValuation } from '@/engine/stats/boxScoreValuation'
import {
  calculatePlayerStatAverages,
  getPlayerGameLogs,
  getPlayerSeasonStats,
  type PlayerAggregateStats,
} from '@/engine/stats/PlayerHistory'

import { formatGameDateLabel, opponentShortCode } from './presentationHelpers'
import { effectiveFieldGoalPercentage, trueShootingPercentage } from './statFormulas'
import type { OverviewGapModel } from './playerWorkspaceModel'

export type PerformanceCompetitionFilter = 'all' | CompetitionId

/** Stakes recorded on the fixture: regular season games versus the decisive ones. */
export type PerformancePhaseFilter = 'all' | 'regular' | 'decisive'

export type PerformanceSplitFilter = 'all' | 'home' | 'away' | 'wins' | 'losses'

/** Everything the context bar can query. All four are real groupings of the game log. */
export interface PerformanceFilterState {
  readonly seasonId: SeasonId
  readonly competition: PerformanceCompetitionFilter
  readonly phase: PerformancePhaseFilter
  readonly split: PerformanceSplitFilter
}

export interface PerformanceFilterOption {
  readonly id: string
  readonly label: string
}

/** One context selector: its label, the value in force and the values it can take. */
export interface PerformanceFilterModel {
  readonly id: 'season' | 'competition' | 'phase' | 'split'
  readonly label: string
  readonly valueLabel: string
  readonly options: readonly PerformanceFilterOption[]
}

/** One cell of the KPI strip. Values are season averages unless the label says otherwise. */
export interface PerformanceKpiModel {
  readonly id: string
  readonly label: string
  readonly value: string
}

/**
 * One efficiency reading. `detail` carries the volume behind a percentage (makes per game over
 * attempts per game) and is null when the reference shows none.
 */
export interface PerformanceEfficiencyMetricModel {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail: string | null
  /** Which of the two efficiency rows the metric belongs to. */
  readonly row: 'volume' | 'advanced'
}

/**
 * One shot zone. The save stores two-point and three-point attempts, so those are the two zones a
 * court can honestly show: nothing here is derived from shot coordinates.
 */
export interface PerformanceShotZoneModel {
  readonly id: 'inside-arc' | 'outside-arc'
  readonly label: string
  readonly court: 'paint' | 'arc'
  readonly made: number
  readonly attempted: number
  readonly percentage: string | null
  /** Share of the player's field goal attempts that came from this zone. */
  readonly share: number
}

export interface PerformanceShotProfileModel {
  readonly zones: readonly PerformanceShotZoneModel[]
  readonly totalAttempts: number
  readonly note: string
}

export interface PlayerGameLogRow {
  readonly gameId: GameId
  readonly competitionId: CompetitionId
  readonly date: string
  /** Display form of the date, the same one the inspector header uses. */
  readonly dateLabel: string
  readonly opponent: string
  /** Full opponent name, for the inspector header. */
  readonly opponentName: string
  readonly competition: string
  readonly homeAway: 'H' | 'A'
  readonly result: string
  readonly outcome: 'W' | 'L' | 'T'
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
  readonly fgPercentage: string | null
  readonly threePointPercentage: string | null
  readonly ftPercentage: string | null
  readonly plusMinus: number
  /** Engine box-score valuation for this game, the same formula the KPI strip uses. */
  readonly valuation: number
  /** Factual reading of the box score, assembled from the recorded numbers only. */
  readonly summary: string
}

export interface PerformanceRecentGame {
  readonly gameId: GameId
  readonly date: string
  readonly opponent: string
  readonly points: number
  readonly rebounds: number
  readonly assists: number
  /** Box-score valuation, so the form chart can plot the same number the log shows. */
  readonly valuation: number
}

/** One slice of the game log: home/away, the opponent's standing in the table, or a half. */
export interface PerformanceSplitRowModel {
  readonly id: string
  readonly label: string
  readonly games: number
  readonly points: string
  readonly rebounds: string
  readonly assists: string
  readonly fieldGoalPercentage: string | null
  readonly threePointPercentage: string | null
  readonly valuation: string
  /** Why the row is empty, when the source could not supply it. Null when the row is measured. */
  readonly reason: string | null
}

export interface PerformanceViewSnapshot {
  readonly status: 'empty' | 'available'
  readonly seasonLabel: string
  readonly contextLabel: string
  /** The KPI strip, left to right. */
  readonly kpiStrip: readonly PerformanceKpiModel[]
  /** Efficiency as the reference lays it out: percentages with the volume behind them. */
  readonly efficiencyMetrics: readonly PerformanceEfficiencyMetricModel[]
  readonly shotProfile: PerformanceShotProfileModel
  readonly splits: readonly PerformanceSplitRowModel[]
  readonly splitsNote: string
  readonly recentForm: readonly PerformanceRecentGame[]
  readonly gameLogs: readonly PlayerGameLogRow[]
  readonly gaps: readonly OverviewGapModel[]
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
  const stats = line.stats

  return {
    gameId: line.gameId,
    competitionId: line.competitionId,
    date: line.gameDate,
    dateLabel: formatGameDateLabel(line.gameDate),
    opponent: opponent === undefined ? '—' : opponentShortCode(opponent.name),
    opponentName: opponent?.name ?? '—',
    competition: competition?.name ?? '—',
    homeAway: line.isHome ? 'H' : 'A',
    result: `${resultPrefix} ${playerScore}-${opponentScore}`,
    outcome: resultPrefix,
    started: line.started,
    minutes: Math.round(stats.secondsPlayed / 60),
    points: stats.points,
    rebounds: stats.rebounds,
    assists: stats.assists,
    steals: stats.steals,
    blocks: stats.blocks,
    turnovers: stats.turnovers,
    fouls: stats.foulsCommitted,
    fg: formatMadeAttempt(stats.fieldGoalsMade, stats.fieldGoalsAttempted),
    threePt: formatMadeAttempt(stats.threePointMade, stats.threePointAttempted),
    ft: formatMadeAttempt(stats.freeThrowsMade, stats.freeThrowsAttempted),
    fgPercentage: formatPercentage(stats.fieldGoalsMade, stats.fieldGoalsAttempted),
    threePointPercentage: formatPercentage(stats.threePointMade, stats.threePointAttempted),
    ftPercentage: formatPercentage(stats.freeThrowsMade, stats.freeThrowsAttempted),
    plusMinus: stats.plusMinus,
    valuation: boxScoreValuation(stats),
    // A reading of the recorded box score, never authored commentary.
    summary: [
      `${stats.points} ${stats.points === 1 ? 'point' : 'points'} on ${formatMadeAttempt(stats.fieldGoalsMade, stats.fieldGoalsAttempted)} from the field and ${formatMadeAttempt(stats.threePointMade, stats.threePointAttempted)} from three in ${Math.round(stats.secondsPlayed / 60)} minutes.`,
      `${stats.rebounds} ${stats.rebounds === 1 ? 'rebound' : 'rebounds'}, ${stats.assists} ${stats.assists === 1 ? 'assist' : 'assists'}, ${stats.steals} ${stats.steals === 1 ? 'steal' : 'steals'} and ${stats.blocks} ${stats.blocks === 1 ? 'block' : 'blocks'}.`,
    ].join(' '),
  }
}

/**
 * Team totals for the games in scope. Individual possession share cannot be measured without
 * them, and they are read from the same match logs the player's line comes from.
 */
function teamTotalsFor(
  world: GameWorld,
  logs: readonly ReturnType<typeof getPlayerGameLogs>[number][],
): {
  readonly seconds: number
  readonly fieldGoalsMade: number
  readonly fieldGoalsAttempted: number
  readonly freeThrowsAttempted: number
  readonly turnovers: number
} {
  const totals = {
    seconds: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    freeThrowsAttempted: 0,
    turnovers: 0,
  }
  for (const line of logs) {
    const log = world.matchStatLogsByGameId[line.gameId]
    if (log === undefined) continue
    for (const teamLine of log.playerLines) {
      if (teamLine.teamId !== line.teamId) continue
      totals.seconds += teamLine.stats.secondsPlayed
      totals.fieldGoalsMade += teamLine.stats.fieldGoalsMade
      totals.fieldGoalsAttempted += teamLine.stats.fieldGoalsAttempted
      totals.freeThrowsAttempted += teamLine.stats.freeThrowsAttempted
      totals.turnovers += teamLine.stats.turnovers
    }
  }
  return totals
}

/** Usage rate: the share of the team's shooting possessions the player finished while on the floor. */
function usageRate(
  aggregate: PlayerAggregateStats,
  team: ReturnType<typeof teamTotalsFor>,
): number | null {
  const teamPossessions = team.fieldGoalsAttempted + 0.44 * team.freeThrowsAttempted + team.turnovers
  const playerPossessions =
    aggregate.fieldGoalsAttempted + 0.44 * aggregate.freeThrowsAttempted + aggregate.turnovers
  const teamMinutes = team.seconds / 60
  const minutes = aggregate.secondsPlayed / 60
  if (teamPossessions <= 0 || teamMinutes <= 0 || minutes <= 0) return null
  return (100 * playerPossessions * (teamMinutes / 5)) / (minutes * teamPossessions)
}

/** Assist rate: the share of team field goals the player assisted while on the floor. */
function assistRate(
  aggregate: PlayerAggregateStats,
  team: ReturnType<typeof teamTotalsFor>,
): number | null {
  const teamMinutes = team.seconds / 60
  const minutes = aggregate.secondsPlayed / 60
  if (teamMinutes <= 0 || minutes <= 0) return null
  const assisted = (minutes / (teamMinutes / 5)) * team.fieldGoalsMade - aggregate.fieldGoalsMade
  return assisted <= 0 ? null : (100 * aggregate.assists) / assisted
}

/** Turnover rate: turnovers per shooting possession the player used. */
function turnoverRate(aggregate: PlayerAggregateStats): number | null {
  const possessions =
    aggregate.fieldGoalsAttempted + 0.44 * aggregate.freeThrowsAttempted + aggregate.turnovers
  return possessions <= 0 ? null : (100 * aggregate.turnovers) / possessions
}

function buildKpiStrip(
  aggregate: PlayerAggregateStats,
  averages: ReturnType<typeof calculatePlayerStatAverages>,
): readonly PerformanceKpiModel[] {
  const games = aggregate.gamesPlayed
  return [
    { id: 'gp', label: 'GP', value: String(games) },
    { id: 'gs', label: 'GS', value: String(aggregate.gamesStarted) },
    { id: 'min', label: 'MIN', value: formatOneDecimal(averages.mpg) },
    { id: 'pts', label: 'PTS', value: formatOneDecimal(averages.ppg) },
    { id: 'reb', label: 'REB', value: formatOneDecimal(averages.rpg) },
    { id: 'ast', label: 'AST', value: formatOneDecimal(averages.apg) },
    { id: 'stl', label: 'STL', value: formatOneDecimal(averages.spg) },
    { id: 'blk', label: 'BLK', value: formatOneDecimal(averages.bpg) },
    { id: 'tov', label: 'TOV', value: formatOneDecimal(averages.turnoversPerGame) },
    {
      id: 'val',
      label: 'VAL',
      value: games === 0 ? '0.0' : formatOneDecimal(boxScoreValuation(aggregate) / games),
    },
  ]
}

/**
 * Efficiency as the reference lays it out: the four shooting families with the volume behind them,
 * then the four advanced readings. Every one is computed from the recorded box score.
 */
function buildEfficiencyMetrics(
  aggregate: PlayerAggregateStats,
  team: ReturnType<typeof teamTotalsFor>,
): readonly PerformanceEfficiencyMetricModel[] {
  const games = aggregate.gamesPlayed
  const perTry = (made: number, attempted: number): string =>
    `${formatOneDecimal(perGame(made, games))} / ${formatOneDecimal(perGame(attempted, games))}`
  const twoPointMade = aggregate.twoPointMade
  const twoPointAttempted = aggregate.twoPointAttempted
  const trueShooting = trueShootingPercentage(aggregate)
  const effectiveFieldGoal = effectiveFieldGoalPercentage(aggregate)
  const usage = usageRate(aggregate, team)
  const assists = assistRate(aggregate, team)
  const turnovers = turnoverRate(aggregate)

  return [
    {
      id: 'fg',
      label: 'FG%',
      value: formatPercentage(aggregate.fieldGoalsMade, aggregate.fieldGoalsAttempted) ?? '—',
      detail: perTry(aggregate.fieldGoalsMade, aggregate.fieldGoalsAttempted),
      row: 'volume',
    },
    {
      id: '2p',
      label: '2P%',
      value: formatPercentage(twoPointMade, twoPointAttempted) ?? '—',
      detail: perTry(twoPointMade, twoPointAttempted),
      row: 'volume',
    },
    {
      id: '3p',
      label: '3P%',
      value: formatPercentage(aggregate.threePointMade, aggregate.threePointAttempted) ?? '—',
      detail: perTry(aggregate.threePointMade, aggregate.threePointAttempted),
      row: 'volume',
    },
    {
      id: 'ft',
      label: 'FT%',
      value: formatPercentage(aggregate.freeThrowsMade, aggregate.freeThrowsAttempted) ?? '—',
      detail: perTry(aggregate.freeThrowsMade, aggregate.freeThrowsAttempted),
      row: 'volume',
    },
    {
      id: 'efg',
      label: 'eFG%',
      value: effectiveFieldGoal === undefined ? '—' : effectiveFieldGoal.toFixed(1),
      detail: null,
      row: 'volume',
    },
    {
      id: 'ts',
      label: 'TS%',
      value: trueShooting === undefined ? '—' : (trueShooting * 100).toFixed(1),
      detail: null,
      row: 'advanced',
    },
    { id: 'usg', label: 'USG%', value: usage === null ? '—' : usage.toFixed(1), detail: null, row: 'advanced' },
    { id: 'astp', label: 'AST%', value: assists === null ? '—' : assists.toFixed(1), detail: null, row: 'advanced' },
    {
      id: 'tovp',
      label: 'TOV%',
      value: turnovers === null ? '—' : turnovers.toFixed(1),
      detail: null,
      row: 'advanced',
    },
  ]
}

/**
 * The two zones the save can support. Shot coordinates are not stored, so a six-zone chart would be
 * invention; two-point and three-point attempts are recorded per game and are shown as they are.
 */
function buildShotProfile(aggregate: PlayerAggregateStats): PerformanceShotProfileModel {
  const attempts = aggregate.fieldGoalsAttempted
  const share = (value: number): number => (attempts === 0 ? 0 : Math.round((value / attempts) * 100))
  return {
    zones: [
      {
        id: 'inside-arc',
        label: 'Inside the arc',
        court: 'paint',
        made: aggregate.twoPointMade,
        attempted: aggregate.twoPointAttempted,
        percentage: formatPercentage(aggregate.twoPointMade, aggregate.twoPointAttempted),
        share: share(aggregate.twoPointAttempted),
      },
      {
        id: 'outside-arc',
        label: 'Beyond the arc',
        court: 'arc',
        made: aggregate.threePointMade,
        attempted: aggregate.threePointAttempted,
        percentage: formatPercentage(aggregate.threePointMade, aggregate.threePointAttempted),
        share: share(aggregate.threePointAttempted),
      },
    ],
    totalAttempts: attempts,
    note: 'Two-point and three-point attempts are stored per game; the save records no shot coordinates, so the court shows the two zones it can support.',
  }
}

/** Stakes recorded on the fixtures, which is the only phase information the save holds. */
function phaseOf(world: GameWorld, gameId: GameId): PerformancePhaseFilter {
  const stakes = world.games[gameId]?.stakes
  return stakes !== undefined && stakes !== 'regular' ? 'decisive' : 'regular'
}

function matchesSplit(
  world: GameWorld,
  line: ReturnType<typeof getPlayerGameLogs>[number],
  split: PerformanceSplitFilter,
): boolean {
  switch (split) {
    case 'all':
      return true
    case 'home':
      return line.isHome
    case 'away':
      return !line.isHome
    case 'wins':
    case 'losses': {
      const playerScore = line.isHome ? line.finalScore.home : line.finalScore.away
      const opponentScore = line.isHome ? line.finalScore.away : line.finalScore.home
      const won = playerScore > opponentScore
      return split === 'wins' ? won : playerScore < opponentScore
    }
  }
}

/**
 * The context bar. Every selector filters the log for real; none of them is decorative.
 */
export function buildPerformanceFilterBar(
  world: GameWorld,
  playerId: PlayerId,
  seasonId: SeasonId,
  filter: Omit<PerformanceFilterState, 'seasonId'>,
): readonly PerformanceFilterModel[] {
  const allLogs = getPlayerGameLogs(world, playerId)
  const seasonIds = [...new Set([seasonId, ...allLogs.map((line) => line.seasonId)])]
  const seasonLogs = allLogs.filter((line) => line.seasonId === seasonId)
  const competitionIds = [...new Set(seasonLogs.map((line) => line.competitionId))].sort((a, b) =>
    a.localeCompare(b),
  )
  const phases = new Set(seasonLogs.map((line) => phaseOf(world, line.gameId)))

  const competitionOptions: PerformanceFilterOption[] = [
    { id: 'all', label: 'All Competitions' },
    ...competitionIds.map((id) => ({ id, label: world.competitions[id]?.name ?? id })),
  ]
  const competitionValue =
    competitionOptions.find((option) => option.id === filter.competition)?.label ??
    'All Competitions'

  return [
    {
      id: 'season',
      label: 'Season',
      valueLabel: world.seasons[seasonId]?.label ?? String(seasonId),
      options: seasonIds.map((id) => ({ id, label: world.seasons[id]?.label ?? String(id) })),
    },
    { id: 'competition', label: 'Competition', valueLabel: competitionValue, options: competitionOptions },
    {
      id: 'phase',
      label: 'Phase',
      valueLabel:
        filter.phase === 'all' ? 'All Phases' : filter.phase === 'regular' ? 'Regular Season' : 'Decisive Games',
      options: [
        { id: 'all', label: 'All Phases' },
        ...(phases.has('regular') ? [{ id: 'regular', label: 'Regular Season' }] : []),
        ...(phases.has('decisive') ? [{ id: 'decisive', label: 'Decisive Games' }] : []),
      ],
    },
    {
      id: 'split',
      label: 'Split',
      valueLabel:
        filter.split === 'all'
          ? 'All Games'
          : filter.split === 'home'
            ? 'Home'
            : filter.split === 'away'
              ? 'Away'
              : filter.split === 'wins'
                ? 'Wins'
                : 'Losses',
      options: [
        { id: 'all', label: 'All Games' },
        { id: 'home', label: 'Home' },
        { id: 'away', label: 'Away' },
        { id: 'wins', label: 'Wins' },
        { id: 'losses', label: 'Losses' },
      ],
    },
  ]
}

export function buildPerformanceViewSnapshot(
  world: GameWorld,
  playerId: PlayerId,
  seasonId: SeasonId,
  logs: readonly ReturnType<typeof getPlayerGameLogs>[number][],
  filter: Omit<PerformanceFilterState, 'seasonId'>,
): PerformanceViewSnapshot {
  const season = world.seasons[seasonId]
  const competitionFilter = filter.competition
  const filteredLogs = logs
    .filter((line) => competitionFilter === 'all' || line.competitionId === competitionFilter)
    .filter((line) => filter.phase === 'all' || phaseOf(world, line.gameId) === filter.phase)
    .filter((line) => matchesSplit(world, line, filter.split))

  const competitionIds = [...new Set(logs.map((line) => line.competitionId))].sort((a, b) =>
    a.localeCompare(b),
  )

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
      kpiStrip: [],
      efficiencyMetrics: [],
      shotProfile: { zones: [], totalAttempts: 0, note: '' },
      splits: [],
      splitsNote: SPLITS_NOTE,
      recentForm: [],
      gameLogs: [],
      gaps: buildPerformanceGaps(),
    }
  }

  const aggregate = aggregateFromLogs(playerId, filteredLogs)
  const averages = calculatePlayerStatAverages(aggregate)
  const trueShooting = trueShootingPercentage(aggregate)
  const effectiveFieldGoal = effectiveFieldGoalPercentage(aggregate)
  const twoPointMade = aggregate.fieldGoalsMade - aggregate.threePointMade
  const twoPointAttempted = aggregate.fieldGoalsAttempted - aggregate.threePointAttempted
  const gameLogs = filteredLogs
    .filter((line) => line.stats.secondsPlayed > 0)
    .map((line) => buildGameLogRow(world, line))

  const recentForm = gameLogs.slice(0, RECENT_FORM_WINDOW).map((row) => ({
    gameId: row.gameId,
    date: row.date,
    opponent: row.opponent,
    points: row.points,
    rebounds: row.rebounds,
    assists: row.assists,
    valuation: row.valuation,
  }))

  return {
    status: 'available',
    seasonLabel: season?.label ?? 'Current season',
    contextLabel,
    kpiStrip: buildKpiStrip(aggregate, averages),
    efficiencyMetrics: buildEfficiencyMetrics(aggregate, teamTotalsFor(world, filteredLogs)),
    shotProfile: buildShotProfile(aggregate),
    splits: buildSplits(world, playerId, filteredLogs, seasonId),
    splitsNote: SPLITS_NOTE,
    recentForm,
    gameLogs,
    gaps: buildPerformanceGaps(),
  }
}

/** How many games the form chart covers, matching the reference. */
const RECENT_FORM_WINDOW = 10

const SPLITS_NOTE =
  'Home and away come from the fixture; the top-4 split uses the current competition table, not the table on the game date.'

/**
 * Reference elements this page cannot produce yet, each with the reason. The two halves are listed
 * as rows in the splits table as well, so the reason lives here once.
 */
function buildPerformanceGaps(): readonly OverviewGapModel[] {
  return [
    {
      id: 'shot-zones',
      label: 'Shot profile by location',
      reason:
        'Shots are stored as two-point and three-point attempts only: the engine records no shot coordinates, so no finer zone can be drawn.',
    },
    {
      id: 'halves',
      label: 'First half / second half',
      reason: 'Box scores are stored as final totals, with no per-half breakdown.',
    },
  ]
}

const HALVES_REASON = 'Box scores are stored as final totals, so no per-half line exists.'

/** Splits the tracked games by venue, by the opponent's place in the table, and by half. */
function buildSplits(
  world: GameWorld,
  playerId: PlayerId,
  logs: readonly ReturnType<typeof getPlayerGameLogs>[number][],
  seasonId: SeasonId,
): readonly PerformanceSplitRowModel[] {
  const rosterTeamId = getPlayerRosterTeamId(world, playerId)
  if (rosterTeamId === undefined) return []

  const season = world.seasons[seasonId]
  const competitionId = season?.competitionId
  const ranks = topFourRanking(world, competitionId)

  const played = logs.filter((line) => line.stats.secondsPlayed > 0)
  const groups: {
    id: string
    label: string
    lines: typeof played
    reason: string | null
  }[] = [
    {
      id: 'home',
      label: 'Home',
      lines: played.filter((line) => world.games[line.gameId]?.homeTeamId === rosterTeamId),
      reason: null,
    },
    {
      id: 'away',
      label: 'Away',
      lines: played.filter((line) => world.games[line.gameId]?.homeTeamId !== rosterTeamId),
      reason: null,
    },
  ]

  if (ranks.size > 0) {
    const opponentOf = (gameId: GameId): TeamId | undefined => {
      const game = world.games[gameId]
      if (game === undefined) return undefined
      return game.homeTeamId === rosterTeamId ? game.awayTeamId : game.homeTeamId
    }
    groups.push(
      {
        id: 'vs-top-4',
        label: 'Vs top 4',
        lines: played.filter((line) => {
          const opponent = opponentOf(line.gameId)
          return opponent !== undefined && ranks.has(opponent)
        }),
        reason: null,
      },
      {
        id: 'vs-others',
        label: 'Vs others',
        lines: played.filter((line) => {
          const opponent = opponentOf(line.gameId)
          return opponent === undefined || !ranks.has(opponent)
        }),
        reason: null,
      },
    )
  }

  const measured = groups.map((group) => {
    const aggregate = aggregateFromLogs(playerId, group.lines)
    const averages = calculatePlayerStatAverages(aggregate)
    return {
      id: group.id,
      label: group.label,
      games: aggregate.gamesPlayed,
      points: group.lines.length === 0 ? '—' : formatOneDecimal(averages.ppg),
      rebounds: group.lines.length === 0 ? '—' : formatOneDecimal(averages.rpg),
      assists: group.lines.length === 0 ? '—' : formatOneDecimal(averages.apg),
      fieldGoalPercentage:
        group.lines.length === 0
          ? null
          : formatPercentage(aggregate.fieldGoalsMade, aggregate.fieldGoalsAttempted),
      threePointPercentage:
        group.lines.length === 0
          ? null
          : formatPercentage(aggregate.threePointMade, aggregate.threePointAttempted),
      valuation:
        group.lines.length === 0
          ? '—'
          : formatOneDecimal(boxScoreValuation(aggregate) / aggregate.gamesPlayed),
      reason: group.reason,
    }
  })

  // The halves stay in the table with their reason: the reference lists them, so they are shown as
  // rows the save cannot fill rather than as a missing line.
  return [
    ...measured,
    {
      id: 'first-half',
      label: '1H',
      games: 0,
      points: '—',
      rebounds: '—',
      assists: '—',
      fieldGoalPercentage: null,
      threePointPercentage: null,
      valuation: '—',
      reason: HALVES_REASON,
    },
    {
      id: 'second-half',
      label: '2H',
      games: 0,
      points: '—',
      rebounds: '—',
      assists: '—',
      fieldGoalPercentage: null,
      threePointPercentage: null,
      valuation: '—',
      reason: HALVES_REASON,
    },
  ]
}

/** The four best-placed teams of the competition the season belongs to. Empty when unknown. */
function topFourRanking(world: GameWorld, competitionId: CompetitionId | undefined): Set<TeamId> {
  if (competitionId === undefined) return new Set()
  const hasSeason = Object.values(world.seasons).some(
    (candidate) => candidate.competitionId === competitionId,
  )
  if (!hasSeason) return new Set()
  return new Set(
    calculateStandingsForCompetition(world, competitionId)
      .slice(0, 4)
      .map((entry) => entry.teamId),
  )
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
    allSeasonSnapshot: buildPerformanceViewSnapshot(world, playerId, seasonId, seasonLogs, {
      competition: 'all',
      phase: 'all',
      split: 'all',
    }),
  }
}

/** The filter state the page starts from, and the one it falls back to when the world changes. */
export function defaultPerformanceFilter(seasonId: SeasonId): PerformanceFilterState {
  return { seasonId, competition: 'all', phase: 'all', split: 'all' }
}

export function selectPerformanceSnapshot(
  model: PlayerPerformanceModel,
  world: GameWorld,
  playerId: PlayerId,
  filter: PerformanceFilterState,
): PerformanceViewSnapshot {
  const seasonLogs = getPlayerGameLogs(world, playerId).filter(
    (line) => line.seasonId === filter.seasonId,
  )
  return buildPerformanceViewSnapshot(world, playerId, filter.seasonId, seasonLogs, filter)
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
