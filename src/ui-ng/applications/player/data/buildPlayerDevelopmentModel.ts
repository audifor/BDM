import { DEVELOPMENT_DOMAINS, type DevelopmentDomain } from '@/domain/player/PlayerDevelopmentProfile'
import { getPlayerAge, PLAYER_TRUTH_RATING_KEYS, type PlayerTruthRatingKey } from '@/domain/player'
import type { PlayerId, SeasonId } from '@/domain/ids'
import { organizationIdForTeam } from '@/domain/ids'
import { formatInjuryKind } from '@/domain/injury'
import type { PlayerRatingHistory } from '@/domain/development/PlayerRatingHistory'
import {
  formatRatingEvaluation,
  getOrganizationRatingEvaluation,
} from '@/domain/intelligence/OrganizationPlayerEvaluation'
import {
  getCareerFatigueForPlayer,
  getDevelopmentStimulusForPlayer,
  getTrainingPlanForTeam,
  type GameWorld,
} from '@/domain/world'
import { getBaseDevelopmentTrend } from '@/engine/development/PlayerDevelopment'
import { calculatePlayerStatAverages, getPlayerSeasonStats } from '@/engine/stats/PlayerHistory'

import { formatSeasonSpanLabel } from './buildPlayerContractModel'
import { calendarDaysBetween } from './buildPlayerMedicalModel'

import {
  aggregateCategoryValue,
  CATEGORY_LABELS,
  RADAR_CATEGORY_ORDER,
  ratingCategory,
  ratingLabel,
  type RatingCategory,
} from './ratingCatalog'
import { findTeamForPlayer, formatGameDateLabel } from './presentationHelpers'
import type { OverviewGapModel, PresentationAvailability } from './playerWorkspaceModel'

/** Canonical ratings of one family, in catalog order. */
function ratingKeysForCategory(category: RatingCategory): readonly PlayerTruthRatingKey[] {
  return PLAYER_TRUTH_RATING_KEYS.filter((key) => ratingCategory(key) === category)
}

export interface DevelopmentContextBandModel {
  readonly age: number
  readonly seasonLabel: string | null
  readonly developmentStageLabel: string
  readonly developmentStageNote: string
  readonly ageTrendLabel: string
  readonly ageTrendNote: string
}

export interface DevelopmentStimulusCategoryRowModel {
  readonly id: RatingCategory
  readonly categoryLabel: string
  readonly stimulusTotal: number
  readonly ratingCount: number
}

export interface DevelopmentStimulusRatingRowModel {
  readonly id: PlayerTruthRatingKey
  readonly ratingLabel: string
  readonly categoryLabel: string
  readonly stimulus: number
}

export interface DevelopmentSeasonStimulusModel {
  readonly totalStimulus: number
  readonly categories: readonly DevelopmentStimulusCategoryRowModel[]
  readonly topRatings: readonly DevelopmentStimulusRatingRowModel[]
  readonly contextNote: string
}

export interface DevelopmentScoutPotentialRowModel {
  readonly id: string
  readonly domainLabel: string
  readonly evaluationLabel: string
}

export interface DevelopmentScoutPotentialModel {
  readonly status: 'available' | 'unavailable'
  readonly rows: readonly DevelopmentScoutPotentialRowModel[]
  readonly unavailableLabel: string | null
  readonly contextNote: string
}

export interface DevelopmentTrainingContextModel {
  readonly teamIntensity: string | null
  readonly teamFocus: string | null
  readonly individualPlanActive: boolean
  readonly individualFocus: string | null
  readonly individualIntensity: string | null
  readonly contextNote: string
}

/** One rating's season-by-season curve, reconstructed from the recorded rating deltas. */
export interface DevelopmentCurveSeriesModel {
  readonly id: PlayerTruthRatingKey
  readonly label: string
  readonly points: readonly number[]
  readonly delta: number
}

/** A rating that moved in the last recorded offseason transition, with the season it moved in. */
export interface DevelopmentMoverRowModel {
  readonly id: PlayerTruthRatingKey
  readonly label: string
  readonly delta: number
  readonly seasonLabel: string
}

/** A real, dated development event. Only what the world records: transitions and injuries. */
export interface DevelopmentEventRowModel {
  readonly id: string
  readonly dateLabel: string
  readonly label: string
  readonly detail: string
  readonly kind: 'injury' | 'transition'
  /** Rating points the event moved, when the save records a movement. */
  readonly impact: number | null
}

export interface DevelopmentLongitudinalModel {
  readonly headline: string
  readonly status: 'available' | 'unavailable'
  readonly message: string
  readonly series: readonly DevelopmentCurveSeriesModel[]
  readonly movers: readonly DevelopmentMoverRowModel[]
  readonly events: readonly DevelopmentEventRowModel[]
  readonly note: string
}

/** The lifecycle rail. The stage order is the domain's, with the current stage marked. */
export interface DevelopmentLifecycleModel {
  readonly stages: readonly { readonly id: string; readonly label: string; readonly isCurrent: boolean }[]
  readonly currentLabel: string
  readonly focusLabel: string
  readonly potentialLabel: string
  readonly potentialStatus: PresentationAvailability
}

/** A factor that is genuinely moving development, with the value it carries. */
export interface DevelopmentDriverRowModel {
  readonly id: string
  readonly label: string
  readonly valueLabel: string
  readonly tone: 'positive' | 'negative' | 'neutral'
}

/** Category-level current value and recorded trend. */
export interface DevelopmentCategoryRowModel {
  readonly id: RatingCategory
  readonly categoryLabel: string
  readonly current: number
  readonly trend: number
  readonly scoutingLabel: string | null
  /** Upper end of the scouted potential range for the matching domain, never a hidden ceiling. */
  readonly potential: number | null
}

