import { describe, expect, it } from 'vitest'

import { countryIdFromString, playerIdFromString } from '@/domain/ids'

import { createPlayer } from './index'
import { createTestBasketballProfile, createTestPlayerBio } from './testFixtures'

describe('Player', () => {
  const input = {
    id: playerIdFromString('player-a'),
    firstName: 'Alex',
    lastName: 'Silva',
    gender: 'male' as const,
    nationalityId: countryIdFromString('country-a'),
    basketball: createTestBasketballProfile(),
    bio: createTestPlayerBio(),
    potential: { ceiling: 70 },
  }

  it('creates a valid player', () => {
    const player = createPlayer(input)
    expect(Object.keys(player.basketball.ratings)).toHaveLength(35)
    expect(Object.keys(player.basketball.tendencies)).toHaveLength(21)
    expect(player.potential).toEqual({ ceiling: 70 })
  })

  it('rejects empty names', () => {
    expect(() => createPlayer({ ...input, firstName: '' })).toThrow(TypeError)
    expect(() => createPlayer({ ...input, lastName: ' ' })).toThrow(TypeError)
  })

  it.each(['PG', 'SG', 'SF', 'PF', 'C'] as const)('accepts position %s', (primaryPosition) => {
    expect(createPlayer({ ...input, basketball: { ...input.basketball, primaryPosition } }).basketball.primaryPosition).toBe(primaryPosition)
  })

  it.each([-1, 101, 50.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid ratings: %s', (finishing) => {
    expect(() => createPlayer({ ...input, basketball: { ...input.basketball, ratings: { ...input.basketball.ratings, finishing } } })).toThrow(RangeError)
  })

  it('accepts rating bounds and serializes the profile', () => {
    const player = createPlayer({ ...input, basketball: { ...input.basketball, ratings: { ...input.basketball.ratings, finishing: 0, shooting: 100 } } })
    expect(JSON.parse(JSON.stringify(player))).toEqual(player)
  })

  it('rejects invalid bio measurements', () => {
    expect(() => createPlayer({ ...input, bio: { ...input.bio, heightCm: 119 } })).toThrow(RangeError)
    expect(() => createPlayer({ ...input, bio: { ...input.bio, weightKg: 250.5 } })).toThrow(RangeError)
  })

  it.each([-1, 101, 50.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid potential: %s', (ceiling) => {
    expect(() => createPlayer({ ...input, potential: { ceiling } })).toThrow(RangeError)
  })
})
