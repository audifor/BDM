import { describe, expect, it } from 'vitest'

import type { PlayerTruthRatingKey } from '@/domain/player'
import type { AttributeCategoryModel, PlayerRatingRow, RatingEvolutionModel } from './playerWorkspaceModel'
import {
  comparisonProfile, filterCourtsideRatings, getCategoryComparison, toggleFocusAttribute,
} from './courtsideAttributeLogic'

const shooting = [
  { id: 'FREE_THROW', label: 'Free Throw', value: 70, category: 'shooting' },
  { id: 'THREE_POINT_STATIC', label: 'Three Point Static', value: 40, category: 'shooting' },
] as const satisfies readonly PlayerRatingRow[]

const categories = [{
  category: 'shooting',
  label: 'Shooting',
  all: shooting,
}] as unknown as readonly AttributeCategoryModel[]

function observation(team: number | null, league: number | null, position: number | null, delta: number, history = true) {
  return {
    team: { status: team === null ? 'unavailable' : 'available', average: team },
    league: { status: league === null ? 'unavailable' : 'available', average: league },
    standing: { status: 'available', positionAverage: position, positionSampleSize: position === null ? 0 : 6 },
    hasRecordedHistory: history,
    changeSinceFirst: delta,
  } as unknown as RatingEvolutionModel
}
const history = {
  FREE_THROW: observation(60, 64, 62, 4),
  THREE_POINT_STATIC: observation(50, 48, 49, -2),
} as unknown as Readonly<Record<PlayerTruthRatingKey, RatingEvolutionModel>>

describe('Courtside Attributes canonical selectors', () => {
  it('filters a category to watched attributes without changing rating values', () => {
    const rows = filterCourtsideRatings(shooting, 'tracked', '', history, new Set(), new Set(), new Set<PlayerTruthRatingKey>(['FREE_THROW']))
    expect(rows.map((row) => row.id)).toEqual(['FREE_THROW'])
    expect(rows[0]?.value).toBe(70)
  })

  it('searches attributes and only claims growth when history is tracked', () => {
    expect(filterCourtsideRatings(shooting, 'all', 'three point', history, new Set(), new Set(), new Set()).map(x => x.id))
      .toEqual(['THREE_POINT_STATIC'])
    expect(filterCourtsideRatings(shooting, 'improved', '', history, new Set(), new Set(), new Set()).map(x => x.id))
      .toEqual(['FREE_THROW'])
    expect(filterCourtsideRatings(shooting, 'declined', '', history, new Set(), new Set(), new Set()).map(x => x.id))
      .toEqual(['THREE_POINT_STATIC'])
    const noHistory = {
      ...history,
      FREE_THROW: observation(60, 64, 62, 4, false),
    } as Readonly<Record<PlayerTruthRatingKey, RatingEvolutionModel>>
    expect(filterCourtsideRatings(shooting, 'improved', '', noHistory, new Set(), new Set(), new Set())).toEqual([])
  })

  it('does not draw an invented baseline when any family rating is unknown', () => {
    expect(getCategoryComparison(categories[0]!, history, 'team')).toBe(55)
    expect(getCategoryComparison(categories[0]!, history, 'league')).toBe(56)
    expect(getCategoryComparison(categories[0]!, history, 'position')).toBe(56)
    expect(getCategoryComparison(categories[0]!, history, 'none')).toBeNull()
    expect(comparisonProfile(categories, history, 'team')).toEqual({ shooting: 55 })
    const missing = {
      ...history, THREE_POINT_STATIC: observation(null, 48, 49, -2),
    } as Readonly<Record<PlayerTruthRatingKey, RatingEvolutionModel>>
    expect(comparisonProfile(categories, missing, 'team')).toBeNull()
  })

  it('caps watched attributes at three, supports removal and does not mutate the original', () => {
    const first: readonly PlayerTruthRatingKey[] = ['FREE_THROW', 'SPEED', 'COMPOSURE']
    expect(toggleFocusAttribute(first, 'THREE_POINT_STATIC')).toBe(first)
    const without = toggleFocusAttribute(first, 'SPEED')
    expect(without).toEqual(['FREE_THROW', 'COMPOSURE'])
    expect(first).toEqual(['FREE_THROW', 'SPEED', 'COMPOSURE'])
    expect(toggleFocusAttribute(without, 'THREE_POINT_STATIC')).toEqual(['FREE_THROW', 'COMPOSURE', 'THREE_POINT_STATIC'])
  })
})