/** One category's reconstructed season-by-season index, for the career curve. */
export interface DevelopmentCategoryCurveModel {
  readonly id: RatingCategory
  readonly label: string
  readonly points: readonly number[]
  readonly delta: number
  /** Movement the category recorded in the most recent transition. */
  readonly lastDelta: number
}

/** A dated event placed on its season column of the curve. */
export interface DevelopmentMarkerModel {
  readonly id: string
  readonly label: string
  readonly kind: 'injury' | 'transition'
  readonly dateLabel: string
  /** Index of the season column the marker belongs to. */
  readonly columnIndex: number
  readonly detail: string
}

/** Band 1: the four readings of the overview strip. */
export interface DevelopmentOverviewModel {
  readonly ageLabel: string
  readonly careerStageLabel: string
  readonly trendLabel: string
  readonly trendTone: 'positive' | 'negative' | 'neutral'
  readonly trendNote: string
  readonly nextEvaluationLabel: string
  readonly nextEvaluationNote: string
}

/** Band 2 · right: everything the detail panel shows for one category. */
export interface DevelopmentDetailModel {
  readonly categoryLabel: string
  readonly current: number
  readonly trend: number
  readonly rateLabel: string
  readonly rateTone: 'positive' | 'negative' | 'neutral'
  readonly rateNote: string
  readonly improvements: readonly string[]
  readonly toImprove: readonly string[]
  readonly coachNote: string
}

/** Band 3 · training plan and its expected effect. */
export interface DevelopmentTrainingPlanModel {
  readonly focusLabel: string
  readonly focusDetail: string
  readonly secondaryLabel: string
  readonly secondaryDetail: string
  readonly loadFill: number | null
  readonly loadLabel: string
  readonly loadTone: 'positive' | 'moderate' | 'high' | 'neutral'
}

export interface DevelopmentTrainingEffectRowModel {
  readonly id: RatingCategory
  readonly label: string
  readonly impact: number
  readonly tone: 'positive' | 'neutral'
}

export interface DevelopmentTrainingEffectModel {
  readonly rows: readonly DevelopmentTrainingEffectRowModel[]
  readonly confidenceLabel: string
  readonly confidenceFill: number | null
  readonly note: string
}

/** Band 4 · right: the scouted projection, from reported ranges only. */
export interface DevelopmentProjectionOutcomeModel {
  readonly id: 'low' | 'expected' | 'high'
  readonly label: string
  readonly domainLabel: string
  readonly rangeLabel: string
}

export interface DevelopmentProjectionModel {
  readonly status: PresentationAvailability
  readonly outcomes: readonly DevelopmentProjectionOutcomeModel[]
  readonly note: string
}

/** Band 4 · middle: the event log is the same list the curve marks, with its recorded impact. */

export interface DevelopmentInspectorStimulusDetail {
  readonly kind: 'stimulus-category'
  readonly categoryLabel: string
  readonly stimulusTotal: number
  readonly ratingCount: number
  readonly contextNote: string
}

export interface DevelopmentInspectorRatingStimulusDetail {
  readonly kind: 'stimulus-rating'
  readonly ratingLabel: string
  readonly categoryLabel: string
  readonly stimulus: number
  readonly contextNote: string
}

export interface DevelopmentInspectorPotentialDetail {
  readonly kind: 'scout-potential'
  readonly domainLabel: string
  readonly evaluationLabel: string
  readonly contextNote: string
}

export type DevelopmentInspectorDetail =
  | DevelopmentInspectorStimulusDetail
  | DevelopmentInspectorRatingStimulusDetail
  | DevelopmentInspectorPotentialDetail

export interface PlayerDevelopmentModel {
  readonly contextBand: DevelopmentContextBandModel
  readonly overview: DevelopmentOverviewModel
  readonly insight: string
  readonly seasonStimulus: DevelopmentSeasonStimulusModel
  readonly scoutPotential: DevelopmentScoutPotentialModel
  readonly projection: DevelopmentProjectionModel
  readonly trainingContext: DevelopmentTrainingContextModel
  readonly trainingPlan: DevelopmentTrainingPlanModel
  readonly trainingEffect: DevelopmentTrainingEffectModel
  readonly longitudinal: DevelopmentLongitudinalModel
  readonly categoryCurve: readonly DevelopmentCategoryCurveModel[]
  readonly markers: readonly DevelopmentMarkerModel[]
  readonly detailByCategory: Readonly<Record<RatingCategory, DevelopmentDetailModel>>
  readonly lifecycle: DevelopmentLifecycleModel
  readonly categoryDevelopment: readonly DevelopmentCategoryRowModel[]
  readonly drivers: readonly DevelopmentDriverRowModel[]
  readonly gaps: readonly OverviewGapModel[]
  readonly defaultSelectedItemId: string | null
}

export const DEVELOPMENT_STAGE_LABELS = {
  early: 'Early',
  developing: 'Developing',
  prime: 'Prime',
  declining: 'Declining',
} as const

export const DEVELOPMENT_DOMAIN_LABELS: Record<DevelopmentDomain, string> = {
  shooting: 'Shooting',
  finishing: 'Finishing',
  creation: 'Creation',
  passing: 'Passing',
  defense: 'Defense',
  rebounding: 'Rebounding',
  physical: 'Physical',
  mental: 'Mental',
}

const TRAINING_FOCUS_LABELS: Record<string, string> = {
  balanced: 'Balanced',
  finishing: 'Finishing',
  shooting: 'Shooting',
  playmaking: 'Playmaking',
  perimeterDefense: 'Perimeter defense',
  interiorDefense: 'Interior defense',
  rebounding: 'Rebounding',
  athleticism: 'Athleticism',
}

const STAGE_NOTE =
  'Informational profile label; not used by the current offseason development calculation.'
const AGE_TREND_NOTE =
  'Engine base age trend applied at offseason rating updates; not a forecast.'
const STIMULUS_NOTE =
  'Accumulated training stimulus for the current season; applied at offseason transition, not a rating change.'
