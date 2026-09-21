import { formatInjuryKind } from '@/domain/injury'
import { PLAYER_TRUTH_RATING_KEYS, getPlayerAge, type PlayerTruthRatingKey, type Player } from '@/domain/player'
import type { PlayerGameStatsSnapshot } from '@/domain/stats/MatchStatLog'
import { getTrainingPlanForTeam } from '@/domain/world'
import {
  getCareerFatigueForPlayer,
  getCurrentPlayerContract,
  getCurrentPlayerInjury,
  getMoraleBandForPerson,
  getPlayerContracts,
  getPlayerRosterTeamId,
  isPlayerAvailable,
  isPlayerFreeAgent,
  type GameWorld,
} from '@/domain/world'
import { getPlayerContractStatus } from '@/domain/contract'
import { DEVELOPMENT_DOMAINS } from '@/domain/player/PlayerDevelopmentProfile'
import type { PlayerId } from '@/domain/ids'
import {
  formatRatingEvaluation,
  getOrganizationRatingEvaluation,
  intelligenceSortValue,
} from '@/domain/intelligence/OrganizationPlayerEvaluation'
import type { PlayerRatingHistory } from '@/domain/development/PlayerRatingHistory'
import { getBaseDevelopmentTrend } from '@/engine/development'
import { boxScoreValuation } from '@/engine/stats/boxScoreValuation'
import {
  calculatePlayerStatAverages,
  getPlayerGameLogs,
  getPlayerSeasonStats,
  type PlayerAggregateStats,
} from '@/engine/stats/PlayerHistory'

import { buildPlayerContractModel } from './buildPlayerContractModel'
import { DEVELOPMENT_STAGE_LABELS, DEVELOPMENT_DOMAIN_LABELS } from './buildPlayerDevelopmentModel'
import { calendarDaysBetween, resolvePlayerMedicalRiskPresentation } from './buildPlayerMedicalModel'
import {
  aggregateCategoryValue,
  CATEGORY_LABELS,
  RADAR_CATEGORY_ORDER,
  ratingLabel,
} from './ratingCatalog'
import {
  availableField,
  formatGameDateLabel,
  opponentShortCode,
  unavailableField,
} from './presentationHelpers'
import { effectiveFieldGoalPercentage, trueShootingPercentage } from './statFormulas'
import type {
  OverviewAlertModel,
  OverviewChipModel,
  OverviewFormGameModel,
  OverviewGapModel,
  OverviewMoverModel,
  OverviewObservationModel,
  OverviewRatingSeriesModel,
  OverviewStatModel,
  OverviewStatTrendModel,
  OverviewTimelineNodeModel,
  PlayerOverviewModel,
  PresentationField,
} from './playerWorkspaceModel'

const PLAYER_TRUTH_KEYS = new Set<string>(PLAYER_TRUTH_RATING_KEYS)

/** How many recent games the form bars and the trend readings look at. */
const FORM_WINDOW = 5
const MAX_OBSERVATIONS = 5
const MAX_MOVERS = 3
/** Scoring movement that is worth telling the coach about, in points per game. */
const SCORING_THRESHOLD = 1
const MINUTES_THRESHOLD = 2
const TURNOVER_THRESHOLD = 0.5
const SHOOTING_THRESHOLD_PP = 3
const CONTRACT_WARNING_DAYS = 90
const HIGH_FATIGUE = 70

const POSITION_WORDS: Record<string, string> = {
  PG: 'LEAD GUARD',
  SG: 'SHOOTING GUARD',
  SF: 'WING',
  PF: 'FORWARD',
  C: 'CENTER',
}

/** Adjective derived from the family the player is strongest in. */
const CATEGORY_ADJECTIVES: Record<(typeof RADAR_CATEGORY_ORDER)[number], string> = {
  shooting: 'SHOOTING',
  finishing: 'SCORING',
  ballHandling: 'SHIFTY',
  playmaking: 'CREATIVE',
  offBall: 'MOVING',
  defense: 'TWO-WAY',
  physical: 'PHYSICAL',
  mental: 'COMPOSED',
}

const POSITION_ROLE_TITLES: Record<string, string> = {
  PG: 'PRIMARY BALL HANDLER',
  SG: 'OFF-BALL SCORER',
  SF: 'TWO-WAY WING',
  PF: 'INTERIOR FORWARD',
  C: 'INTERIOR ANCHOR',
}

function signed(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits))
  return `${rounded > 0 ? '+' : ''}${rounded}`
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Canonical ratings are attached as non-enumerable properties, so they must be read by key:
 * Object.entries only ever returns the persisted 80-key truth surface.
 */
function canonicalRatings(ratings: Player['basketball']['ratings']): [PlayerTruthRatingKey, number][] {
  return PLAYER_TRUTH_RATING_KEYS.map((key) => [key, ratings[key]])
}

/** Average of the current canonical ratings. Used only to rank players, never shown as a rating. */
function canonicalMean(ratings: Player['basketball']['ratings']): number {
  return mean(PLAYER_TRUTH_RATING_KEYS.map((key) => ratings[key]))
}

function strongCategory(player: Player): (typeof RADAR_CATEGORY_ORDER)[number] {
  const ranked = RADAR_CATEGORY_ORDER.map((category) => ({
    category,
    value: aggregateCategoryValue(category, player.basketball.ratings),
  })).sort((left, right) => right.value - left.value || left.category.localeCompare(right.category))
  return ranked[0]?.category ?? 'playmaking'
}

