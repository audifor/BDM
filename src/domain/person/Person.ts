import type { CountryId, PersonId } from '@/domain/ids'
import { parseGameDate, type GameDate } from '@/domain/date'
import { requireGender, type Gender } from '@/domain/primitives'
import { requireNonEmptyString } from '@/domain/validation'

export type PersonProfileKind = 'player' | 'staff' | 'official' | 'agent' | 'mediaPerson'

export interface PersonProfileRef {
  readonly kind: PersonProfileKind
  readonly profileId: string
}

export interface PersonPhysicalProfile {
  readonly heightCm?: number
  readonly weightKg?: number
  readonly wingspanCm?: number
  readonly standingReachCm?: number
}

/** Canonical human identity. Role-specific data belongs to the referenced profile. */
export interface Person {
  readonly id: PersonId
  readonly firstName: string
  readonly lastName: string
  readonly gender?: Gender
  readonly dateOfBirth?: GameDate
  readonly nationalityIds: readonly CountryId[]
  readonly birthPlaceId?: string
  readonly currentResidencePlaceId?: string
  readonly languages?: readonly { readonly languageCode: string; readonly proficiency: number; readonly isNative: boolean }[]
  readonly physical?: PersonPhysicalProfile
  readonly profileRefs: readonly PersonProfileRef[]
}

export interface CreatePersonInput extends Omit<Person, 'id' | 'gender' | 'dateOfBirth' | 'nationalityIds'> {
  readonly id: PersonId
  readonly gender?: Gender
  readonly dateOfBirth?: GameDate | string
  readonly nationalityIds?: readonly CountryId[]
}

export function createPerson(input: CreatePersonInput): Person {
  const refs = input.profileRefs.map((ref) => {
    if (!(['player', 'staff', 'official', 'agent', 'mediaPerson'] as readonly string[]).includes(ref.kind)) throw new RangeError('Person profile kind is invalid')
    return { kind: ref.kind, profileId: requireNonEmptyString(ref.profileId, 'Person profile id') }
  })
  if (new Set(refs.map((ref) => `${ref.kind}:${ref.profileId}`)).size !== refs.length) {
    throw new RangeError('Person profile references must be unique')
  }
  const nationalities = [...(input.nationalityIds ?? [])]
  if (new Set(nationalities).size !== nationalities.length) throw new RangeError('Person nationalities must be unique')
  const physical = input.physical === undefined ? undefined : validatePhysical(input.physical)
  return {
    id: requireNonEmptyString(input.id, 'Person id') as PersonId,
    firstName: requireNonEmptyString(input.firstName, 'Person first name'),
    lastName: requireNonEmptyString(input.lastName, 'Person last name'),
    ...(input.gender === undefined ? {} : { gender: requireGender(input.gender) }),
    ...(input.dateOfBirth === undefined ? {} : { dateOfBirth: parseGameDate(input.dateOfBirth) }),
    nationalityIds: nationalities,
    ...(input.birthPlaceId === undefined ? {} : { birthPlaceId: requireNonEmptyString(input.birthPlaceId, 'Person birthPlaceId') }),
    ...(input.currentResidencePlaceId === undefined ? {} : { currentResidencePlaceId: requireNonEmptyString(input.currentResidencePlaceId, 'Person currentResidencePlaceId') }),
    ...(input.languages === undefined ? {} : { languages: input.languages.map(language => {
      const code = requireNonEmptyString(language.languageCode, 'Person languageCode')
      if (!Number.isInteger(language.proficiency) || language.proficiency < 0 || language.proficiency > 100) throw new RangeError('Person language proficiency must be 0..100')
      return { languageCode: code, proficiency: language.proficiency, isNative: language.isNative === true }
    }) }),
    ...(physical === undefined ? {} : { physical }),
    profileRefs: refs,
  }
}

export function personIdForProfile(kind: PersonProfileKind, profileId: string): PersonId {
  return `person:${kind}:${requireNonEmptyString(profileId, 'Profile id')}` as PersonId
}

function validatePhysical(input: PersonPhysicalProfile): PersonPhysicalProfile {
  const result: PersonPhysicalProfile = {
    ...(input.heightCm === undefined ? {} : { heightCm: finite(input.heightCm, 'Person heightCm', 1, 300) }),
    ...(input.weightKg === undefined ? {} : { weightKg: finite(input.weightKg, 'Person weightKg', 1, 500) }),
    ...(input.wingspanCm === undefined ? {} : { wingspanCm: finite(input.wingspanCm, 'Person wingspanCm', 1, 400) }),
    ...(input.standingReachCm === undefined ? {} : { standingReachCm: finite(input.standingReachCm, 'Person standingReachCm', 1, 400) }),
  }
  return result
}

function finite(value: number, label: string, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new RangeError(`${label} is invalid`)
  return value
}
