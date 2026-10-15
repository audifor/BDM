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

  it('keeps P0D provisional name semantics without inventing kinship', () => {
    const person = createPerson({
      id: personIdFromString('person:p0d:so'),
      firstName: 'Ayan',
      lastName: 'Hassan',
      nationalityIds: [],
      profileRefs: [],
      nameComponent: {
        namingCountryCode: 'SO',
        givenSourceCountry: 'SO',
        secondSourceCountry: 'SO',
        secondComponentKind: 'PROVISIONAL_UNLINKED_CULTURAL_GIVEN_NAME',
      },
    })
    expect(person.nameComponent?.secondComponentKind).toBe('PROVISIONAL_UNLINKED_CULTURAL_GIVEN_NAME')
    expect(person.nameComponent?.verifiedFatherLogicalKey).toBeUndefined()
    expect(() => createPerson({
      ...person,
      nameComponent: { ...person.nameComponent!, verifiedFatherLogicalKey: 'fiction:father' },
    })).toThrow(RangeError)
    expect(() => createPerson({
      ...person,
      nameComponent: { ...person.nameComponent!, secondComponentKind: 'LINKED_PATERNAL_GIVEN_NAME' },
    })).toThrow(RangeError)
    const linked = createPerson({
      ...person,
      nameComponent: { ...person.nameComponent!, secondComponentKind: 'LINKED_PATERNAL_GIVEN_NAME', verifiedFatherLogicalKey: 'world:father:verified' },
    })
    expect(linked.nameComponent?.verifiedFatherLogicalKey).toBe('world:father:verified')
  })

  it('does not accept Coach as a canonical Person profile kind', () => {
    expect(() => createPerson({ id: personIdFromString('person:coach-legacy'), firstName: 'A', lastName: 'B', profileRefs: [{ kind: 'coach' as never, profileId: 'coach-1' }] })).toThrow(RangeError)
  })
})