function weakCategory(player: Player): (typeof RADAR_CATEGORY_ORDER)[number] {
  const ranked = RADAR_CATEGORY_ORDER.map((category) => ({
    category,
    value: aggregateCategoryValue(category, player.basketball.ratings),
  })).sort((left, right) => left.value - right.value || left.category.localeCompare(right.category))
  return ranked[0]?.category ?? 'defense'
}

function buildIdentityModule(
  world: GameWorld,
  player: Player,
): PlayerOverviewModel['identityModule'] {
  const position = player.basketball.primaryPosition
  const strongest = strongCategory(player)
  const weakest = weakCategory(player)
  const topRatings: OverviewChipModel[] = canonicalRatings(player.basketball.ratings)
    .map(([key, value]) => ({ id: key, label: ratingLabel(key), value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, 4)

  const teamId = getPlayerRosterTeamId(world, player.id)
  const lineup = teamId === undefined ? undefined : world.lineupsByTeamId[teamId]
  const isStarter =
    lineup !== undefined && Object.values(lineup.starters).some((id) => id === player.id)
  const isBench = lineup !== undefined && Object.values(lineup.bench).some((id) => id === player.id)
  const squadRole: PresentationField<string> =
    teamId === undefined
      ? unavailableField('Free agent')
      : isStarter
        ? availableField('Starter')
        : isBench
          ? availableField('Bench')
          : availableField('Unassigned')

  const rosterIds = teamId === undefined ? [] : world.teams[teamId]!.rosterPlayerIds
  const ranked = rosterIds
    .map((id) => world.players[id])
    .filter((candidate): candidate is Player => candidate !== undefined)
    .sort(
      (left, right) =>
        canonicalMean(right.basketball.ratings) - canonicalMean(left.basketball.ratings) ||
        left.id.localeCompare(right.id),
    )
  const rank = ranked.findIndex((candidate) => candidate.id === player.id) + 1
  const rosterRank: PresentationField<number> =
    rosterIds.length === 0 || rank === 0
      ? unavailableField('No roster')
      : availableField(rank)

  return {
    archetypeTitle: `${CATEGORY_ADJECTIVES[strongest]} ${POSITION_WORDS[position] ?? position}`,
    roleTitle: POSITION_ROLE_TITLES[position] ?? position,
    chips: topRatings,
    description: `Strongest family is ${CATEGORY_LABELS[strongest]} (${aggregateCategoryValue(strongest, player.basketball.ratings)}); thinnest is ${CATEGORY_LABELS[weakest]} (${aggregateCategoryValue(weakest, player.basketball.ratings)}), with ${topRatings[0]?.label ?? 'no headline rating'} leading the profile.`,
    teamName:
      teamId === undefined
        ? unavailableField('Free agent')
        : availableField(world.teams[teamId]?.name ?? 'Club not tracked'),
    squadRole,
    rosterRank,
    rosterSize: rosterIds.length,
    // Possession-level usage is not tracked by the engine yet, so it is stated, never estimated.
    usage: unavailableField('Not tracked'),
    gaps: [
      {
        id: 'usage',
        label: 'Usage',
        reason: 'Possession tracking does not exist in the engine, so usage cannot be measured.',
      },
      {
        id: 'hierarchy',
        label: 'Hierarchy',
        reason: 'Squad hierarchy is not part of the persisted world.',
      },
      {
        id: 'traits',
        label: 'Trait chips',
        reason: 'Player traits are stored as ids without a published catalogue, so no chip can be labelled.',
      },
    ],
  }
}

function buildSeasonSnapshot(
  world: GameWorld,
  playerId: Player['id'],
): PlayerOverviewModel['season'] {
  const season = world.seasons[world.currentSeasonId]
  const competition = season === undefined ? undefined : world.competitions[season.competitionId]
  const stats = getPlayerSeasonStats(world, playerId, world.currentSeasonId)
  const averages = calculatePlayerStatAverages(stats)
  const trueShooting = trueShootingPercentage(stats)
  const effectiveFieldGoal = effectiveFieldGoalPercentage(stats)

  // Only shots and free throws are tracked, so possession-share metrics cannot be derived.
  const gaps: readonly OverviewGapModel[] = [
    {
      id: 'usage',
      label: 'USG%',
      reason: 'Requires possession tracking, which the engine does not record.',
    },
    {
      id: 'assist-share',
      label: 'AST%',
      reason: 'Requires team-level possession and shot-attribution data.',
    },
    {
      id: 'turnover-share',
      label: 'TOV%',
      reason: 'Requires possession tracking to express turnovers as a share of usage.',
    },
  ]

  if (stats.gamesPlayed === 0) {
    return {
      status: 'unavailable',
      seasonLabel: season?.label ?? null,
      competitionLabel: competition?.name ?? null,
      headline: [],
      secondary: [],
      trends: [],
      trendLabels: [],
      trendNote: 'No game played this season yet.',
      gamesPlayed: 0,
      gaps,
    }
  }

  // Oldest first: the log arrives newest first, and a trend reads left to right.
  const trendPoints = [...getPlayerGameLogs(world, playerId)]
    .filter((line) => line.seasonId === world.currentSeasonId)
    .reverse()
  const gameStats = trendPoints.map((line) => line.stats)

  return {
    status: 'available',
    seasonLabel: season?.label ?? null,
    competitionLabel: competition?.name ?? null,
    headline: [
      { id: 'pts', label: 'PTS', value: averages.ppg.toFixed(1) },
      { id: 'reb', label: 'REB', value: averages.rpg.toFixed(1) },
      { id: 'ast', label: 'AST', value: averages.apg.toFixed(1) },
      { id: 'stl', label: 'STL', value: averages.spg.toFixed(1) },
      { id: 'blk', label: 'BLK', value: averages.bpg.toFixed(1) },
      { id: 'val', label: 'VAL', value: valuationPerGame(stats) },
    ],
    secondary: [
      { id: 'fg', label: 'FG%', value: averages.fieldGoalPercentage.toFixed(1) },
      { id: '3p', label: '3P%', value: averages.threePointPercentage.toFixed(1) },
      { id: 'ft', label: 'FT%', value: averages.freeThrowPercentage.toFixed(1) },
      ...(trueShooting === undefined
        ? []
        : [{ id: 'ts', label: 'TS%', value: (trueShooting * 100).toFixed(1) }]),
      ...(effectiveFieldGoal === undefined
        ? []
        : [{ id: 'efg', label: 'eFG%', value: effectiveFieldGoal.toFixed(1) }]),
    ],
    // Every stat the panel shows gets its own curve, so selecting a cell re-plots the chart.
    trends: [
      ...perGameTrend('pts', 'PTS', gameStats, (line) => line.points, { average: averages.ppg }),
      ...perGameTrend('reb', 'REB', gameStats, (line) => line.rebounds, { average: averages.rpg }),
      ...perGameTrend('ast', 'AST', gameStats, (line) => line.assists, { average: averages.apg }),
      ...perGameTrend('stl', 'STL', gameStats, (line) => line.steals, { average: averages.spg }),
      ...perGameTrend('blk', 'BLK', gameStats, (line) => line.blocks, { average: averages.bpg }),
      ...perGameTrend('val', 'VAL', gameStats, (line) => boxScoreValuation(singleGameStats(line)), {
        average: Number(valuationPerGame(stats)),
      }),
      ...perGameTrend('fg', 'FG%', gameStats, (line) => shotPercentage(line.fieldGoalsMade, line.fieldGoalsAttempted), {
        average: averages.fieldGoalPercentage,
      }),
      ...perGameTrend('3p', '3P%', gameStats, (line) => shotPercentage(line.threePointMade, line.threePointAttempted), {
        average: averages.threePointPercentage,
      }),
      ...perGameTrend('ft', 'FT%', gameStats, (line) => shotPercentage(line.freeThrowsMade, line.freeThrowsAttempted), {
        average: averages.freeThrowPercentage,
      }),
      ...perGameTrend('ts', 'TS%', gameStats, (line) => {
        const perGame = trueShootingPercentage(singleGameStats(line))
        return perGame === undefined ? null : perGame * 100
      }, { average: trueShooting === undefined ? null : trueShooting * 100 }),
      ...perGameTrend('efg', 'eFG%', gameStats, (line) => effectiveFieldGoalPercentage(singleGameStats(line)) ?? null, {
        average: effectiveFieldGoal ?? null,
      }),
    ],
    trendLabels: trendPoints.map((_line, index) => `G${index + 1}`),
    trendNote: `Per-game values across ${stats.gamesPlayed} tracked ${stats.gamesPlayed === 1 ? 'game' : 'games'}.`,
    gamesPlayed: stats.gamesPlayed,
    gaps,
  }
}

/** One shot chart reading for a single game. No attempts is unknown, never zero. */
function shotPercentage(made: number, attempted: number): number | null {
  return attempted === 0 ? null : (made / attempted) * 100
}

/**
 * A single game line shaped as an aggregate of one, so the engine's own formulas apply to it
 * unchanged. They only read the counting stats of the line.
 */
function singleGameStats(stats: PlayerGameStatsSnapshot): PlayerAggregateStats {
  return { ...stats, gamesPlayed: stats.secondsPlayed > 0 ? 1 : 0, gamesStarted: 0 }
}

/**
 * Every tracked figure of one game, in box-score order, for the hover card on the form bars. The
 * shooting lines keep their makes and attempts, because a percentage alone hides the volume.
 */
function gameFigures(stats: PlayerGameStatsSnapshot): readonly OverviewStatModel[] {
  const trueShooting = trueShootingPercentage(singleGameStats(stats))
  const effectiveFieldGoal = effectiveFieldGoalPercentage(singleGameStats(stats))
  const minutes = Math.round(stats.secondsPlayed / 60)

  return [
    { id: 'min', label: 'MIN', value: String(minutes) },
    { id: 'pts', label: 'PTS', value: String(stats.points) },
    { id: 'reb', label: 'REB', value: String(stats.rebounds) },
    { id: 'oreb', label: 'OREB', value: String(stats.offensiveRebounds) },
    { id: 'dreb', label: 'DREB', value: String(stats.defensiveRebounds) },
    { id: 'ast', label: 'AST', value: String(stats.assists) },
    { id: 'stl', label: 'STL', value: String(stats.steals) },
    { id: 'blk', label: 'BLK', value: String(stats.blocks) },
    { id: 'tov', label: 'TOV', value: String(stats.turnovers) },
    { id: 'pf', label: 'PF', value: String(stats.foulsCommitted) },
    {
      id: 'plus-minus',
      label: '+/-',
      value: `${stats.plusMinus > 0 ? '+' : ''}${stats.plusMinus}`,
    },
    { id: 'fg', label: 'FG', value: `${stats.fieldGoalsMade}/${stats.fieldGoalsAttempted}` },
    { id: 'fg-pct', label: 'FG%', value: formatPercentage(shotPercentage(stats.fieldGoalsMade, stats.fieldGoalsAttempted)) },
    {
      id: 'three',
      label: '3P',
      value: `${stats.threePointMade}/${stats.threePointAttempted}`,
    },
    {
      id: 'three-pct',
      label: '3P%',
      value: formatPercentage(shotPercentage(stats.threePointMade, stats.threePointAttempted)),
    },
    {
      id: 'ft',
      label: 'FT',
      value: `${stats.freeThrowsMade}/${stats.freeThrowsAttempted}`,
    },
    {
      id: 'ft-pct',
      label: 'FT%',
      value: formatPercentage(shotPercentage(stats.freeThrowsMade, stats.freeThrowsAttempted)),
    },
    {
      id: 'ts-pct',
      label: 'TS%',
      value: formatPercentage(trueShooting === undefined ? null : trueShooting * 100),
    },
    { id: 'efg-pct', label: 'eFG%', value: formatPercentage(effectiveFieldGoal ?? null) },
    { id: 'val', label: 'VAL', value: String(boxScoreValuation(singleGameStats(stats))) },
  ]
}

/** An unknown reading is stated as such, never drawn as a zero. */
function formatPercentage(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

/**
 * Builds a stat's series with its season average, or nothing at all when no game in the season has
 * a value for it: an empty curve would claim a reading the save does not hold.
 */
function perGameTrend(
  id: string,
  label: string,
  gameStats: readonly PlayerGameStatsSnapshot[],
  read: (stats: PlayerGameStatsSnapshot) => number | null | undefined,
  options: { readonly average?: number | null; readonly digits?: number } = {},
): readonly OverviewStatTrendModel[] {
  const points = gameStats.map((line) => read(line) ?? null)
  if (points.every((point) => point === null)) return []

  return [
    {
      id,
      label,
      points,
      average: options.average ?? null,
      digits: options.digits ?? 1,
    },
  ]
}

/** Season valuation per game, using the engine's own box-score formula. */
function valuationPerGame(stats: PlayerAggregateStats): string {
  return (boxScoreValuation(stats) / stats.gamesPlayed).toFixed(1)
}

function buildRecentForm(world: GameWorld, playerId: Player['id']): PlayerOverviewModel['recentForm'] {
  const stats = getPlayerSeasonStats(world, playerId, world.currentSeasonId)
  const averages = calculatePlayerStatAverages(stats)
  const logs = getPlayerGameLogs(world, playerId).slice(0, FORM_WINDOW)
  const seasonAveragePoints = stats.gamesPlayed === 0 ? null : averages.ppg

  if (logs.length === 0) {
    return {
      status: 'unavailable',
      games: [],
      seasonAveragePoints,
      averageLabel: 'No games tracked yet.',
      windowLabel: 'No games tracked yet',
      slots: FORM_WINDOW,
    }
  }

  const rosterTeamId = getPlayerRosterTeamId(world, playerId)
  const best = Math.max(...logs.map((line) => line.stats.points))
  const games: OverviewFormGameModel[] = logs.map((line) => {
    const game = world.games[line.gameId]
    const opponentTeamId =
      game === undefined || rosterTeamId === undefined
        ? undefined
        : game.homeTeamId === rosterTeamId
          ? game.awayTeamId
          : game.homeTeamId
    const opponent = opponentTeamId === undefined ? undefined : world.teams[opponentTeamId]
    const tone =
      seasonAveragePoints === null
        ? 'average'
        : line.stats.points >= seasonAveragePoints * 1.15
          ? 'positive'
          : line.stats.points <= seasonAveragePoints * 0.85
            ? 'poor'
            : 'average'

    return {
      id: line.gameId,
      opponent: opponent === undefined ? '—' : opponentShortCode(opponent.name),
      points: line.stats.points,
      minutes: Math.round(line.stats.secondsPlayed / 60),
      tone,
      dateLabel: formatGameDateLabel(line.gameDate),
      height: best === 0 ? 0 : Math.round((line.stats.points / best) * 100),
      figures: gameFigures(line.stats),
    }
  })

  return {
    status: 'available',
    games,
    seasonAveragePoints,
    averageLabel:
      seasonAveragePoints === null
        ? 'No season average yet.'
        : `Season average ${seasonAveragePoints.toFixed(1)} PTS over ${stats.gamesPlayed} games.`,
    windowLabel:
      stats.gamesPlayed > games.length
        ? `Last ${games.length} of ${stats.gamesPlayed} games`
        : `${games.length} ${games.length === 1 ? 'game' : 'games'}`,
    slots: FORM_WINDOW,
  }
}

/** Split of the last window against the whole season, from the tracked game log only. */
function recentSplit(world: GameWorld, playerId: Player['id']): {
  readonly window: { readonly games: number; readonly points: number; readonly minutes: number; readonly turnovers: number; readonly fieldGoalPercentage: number }
  readonly season: { readonly games: number; readonly points: number; readonly minutes: number; readonly turnovers: number; readonly fieldGoalPercentage: number }
} | undefined {
  const logs = getPlayerGameLogs(world, playerId).filter((line) => line.seasonId === world.currentSeasonId)
  if (logs.length === 0) return undefined

  const aggregate = (lines: typeof logs) => {
    const attempts = lines.reduce((sum, line) => sum + line.stats.fieldGoalsAttempted, 0)
    const made = lines.reduce((sum, line) => sum + line.stats.fieldGoalsMade, 0)
    return {
      games: lines.length,
      points: mean(lines.map((line) => line.stats.points)),
      minutes: mean(lines.map((line) => line.stats.secondsPlayed / 60)),
      turnovers: mean(lines.map((line) => line.stats.turnovers)),
      fieldGoalPercentage: attempts === 0 ? 0 : (made / attempts) * 100,
    }
  }

  return { window: aggregate(logs.slice(0, FORM_WINDOW)), season: aggregate(logs) }
}

function buildObservations(
  world: GameWorld,
  playerId: Player['id'],
): { readonly observations: readonly OverviewObservationModel[]; readonly note: string } {
  const split = recentSplit(world, playerId)
  const observations: OverviewObservationModel[] = []

  if (split !== undefined && split.window.games >= 3) {
    const pointsDelta = split.window.points - split.season.points
    if (Math.abs(pointsDelta) >= SCORING_THRESHOLD) {
      observations.push({
        id: 'scoring-trend',
        tone: pointsDelta > 0 ? 'positive' : 'warning',
        label: pointsDelta > 0 ? 'Scoring trending up' : 'Scoring trending down',
        detail: `${signed(pointsDelta)} PTS per game over the last ${split.window.games} games versus the season average.`,
      })
    }

    const minutesDelta = split.window.minutes - split.season.minutes
    if (Math.abs(minutesDelta) >= MINUTES_THRESHOLD) {
      observations.push({
        id: 'minutes-trend',
        tone: minutesDelta > 0 ? 'positive' : 'warning',
        label: minutesDelta > 0 ? 'Role expanding' : 'Role shrinking',
        detail: `${signed(minutesDelta)} minutes per game over the last ${split.window.games} games.`,
      })
    }

    const turnoverDelta = split.window.turnovers - split.season.turnovers
    if (turnoverDelta >= TURNOVER_THRESHOLD) {
      observations.push({
        id: 'turnovers',
        tone: 'warning',
        label: 'Turnover rate rising',
        detail: `${signed(turnoverDelta)} turnovers per game over the last ${split.window.games} games.`,
      })
    }

    const shootingDelta = split.window.fieldGoalPercentage - split.season.fieldGoalPercentage
    if (Math.abs(shootingDelta) >= SHOOTING_THRESHOLD_PP) {
      observations.push({
        id: 'shooting-trend',
        tone: shootingDelta > 0 ? 'positive' : 'warning',
        label: shootingDelta > 0 ? 'Shooting efficiency improving' : 'Shooting efficiency falling',
        detail: `${signed(shootingDelta)} percentage points of field goal accuracy over the last ${split.window.games} games.`,
      })
    }
  }

  const player = world.players[playerId]!
  const best = strongCategory(player)
  const weakest = weakCategory(player)
  const league = leagueBaselineFor(world, player, best)
  if (league !== null) {
    const delta = aggregateCategoryValue(best, player.basketball.ratings) - league
    observations.push({
      id: 'league-strength',
      tone: delta >= 0 ? 'positive' : 'warning',
      label: `${CATEGORY_LABELS[best]} against the league`,
      detail: `${signed(delta)} versus the competition mean of ${league.toFixed(1)} for the same family.`,
    })
  }
  const weakLeague = leagueBaselineFor(world, player, weakest)
  if (weakLeague !== null && observations.length < MAX_OBSERVATIONS) {
    const delta = aggregateCategoryValue(weakest, player.basketball.ratings) - weakLeague
    if (delta < 0) {
      observations.push({
        id: 'league-weakness',
        tone: 'warning',
        label: `${CATEGORY_LABELS[weakest]} below the league mean`,
        detail: `${signed(delta)} versus the competition mean of ${weakLeague.toFixed(1)} for the same family.`,
      })
    }
  }

  const fatigue = getCareerFatigueForPlayer(world, playerId)
  if (fatigue >= HIGH_FATIGUE && observations.length < MAX_OBSERVATIONS) {
    observations.push({
      id: 'fatigue',
      tone: 'warning',
      label: 'Workload is high',
      detail: `Career fatigue is at ${fatigue}, which limits how much training load can be added.`,
    })
  }

  const injury = getCurrentPlayerInjury(world, playerId)
  if (injury !== undefined && observations.length < MAX_OBSERVATIONS) {
    observations.push({
      id: 'injury',
      tone: 'warning',
      label: 'Unavailable',
      detail: `${formatInjuryKind(injury.kind)} until ${formatGameDateLabel(injury.expectedReturnDate)}.`,
    })
  }

  return {
    observations: observations.slice(0, MAX_OBSERVATIONS),
    note:
      observations.length === 0
        ? 'No tracked signal yet: observations appear once games are played.'
        : 'Derived from this season’s tracked games and the competition baseline.',
  }
}

/** Mean of the same rating family across the player's competition rivals, or null when unknown. */
function leagueBaselineFor(
  world: GameWorld,
  player: Player,
  category: (typeof RADAR_CATEGORY_ORDER)[number],
): number | null {
  const season = world.seasons[world.currentSeasonId]
  const competition = season === undefined ? undefined : world.competitions[season.competitionId]
  if (competition === undefined) return null

  const rivals: number[] = []
  for (const teamId of competition.participantTeamIds) {
    const team = world.teams[teamId]
    if (team === undefined) continue
    for (const rosterId of team.rosterPlayerIds) {
      const rival = world.players[rosterId]
      if (rival === undefined || rival.id === player.id) continue
      rivals.push(aggregateCategoryValue(category, rival.basketball.ratings))
    }
  }

  return rivals.length === 0 ? null : mean(rivals)
}

/** How many rating curves the overview draws. More than three stops being readable at this height. */
const MAX_SERIES = 3

/**
 * The ratings worth drawing: whatever actually moved, ranked by the size of the recorded movement,
 * topped up with the strongest current ratings so a save without transitions still shows a profile.
 */
function buildRatingSeries(
  player: Player,
  history: PlayerRatingHistory,
  currentSeasonId: GameWorld['currentSeasonId'],
  tracked: PlayerTruthRatingKey,
): readonly OverviewRatingSeriesModel[] {
  const totals = new Map<PlayerTruthRatingKey, number>()
  for (const entry of history) {
    for (const [key, delta] of Object.entries(entry.deltas)) {
      if (PLAYER_TRUTH_KEYS.has(key)) {
        const ratingKey = key as PlayerTruthRatingKey
        totals.set(ratingKey, (totals.get(ratingKey) ?? 0) + Number(delta))
      }
    }
  }

  const moved = [...totals.entries()]
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]) || left[0].localeCompare(right[0]))
    .map(([key]) => key)
  const strongest = canonicalRatings(player.basketball.ratings)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key]) => key)

  return [...new Set([...moved, tracked, ...strongest])].slice(0, MAX_SERIES).map((key) => {
    const canonicalHistory = history.filter((entry) => PLAYER_TRUTH_KEYS.has(key) && (Number((entry.deltas as Readonly<Record<string, number>>)[key]) || 0) !== 0)
    let running = player.basketball.ratings[key] - canonicalHistory.reduce((sum, entry) => sum + ((entry.deltas as Readonly<Record<string, number>>)[key] ?? 0), 0)
    const points = canonicalHistory.flatMap((entry) => {
      const point = entry.seasonId === currentSeasonId ? [] : [running]
      running += (entry.deltas as Readonly<Record<string, number>>)[key] ?? 0
      return point
    })
    points.push(player.basketball.ratings[key])
    return {
      id: key,
      label: ratingLabel(key),
      points,
      delta: points.length < 2 ? 0 : points[points.length - 1]! - points[0]!,
    }
  })
}

