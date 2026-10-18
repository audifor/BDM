import type { PlayerId } from '@/domain/ids'
import { PLAYER_TRUTH_RATING_KEYS, type PlayerTruthRatingKey } from '@/domain/player'
import type { GameWorld } from '@/domain/world'
import { derivePlayerKnowledgeAccess } from '@/app/player/PlayerKnowledgeAccess'
import { getUserTeam } from '@/engine/calendar'
import { ratingLabel } from './ratingCatalog'

export interface ScoutingRosterComparisonRow {
  readonly id: PlayerTruthRatingKey
  readonly label: string
  readonly subject: number | null
  readonly low: number | null
  readonly high: number | null
  readonly own: number
  readonly isEstimate: boolean
}

/**
 * FM-style like-for-like: compare the SAME individual attribute key on both
 * players. Own roster = exact truth. External subject = only persisted scouting
 * evaluations. Never mix a broad scouting domain with a full 80-rating average.
 */
export function buildScoutingRosterComparison(
  world: GameWorld, subjectId: PlayerId, ownPlayerId: PlayerId,
): readonly ScoutingRosterComparisonRow[] {
  const team = getUserTeam(world)
  if (team === undefined || !team.rosterPlayerIds.includes(ownPlayerId)) return []
  const ownAccess = derivePlayerKnowledgeAccess(world, ownPlayerId)
  if (ownAccess.kind !== 'own-roster') return []
  const subjectAccess = derivePlayerKnowledgeAccess(world, subjectId)
  const evaluations = new Map(subjectAccess.ratingEvaluations.map(row => [row.key, row.evaluation]))
  return PLAYER_TRUTH_RATING_KEYS.map(key => {
    let subject: number | null = null
    let low: number | null = null
    let high: number | null = null
    if (subjectAccess.kind === 'own-roster') {
      subject = subjectAccess.currentRatings[key]
      low = high = subject
    } else {
      const evaluation = evaluations.get(key)
      if (evaluation?.mode !== 'UNKNOWN' && evaluation?.estimate !== undefined) {
        subject = Math.round(evaluation.estimate)
        low = Math.max(1, Math.round(evaluation.estimate - (evaluation.uncertainty ?? 0)))
        high = Math.min(100, Math.round(evaluation.estimate + (evaluation.uncertainty ?? 0)))
      }
    }
    return {
      id: key, label: ratingLabel(key), subject, low, high,
      own: ownAccess.currentRatings[key], isEstimate: subjectAccess.kind !== 'own-roster',
    }
  })
}
