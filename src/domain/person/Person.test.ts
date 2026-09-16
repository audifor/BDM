import { describe, expect, it } from 'vitest'
import { countryIdFromString, personIdFromString } from '@/domain/ids'
import { createPerson } from './Person'

describe('Person', () => {
  it('stores shared human identity once while referencing multiple role profiles', () => {
    const person = createPerson({
      id: personIdFromString('person:shared-1'),
      firstName: 'Alex',
      lastName: 'Silva',
      gender: 'male',
      dateOfBirth: '1990-04-05',
      nationalityIds: [countryIdFromString('country-a'), countryIdFromString('country-b')],
      physical: { heightCm: 188, weightKg: 86 },
      profileRefs: [
        { kind: 'player', profileId: 'player-1' },
        { kind: 'staff', profileId: 'staff-1' },
      ],
    })
    expect(person.profileRefs).toHaveLength(2)
    expect(person.nationalityIds).toEqual(['country-a', 'country-b'])
    expect(JSON.stringify(person)).not.toContain('overall')
  })

  it('rejects duplicate profile references and nationalities', () => {
    const input = { id: personIdFromString('person:duplicate'), firstName: 'A', lastName: 'B', gender: 'female' as const, profileRefs: [{ kind: 'player' as const, profileId: 'player-1' }, { kind: 'player' as const, profileId: 'player-1' }] }
    expect(() => createPerson(input)).toThrow(RangeError)
    expect(() => createPerson({ ...input, profileRefs: [{ kind: 'player', profileId: 'player-1' }], nationalityIds: [countryIdFromString('country-a'), countryIdFromString('country-a')] })).toThrow(RangeError)
  })
})