function buildDevelopmentPulse(
  world: GameWorld,
  player: Player,
): PlayerOverviewModel['developmentPulse'] {
  const age = getPlayerAge(world, player.id)
  const stimulus = world.developmentStimulusByPlayerId[player.id]?.byRating
  const concentrated = stimulus === undefined
    ? undefined
    : Object.entries(stimulus)
        .filter(([key, value]) => PLAYER_TRUTH_KEYS.has(key) && Number(value) > 0)
        .map(([key, value]) => [key as PlayerTruthRatingKey, Number(value)] as const)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]

  const tracked: PlayerTruthRatingKey =
    concentrated?.[0] ??
    (canonicalRatings(player.basketball.ratings).sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0]?.[0] ??
      'PASSING_ACCURACY')

  const history = world.playerRatingHistoryByPlayerId[player.id] ?? []
  const series = buildRatingSeries(player, history, world.currentSeasonId, tracked)

  const lastTransition = history.at(-1)
  const movers: OverviewMoverModel[] =
    lastTransition === undefined
      ? []
      : Object.entries(lastTransition.deltas)
          .filter(([key]) => PLAYER_TRUTH_KEYS.has(key))
          .map(([key, delta]) => [key as PlayerTruthRatingKey, Number(delta)] as const)
          .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]) || left[0].localeCompare(right[0]))
          .slice(0, MAX_MOVERS)
          .map(([key, delta]) => ({ label: ratingLabel(key), delta }))

  const teamId = getPlayerRosterTeamId(world, player.id)
  const teamPlan = teamId === undefined ? undefined : getTrainingPlanForTeam(world, teamId)
  const individual = world.individualTrainingPlansByPlayerId[player.id]
  const trainingLabel: PresentationField<string> =
    individual?.active === true
      ? availableField(String(individual.primaryFocus))
      : teamPlan === undefined
        ? unavailableField('No plan')
        : availableField(`${String(teamPlan.focus)} (team)`)

  return {
    trendLabel: signed(getBaseDevelopmentTrend(age)),
    ageLabel: String(age),
    stageLabel: DEVELOPMENT_STAGE_LABELS[player.development.developmentStage],
    stageNote: 'Informational stage label; the offseason transition applies the base age trend.',
    ...buildPotential(world, player),
    trainingLabel,
    series,
    seasonLabels: [...history.map((entry) => entry.seasonId), world.currentSeasonId].map(
      (seasonId) => world.seasons[seasonId]?.label ?? seasonId,
    ),
    seriesNote:
      history.length === 0
        ? 'Rating evolution starts at the first offseason transition: only the current values are stored.'
        : `Recorded across ${history.length} season ${history.length === 1 ? 'transition' : 'transitions'}.`,
    movers,
    moversNote:
      lastTransition === undefined
        ? 'No offseason transition recorded yet, so there are no movers to show.'
        : `Applied when the ${lastTransition.seasonId} season closed.`,
  }
}

