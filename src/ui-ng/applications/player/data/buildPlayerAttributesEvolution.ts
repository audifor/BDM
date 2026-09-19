import type { CanonicalRatingKey, Player } from '@/domain/player'
import { CANONICAL_RATING_KEYS } from '@/domain/player'
import type { SeasonId } from '@/domain/ids'
import { ratingHistorySeries, EMPTY_PLAYER_RATING_HISTORY } from '@/domain/development/PlayerRatingHistory'
import { TRAINING_CATALOG, isPositionEligible, type TrainingCategory, type TrainingDefinition } from '@/domain/training'
import { getPlayerRosterTeamId, type GameWorld } from '@/domain/world'
import { nextEligibleTrainingDate, resolveTrainingModule } from '@/engine/training'
import { getUserTeam } from '@/engine/calendar'

import { formatSeasonSpanLabel } from './buildPlayerContractModel'
import { ratingLabel } from './ratingCatalog'
import type {
  AttributeHighlightModel,
  AttributeLeagueBaselineModel,
  AttributeNextSessionModel,
  AttributeStandingModel,
  AttributeTrainingAssignmentModel,
  AttributeTrainingOptionModel,
  OverviewGapModel,
  PlayerAttributesModel,
  RatingEvolutionModel,
  RatingEvolutionPointModel,
} from './playerWorkspaceModel'

const HISTORY_NOTE = 'One movement per offseason transition; past values are reconstructed from it.'
const NO_HISTORY_NOTE = 'No progression recorded yet: the curve starts at the first offseason transition.'
const LEAGUE_NOTE = 'Mean of this rating across every rostered rival in the competition.'
const NO_LEAGUE_NOTE = 'No rivalling roster available for this competition.'
const STANDING_NOTE =
  'Percentile is the share of rivalling rosters this value beats; the player never counts in their own sample.'
const NO_STANDING_NOTE = 'No rivalling roster available, so no percentile can be computed.'
/** Same slot the Personal training planner books when it assigns a module to a player. */
const INDIVIDUAL_SESSION_START = '09:00'
const NO_OWN_ROSTER_REASON = 'Only players on your own roster can be scheduled from here.'

const TRAINING_CATEGORY_LABELS: Record<TrainingCategory, string> = {
  shooting: 'Shooting',
  finishing: 'Finishing',
  ballHandling: 'Ball Handling',
  playmaking: 'Playmaking',
  defense: 'Defense',
  rebounding: 'Rebounding',
  physical: 'Physical',
  recovery: 'Recovery',
  tactical: 'Tactical',
}

const TRAINING_SCOPE_LABELS = {
  team: 'Team session',
  individual: 'Individual session',
  both: 'Team or individual',
} as const