const POTENTIAL_NOTE =
  'Scouting evaluation ranges only; hidden internal ceilings are never shown as exact values.'
const TRAINING_NOTE =
  'Training builds season stimulus; it does not mutate ratings directly during the season.'
const PLAYER_TRUTH_KEYS = new Set<string>(PLAYER_TRUTH_RATING_KEYS)

function playerTruthDeltas(change: PlayerRatingHistory[number]): Partial<Record<PlayerTruthRatingKey, number>> {
  const deltas: Partial<Record<PlayerTruthRatingKey, number>> = {}
  for (const [key, delta] of Object.entries(change.deltas)) {
    if (PLAYER_TRUTH_KEYS.has(key) && delta !== 0) deltas[key as PlayerTruthRatingKey] = Number(delta)
  }
  return deltas
}

function playerTruthHistory(history: PlayerRatingHistory): PlayerRatingHistory {
  return history.filter((change) => Object.keys(playerTruthDeltas(change)).length > 0)
}

function playerTruthRatingSeries(
  currentRatings: Readonly<Record<string, number>>,
  history: PlayerRatingHistory,
  key: PlayerTruthRatingKey,
  currentSeasonId: SeasonId,
): readonly number[] {
  const changes = history.map((entry) => playerTruthDeltas(entry)[key] ?? 0)
  let running = currentRatings[key]! - changes.reduce((sum, delta) => sum + delta, 0)
  const points = history.flatMap((entry, index) => {
    const point = entry.seasonId === currentSeasonId ? [] : [running]
    running += changes[index] ?? 0
    return point
  })
  points.push(currentRatings[key]!)
  return points
}

function formatSignedTrend(value: number): string {
  if (value > 0) return `+${value.toFixed(1)}`
  if (value < 0) return value.toFixed(1)
  return '0.0'
}

function buildSeasonStimulus(world: GameWorld, playerId: PlayerId): DevelopmentSeasonStimulusModel {
  const stimulus = getDevelopmentStimulusForPlayer(world, playerId)
  const byRating = stimulus?.byRating as Readonly<Record<string, number>> | undefined

  const categoryTotals = new Map<RatingCategory, { total: number; count: number }>()
  for (const category of RADAR_CATEGORY_ORDER) {
    categoryTotals.set(category, { total: 0, count: 0 })
  }

  const ratingRows: DevelopmentStimulusRatingRowModel[] = PLAYER_TRUTH_RATING_KEYS.flatMap((key) => {
    if (byRating === undefined || !Object.hasOwn(byRating, key)) return []
    const value = byRating[key]!
    const category = ratingCategory(key)
    const bucket = categoryTotals.get(category)!
    categoryTotals.set(category, { total: bucket.total + value, count: bucket.count + 1 })
    return [{
      id: key,
      ratingLabel: ratingLabel(key),
      categoryLabel: CATEGORY_LABELS[category],
      stimulus: value,
    }]
  })

  const categories = RADAR_CATEGORY_ORDER.map((category) => {
    const bucket = categoryTotals.get(category)!
    return {
      id: category,
      categoryLabel: CATEGORY_LABELS[category],
      stimulusTotal: bucket.total,
      ratingCount: bucket.count,
    }
  }).filter((row) => row.ratingCount > 0)

  const totalStimulus = byRating === undefined ? 0 : Object.values(byRating).reduce((sum, value) => sum + value, 0)
  const topRatings = [...ratingRows]
    .sort((left, right) => right.stimulus - left.stimulus || left.ratingLabel.localeCompare(right.ratingLabel))
    .filter((row) => row.stimulus > 0)
    .slice(0, 8)

  return {
    totalStimulus,
    categories,
    topRatings,
    contextNote: byRating === undefined
      ? STIMULUS_NOTE
      : ratingRows.length > 0
        ? STIMULUS_NOTE
        : 'Training stimulus exists only on the legacy rating profile; no canonical 80-key breakdown is available.',
  }
}

function buildScoutPotential(world: GameWorld, playerId: PlayerId): DevelopmentScoutPotentialModel {
  const player = world.players[playerId]
  const team = findTeamForPlayer(world, playerId)
  if (player === undefined || team === undefined) {
    return {
      status: 'unavailable',
      rows: [],
      unavailableLabel: 'Requires roster team scouting context',
      contextNote: POTENTIAL_NOTE,
    }
  }

  const organizationId = organizationIdForTeam(team.id)
  const rows = DEVELOPMENT_DOMAINS.map((domain) => {
    const evaluation = getOrganizationRatingEvaluation({
      organizationId,
      playerId,
      dimension: `potential:${domain}`,
      knowledge: world.organizationKnowledge,
      currentDate: world.currentDate,
      publicPosition: player.basketball.primaryPosition,
    })
    return {
      id: `potential:${domain}`,
      domainLabel: DEVELOPMENT_DOMAIN_LABELS[domain],
      evaluationLabel: formatRatingEvaluation(evaluation),
    }
  })

  const hasSignal = rows.some((row) => row.evaluationLabel !== '?')
  return {
    status: hasSignal ? 'available' : 'unavailable',
    rows,
    unavailableLabel: hasSignal ? null : 'No scouting potential evaluations available',
    contextNote: POTENTIAL_NOTE,
  }
}