/**
 * Potential is a scouting reading, never the hidden ceiling: the strongest range the organization
 * has actually reported for one of the eight development domains. No evaluation means no claim.
 */
function buildPotential(
  world: GameWorld,
  player: Player,
): Pick<
  PlayerOverviewModel['developmentPulse'],
  'potentialStatus' | 'potentialLabel' | 'potentialNote'
> {
  const teamId = getPlayerRosterTeamId(world, player.id)
  if (teamId === undefined) {
    return {
      potentialStatus: 'unavailable',
      potentialLabel: 'Not scouted',
      potentialNote: 'Potential comes from scouting evaluations, which need a club context.',
    }
  }

  const organizationId = world.teams[teamId]!.organizationId
  const scouted = DEVELOPMENT_DOMAINS.map((domain) => ({
    domain,
    evaluation: getOrganizationRatingEvaluation({
      organizationId,
      playerId: player.id,
      dimension: `potential:${domain}`,
      knowledge: world.organizationKnowledge,
      currentDate: world.currentDate,
      publicPosition: player.basketball.primaryPosition,
    }),
  })).filter((entry) => entry.evaluation.mode !== 'UNKNOWN')

  if (scouted.length === 0) {
    return {
      potentialStatus: 'unavailable',
      potentialLabel: 'Not scouted',
      potentialNote: 'No scouting potential evaluation exists yet for this player.',
    }
  }

  const best = [...scouted].sort(
    (left, right) =>
      (intelligenceSortValue(right.evaluation) ?? 0) -
      (intelligenceSortValue(left.evaluation) ?? 0) ||
      left.domain.localeCompare(right.domain),
  )[0]!

  return {
    potentialStatus: 'available',
    potentialLabel: `${formatRatingEvaluation(best.evaluation)} · ${DEVELOPMENT_DOMAIN_LABELS[best.domain]}`,
    potentialNote: `Best reported ceiling across ${scouted.length} of ${DEVELOPMENT_DOMAINS.length} scouted domains. Scouting ranges only: hidden ceilings are never shown as exact values.`,
  }
}

