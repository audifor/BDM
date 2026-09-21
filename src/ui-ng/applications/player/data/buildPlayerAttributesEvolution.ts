import { PLAYER_TRUTH_RATING_KEYS, type PlayerTruthRatingKey, type Player } from '@/domain/player'
import type { SeasonId } from '@/domain/ids'
import { type GameWorld } from '@/domain/world'

import { formatSeasonSpanLabel } from './buildPlayerContractModel'
import { ratingLabel } from './ratingCatalog'
import type {
  AttributeHighlightModel,
  AttributeLeagueBaselineModel,
  AttributeStandingModel,
  AttributeTeamBaselineModel,
  AttributeTrainingAssignmentModel,
  AttributeTrainingOptionModel,
  OverviewGapModel,
  PlayerAttributesModel,
  RatingEvolutionModel,
  RatingEvolutionPointModel,
} from './playerWorkspaceModel'

const HISTORY_NOTE = 'One movement per offseason transition; past values are reconstructed from it.'
const NO_HISTORY_NOTE = 'No progression recorded yet: the curve starts at the first offseason transition.'
const LEAGUE_NOTE = 'Average of this rating across every rostered rival in the competition.'
const NO_LEAGUE_NOTE = 'No rivalling roster available for this competition.'
const TEAM_NOTE = 'Average of this rating across the player\'s teammates; the inspected player is excluded.'
const NO_TEAM_NOTE = 'No teammate roster is available for this player.'
const STANDING_NOTE =
  'Percentile is the share of rivalling rosters this value beats; the player never counts in their own sample.'
const NO_STANDING_NOTE = 'No rivalling roster available, so no percentile can be computed.'
/** Same slot the Personal training planner books when it assigns a module to a player. */

interface LeagueSample {
  readonly label: string | null
  /** Rivals only: the inspected player never contributes to their own baseline. */
  readonly players: readonly Player[]
}

interface TeamSample {
  readonly label: string | null
  /** Teammates only: the inspected player never contributes to their own baseline. */
  readonly players: readonly Player[]
}

/** Every rival rostered in the competition the player's current season belongs to. */
function competitionLeagueSample(world: GameWorld, player: Player): LeagueSample {
  const season = world.seasons[world.currentSeasonId]
  const competition = season === undefined ? undefined : world.competitions[season.competitionId]
  if (competition === undefined) return { label: null, players: [] }

  const players: Player[] = []
  for (const teamId of competition.participantTeamIds) {
    const team = world.teams[teamId]
    if (team === undefined) continue
    for (const playerId of team.rosterPlayerIds) {
      const rosterPlayer = world.players[playerId]
      if (rosterPlayer !== undefined && rosterPlayer.id !== player.id) players.push(rosterPlayer)
    }
  }

  return { label: competition.name, players }
}

/** Every other player rostered on the inspected player's current team. */
function teamRosterSample(world: GameWorld, player: Player): TeamSample {
  const team = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(player.id))
  if (team === undefined) return { label: null, players: [] }

  return {
    label: team.name,
    players: team.rosterPlayerIds.flatMap((playerId) => {
      const teammate = world.players[playerId]
      return teammate === undefined || teammate.id === player.id ? [] : [teammate]
    }),
  }
}

function buildLeagueBaseline(
  player: Player,
  league: LeagueSample,
  ratingId: PlayerTruthRatingKey,
): AttributeLeagueBaselineModel {
  if (league.players.length === 0) {
    return { status: 'unavailable', average: null, sampleSize: 0, scopeLabel: league.label, note: NO_LEAGUE_NOTE }
  }

  const total = league.players.reduce(
    (sum, candidate) => sum + candidate.basketball.ratings[ratingId],
    0,
  )
  return {
    status: 'available',
    average: Math.round((total / league.players.length) * 10) / 10,
    sampleSize: league.players.length,
    scopeLabel: league.label,
    note: LEAGUE_NOTE,
  }
}