function buildTrainingContext(world: GameWorld, playerId: PlayerId): DevelopmentTrainingContextModel {
  const team = findTeamForPlayer(world, playerId)
  const individual = world.individualTrainingPlansByPlayerId[playerId]
  const teamPlan = team === undefined ? undefined : getTrainingPlanForTeam(world, team.id)

  return {
    teamIntensity: teamPlan === undefined ? null : capitalize(teamPlan.intensity),
    teamFocus:
      teamPlan === undefined
        ? null
        : TRAINING_FOCUS_LABELS[teamPlan.focus] ?? String(teamPlan.focus),
    individualPlanActive: individual?.active === true,
    individualFocus:
      individual === undefined || !individual.active
        ? null
        : TRAINING_FOCUS_LABELS[individual.primaryFocus] ?? String(individual.primaryFocus),
    individualIntensity:
      individual === undefined || !individual.active ? null : capitalize(individual.intensity),
    contextNote: TRAINING_NOTE,
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** How many rating curves the career chart draws before it stops being readable. */
const MAX_CURVE_SERIES = 4

const LONGITUDINAL_NOTE =
  'Past values are reconstructed from the recorded offseason movement: the save stores the current ratings plus one delta per transition.'

/**
 * The career curve, built from the rating history this session added. Before that history existed
 * this page could only say progression was not tracked; now it can draw the real movement.
 */
function buildLongitudinal(
  world: GameWorld,
  playerId: PlayerId,
  seasonStimulus: DevelopmentSeasonStimulusModel,
): DevelopmentLongitudinalModel {
  const player = world.players[playerId]
  if (player === undefined) {
    return {
      headline: 'Career development curve',
      status: 'unavailable',
      message: 'Player not found.',
      series: [],
      movers: [],
      events: [],
      note: LONGITUDINAL_NOTE,
    }
  }

  const storedHistory = world.playerRatingHistoryByPlayerId[playerId] ?? []
  const history = playerTruthHistory(storedHistory)
  if (history.length === 0) {
    return {
      headline: 'Career development curve',
      status: 'unavailable',
      message: storedHistory.length > 0
        ? 'The save contains legacy 35-rating history, but no season-by-season movement for the canonical 80 ratings.'
        : 'No offseason transition has been recorded yet, so there is no curve to draw. It appears after the first season closes.',
      series: [],
      movers: [],
      events: buildDevelopmentEvents(world, playerId),
      note: LONGITUDINAL_NOTE,
    }
  }

  const movedKeys = new Set<PlayerTruthRatingKey>()
  for (const transition of history) {
    for (const key of Object.keys(playerTruthDeltas(transition))) {
      movedKeys.add(key as PlayerTruthRatingKey)
    }
  }

  const ranked = [...movedKeys].sort((left, right) => {
    const leftTotal = history.reduce((sum, t) => sum + (playerTruthDeltas(t)[left] ?? 0), 0)
    const rightTotal = history.reduce((sum, t) => sum + (playerTruthDeltas(t)[right] ?? 0), 0)
    return Math.abs(rightTotal) - Math.abs(leftTotal) || left.localeCompare(right)
  })

  const series: DevelopmentCurveSeriesModel[] = ranked
    .slice(0, MAX_CURVE_SERIES)
    .map((key) => {
      const points = playerTruthRatingSeries(
        player.basketball.ratings,
        history,
        key,
        world.currentSeasonId,
      )
      return {
        id: key,
        label: ratingLabel(key),
        points,
        delta: points.length < 2 ? 0 : points[points.length - 1]! - points[0]!,
      }
    })

  const lastTransition = history[history.length - 1]!
  const movers: DevelopmentMoverRowModel[] = Object.entries(playerTruthDeltas(lastTransition))
    .map(([key, delta]) => [key as PlayerTruthRatingKey, Number(delta)] as const)
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]) || left[0].localeCompare(right[0]))
    .map(([key, delta]) => ({
      id: key,
      label: ratingLabel(key),
      delta,
      seasonLabel: seasonLabelFor(world, lastTransition.seasonId),
    }))

  const totalMovement = history.reduce((sum, transition) => sum + Object.values(playerTruthDeltas(transition)).reduce((inner, delta) => inner + Math.abs(delta), 0), 0)

  return {
    headline: 'Career development curve',
    status: 'available',
    message: `${series.length} tracked ${series.length === 1 ? 'rating' : 'ratings'} moved a total of ${totalMovement} rating points across ${history.length} ${history.length === 1 ? 'transition' : 'transitions'}; the season training focus was ${seasonStimulus.contextNote ? 'tracked separately' : 'not recorded'}.`,
    series,
    movers,
    events: buildDevelopmentEvents(world, playerId),
    note: LONGITUDINAL_NOTE,
  }
}

/** `2032/33` for seasons the world knows, otherwise the raw id so nothing is invented. */
function seasonLabelFor(world: GameWorld, seasonId: SeasonId): string {
  const season = world.seasons[seasonId]
  if (season === undefined) return seasonId
  const startYear = Number(season.startDate.slice(0, 4))
  return Number.isFinite(startYear) ? formatSeasonSpanLabel(startYear) : seasonId
}

/** Dated events the world really records: season transitions and injuries. */
function buildDevelopmentEvents(
  world: GameWorld,
  playerId: PlayerId,
): readonly DevelopmentEventRowModel[] {
  const events: DevelopmentEventRowModel[] = []

  for (const transition of world.playerRatingHistoryByPlayerId[playerId] ?? []) {
    const movement = Object.values(transition.deltas).reduce(
      (sum, delta) => sum + Math.abs(delta),
      0,
    )
    events.push({
      id: `transition:${transition.seasonId}`,
      dateLabel: seasonLabelFor(world, transition.seasonId),
      label: 'Offseason development',
      detail: `${movement} rating points moved when the ${seasonLabelFor(world, transition.seasonId)} season closed.`,
      kind: 'transition',
      impact: Object.values(transition.deltas).reduce((sum, delta) => sum + delta, 0),
    })
  }

  for (const injury of Object.values(world.injuriesById)) {
    if (injury.playerId !== playerId) continue
    events.push({
      id: `injury:${injury.id}`,
      dateLabel: formatGameDateLabel(injury.injuredOn),
      label: formatInjuryKind(injury.kind),
      detail: `Expected return ${formatGameDateLabel(injury.expectedReturnDate)}.`,
      kind: 'injury',
      // An absence costs availability: the save records no rating movement for it.
      impact: null,
    })
  }

  return events
}

