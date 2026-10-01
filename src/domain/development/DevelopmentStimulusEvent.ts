import type { GameDate } from '@/domain/date'
import type { PlayerId } from '@/domain/ids'
import { CANONICAL_RATING_KEYS, type CanonicalRatingKey } from '@/domain/player'

export type DevelopmentStimulusSourceType = 'training' | 'match'

/** Compact, immutable evidence for one real contribution to the canonical stimulus aggregate. */
export interface DevelopmentStimulusEvent {
  readonly id: string
  readonly playerId: PlayerId
  readonly sourceType: DevelopmentStimulusSourceType
  readonly sourceId: string
  readonly date: GameDate
  readonly byRating: Readonly<Partial<Record<CanonicalRatingKey, number>>>
}

export function createDevelopmentStimulusEvent(input: DevelopmentStimulusEvent): DevelopmentStimulusEvent {
  if (!input.id.trim() || !input.sourceId.trim()) throw new RangeError('Development stimulus source identity is required')
  if (!['training', 'match'].includes(input.sourceType)) throw new RangeError('Development stimulus source type is invalid')
  const byRating: Partial<Record<CanonicalRatingKey, number>> = {}
  for (const key of CANONICAL_RATING_KEYS) {
    const amount = input.byRating[key]
    if (amount === undefined || amount === 0) continue
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`Development stimulus event amount is invalid: ${key}`)
    byRating[key] = amount
  }
  if (Object.keys(byRating).length === 0) throw new RangeError('Development stimulus event must contain a positive contribution')
  return Object.freeze({ ...input, byRating: Object.freeze(byRating) })
}
