import type { SeasonId } from '@/domain/ids'
import {
  CANONICAL_RATING_KEYS,
  type CanonicalRatingKey,
  type LegacyCanonicalPlayerRatings,
  PLAYER_TRUTH_RATING_KEYS,
  type PlayerTruthRatingKey,
} from '@/domain/player'
import type { GameDate } from '@/domain/date'

/**
 * Canonical rating movement applied by one offseason development transition.
 *
 * Only non-zero movements are stored. The deltas are the canonical (35-key compatibility)
 * projection differences produced by `applyOffseasonDevelopment`, so a past value is recovered
 * exactly with `ratingHistorySeries` by walking the recorded chain backwards from the current value.
 */
export type PlayerRatingDeltas = Readonly<Partial<Record<CanonicalRatingKey, number>>>

export interface PlayerSeasonRatingChange {
  /** Season the change closed: the transition ran from this season into the following one. */
  readonly seasonId: SeasonId
  readonly deltas: PlayerRatingDeltas
  /** Sparse exact changes to the 80 persisted Player Truth ratings. Absent on legacy saves. */
  readonly truthDeltas?: Readonly<Partial<Record<PlayerTruthRatingKey, { readonly before: number; readonly after: number; readonly delta: number }>>>
  /** Stimulus present at this checkpoint, retained after the live aggregate resets. */
  readonly stimulusByRating?: Readonly<Partial<Record<CanonicalRatingKey, number>>>
  readonly checkpointDate?: GameDate
  readonly cycleId?: string
  readonly age?: number
  readonly baseTrend?: number
  readonly potentialGrowthFactor?: number
}

/** Chronological (oldest first) rating movement history for one player. Never contains the current value. */
export type PlayerRatingHistory = readonly PlayerSeasonRatingChange[]

export const EMPTY_PLAYER_RATING_HISTORY: PlayerRatingHistory = Object.freeze([])

export function createPlayerSeasonRatingChange(input: PlayerSeasonRatingChange): PlayerSeasonRatingChange {
  const deltas: Partial<Record<CanonicalRatingKey, number>> = {}
  for (const key of CANONICAL_RATING_KEYS) {
    const value = input.deltas[key]
    if (value === undefined) continue
    if (!Number.isInteger(value)) throw new RangeError(`Rating history delta must be an integer: ${key}`)
    if (value !== 0) deltas[key] = value
  }
  const truthDeltas: Partial<Record<PlayerTruthRatingKey, { before: number; after: number; delta: number }>> = {}
  for (const key of PLAYER_TRUTH_RATING_KEYS) {
    const change = input.truthDeltas?.[key]
    if (change === undefined) continue
    if (![change.before, change.after, change.delta].every(Number.isInteger) || change.after - change.before !== change.delta) throw new RangeError(`Truth rating history change is invalid: ${key}`)
    if (change.delta !== 0) truthDeltas[key] = Object.freeze({ ...change })
  }
  const stimulusByRating: Partial<Record<CanonicalRatingKey, number>> = {}
  for (const key of CANONICAL_RATING_KEYS) {
    const amount = input.stimulusByRating?.[key]
    if (amount === undefined || amount === 0) continue
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`Rating history stimulus is invalid: ${key}`)
    stimulusByRating[key] = amount
  }
  return {
    seasonId: input.seasonId,
    deltas: Object.freeze(deltas),
    ...(input.truthDeltas === undefined ? {} : { truthDeltas: Object.freeze(truthDeltas) }),
    ...(input.stimulusByRating === undefined ? {} : { stimulusByRating: Object.freeze(stimulusByRating) }),
    ...(input.checkpointDate === undefined ? {} : { checkpointDate: input.checkpointDate }),
    ...(input.cycleId === undefined ? {} : { cycleId: input.cycleId }),
    ...(input.age === undefined ? {} : { age: input.age }),
    ...(input.baseTrend === undefined ? {} : { baseTrend: input.baseTrend }),
    ...(input.potentialGrowthFactor === undefined ? {} : { potentialGrowthFactor: input.potentialGrowthFactor }),
  }
}

/** Appends one transition, replacing any previously recorded entry for the same season. */
export function appendRatingHistory(
  history: PlayerRatingHistory,
  change: PlayerSeasonRatingChange,
): PlayerRatingHistory {
  const created = createPlayerSeasonRatingChange(change)
  const withoutSeason = history.filter((entry) => entry.seasonId !== created.seasonId)
  return Object.freeze([...withoutSeason, created])
}

/** Every canonical rating key that changed at least once in the recorded history. */
export function changedRatingKeys(history: PlayerRatingHistory): readonly CanonicalRatingKey[] {
  const changed = new Set<CanonicalRatingKey>()
  for (const entry of history) {
    for (const key of CANONICAL_RATING_KEYS) {
      if ((entry.deltas[key] ?? 0) !== 0) changed.add(key)
    }
  }
  return CANONICAL_RATING_KEYS.filter((key) => changed.has(key))
}

export interface PlayerRatingPoint {
  readonly seasonId: SeasonId
  readonly value: number
}

/**
 * One rating's value at every recorded season (oldest first), closed by the current value.
 *
 * A player without recorded history yields a single point: the current value is all that is known,
 * and the chart must show that honestly rather than inventing earlier seasons. A transition
 * attributed to the season still in progress owns no point of its own — that season is reported by
 * the closing current value — but its movement is still removed from every earlier season.
 */
export function ratingHistorySeries(
  current: LegacyCanonicalPlayerRatings,
  history: PlayerRatingHistory,
  key: CanonicalRatingKey,
  currentSeasonId: SeasonId,
): readonly PlayerRatingPoint[] {
  const totalMovement = history.reduce((sum, entry) => sum + (entry.deltas[key] ?? 0), 0)
  let running = current[key] - totalMovement

  const points: PlayerRatingPoint[] = []
  for (const entry of history) {
    if (entry.seasonId !== currentSeasonId) points.push({ seasonId: entry.seasonId, value: running })
    running += entry.deltas[key] ?? 0
  }

  return [...points, { seasonId: currentSeasonId, value: current[key] }]
}