const LIFECYCLE_ORDER = ['early', 'developing', 'prime', 'declining'] as const

function buildLifecycle(
  world: GameWorld,
  playerId: PlayerId,
  scoutPotential: DevelopmentScoutPotentialModel,
  trainingContext: DevelopmentTrainingContextModel,
): DevelopmentLifecycleModel {
  const player = world.players[playerId]!
  const current = player.development.developmentStage
  const scouted = scoutPotential.rows.find((row) => row.evaluationLabel !== '?')

  return {
    stages: LIFECYCLE_ORDER.map((stage) => ({
      id: stage,
      label: DEVELOPMENT_STAGE_LABELS[stage],
      isCurrent: stage === current,
    })),
    currentLabel: DEVELOPMENT_STAGE_LABELS[current],
    focusLabel:
      trainingContext.individualPlanActive && trainingContext.individualFocus !== null
        ? trainingContext.individualFocus
        : trainingContext.teamFocus ?? 'No plan recorded',
    potentialLabel: scouted?.evaluationLabel ?? 'Not scouted',
    potentialStatus: scouted === undefined ? 'unavailable' : 'available',
  }
}

/** Category value plus the movement actually recorded for it. */
function buildCategoryDevelopment(
  world: GameWorld,
  playerId: PlayerId,
  scoutPotential: DevelopmentScoutPotentialModel,
): readonly DevelopmentCategoryRowModel[] {
  const player = world.players[playerId]
  if (player === undefined) return []
  const history = playerTruthHistory(world.playerRatingHistoryByPlayerId[playerId] ?? [])

  return RADAR_CATEGORY_ORDER.map((category) => {
    const ratings = ratingKeysForCategory(category)
    const trend = ratings.reduce(
      (sum, key) =>
        sum +
        history.reduce((inner, transition) => inner + (playerTruthDeltas(transition)[key] ?? 0), 0),
      0,
    )
    const scouted = scoutPotential.rows.find(
      (row) => row.domainLabel.toLowerCase() === DOMAIN_FOR_CATEGORY[category],
    )
    return {
      id: category,
      categoryLabel: CATEGORY_LABELS[category],
      current: aggregateCategoryValue(category, player.basketball.ratings),
      trend,
      scoutingLabel: scouted === undefined || scouted.evaluationLabel === '?' ? null : scouted.evaluationLabel,
      // The scouted upper bound, when the organization reported one: never the hidden ceiling.
      potential:
        scouted === undefined
          ? null
          : Number(scouted.evaluationLabel.match(/^(\d+)-(\d+)$/)?.[2] ?? Number.NaN) || null,
    }
  })
}

/** Development domains are named differently from rating families, so the bridge is explicit. */
const DOMAIN_FOR_CATEGORY: Record<RatingCategory, string> = {
  shooting: 'shooting',
  finishing: 'finishing',
  ballHandling: 'creation',
  playmaking: 'passing',
  offBall: 'creation',
  defense: 'defense',
  physical: 'physical',
  mental: 'mental',
}

/**
 * Factors actually in play. Each row carries a real value from the world, so the panel reports
 * state rather than a verdict on the player.
 */
function buildDrivers(
  world: GameWorld,
  playerId: PlayerId,
  trainingContext: DevelopmentTrainingContextModel,
): readonly DevelopmentDriverRowModel[] {
  const age = getPlayerAge(world, playerId)
  const trend = getBaseDevelopmentTrend(age)
  const fatigue = getCareerFatigueForPlayer(world, playerId)
  const stats = getPlayerSeasonStats(world, playerId, world.currentSeasonId)
  const history = world.playerRatingHistoryByPlayerId[playerId] ?? []

  return [
    {
      id: 'age-trend',
      label: 'Age trend',
      valueLabel: `${formatSignedTrend(trend)} per transition at age ${age}`,
      tone: trend >= 0 ? 'positive' : 'negative',
    },
    {
      id: 'stage',
      label: 'Career stage',
      valueLabel: DEVELOPMENT_STAGE_LABELS[world.players[playerId]!.development.developmentStage],
      tone: 'neutral',
    },
    {
      id: 'training',
      label: 'Training plan',
      valueLabel: trainingContext.individualPlanActive
        ? `Individual · ${trainingContext.individualFocus ?? 'focus not set'}`
        : trainingContext.teamFocus === null
          ? 'No plan recorded'
          : `Team · ${trainingContext.teamFocus}`,
      tone: trainingContext.teamFocus === null && !trainingContext.individualPlanActive ? 'negative' : 'positive',
    },
    {
      id: 'fatigue',
      label: 'Career fatigue',
      valueLabel: `${fatigue}%`,
      tone: fatigue >= 70 ? 'negative' : fatigue >= 40 ? 'neutral' : 'positive',
    },
    {
      id: 'minutes',
      label: 'Minutes played',
      valueLabel:
        stats.gamesPlayed === 0
          ? 'No game tracked this season'
          : `${calculatePlayerStatAverages(stats).mpg.toFixed(1)} per game over ${stats.gamesPlayed} ${stats.gamesPlayed === 1 ? 'game' : 'games'}`,
      tone: stats.gamesPlayed === 0 ? 'neutral' : 'positive',
    },
    {
      id: 'transitions',
      label: 'Transitions recorded',
      valueLabel: history.length === 0 ? 'None yet' : String(history.length),
      tone: history.length === 0 ? 'neutral' : 'positive',
    },
  ]
}