function buildTeamBaseline(team: TeamSample, ratingId: PlayerTruthRatingKey): AttributeTeamBaselineModel {
  if (team.players.length === 0) {
    return { status: 'unavailable', average: null, sampleSize: 0, scopeLabel: team.label, note: NO_TEAM_NOTE }
  }

  const total = team.players.reduce((sum, teammate) => sum + teammate.basketball.ratings[ratingId], 0)
  return {
    status: 'available',
    average: Math.round((total / team.players.length) * 10) / 10,
    sampleSize: team.players.length,
    scopeLabel: team.label,
    note: TEAM_NOTE,
  }
}

/**
 * Standing of one attribute: how much of the competition it beats, and how it compares with the
 * rivals who play the same position. The inspected player never contributes to either sample.
 */
function buildStanding(
  player: Player,
  league: LeagueSample,
  ratingId: PlayerTruthRatingKey,
): AttributeStandingModel {
  const position = player.basketball.primaryPosition
  if (league.players.length === 0) {
    return {
      status: 'unavailable',
      percentile: null,
      positionAverage: null,
      positionLabel: position,
      positionSampleSize: 0,
      note: NO_STANDING_NOTE,
    }
  }

  const value = player.basketball.ratings[ratingId]
  const beaten = league.players.filter(
    (rival) => rival.basketball.ratings[ratingId] < value,
  ).length
  const peers = league.players.filter(
    (rival) => rival.basketball.primaryPosition === position,
  )
  const positionAverage =
    peers.length === 0
      ? null
      : Math.round(
          (peers.reduce((sum, rival) => sum + rival.basketball.ratings[ratingId], 0) / peers.length) * 10,
        ) / 10

  return {
    status: 'available',
    percentile: Math.round((beaten / league.players.length) * 100),
    positionAverage,
    positionLabel: position,
    positionSampleSize: peers.length,
    note:
      positionAverage === null
        ? STANDING_NOTE
        : `${STANDING_NOTE} Position average covers ${peers.length} rival ${position} players.`,
  }
}

function buildTrainingOptions(
  _world: GameWorld,
  _player: Player,
  _ratingId: PlayerTruthRatingKey,
): readonly AttributeTrainingOptionModel[] {
  // Current training definitions target only the separate legacy 35-key surface.
  return []
}

/**
 * Where a quick assignment would land: the next eligible training day, in the same slot the
 * Personal training planner uses. Scheduling itself stays canonical — the store action runs
 * `assignTrainingModuleToPlayer`, which validates the slot and rejects a real collision.
 */
function buildAssignmentContext(): AttributeTrainingAssignmentModel {
  return {
    status: 'unavailable',
    reason: 'Training plans do not target the canonical 80-key rating model yet.',
    date: null,
    startTime: null,
    sessionId: null,
    nextSession: null,
  }
}

function buildEvolution(
  world: GameWorld,
  player: Player,
  league: LeagueSample,
  team: TeamSample,
  assignment: AttributeTrainingAssignmentModel,
  ratingId: PlayerTruthRatingKey,
): RatingEvolutionModel {
  const current = player.basketball.ratings[ratingId]
  const history = world.playerRatingHistoryByPlayerId[player.id] ?? []
  const canonicalDeltas = history.map((entry) => (entry.deltas as Readonly<Record<string, number>>)[ratingId] ?? 0)
  const hasCanonicalHistory = canonicalDeltas.some((delta) => delta !== 0)
  let rated: { seasonId: SeasonId; value: number }[]
  if (hasCanonicalHistory) {
    let running = current - canonicalDeltas.reduce((sum, delta) => sum + delta, 0)
    rated = history.flatMap((entry, index) => {
      const point = entry.seasonId === world.currentSeasonId ? [] : [{ seasonId: entry.seasonId, value: running }]
      running += canonicalDeltas[index] ?? 0
      return point
    })
    rated.push({ seasonId: world.currentSeasonId, value: current })
  } else {
    // Legacy transitions cannot establish season-by-season values for the truth rating model.
    rated = [{ seasonId: world.currentSeasonId, value: current }]
  }

  const points: RatingEvolutionPointModel[] = rated.map((point, index) => ({
    id: point.seasonId,
    label: seasonLabel(world, point.seasonId),
    value: point.value,
    delta: index === 0 ? 0 : point.value - rated[index - 1]!.value,
    isCurrent: index === rated.length - 1,
  }))

  return {
    ratingId,
    current,
    points,
    changeSinceFirst: points.length < 2 ? 0 : current - points[0]!.value,
    hasRecordedHistory: hasCanonicalHistory,
    note: hasCanonicalHistory ? HISTORY_NOTE : NO_HISTORY_NOTE,
    accumulatedStimulus: null,
    league: buildLeagueBaseline(player, league, ratingId),
    team: buildTeamBaseline(team, ratingId),
    standing: buildStanding(player, league, ratingId),
    trainings: buildTrainingOptions(world, player, ratingId),
    assignment,
  }
}