interface LeagueSample {
  readonly label: string | null
  /** Rivals only: the inspected player never contributes to their own baseline. */
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

function buildLeagueBaseline(
  player: Player,
  league: LeagueSample,
  ratingId: CanonicalRatingKey,
): AttributeLeagueBaselineModel {
  if (league.players.length === 0) {
    return { status: 'unavailable', mean: null, sampleSize: 0, scopeLabel: league.label, note: NO_LEAGUE_NOTE }
  }

  const total = league.players.reduce(
    (sum, candidate) => sum + candidate.basketball.ratings[ratingId],
    0,
  )
  return {
    status: 'available',
    mean: Math.round((total / league.players.length) * 10) / 10,
    sampleSize: league.players.length,
    scopeLabel: league.label,
    note: LEAGUE_NOTE,
  }
}

/**
 * Standing of one attribute: how much of the competition it beats, and how it compares with the
 * rivals who play the same position. The inspected player never contributes to either sample.
 */
function buildStanding(
  player: Player,
  league: LeagueSample,
  ratingId: CanonicalRatingKey,
): AttributeStandingModel {
  const position = player.basketball.primaryPosition
  if (league.players.length === 0) {
    return {
      status: 'unavailable',
      percentile: null,
      positionMean: null,
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
  const positionMean =
    peers.length === 0
      ? null
      : Math.round(
          (peers.reduce((sum, rival) => sum + rival.basketball.ratings[ratingId], 0) / peers.length) * 10,
        ) / 10

  return {
    status: 'available',
    percentile: Math.round((beaten / league.players.length) * 100),
    positionMean,
    positionLabel: position,
    positionSampleSize: peers.length,
    note:
      positionMean === null
        ? STANDING_NOTE
        : `${STANDING_NOTE} Position mean covers ${peers.length} rival ${position} players.`,
  }
}

function buildTrainingOptions(
  world: GameWorld,
  player: Player,
  ratingId: CanonicalRatingKey,
): readonly AttributeTrainingOptionModel[] {
  const fromCatalog = TRAINING_CATALOG.filter(
    (definition) =>
      definition.effects.targetRatings.includes(ratingId) &&
      definition.effects.developmentWeight > 0 &&
      isPositionEligible(definition, player.basketball.primaryPosition),
  ).map((definition) => toTrainingOption(definition, definition.id, definition.name, false, definition.scope))

  // Modules the user already created execute as their base definition, so they belong on the same
  // list as the definition they are built on. `resolveTrainingModule` is the canonical resolution
  // path shared with individual assignment and the team planner.
  const fromUserModules = Object.values(world.userTrainingModulesById).flatMap((module) => {
    const { definition, scope, intensity } = resolveTrainingModule(world, module.id)
    if (
      !definition.effects.targetRatings.includes(ratingId) ||
      definition.effects.developmentWeight <= 0 ||
      !isPositionEligible(definition, player.basketball.primaryPosition)
    ) {
      return []
    }
    return [toTrainingOption(definition, module.id, module.name, true, scope, intensity)]
  })

  return [...fromCatalog, ...fromUserModules].sort(
    (left, right) =>
      right.developmentWeight - left.developmentWeight ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  )
}

function toTrainingOption(
  definition: TrainingDefinition,
  id: string,
  name: string,
  isUserModule: boolean,
  scope: TrainingDefinition['scope'],
  intensity?: string,
): AttributeTrainingOptionModel {
  return {
    id,
    definitionId: definition.id,
    name,
    categoryLabel: TRAINING_CATEGORY_LABELS[definition.category],
    scopeLabel: TRAINING_SCOPE_LABELS[scope],
    defaultIntensity: intensity ?? definition.defaultIntensity,
    developmentWeight: definition.effects.developmentWeight,
    fatigueMultiplier: definition.effects.fatigueMultiplier,
    durationMinutes: definition.durationMinutes,
    isUserModule,
    individualAssignable: scope !== 'team',
  }
}

/** The player's earliest pending individual session, exactly as the world has it scheduled. */
function nextIndividualSession(world: GameWorld, playerId: Player['id']): AttributeNextSessionModel | null {
  const pending = Object.values(world.scheduledTrainingSessionsById)
    .filter(
      (session) =>
        session.scope === 'individual' && session.playerId === playerId && session.status === 'scheduled',
    )
    .sort((left, right) =>
      left.date === right.date
        ? left.startTime.localeCompare(right.startTime)
        : left.date.localeCompare(right.date),
    )[0]
  if (pending === undefined) return null

  const moduleId = pending.moduleId ?? null
  const definition = TRAINING_CATALOG.find((entry) => entry.id === pending.definitionId)
  return {
    sessionId: pending.id,
    definitionId: pending.definitionId,
    moduleId,
    // The user picked a module, so name it — falling back to the definition it executes as.
    label:
      (moduleId === null ? undefined : world.userTrainingModulesById[moduleId]?.name) ??
      definition?.name ??
      pending.definitionId,
    date: pending.date,
    startTime: pending.startTime,
    intensity: pending.intensity,
  }
}

/**
 * Where a quick assignment would land: the next eligible training day, in the same slot the
 * Personal training planner uses. Scheduling itself stays canonical — the store action runs
 * `assignTrainingModuleToPlayer`, which validates the slot and rejects a real collision.
 */
function buildAssignmentContext(world: GameWorld, player: Player): AttributeTrainingAssignmentModel {
  const userTeam = getUserTeam(world)
  const nextSession = nextIndividualSession(world, player.id)
  if (userTeam === undefined || getPlayerRosterTeamId(world, player.id) !== userTeam.id) {
    return {
      status: 'unavailable',
      reason: NO_OWN_ROSTER_REASON,
      date: null,
      startTime: null,
      sessionId: null,
      nextSession,
    }
  }

  const date = nextEligibleTrainingDate(world.currentDate)
  return {
    status: 'available',
    reason: null,
    date,
    startTime: INDIVIDUAL_SESSION_START,
    // Re-assigning for the same day replaces that pending session instead of colliding with it.
    sessionId: `session:individual:${player.id}:${date}`,
    nextSession,
  }
}

function buildEvolution(
  world: GameWorld,
  player: Player,
  league: LeagueSample,
  assignment: AttributeTrainingAssignmentModel,
  ratingId: CanonicalRatingKey,
): RatingEvolutionModel {
  const current = player.basketball.ratings[ratingId]
  const history = world.playerRatingHistoryByPlayerId[player.id] ?? EMPTY_PLAYER_RATING_HISTORY
  const rated = ratingHistorySeries(player.basketball.ratings, history, ratingId, world.currentSeasonId)

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
    hasRecordedHistory: history.length > 0,
    note: history.length > 0 ? HISTORY_NOTE : NO_HISTORY_NOTE,
    accumulatedStimulus: world.developmentStimulusByPlayerId[player.id]?.byRating[ratingId] ?? 0,
    league: buildLeagueBaseline(player, league, ratingId),
    standing: buildStanding(player, league, ratingId),
    trainings: buildTrainingOptions(world, player, ratingId),
    assignment,
  }
}

/** How many attributes each highlight list shows. */
const HIGHLIGHT_COUNT = 4

function toHighlight(
  ratingId: CanonicalRatingKey,
  evolutionByRating: Readonly<Record<CanonicalRatingKey, RatingEvolutionModel>>,
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
  evolutionByRating: Readonly<Record<CanonicalRatingKey, RatingEvolutionModel>>,
): Pick<PlayerAttributesModel, 'signatureSkills' | 'weakLinks'> {
  const ranked = CANONICAL_RATING_KEYS.filter(
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
): Readonly<Record<CanonicalRatingKey, RatingEvolutionModel>> {
  const league = competitionLeagueSample(world, player)
  const assignment = buildAssignmentContext(world, player)
  return Object.fromEntries(
    CANONICAL_RATING_KEYS.map((key) => [key, buildEvolution(world, player, league, assignment, key)]),
  ) as Readonly<Record<CanonicalRatingKey, RatingEvolutionModel>>
}