function buildContractPulse(world: GameWorld, playerId: Player['id']): PlayerOverviewModel['contractPulse'] {
  const contract = buildPlayerContractModel(world, playerId)
  const current = contract.financialSchedule.find((row) => row.isCurrent)
  const raw = getCurrentPlayerContract(world, playerId)

  if (raw === undefined) {
    // A roster can hold a contract that only starts later, and a free agent holds none at all.
    const scheduled = getPlayerContracts(world, playerId).find(
      (candidate) => getPlayerContractStatus(candidate, world.currentDate) === 'scheduled',
    )
    if (scheduled !== undefined) {
      return {
        status: 'unavailable',
        teamName: world.teams[scheduled.teamId]?.name ?? null,
        salaryLabel: null,
        remainingLabel: null,
        endDateLabel: null,
        daysToExpiry: null,
        message: `No active contract. The deal with ${world.teams[scheduled.teamId]?.name ?? 'the club'} runs ${formatGameDateLabel(scheduled.term.startsOn)} to ${formatGameDateLabel(scheduled.term.expiresOn)}.`,
      }
    }

    return {
      status: 'unavailable',
      teamName: null,
      salaryLabel: null,
      remainingLabel: null,
      endDateLabel: null,
      daysToExpiry: null,
      message: isPlayerFreeAgent(world, playerId)
        ? 'Free agent: no contract on record.'
        : 'No contract recorded for this player.',
    }
  }

  return {
    status: 'available',
    teamName: contract.statusBand?.teamName ?? world.teams[raw.teamId]?.name ?? null,
    salaryLabel: current?.baseSalary.formatted ?? null,
    remainingLabel: contract.statusBand?.seasonsRemaining ?? null,
    endDateLabel: formatGameDateLabel(raw.term.expiresOn),
    daysToExpiry: calendarDaysBetween(world.currentDate, raw.term.expiresOn),
    message: null,
  }
}