/** Band 1 — the four readings, plus the honest next date the engine will run development on. */
function buildOverview(world: GameWorld, playerId: PlayerId): {
  readonly overview: DevelopmentOverviewModel
  readonly insight: string
} {
  const player = world.players[playerId]!
  const age = getPlayerAge(world, playerId)
  const trend = getBaseDevelopmentTrend(age)
  const history = world.playerRatingHistoryByPlayerId[playerId] ?? []
  const season = world.seasons[world.currentSeasonId]
  const daysToSeasonEnd =
    season === undefined ? null : calendarDaysBetween(world.currentDate, season.endDate)

  return {
    overview: {
      ageLabel: String(age),
      careerStageLabel: DEVELOPMENT_STAGE_LABELS[player.development.developmentStage],
      trendLabel: formatSignedTrend(trend),
      trendTone: trend > 0 ? 'positive' : trend < 0 ? 'negative' : 'neutral',
      trendNote: 'per season transition',
      // Development runs when the season closes, so that is the next date the model will move.
      nextEvaluationLabel: season === undefined ? 'Not scheduled' : formatGameDateLabel(season.endDate),
      nextEvaluationNote:
        daysToSeasonEnd === null
          ? 'The calendar holds no season end for this competition.'
          : daysToSeasonEnd <= 0
            ? 'Season closed: the next transition runs now.'
            : `In ${Math.max(1, Math.round(daysToSeasonEnd / 30))} ${Math.round(daysToSeasonEnd / 30) === 1 ? 'month' : 'months'}`,
    },
    insight:
      history.length === 0
        ? 'No season transition has been recorded yet, so there is no progression to report.'
        : `${history.length} ${history.length === 1 ? 'transition' : 'transitions'} recorded, moving ${history.reduce(
            (sum, entry) => sum + Object.values(entry.deltas).reduce((inner, delta) => inner + delta, 0),
            0,
          )} rating points overall. The base age trend at ${age} is ${formatSignedTrend(trend)} per transition.`,
  }
}

/** Band 2 · left — one reconstructed index per category, plus the dated markers. */
function buildCategoryCurve(
  world: GameWorld,
  playerId: PlayerId,
): {
  readonly categoryCurve: readonly DevelopmentCategoryCurveModel[]
  readonly markers: readonly DevelopmentMarkerModel[]
} {
  const player = world.players[playerId]
  if (player === undefined) return { categoryCurve: [], markers: [] }

  const history = playerTruthHistory(world.playerRatingHistoryByPlayerId[playerId] ?? [])
  const seasonIds = [...history.map((entry) => entry.seasonId), world.currentSeasonId]
  const lastTransition = history.at(-1)

  const categoryCurve = RADAR_CATEGORY_ORDER.map((category) => {
    const keys = ratingKeysForCategory(category)
    const series = keys.map((key) => playerTruthRatingSeries(player.basketball.ratings, history, key, world.currentSeasonId))
    const points = series[0]?.map((_value, index) =>
      Math.round(
        series.reduce((sum, entry) => sum + (entry[index] ?? entry[entry.length - 1] ?? 0), 0) /
          Math.max(1, series.length),
      ),
    ) ?? []
    return {
      id: category,
      label: CATEGORY_LABELS[category],
      points,
      delta: points.length < 2 ? 0 : points[points.length - 1]! - points[0]!,
      lastDelta: lastTransition === undefined
        ? 0
        : keys.reduce((sum, key) => sum + (playerTruthDeltas(lastTransition)[key] ?? 0), 0),
    }
  })

  const markers: DevelopmentMarkerModel[] = []
  for (const transition of history) {
    markers.push({
      id: `transition:${transition.seasonId}`,
      label: 'Offseason development',
      kind: 'transition',
      dateLabel: seasonLabelFor(world, transition.seasonId),
      columnIndex: Math.max(0, seasonIds.indexOf(transition.seasonId)),
      detail: `${Object.values(playerTruthDeltas(transition)).reduce((sum, delta) => sum + Math.abs(delta), 0)} canonical rating points moved.`,
    })
  }
  for (const injury of Object.values(world.injuriesById)) {
    if (injury.playerId !== playerId) continue
    markers.push({
      id: `injury:${injury.id}`,
      label: formatInjuryKind(injury.kind),
      kind: 'injury',
      dateLabel: formatGameDateLabel(injury.injuredOn),
      // Injuries are dated, not tied to a transition: they hang on the season they happened in.
      columnIndex: Math.max(0, seasonIds.length - 1),
      detail: `Out until ${formatGameDateLabel(injury.expectedReturnDate)}.`,
    })
  }

  return { categoryCurve, markers }
}

/** Band 2 · right — the detail of every category, so selecting one is a pure UI change. */
function buildDetailByCategory(
  world: GameWorld,
  playerId: PlayerId,
  curve: readonly DevelopmentCategoryCurveModel[],
): Readonly<Record<RatingCategory, DevelopmentDetailModel>> {
  const player = world.players[playerId]!
  const history = playerTruthHistory(world.playerRatingHistoryByPlayerId[playerId] ?? [])
  const trend = getBaseDevelopmentTrend(getPlayerAge(world, playerId))
  const perTransition = history.length === 0 ? 0 : trend

  const detail = {} as Record<RatingCategory, DevelopmentDetailModel>
  for (const category of RADAR_CATEGORY_ORDER) {
    const keys = ratingKeysForCategory(category)
    const movements = keys
      .map((key) => ({
        key,
        delta: history.reduce((sum, entry) => sum + (playerTruthDeltas(entry)[key] ?? 0), 0),
        value: player.basketball.ratings[key],
      }))
      .sort((left, right) => right.delta - left.delta || right.value - left.value)
    const series = curve.find((entry) => entry.id === category)
    const measured =
      series === undefined || series.points.length < 2 ? 0 : series.delta / (series.points.length - 1)
    const gap = Number((measured - perTransition).toFixed(2))

    detail[category] = {
      categoryLabel: CATEGORY_LABELS[category],
      current: aggregateCategoryValue(category, player.basketball.ratings),
      trend: series?.delta ?? 0,
      rateLabel:
        history.length === 0
          ? 'No transition recorded'
          : gap > 0.5
            ? 'Above expectation'
            : gap < -0.5
              ? 'Below expectation'
              : 'In line with the age trend',
      rateTone:
        history.length === 0 ? 'neutral' : gap > 0.5 ? 'positive' : gap < -0.5 ? 'negative' : 'neutral',
      rateNote:
        history.length === 0
          ? 'The rate can only be compared once a transition has run.'
          : `${measured.toFixed(1)} points per transition against a base age trend of ${formatSignedTrend(perTransition)}.`,
      improvements: movements
        .filter((entry) => entry.delta > 0)
        .slice(0, 3)
        .map((entry) => `${ratingLabel(entry.key)} ${entry.delta > 0 ? '+' : ''}${entry.delta}`),
      toImprove: movements
        .slice(-2)
        .reverse()
        .map((entry) => `${ratingLabel(entry.key)} at ${entry.value}`),
      coachNote:
        'Authored copy: no department writes free text into the save, so no assessment can be quoted.',
    }
  }

  return detail
}

