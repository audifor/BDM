import { describe, expect, it } from 'vitest'

import { coachIdFromString, countryIdFromString } from '@/domain/ids'

import { createCoach } from './index'

describe('Coach', () => {
  const input = {
    id: coachIdFromString('coach-a'),
    firstName: 'Mara',
    lastName: 'Vega',
    gender: 'female' as const,
    nationalityId: countryIdFromString('country-a'),
  }

  it('creates a valid coach', () => {
    expect(createCoach(input)).toEqual(input)
  })

  it('rejects empty names', () => {
    expect(() => createCoach({ ...input, firstName: '' })).toThrow(TypeError)
    expect(() => createCoach({ ...input, lastName: ' ' })).toThrow(TypeError)
  })
})
