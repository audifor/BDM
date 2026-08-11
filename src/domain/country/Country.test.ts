import { describe, expect, it } from 'vitest'

import { countryIdFromString } from '@/domain/ids'

import { createCountry } from './index'

describe('Country', () => {
  it('creates a valid country', () => {
    expect(
      createCountry({ id: countryIdFromString('country-a'), name: 'Arcadia', code: 'ARC' }),
    ).toEqual({ id: 'country-a', name: 'Arcadia', code: 'ARC' })
  })

  it('rejects empty names and codes', () => {
    const id = countryIdFromString('country-a')

    expect(() => createCountry({ id, name: '', code: 'ARC' })).toThrow(TypeError)
    expect(() => createCountry({ id, name: 'Arcadia', code: ' ' })).toThrow(TypeError)
  })
})
