import {
  formatRatingEvaluation,
  getOrganizationRatingEvaluation,
  intelligenceSortValue,
  type RatingEvaluation,
} from '@/domain/intelligence'
import type { GameWorld } from '@/domain/world'
import { organizationIdForTeam, type PlayerId, type TeamId } from '@/domain/ids'
import {
  CANONICAL_RATING_KEYS,
  type BasketballRatingKey,
  type CanonicalRatingKey,
  type LegacyPlayerRatings,
  type Player,
} from '@/domain/player'

/** Mirrors DevelopmentStimulus groupings → organization knowledge dimensions. */
const STIMULUS_GROUPS: Readonly<Record<BasketballRatingKey, readonly CanonicalRatingKey[]>> = {
  finishing: ['rimFinishing', 'contactFinishing', 'dunking', 'floater', 'postScoring'],
  shooting: ['midRangeShooting', 'threePointShooting', 'freeThrowShooting'],
  playmaking: ['ballHandling', 'ballSecurity', 'firstStep', 'passing', 'courtVision', 'decisionMaking', 'offBallAwareness'],
  perimeterDefense: ['perimeterDefense', 'screenNavigation', 'defensiveAwareness', 'steal', 'shotContest', 'lateralAgility'],
  interiorDefense: ['interiorDefense', 'rimProtection', 'shotContest', 'strength', 'defensiveAwareness'],
  rebounding: ['offensiveRebounding', 'defensiveRebounding', 'boxOut', 'strength', 'vertical'],
  athleticism: ['acceleration', 'speed', 'lateralAgility', 'strength', 'vertical', 'stamina', 'changeOfDirection'],
}

const LEGACY_KEY_TO_ORG_DIMENSION: Readonly<Record<BasketballRatingKey, string>> = {
  finishing: 'finishing',
  shooting: 'shooting',
  playmaking: 'creation',
  perimeterDefense: 'perimeterDefense',
  interiorDefense: 'interiorDefense',
  rebounding: 'rebounding',
  athleticism: 'physical',
}

const UNGROUPED_RATING_DIMENSIONS: Readonly<Partial<Record<CanonicalRatingKey, string>>> = {
  anticipation: 'perimeterDefense',
  composure: 'shooting',
  discipline: 'interiorDefense',
}

function buildCanonicalRatingOrgDimensionMap(): Readonly<Record<CanonicalRatingKey, string>> {
  const map = {} as Record<CanonicalRatingKey, string>
  for (const legacyKey of Object.keys(STIMULUS_GROUPS) as BasketballRatingKey[]) {
    const orgDimension = LEGACY_KEY_TO_ORG_DIMENSION[legacyKey]
    for (const ratingKey of STIMULUS_GROUPS[legacyKey]) {
      if (map[ratingKey] === undefined) {
        map[ratingKey] = orgDimension
      }
    }
  }
  for (const key of CANONICAL_RATING_KEYS) {
    if (map[key] === undefined) {
      map[key] = UNGROUPED_RATING_DIMENSIONS[key] ?? 'creation'
    }
  }
  return map
}

export const CANONICAL_RATING_ORG_DIMENSION = buildCanonicalRatingOrgDimensionMap()

export const SUMMARY_SIGNAL_ORG_DIMENSION: Readonly<Record<keyof LegacyPlayerRatings, string>> = {
  finishing: 'finishing',
  shooting: 'shooting',
  playmaking: 'creation',
  perimeterDefense: 'perimeterDefense',
  interiorDefense: 'interiorDefense',
  rebounding: 'rebounding',
  athleticism: 'physical',
}

/** SquadScreen parity: unknown evaluations sort last instead of using hidden truth. */
export const ROSTER_UNKNOWN_RATING_SORT_VALUE = 101

export type RosterRatingEvaluationLookup = (
  player: Player,
  dimension: string,
) => RatingEvaluation

export function evaluateRosterOrganizationRating(
  world: GameWorld,
  teamId: TeamId,
  player: Player,
  dimension: string,
): RatingEvaluation {
  return getOrganizationRatingEvaluation({
    organizationId: organizationIdForTeam(teamId),
    playerId: player.id,
    dimension,
    knowledge: world.organizationKnowledge,
    currentDate: world.currentDate,
    publicPosition: player.basketball.primaryPosition,
  })
}

export function buildRosterRatingEvaluationLookup(
  world: GameWorld,
  teamId: TeamId,
): RosterRatingEvaluationLookup {
  const cache = new Map<string, RatingEvaluation>()
  return (player, dimension) => {
    const cacheKey = `${player.id}:${dimension}`
    const cached = cache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }
    const evaluation = evaluateRosterOrganizationRating(world, teamId, player, dimension)
    cache.set(cacheKey, evaluation)
    return evaluation
  }
}

export function rosterRatingDisplay(evaluation: RatingEvaluation): string {
  return formatRatingEvaluation(evaluation)
}

export function rosterRatingExportValue(evaluation: RatingEvaluation): string {
  return formatRatingEvaluation(evaluation)
}

export function rosterRatingSortValue(evaluation: RatingEvaluation): number {
  return intelligenceSortValue(evaluation) ?? ROSTER_UNKNOWN_RATING_SORT_VALUE
}

export function organizationDimensionForCanonicalRating(key: CanonicalRatingKey): string {
  return CANONICAL_RATING_ORG_DIMENSION[key]
}

export function organizationDimensionForSummarySignal(key: keyof LegacyPlayerRatings): string {
  return SUMMARY_SIGNAL_ORG_DIMENSION[key]
}

export function rosterRatingCacheKey(playerId: PlayerId, dimension: string): string {
  return `${playerId}:${dimension}`
}