/** How many attributes each highlight list shows. */
const HIGHLIGHT_COUNT = 4

function toHighlight(
  ratingId: PlayerTruthRatingKey,
  evolutionByRating: Readonly<Record<PlayerTruthRatingKey, RatingEvolutionModel>>,
): AttributeHighlightModel {
  const evolution = evolutionByRating[ratingId]
  return {
    id: ratingId,
    label: ratingLabel(ratingId),
    value: evolution.current,
    percentile: evolution.standing.percentile,
  }
}

/**
 * Signature skills and weak links are read from the standing against the competition, not from the
 * raw values: an 80 means something different for a guard than for a centre.
 */
export function buildAttributeHighlights(
  evolutionByRating: Readonly<Record<PlayerTruthRatingKey, RatingEvolutionModel>>,
): Pick<PlayerAttributesModel, 'signatureSkills' | 'weakLinks'> {
  const ranked = PLAYER_TRUTH_RATING_KEYS.filter(
    (key) => evolutionByRating[key].standing.percentile !== null,
  ).sort((left, right) => {
    const leftPercentile = evolutionByRating[left].standing.percentile ?? 0
    const rightPercentile = evolutionByRating[right].standing.percentile ?? 0
    return rightPercentile - leftPercentile || left.localeCompare(right)
  })

  return {
    signatureSkills: ranked
      .slice(0, HIGHLIGHT_COUNT)
      .map((key) => toHighlight(key, evolutionByRating)),
    weakLinks: ranked
      .slice(-HIGHLIGHT_COUNT)
      .reverse()
      .map((key) => toHighlight(key, evolutionByRating)),
  }
}

/**
 * Reference elements this page cannot produce yet. Each one states why, so nothing is approximated.
 */
export function buildAttributeGaps(): readonly OverviewGapModel[] {
  return [
    {
      id: 'category-description',
      label: 'Category description',
      reason: 'Authored copy: the world stores ratings, never prose about them.',
    },
    {
      id: 'role-fit',
      label: 'Role fit',
      reason: 'No role-requirement table exists in the domain, so no percentage can be computed.',
    },
  ]
}

/** `2032/33` for seasons the world knows, otherwise the raw season id so nothing is invented. */
function seasonLabel(world: GameWorld, seasonId: SeasonId): string {
  const season = world.seasons[seasonId]
  if (season === undefined) return seasonId
  const startYear = Number(season.startDate.slice(0, 4))
  return Number.isFinite(startYear) ? formatSeasonSpanLabel(startYear) : seasonId
}

export function buildPlayerAttributesEvolution(
  world: GameWorld,
  player: Player,
): Readonly<Record<PlayerTruthRatingKey, RatingEvolutionModel>> {
  const league = competitionLeagueSample(world, player)
  const team = teamRosterSample(world, player)
  const assignment = buildAssignmentContext()
  return Object.fromEntries(
    PLAYER_TRUTH_RATING_KEYS.map((key) => [key, buildEvolution(world, player, league, team, assignment, key)]),
  ) as Readonly<Record<PlayerTruthRatingKey, RatingEvolutionModel>>
}
