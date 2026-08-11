import { describe, expect, it } from 'vitest'

import { countryIdFromString, playerIdFromString } from '@/domain/ids'

import { createPlayer } from './index'

describe('Player', () => {
  const input = {
    id: playerIdFromString('player-a'),
    firstName: 'Alex',
    lastName: 'Silva',
    gender: 'male' as const,
    nationalityId: countryIdFromString('country-a'),
  }

  it('creates a valid player', () => {
    expect(createPlayer(input)).toEqual(input)
  })

  it('rejects empty names', () => {
    expect(() => createPlayer({ ...input, firstName: '' })).toThrow(TypeError)
    expect(() => createPlayer({ ...input, lastName: ' ' })).toThrow(TypeError)
  })
})