function buildMedicalPulse(world: GameWorld, playerId: Player['id']): PlayerOverviewModel['medicalPulse'] {
  const injury = getCurrentPlayerInjury(world, playerId)
  const fatigue = getCareerFatigueForPlayer(world, playerId)
  const risk = resolvePlayerMedicalRiskPresentation(world, playerId)

  return {
    availabilityLabel: isPlayerAvailable(world, playerId)
      ? 'Available'
      : injury === undefined
        ? 'Unavailable'
        : `${formatInjuryKind(injury.kind)} · return ${formatGameDateLabel(injury.expectedReturnDate)}`,
    fatigueLabel: `${fatigue}%`,
    riskLabel:
      risk.status === 'available' ? risk.displayLabel! : risk.unavailableLabel ?? 'Not tracked',
    priorityLabel: injury === undefined ? null : 'Medical priority',
    priorityDetail:
      injury === undefined
        ? null
        : `${formatInjuryKind(injury.kind)} since ${formatGameDateLabel(injury.injuredOn)}. Expected return ${formatGameDateLabel(injury.expectedReturnDate)}.`,
  }
}

function buildAlerts(world: GameWorld, playerId: Player['id']): readonly OverviewAlertModel[] {
  const alerts: OverviewAlertModel[] = []
  // Every alert is evaluated today, so the row date is the date it refers to when it has one.
  const today = formatGameDateLabel(world.currentDate)
  const injury = getCurrentPlayerInjury(world, playerId)
  if (injury !== undefined) {
    alerts.push({
      id: 'injury',
      severity: 'critical',
      tag: 'Availability',
      label: 'Player is unavailable',
      detail: `${formatInjuryKind(injury.kind)} · expected return ${formatGameDateLabel(injury.expectedReturnDate)}.`,
      dateLabel: formatGameDateLabel(injury.expectedReturnDate),
      action: { label: 'VIEW MEDICAL', view: 'medical' },
    })
  }

  const rawContract = getCurrentPlayerContract(world, playerId)
  if (rawContract !== undefined) {
    const days = calendarDaysBetween(world.currentDate, rawContract.term.expiresOn)
    if (days <= CONTRACT_WARNING_DAYS) {
      alerts.push({
        id: 'contract-expiry',
        severity: 'critical',
        tag: 'Contract',
        label: 'Contract expires soon',
        detail: `Expires ${formatGameDateLabel(rawContract.term.expiresOn)}, in ${days} ${days === 1 ? 'day' : 'days'}.`,
        dateLabel: formatGameDateLabel(rawContract.term.expiresOn),
        action: { label: 'VIEW CONTRACT', view: 'contract' },
      })
    } else if (days <= 365) {
      alerts.push({
        id: 'contract-window',
        severity: 'warning',
        tag: 'Contract',
        label: 'Contract year',
        detail: `Expires ${formatGameDateLabel(rawContract.term.expiresOn)}, in ${days} days.`,
        dateLabel: formatGameDateLabel(rawContract.term.expiresOn),
        action: { label: 'VIEW CONTRACT', view: 'contract' },
      })
    }
  }

  const fatigue = getCareerFatigueForPlayer(world, playerId)
  if (fatigue >= HIGH_FATIGUE) {
    alerts.push({
      id: 'fatigue',
      severity: 'warning',
      tag: 'Workload',
      label: 'High fatigue',
      detail: `Career fatigue at ${fatigue}. Manage the training load.`,
      dateLabel: today,
      action: { label: 'ASSIGN TRAINING', view: 'development' },
    })
  }

  const morale = getMoraleBandForPerson(world, playerId)
  if (morale === 'low' || morale === 'veryLow') {
    alerts.push({
      id: 'morale',
      severity: 'warning',
      tag: 'Morale',
      label: morale === 'veryLow' ? 'Morale is very low' : 'Morale is low',
      detail: 'Check playing time and recent decisions with the player.',
      dateLabel: today,
      action: { label: 'VIEW PERFORMANCE', view: 'performance' },
    })
  }

  const individual = world.individualTrainingPlansByPlayerId[playerId]
  if (individual?.active !== true) {
    alerts.push({
      id: 'individual-plan',
      severity: 'info',
      tag: 'Development',
      label: 'No individual training plan',
      detail: 'Assign an individual plan to steer offseason development.',
      dateLabel: today,
      action: { label: 'ASSIGN TRAINING', view: 'development' },
    })
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'all-clear',
      severity: 'info',
      tag: 'Decisions',
      label: 'No critical issues',
      detail: 'Availability, workload, morale and contract need no action today.',
      dateLabel: today,
      action: null,
    })
  }

  const order = { critical: 0, warning: 1, info: 2 } as const
  return [...alerts].sort(
    (left, right) => order[left.severity] - order[right.severity] || left.id.localeCompare(right.id),
  )
}