/** Band 3 — the plan in force and the effect the assigned training is expected to have. */
function buildTrainingPlan(
  world: GameWorld,
  playerId: PlayerId,
  trainingContext: DevelopmentTrainingContextModel,
  seasonStimulus: DevelopmentSeasonStimulusModel,
): DevelopmentTrainingPlanModel {
  const stimulusTotal = seasonStimulus.totalStimulus
  const ranked = [...seasonStimulus.categories].sort(
    (left, right) => right.stimulusTotal - left.stimulusTotal || left.id.localeCompare(right.id),
  )
  const primary = ranked[0]
  const secondary = ranked.find((entry) => entry.id !== primary?.id)
  const hasCanonicalBreakdown = ranked.length > 0
  // A season of stimulus above the player's own average category load reads as a heavy plan.
  const averageLoad = ranked.length === 0 ? 0 : stimulusTotal / ranked.length
  const loadFill = !hasCanonicalBreakdown || stimulusTotal === 0
    ? null
    : Math.min(100, Math.round((stimulusTotal / Math.max(1, averageLoad * 2)) * 100))

  return {
    focusLabel: trainingContext.individualPlanActive
      ? trainingContext.individualFocus ?? 'Individual plan without a focus'
      : trainingContext.teamFocus ?? 'No plan recorded',
    focusDetail: trainingContext.individualPlanActive
      ? `Individual plan · ${trainingContext.individualIntensity ?? 'intensity not set'}`
      : trainingContext.teamFocus === null
        ? 'Neither the team nor the player has a plan in force.'
        : `Team plan · ${trainingContext.teamIntensity ?? 'intensity not set'}`,
    secondaryLabel: !hasCanonicalBreakdown
      ? 'Canonical category breakdown unavailable'
      : primary === undefined ? 'Nothing assigned' : `${primary.categoryLabel} development`,
    secondaryDetail:
      !hasCanonicalBreakdown
        ? seasonStimulus.contextNote
        : secondary === undefined
        ? 'No second category has received stimulus this season.'
        : `${primary?.categoryLabel ?? '—'} carries ${Math.round(primary?.stimulusTotal ?? 0)} of the ${Math.round(stimulusTotal)} stimulus points; ${secondary.categoryLabel} follows with ${Math.round(secondary.stimulusTotal)}.`,
    loadFill,
    loadLabel: !hasCanonicalBreakdown
      ? 'Unknown'
      : stimulusTotal === 0
        ? 'None'
        : loadFill !== null && loadFill >= 75
          ? 'High'
          : loadFill !== null && loadFill >= 40
            ? 'Moderate'
            : 'Low',
    loadTone:
      !hasCanonicalBreakdown || stimulusTotal === 0
        ? 'neutral'
        : loadFill !== null && loadFill >= 75
          ? 'high'
          : loadFill !== null && loadFill >= 40
            ? 'moderate'
            : 'positive',
  }
}

function buildTrainingEffect(
  world: GameWorld,
  playerId: PlayerId,
  seasonStimulus: DevelopmentSeasonStimulusModel,
): DevelopmentTrainingEffectModel {
  const history = playerTruthHistory(world.playerRatingHistoryByPlayerId[playerId] ?? [])
  const transitions = Math.max(1, history.length)
  const rows = [...seasonStimulus.categories]
    .filter((entry) => entry.stimulusTotal > 0)
    .sort((left, right) => right.stimulusTotal - left.stimulusTotal || left.id.localeCompare(right.id))
    .slice(0, 4)
    .map((entry) => ({
      id: entry.id,
      label: entry.categoryLabel,
      // The stimulus recorded, spread over the transitions the save has actually run.
      impact: Number((entry.stimulusTotal / transitions / 10).toFixed(1)),
      tone: 'positive' as const,
    }))

  const covered = seasonStimulus.categories.filter((entry) => entry.stimulusTotal > 0).length
  const confidenceFill =
    seasonStimulus.categories.length === 0
      ? null
      : Math.round((covered / seasonStimulus.categories.length) * 100)

  return {
    rows,
    confidenceLabel:
      confidenceFill === null ? 'Unknown' : confidenceFill >= 75 ? 'High' : confidenceFill >= 40 ? 'Medium' : 'Low',
    confidenceFill,
    note: seasonStimulus.categories.length === 0
      ? seasonStimulus.contextNote
      : `Estimated impact (next transition), from the stimulus recorded this season over ${transitions} recorded ${transitions === 1 ? 'transition' : 'transitions'}. A projection, never a guarantee.`,
  }
}

