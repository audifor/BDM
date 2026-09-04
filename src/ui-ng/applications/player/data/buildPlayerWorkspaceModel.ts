import { formatInjuryKind } from '@/domain/injury'
import type { PlayerId } from '@/domain/ids'
import { getPlayerAge, type PlayerRatings } from '@/domain/player'
import {
  getCareerFatigueForPlayer,
  getCurrentPlayerInjury,
  getMoraleBandForPerson,
  isPlayerAvailable,
} from '@/domain/world'
import type { GameWorld } from '@/domain/world'
import {
  calculatePlayerStatAverages,
  getPlayerGameLogs,
  getPlayerSeasonStats,
} from '@/engine/stats/PlayerHistory'
import { getUserTeam } from '@/engine/calendar'

import {
  aggregateCategoryValue,
  buildOverviewRatingKeys,
  ratingCategory,
  ratingLabel,
  RADAR_CATEGORY_ORDER,
} from './ratingCatalog'
import {
  availableField,
  deriveTeamColors,
  findTeamForPlayer,
  opponentShortCode,
  teamShortCode,
  unavailableField,
} from './presentationHelpers'
import type {
  EvaluationItem,
  PlayerWorkspaceModel,
  PlayerRatingRow,
  RecentFormGameModel,
} from './playerWorkspaceModel'

const MORALE_BAND_LABELS = {
  veryLow: 'Very Low',
  low: 'Low',
  stable: 'Stable',
  good: 'Good',
  excellent: 'Excellent',
} as const

const OVERVIEW_EVALUATION_COUNT = 3

function buildRatings(playerRatings: PlayerRatings): PlayerRatingRow[] {
  return buildOverviewRatingKeys(playerRatings).map((key) => ({
    id: key,
    label: ratingLabel(key),
    category: ratingCategory(key),
    value: playerRatings[key],
  }))
}

function buildEvaluations(
  ratings: readonly PlayerRatingRow[],
  kind: 'strength' | 'limitation',
): EvaluationItem[] {
  const sorted = [...ratings].sort((left, right) =>
    kind === 'strength'
      ? right.value - left.value || left.label.localeCompare(right.label)
      : left.value - right.value || left.label.localeCompare(right.label),
  )

  return sorted.slice(0, OVERVIEW_EVALUATION_COUNT).map((rating, index) => ({
    id: `${kind}-${rating.id}`,
    label: rating.label,
    level: rating.value,
    kind,
  }))
}

function buildSeasonPerformance(world: GameWorld, playerId: PlayerId): PlayerWorkspaceModel['seasonPerformance'] {
  const season = world.seasons[world.currentSeasonId]
  const competition = season === undefined ? undefined : world.competitions[season.competitionId]
  const stats = getPlayerSeasonStats(world, playerId, world.currentSeasonId)
  const averages = calculatePlayerStatAverages(stats)

  if (stats.gamesPlayed === 0) {
    return {
      status: 'unavailable',
      primary: [],
      secondary: [],
      metaLabel: competition === undefined || season === undefined
        ? undefined
        : `${competition.name} · ${season.label}`,
    }
  }

  const trueShooting =
    stats.fieldGoalsAttempted + 0.44 * stats.freeThrowsAttempted === 0
      ? undefined
      : stats.points / (2 * (stats.fieldGoalsAttempted + 0.44 * stats.freeThrowsAttempted))

  const primary = [
    { label: 'PTS', value: averages.ppg.toFixed(1) },
    { label: 'AST', value: averages.apg.toFixed(1) },
    { label: 'REB', value: averages.rpg.toFixed(1) },
    ...(trueShooting === undefined
      ? []
      : [{ label: 'TS%', value: (trueShooting * 100).toFixed(1) }]),
  ]

  const secondary = [
    { label: 'GP', value: String(stats.gamesPlayed) },
    { label: 'MIN', value: averages.mpg.toFixed(1) },
    { label: 'STL', value: averages.spg.toFixed(1) },
    { label: 'TOV', value: averages.turnoversPerGame.toFixed(1) },
    { label: 'FG%', value: averages.fieldGoalPercentage.toFixed(1) },
    { label: '3P%', value: averages.threePointPercentage.toFixed(1) },
    { label: 'FT%', value: averages.freeThrowPercentage.toFixed(1) },
  ]

  return {
    status: 'available',
    metaLabel:
      competition === undefined || season === undefined
        ? undefined
        : `${competition.name} · ${season.label}`,
    primary,
    secondary,
  }
}

function buildRecentForm(
  world: GameWorld,
  playerId: PlayerId,
  teamId: string | undefined,
  seasonAveragePoints?: number,
): PlayerWorkspaceModel['recentForm'] {
  const logs = getPlayerGameLogs(world, playerId).slice(0, 8)
  if (logs.length === 0 || teamId === undefined) {
    return { status: 'unavailable', games: [] }
  }

  const games: RecentFormGameModel[] = logs.map((line, index) => {
    const game = world.games[line.gameId]
    const opponentTeamId =
      game === undefined
        ? undefined
        : game.homeTeamId === teamId
          ? game.awayTeamId
          : game.homeTeamId
    const opponent = opponentTeamId === undefined ? undefined : world.teams[opponentTeamId]

    return {
      id: line.gameId,
      label: `G${logs.length - index}`,
      opponent: opponent === undefined ? '—' : opponentShortCode(opponent.name),
      points: line.stats.points,
      plusMinus: line.stats.plusMinus,
      minutes: Math.round(line.stats.secondsPlayed / 60),
    }
  })

  return {
    status: 'available',
    games,
    seasonAveragePoints,
  }
}