interface TimelineNode extends OverviewTimelineNodeModel {
  readonly sortKey: string
}

function buildTimeline(world: GameWorld, playerId: Player['id']): readonly OverviewTimelineNodeModel[] {
  const nodes: TimelineNode[] = []
  const logs = getPlayerGameLogs(world, playerId)
  const oldest = logs.at(-1)
  if (oldest !== undefined) {
    nodes.push({
      id: 'first-game',
      sortKey: oldest.gameDate,
      label: 'First tracked game',
      detail: formatGameDateLabel(oldest.gameDate),
      dateLabel: formatGameDateLabel(oldest.gameDate),
      state: 'past',
    })
  }

  const best = [...logs].sort((left, right) => right.stats.points - left.stats.points)[0]
  if (best !== undefined && best.stats.points > 0) {
    const game = world.games[best.gameId]
    const teamId = getPlayerRosterTeamId(world, playerId)
    const opponentTeamId =
      game === undefined || teamId === undefined
        ? undefined
        : game.homeTeamId === teamId
          ? game.awayTeamId
          : game.homeTeamId
    const opponent = opponentTeamId === undefined ? undefined : world.teams[opponentTeamId]
    nodes.push({
      id: 'career-high',
      sortKey: best.gameDate,
      label: `Career high ${best.stats.points} PTS`,
      detail: `${opponent?.name ?? 'Opponent not tracked'} · ${formatGameDateLabel(best.gameDate)}`,
      dateLabel: formatGameDateLabel(best.gameDate),
      state: 'past',
    })
  }

  const contract = buildPlayerContractModel(world, playerId)
  const rawContract = getCurrentPlayerContract(world, playerId)
  if (rawContract !== undefined) {
    nodes.push({
      id: 'contract',
      sortKey: rawContract.term.startsOn,
      label: `Contract with ${contract.statusBand?.teamName ?? 'team'}`,
      detail: `Signed ${formatGameDateLabel(rawContract.term.startsOn)}`,
      dateLabel: formatGameDateLabel(rawContract.term.startsOn),
      state: 'past',
    })
    // A future node only exists when a contract actually runs out on record.
    nodes.push({
      id: 'contract-end',
      sortKey: rawContract.term.expiresOn,
      label: 'Contract end',
      detail: 'Free agent if not extended',
      dateLabel: formatGameDateLabel(rawContract.term.expiresOn),
      state: 'future',
    })
  }

  const season = world.seasons[world.currentSeasonId]
  if (season !== undefined) {
    nodes.push({
      id: 'current-season',
      sortKey: season.startDate,
      label: 'Current season',
      detail: season.label,
      dateLabel: season.label,
      state: 'current',
    })
  }

  return [...nodes]
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey) || left.id.localeCompare(right.id))
    .map(({ sortKey: _sortKey, ...node }) => node)
}

export function buildPlayerOverviewModel(
  world: GameWorld,
  playerId: Player['id'],
): PlayerOverviewModel | undefined {
  const player = world.players[playerId]
  if (player === undefined) return undefined

  const { observations, note } = buildObservations(world, playerId)

  return {
    identityModule: buildIdentityModule(world, player),
    season: buildSeasonSnapshot(world, playerId),
    recentForm: buildRecentForm(world, playerId),
    observations,
    observationsNote: note,
    developmentPulse: buildDevelopmentPulse(world, player),
    contractPulse: buildContractPulse(world, playerId),
    medicalPulse: buildMedicalPulse(world, playerId),
    alerts: buildAlerts(world, playerId),
    timeline: buildTimeline(world, playerId),
  }
}