/** Band 4 · right — the projection, from the reported scouting ranges of the potential domains. */
function buildProjection(
  world: GameWorld,
  playerId: PlayerId,
  scoutPotential: DevelopmentScoutPotentialModel,
): DevelopmentProjectionModel {
  const scouted = scoutPotential.rows
    .map((row) => ({ row, range: row.evaluationLabel.match(/^(\d+)-(\d+)$/) }))
    .filter((entry): entry is { row: DevelopmentScoutPotentialRowModel; range: RegExpMatchArray } => entry.range !== null)

  if (scoutPotential.status !== 'available' || scouted.length === 0) {
    return {
      status: 'unavailable',
      outcomes: [],
      note: scoutPotential.unavailableLabel ?? 'No scouting projection exists for this player yet.',
    }
  }

  const lowest = Math.min(...scouted.map((entry) => Number(entry.range[1])))
  const highest = Math.max(...scouted.map((entry) => Number(entry.range[2])))
  const mean = Math.round(
    scouted.reduce((sum, entry) => sum + (Number(entry.range[1]) + Number(entry.range[2])) / 2, 0) /
      scouted.length,
  )
  const strongest = [...scouted].sort(
    (left, right) => Number(right.range[2]) - Number(left.range[2]),
  )[0]!

  return {
    status: 'available',
    outcomes: [
      {
        id: 'low',
        label: 'Low outcome',
        domainLabel: scouted[0]!.row.domainLabel,
        rangeLabel: `${lowest}-${Math.max(lowest, mean - 3)}`,
      },
      {
        id: 'expected',
        label: 'Expected outcome',
        domainLabel: strongest.row.domainLabel,
        rangeLabel: `${Math.max(lowest, mean - 2)}-${Math.min(highest, mean + 3)}`,
      },
      {
        id: 'high',
        label: 'High outcome',
        domainLabel: strongest.row.domainLabel,
        rangeLabel: `${Math.max(lowest, highest - 3)}-${highest}`,
      },
    ],
    note: `Built from the reported ranges of ${scouted.length} scouted potential ${scouted.length === 1 ? 'domain' : 'domains'}. Scouting projections only: hidden ceilings are never shown.`,
  }
}

/**
 * Reference elements this page cannot produce yet. The evaluation date, the rate against expectation
 * and the projection are all derived now; the two blocks below would need a model the save does not
 * hold.
 */
function buildDevelopmentGaps(): readonly OverviewGapModel[] {
  return [
    {
      id: 'event-markers',
      label: 'Role change markers',
      reason: 'Only injuries and season transitions are dated in the save, so no role or training change can be placed on the curve.',
    },
    {
      id: 'coach-assessment',
      label: 'Coach assessment',
      reason: 'Authored copy: no department writes free text into the save.',
    },
  ]
}

export function buildPlayerDevelopmentModel(
  world: GameWorld,
  playerId: PlayerId,
): PlayerDevelopmentModel | undefined {
  const player = world.players[playerId]
  if (player === undefined) return undefined

  const age = getPlayerAge(world, playerId)
  const season = world.seasons[world.currentSeasonId]
  const seasonStimulus = buildSeasonStimulus(world, playerId)
  const scoutPotential = buildScoutPotential(world, playerId)
  const trainingContext = buildTrainingContext(world, playerId)
  const defaultCategory =
    seasonStimulus.categories.find((row) => row.stimulusTotal > 0)?.id ??
    seasonStimulus.topRatings[0]?.id ??
    null
  const { overview, insight } = buildOverview(world, playerId)
  const { categoryCurve, markers } = buildCategoryCurve(world, playerId)

  return {
    contextBand: {
      age,
      seasonLabel: season?.label ?? null,
      developmentStageLabel: DEVELOPMENT_STAGE_LABELS[player.development.developmentStage],
      developmentStageNote: STAGE_NOTE,
      ageTrendLabel: `${formatSignedTrend(getBaseDevelopmentTrend(age))} base trend`,
      ageTrendNote: AGE_TREND_NOTE,
    },
    overview,
    insight,
    seasonStimulus,
    scoutPotential,
    projection: buildProjection(world, playerId, scoutPotential),
    trainingContext,
    trainingPlan: buildTrainingPlan(world, playerId, trainingContext, seasonStimulus),
    trainingEffect: buildTrainingEffect(world, playerId, seasonStimulus),
    longitudinal: buildLongitudinal(world, playerId, seasonStimulus),
    categoryCurve,
    markers,
    detailByCategory: buildDetailByCategory(world, playerId, categoryCurve),
    lifecycle: buildLifecycle(world, playerId, scoutPotential, trainingContext),
    categoryDevelopment: buildCategoryDevelopment(world, playerId, scoutPotential),
    drivers: buildDrivers(world, playerId, trainingContext),
    gaps: buildDevelopmentGaps(),
    defaultSelectedItemId: defaultCategory,
  }
}

export function findDevelopmentInspectorDetail(
  model: PlayerDevelopmentModel,
  selectedItemId: string | null,
): DevelopmentInspectorDetail | undefined {
  if (selectedItemId === null) return undefined

  const category = model.seasonStimulus.categories.find((row) => row.id === selectedItemId)
  if (category !== undefined) {
    return {
      kind: 'stimulus-category',
      categoryLabel: category.categoryLabel,
      stimulusTotal: category.stimulusTotal,
      ratingCount: category.ratingCount,
      contextNote: model.seasonStimulus.contextNote,
    }
  }

  const rating = model.seasonStimulus.topRatings.find((row) => row.id === selectedItemId)
  if (rating !== undefined) {
    return {
      kind: 'stimulus-rating',
      ratingLabel: rating.ratingLabel,
      categoryLabel: rating.categoryLabel,
      stimulus: rating.stimulus,
      contextNote: model.seasonStimulus.contextNote,
    }
  }

  const potential = model.scoutPotential.rows.find((row) => row.id === selectedItemId)
  if (potential !== undefined) {
    return {
      kind: 'scout-potential',
      domainLabel: potential.domainLabel,
      evaluationLabel: potential.evaluationLabel,
      contextNote: model.scoutPotential.contextNote,
    }
  }

  return undefined
}
