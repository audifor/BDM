import type { PlayerTruthRatingKey } from '@/domain/player'
import type { RatingCategory } from './ratingCatalog'
import type { PlayerRatingRow, RatingEvolutionModel, AttributeCategoryModel } from './playerWorkspaceModel'

export type AttributeFilter = 'all' | 'strengths' | 'weaknesses' | 'tracked' | 'improved' | 'declined'
export type AttributeBaselineScope = 'none' | 'team' | 'league' | 'position'
export const MAX_FOCUS_ATTRIBUTES = 3

type EvolutionReadings = Readonly<Partial<Record<PlayerTruthRatingKey, RatingEvolutionModel>>>

export function filterCourtsideRatings(
  ratings: readonly PlayerRatingRow[],
  mode: AttributeFilter,
  search: string,
  evolutions: EvolutionReadings,
  strengths: ReadonlySet<PlayerTruthRatingKey>,
  weaknesses: ReadonlySet<PlayerTruthRatingKey>,
  tracked: ReadonlySet<PlayerTruthRatingKey>,
): readonly PlayerRatingRow[] {
  const needle = search.trim().toLocaleLowerCase()
  return ratings.filter((rating) => {
    if (needle !== '' && !rating.label.toLocaleLowerCase().includes(needle)) return false
    const history = evolutions[rating.id]
    switch (mode) {
      case 'all': return true
      case 'strengths': return strengths.has(rating.id)
      case 'weaknesses': return weaknesses.has(rating.id)
      case 'tracked': return tracked.has(rating.id)
      case 'improved': return history?.hasRecordedHistory === true && history.changeSinceFirst > 0
      case 'declined': return history?.hasRecordedHistory === true && history.changeSinceFirst < 0
    }
  })
}

/** A complete family reference requires a recorded baseline for every canonical rating. */
export function getCategoryComparison(
  category: Pick<AttributeCategoryModel, 'category' | 'all'>,
  evolutions: EvolutionReadings,
  scope: AttributeBaselineScope,
): number | null {
  if (scope === 'none' || category.all.length === 0) return null
  const values = category.all.map(({ id }) => {
    const source = evolutions[id]
    if (source === undefined) return null
    if (scope === 'league') return source.league.status === 'available' ? source.league.average : null
    if (scope === 'team') return source.team.status === 'available' ? source.team.average : null
    return source.standing.status === 'available' && source.standing.positionSampleSize > 0
      ? source.standing.positionAverage : null
  })
  if (values.some((value) => value === null || !Number.isFinite(value))) return null
  return Math.round(values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / values.length)
}

export function comparisonProfile(
  categories: readonly AttributeCategoryModel[],
  evolutions: EvolutionReadings,
  scope: AttributeBaselineScope,
): Readonly<Partial<Record<RatingCategory, number>>> | null {
  if (scope === 'none' || categories.length === 0) return null
  const output: Partial<Record<RatingCategory, number>> = {}
  for (const category of categories) {
    const value = getCategoryComparison(category, evolutions, scope)
    if (value === null) return null
    output[category.category] = value
  }
  return output
}

/** Immutable capped toggle, with no invented progress or Save V4 mutations. */
export function toggleFocusAttribute(
  current: readonly PlayerTruthRatingKey[],
  id: PlayerTruthRatingKey,
): readonly PlayerTruthRatingKey[] {
  if (current.includes(id)) return current.filter((entry) => entry !== id)
  if (current.length >= MAX_FOCUS_ATTRIBUTES) return current
  return [...current, id]
}
