import { DEVELOPMENT_DOMAINS, type DevelopmentDomain } from '@/domain/player/PlayerDevelopmentProfile'
import { getPlayerAge, CANONICAL_RATING_KEYS, type CanonicalRatingKey } from '@/domain/player'
import type { PlayerId } from '@/domain/ids'
import { organizationIdForTeam } from '@/domain/ids'
import {
  formatRatingEvaluation,
  getOrganizationRatingEvaluation,
} from '@/domain/intelligence/OrganizationPlayerEvaluation'
import {
  getDevelopmentStimulusForPlayer,
  getTrainingPlanForTeam,
  type GameWorld,
} from '@/domain/world'
import { getBaseDevelopmentTrend } from '@/engine/development/PlayerDevelopment'

import {
  CATEGORY_LABELS,
  RADAR_CATEGORY_ORDER,
  ratingCategory,
  ratingLabel,
  type RatingCategory,
} from './ratingCatalog'
import { findTeamForPlayer } from './presentationHelpers'

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
  readonly id: CanonicalRatingKey
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

export interface DevelopmentLongitudinalModel {
  readonly headline: string
  readonly message: string
}

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
  readonly seasonStimulus: DevelopmentSeasonStimulusModel
  readonly scoutPotential: DevelopmentScoutPotentialModel
  readonly trainingContext: DevelopmentTrainingContextModel
  readonly longitudinal: DevelopmentLongitudinalModel
  readonly defaultSelectedItemId: string | null
}

const DEVELOPMENT_STAGE_LABELS = {
  early: 'Early',
  developing: 'Developing',
  prime: 'Prime',
  declining: 'Declining',
} as const

const DEVELOPMENT_DOMAIN_LABELS: Record<DevelopmentDomain, string> = {
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

function formatSignedTrend(value: number): string {
  if (value > 0) return `+${value.toFixed(1)}`
  if (value < 0) return value.toFixed(1)
  return '0.0'
}

function buildSeasonStimulus(world: GameWorld, playerId: PlayerId): DevelopmentSeasonStimulusModel {
  const stimulus = getDevelopmentStimulusForPlayer(world, playerId)
  const byRating = stimulus?.byRating ?? Object.fromEntries(CANONICAL_RATING_KEYS.map((key) => [key, 0]))

  const categoryTotals = new Map<RatingCategory, { total: number; count: number }>()
  for (const category of RADAR_CATEGORY_ORDER) {
    categoryTotals.set(category, { total: 0, count: 0 })
  }

  const ratingRows: DevelopmentStimulusRatingRowModel[] = CANONICAL_RATING_KEYS.map((key) => {
    const value = byRating[key] ?? 0
    const category = ratingCategory(key)
    const bucket = categoryTotals.get(category)!
    categoryTotals.set(category, { total: bucket.total + value, count: bucket.count + 1 })
    return {
      id: key,
      ratingLabel: ratingLabel(key),
      categoryLabel: CATEGORY_LABELS[category],
      stimulus: value,
    }
  })

  const categories = RADAR_CATEGORY_ORDER.map((category) => {
    const bucket = categoryTotals.get(category)!
    return {
      id: category,
      categoryLabel: CATEGORY_LABELS[category],
      stimulusTotal: bucket.total,
      ratingCount: bucket.count,
    }
  }).filter((row) => row.stimulusTotal > 0)

  const totalStimulus = ratingRows.reduce((sum, row) => sum + row.stimulus, 0)
  const topRatings = [...ratingRows]
    .sort((left, right) => right.stimulus - left.stimulus || left.ratingLabel.localeCompare(right.ratingLabel))
    .filter((row) => row.stimulus > 0)
    .slice(0, 8)

  return {
    totalStimulus,
    categories: categories.length > 0 ? categories : RADAR_CATEGORY_ORDER.map((category) => ({
      id: category,
      categoryLabel: CATEGORY_LABELS[category],
      stimulusTotal: 0,
      ratingCount: categoryTotals.get(category)?.count ?? 0,
    })),
    topRatings,
    contextNote: STIMULUS_NOTE,
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

export function buildPlayerDevelopmentModel(
  world: GameWorld,
  playerId: PlayerId,
): PlayerDevelopmentModel | undefined {
  const player = world.players[playerId]
  if (player === undefined) return undefined

  const age = getPlayerAge(world, playerId)
  const season = world.seasons[world.currentSeasonId]
  const seasonStimulus = buildSeasonStimulus(world, playerId)
  const defaultCategory =
    seasonStimulus.categories.find((row) => row.stimulusTotal > 0)?.id ??
    seasonStimulus.topRatings[0]?.id ??
    null

  return {
    contextBand: {
      age,
      seasonLabel: season?.label ?? null,
      developmentStageLabel: DEVELOPMENT_STAGE_LABELS[player.development.developmentStage],
      developmentStageNote: STAGE_NOTE,
      ageTrendLabel: `${formatSignedTrend(getBaseDevelopmentTrend(age))} base trend`,
      ageTrendNote: AGE_TREND_NOTE,
    },
    seasonStimulus,
    scoutPotential: buildScoutPotential(world, playerId),
    trainingContext: buildTrainingContext(world, playerId),
    longitudinal: {
      headline: 'Longitudinal development',
      message: 'Historical rating progression is not currently tracked.',
    },
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
