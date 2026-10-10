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