export function buildPlayerWorkspaceModel(
  world: GameWorld,
  playerId: PlayerId,
): PlayerWorkspaceModel | undefined {
  const player = world.players[playerId]
  if (player === undefined) return undefined

  const team = findTeamForPlayer(world, player.id) ?? getUserTeam(world)
  const season = world.seasons[world.currentSeasonId]
  const competition = season === undefined ? undefined : world.competitions[season.competitionId]
  const country = world.countries[player.nationalityId]
  const fatigue = getCareerFatigueForPlayer(world, player.id)
  const injury = getCurrentPlayerInjury(world, player.id)
  const moraleBand = getMoraleBandForPerson(world, player.id)
  const ratings = buildRatings(player.basketball.ratings)
  const seasonStats = getPlayerSeasonStats(world, player.id, world.currentSeasonId)
  const seasonAverages =
    seasonStats.gamesPlayed === 0 ? undefined : calculatePlayerStatAverages(seasonStats).ppg
  const teamColors = team === undefined ? deriveTeamColors('free-agent') : deriveTeamColors(team.id)

  return {
    identity: {
      playerId: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      initials: `${player.firstName[0] ?? ''}${player.lastName[0] ?? ''}`,
      jerseyNumber: unavailableField('Not tracked'),
      teamName: team === undefined ? unavailableField('Free agent') : availableField(team.name),
      teamShort: team === undefined ? unavailableField('—') : availableField(teamShortCode(team.name)),
      competitionLabel:
        competition === undefined ? unavailableField('Not available') : availableField(competition.name),
      seasonLabel: season === undefined ? unavailableField('Not available') : availableField(season.label),
      primaryPosition: player.basketball.primaryPosition,
      secondaryPositions: player.basketball.secondaryPositions ?? [],
      age: availableField(getPlayerAge(world, player.id)),
      nationality:
        country === undefined ? unavailableField('Unknown') : availableField(country.name),
      height: availableField(`${player.bio.heightCm} cm`),
      weight: availableField(`${player.bio.weightKg} kg`),
      portrait: availableField('initials'),
      teamCrest: availableField('initials'),
      teamColors,
    },
    status: {
      availability: isPlayerAvailable(world, player.id)
        ? availableField('Available')
        : availableField(
            injury === undefined
              ? 'Unavailable'
              : `${formatInjuryKind(injury.kind)} · return ${injury.expectedReturnDate}`,
          ),
      condition: availableField(Math.max(0, 100 - fatigue)),
      fatigue: availableField(fatigue),
      morale:
        moraleBand === undefined
          ? unavailableField('Not available')
          : availableField(MORALE_BAND_LABELS[moraleBand]),
      sharpness: unavailableField('Not tracked'),
      risk: unavailableField('Not tracked'),
    },
    ratings,
    strengths: buildEvaluations(ratings, 'strength'),
    limitations: buildEvaluations(ratings, 'limitation'),
    radarAxes: RADAR_CATEGORY_ORDER.map((category) => ({
      key: category,
      label: category === 'ballHandling' ? 'HANDLE' : category === 'playmaking' ? 'PLAY' : category === 'offBall' ? 'OFF' : category === 'defense' ? 'DEF' : category === 'physical' ? 'PHYS' : category === 'mental' ? 'MENT' : category === 'finishing' ? 'FIN' : 'SHOOT',
      value: aggregateCategoryValue(category, player.basketball.ratings),
    })),
    roleProfile: {
      primaryPosition: player.basketball.primaryPosition,
      secondaryPositions: player.basketball.secondaryPositions ?? [],
      derivedHighlights: [...ratings]
        .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
        .slice(0, 3)
        .map((rating) => rating.label),
      isDerived: true,
    },
    seasonPerformance: buildSeasonPerformance(world, player.id),
    recentForm: buildRecentForm(world, player.id, team?.id, seasonAverages),
    shotProfile: {
      status: 'unavailable',
      message: 'Shot tracking not yet available',
    },
  }
}

export function defaultPlayerIdForNg(world: GameWorld): PlayerId | undefined {
  const userTeam = getUserTeam(world)
  if (userTeam === undefined) {
    const first = Object.values(world.players)[0]
    return first?.id
  }

  const roster = userTeam.rosterPlayerIds
    .map((id) => world.players[id])
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
    .sort((left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`),
    )

  return roster[0]?.id
}

export function rosterPlayerOptions(world: GameWorld): readonly { readonly id: PlayerId; readonly label: string }[] {
  const userTeam = getUserTeam(world)
  if (userTeam === undefined) {
    return Object.values(world.players)
      .slice()
      .sort((left, right) =>
        `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`),
      )
      .map((player) => ({
        id: player.id,
        label: `${player.firstName} ${player.lastName} · ${player.basketball.primaryPosition}`,
      }))
  }

  return userTeam.rosterPlayerIds
    .map((id) => world.players[id])
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
    .sort((left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`),
    )
    .map((player) => ({
      id: player.id,
      label: `${player.firstName} ${player.lastName} · ${player.basketball.primaryPosition}`,
    }))
}
