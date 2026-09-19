import { describe, expect, it } from 'vitest'

import { seasonIdFromString } from '@/domain/ids'
import { CANONICAL_RATING_KEYS, type LegacyCanonicalPlayerRatings } from '@/domain/player'

import {
  appendRatingHistory,
  createPlayerSeasonRatingChange,
  ratingHistorySeries,
  type PlayerRatingHistory,
} from './PlayerRatingHistory'

const SEASON_1 = seasonIdFromString('generated-season-0001')
const SEASON_2 = seasonIdFromString('generated-season-0002')
const SEASON_3 = seasonIdFromString('generated-season-0003')

function ratings(overrides: Partial<LegacyCanonicalPlayerRatings> = {}): LegacyCanonicalPlayerRatings {
  return {
    ...Object.fromEntries(CANONICAL_RATING_KEYS.map((key) => [key, 50])),
    ...overrides,
  } as LegacyCanonicalPlayerRatings
}

function series(current: LegacyCanonicalPlayerRatings, history: PlayerRatingHistory, key: 'passing' | 'threePointShooting') {
  return ratingHistorySeries(current, history, key, SEASON_3).map((point) => point.value)
}

describe('PlayerRatingHistory', () => {
  it('keeps only non-zero canonical deltas', () => {
    const change = createPlayerSeasonRatingChange({
      seasonId: SEASON_1,
      deltas: { threePointShooting: 2, passing: 0 },
    })

    expect(change.deltas).toEqual({ threePointShooting: 2 })
    expect(change.deltas.passing).toBeUndefined()
  })

  it('rejects fractional deltas so reconstructed values stay exact', () => {
    expect(() =>
      createPlayerSeasonRatingChange({ seasonId: SEASON_1, deltas: { passing: 1.5 } }),
    ).toThrow(RangeError)
  })

  it('appends chronologically and replaces an already recorded season', () => {
    const first = appendRatingHistory([], { seasonId: SEASON_1, deltas: { passing: 1 } })
    const second = appendRatingHistory(first, { seasonId: SEASON_2, deltas: { passing: 2 } })
    const replay = appendRatingHistory(second, { seasonId: SEASON_2, deltas: { passing: 3 } })

    expect(second.map((entry) => entry.seasonId)).toEqual([SEASON_1, SEASON_2])
    expect(replay).toHaveLength(2)
    expect(replay[1]!.deltas.passing).toBe(3)
  })

  it('reconstructs past values by removing every later movement', () => {
    const current = ratings({ passing: 60, threePointShooting: 44 })
    const history: PlayerRatingHistory = [
      { seasonId: SEASON_1, deltas: { passing: 4 } },
      { seasonId: SEASON_2, deltas: { passing: 2, threePointShooting: 1 } },
    ]

    // One point per recorded season, closed by the current value. A rating moved by the transition
    // that closes a season still holds its old value for that season.
    expect(series(current, history, 'passing')).toEqual([54, 58, 60])
    expect(series(current, history, 'threePointShooting')).toEqual([43, 43, 44])
    // A rating nobody moved never drifts.
    expect(series(current, history.slice(1), 'passing')).toEqual([58, 60])
  })

  it('returns the current value as the only point when nothing has been recorded', () => {
    const current = ratings({ passing: 61 })

    expect(series(current, [], 'passing')).toEqual([61])
  })

  it('gives a transition recorded for the season in progress no point of its own', () => {
    const current = ratings({ passing: 60 })
    const history: PlayerRatingHistory = [
      { seasonId: SEASON_2, deltas: { passing: 2 } },
      { seasonId: SEASON_3, deltas: { passing: 1 } },
    ]

    // The in-progress transition still moves the earlier season, but the season it belongs to is
    // reported by the closing current value.
    expect(ratingHistorySeries(current, history, 'passing', SEASON_3)).toEqual([
      { seasonId: SEASON_2, value: 57 },
      { seasonId: SEASON_3, value: 60 },
    ])
  })
})

