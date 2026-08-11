import { describe, expect, it } from 'vitest'

import { countryIdFromString, playerIdFromString } from '@/domain/ids'

import { createPlayer } from './index'
import { createTestBasketballProfile } from './testFixtures'

describe('Player', () => {
  const input = {
    id: playerIdFromString('player-a'),
    firstName: 'Alex',
    lastName: 'Silva',
    gender: 'male' as const,
    nationalityId: countryIdFromString('country-a'),
    basketball: createTestBasketballProfile(),
  }

  it('creates a valid player', () => {
    expect(createPlayer(input)).toEqual(input)
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
})
