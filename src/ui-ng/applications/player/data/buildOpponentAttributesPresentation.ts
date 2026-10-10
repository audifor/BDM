import type { PlayerKnowledgeAccess } from '@/app/player/PlayerKnowledgeAccess'
import {
  CATEGORY_LABELS, RADAR_CATEGORY_ORDER, type RatingCategory,
} from './ratingCatalog'

type OpponentAccess = Extract<PlayerKnowledgeAccess, { readonly kind: 'scouted' | 'unknown' }>
type OpponentRating = OpponentAccess['ratingEvaluations'][number]

export interface OpponentFamilyKnowledge {
  readonly id: RatingCategory
  readonly label: string
  readonly total: number
  readonly evaluated: number
  readonly ratings: readonly OpponentRating[]
}

/**
 * No world/player argument is accepted. All values come from the authorized
 * viewer-specific knowledge projection, never from canonical Player Truth.
 */
export function buildOpponentFamilyKnowledge(access: OpponentAccess): readonly OpponentFamilyKnowledge[] {
  return RADAR_CATEGORY_ORDER.map((id) => {
    const ratings = access.ratingEvaluations.filter((entry) => entry.family === id)
    return {
      id,
      label: CATEGORY_LABELS[id],
      total: ratings.length,
      evaluated: ratings.filter((entry) => entry.evaluation !== null).length,
      ratings,
    }
  })
}

/** Organization-estimated ability by family. Values come exclusively from authorized scouting estimates. */
export interface ScoutedFamilyProfile {
  readonly id: RatingCategory
  readonly label: string
  readonly observed: number
  readonly total: number
  readonly estimate: number | null
  readonly low: number | null
  readonly high: number | null
  /** Mean underlying scouting evidence coverage, not % of attributes estimated. */
  readonly coverage: number | null
  /** Mean reported confidence in percentage points (0-100). */
  readonly confidence: number | null
  readonly isComplete: boolean
}

export function buildScoutedFamilyProfiles(access: OpponentAccess): readonly ScoutedFamilyProfile[] {
  return buildOpponentFamilyKnowledge(access).map((family) => {
    // Descriptors may have a provisional estimate, but a visible numerical
    // radar needs actual numerical evaluated findings in every drawn family.
    const observations = family.ratings.flatMap((rating) => {
      const evaluation = rating.evaluation
      return evaluation !== null && evaluation.mode !== 'UNKNOWN'
        && evaluation.estimate !== undefined && Number.isFinite(evaluation.estimate)
        ? [{ evaluation, coverage: rating.coveragePercent }]
        : []
    })
    const n = observations.length
    const average = (values: readonly number[]): number =>
      Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    const estimate = n > 0 ? average(observations.map((row) => row.evaluation.estimate!)) : null
    const low = n > 0 ? average(observations.map((row) =>
      Math.max(0, row.evaluation.estimate! - (row.evaluation.uncertainty ?? 0)))) : null
    const high = n > 0 ? average(observations.map((row) =>
      Math.min(100, row.evaluation.estimate! + (row.evaluation.uncertainty ?? 0)))) : null
    return {
      id: family.id, label: family.label,
      observed: n, total: family.total, estimate, low, high,
      coverage: n > 0 ? average(observations.map((row) => row.coverage)) : null,
      confidence: n > 0 ? average(observations.map((row) => row.evaluation.confidence)) : null,
      isComplete: family.total > 0 && n === family.total,
    }
  })
}

/** Never close the spider polygon by inventing values for unknown families. */
export function hasScoutedRadarProfile(families: readonly ScoutedFamilyProfile[]): boolean {
  return families.length === RADAR_CATEGORY_ORDER.length
    && families.every((family) => family.isComplete && family.estimate !== null)
}

export function opponentKnowledgeSummary(access: OpponentAccess): {
  readonly knownRatings: number
  readonly totalRatings: number
  readonly knownDimensions: number
  readonly complete: boolean
} {
  const knownRatings = access.ratingEvaluations.filter((entry) => entry.evaluation !== null).length
  const totalRatings = access.ratingEvaluations.length
  return {
    knownRatings,
    totalRatings,
    knownDimensions: access.knownDimensions.length,
    // Never construct a spider shape from missing, partial, or invented family scores.
    complete: totalRatings > 0 && knownRatings === totalRatings,
  }
}

export function scoutingConfidenceLabel(confidence: number | undefined): string {
  if (confidence === undefined || !Number.isFinite(confidence)) return 'Sin confianza registrada'
  // RatingEvaluation.confidence is recorded in 0..100 percentage units.
  return Math.round(Math.max(0, Math.min(100, confidence))) + '% de confianza'
}
