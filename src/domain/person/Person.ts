import type { CountryId, PersonId } from '@/domain/ids'
import { parseGameDate, type GameDate } from '@/domain/date'
import { requireGender, type Gender } from '@/domain/primitives'
import { requireNonEmptyString } from '@/domain/validation'

export type PersonProfileKind = 'player' | 'staff' | 'official' | 'agent' | 'mediaPerson'

export interface PersonProfileRef {
  readonly kind: PersonProfileKind
  readonly profileId: string
}

export type PersonNameComponentKind =
  | 'UNVERIFIED_LEGACY_FAMILY_POOL'
  | 'LINKED_PATERNAL_GIVEN_NAME'
  | 'PROVISIONAL_UNLINKED_CULTURAL_GIVEN_NAME'

/** Names retain the semantics of the canonical BDM-DB identity producer.
 * A provisional second component is not a recorded father or hereditary surname. */
export interface PersonNameComponentProvenance {
  readonly namingCountryCode: string
  readonly givenSourceCountry: string
  readonly secondSourceCountry: string
  readonly secondComponentKind: PersonNameComponentKind
  readonly verifiedFatherLogicalKey?: string
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
  readonly nameComponent?: PersonNameComponentProvenance
  readonly gender?: Gender
  readonly dateOfBirth?: GameDate
  readonly nationalityIds: readonly CountryId[]
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
    ...(input.nameComponent === undefined ? {} : {
      nameComponent: validateNameComponent(input.nameComponent),
    }),
    ...(input.gender === undefined ? {} : { gender: requireGender(input.gender) }),
    ...(input.dateOfBirth === undefined ? {} : { dateOfBirth: parseGameDate(input.dateOfBirth) }),
    nationalityIds: nationalities,
    ...(physical === undefined ? {} : { physical }),
    profileRefs: refs,
  }
}

export function personIdForProfile(kind: PersonProfileKind, profileId: string): PersonId {
  return `person:${kind}:${requireNonEmptyString(profileId, 'Profile id')}` as PersonId
}

export function validateNameComponent(input: PersonNameComponentProvenance): PersonNameComponentProvenance {
  for (const code of [input.namingCountryCode, input.givenSourceCountry, input.secondSourceCountry]) {
    if (!/^[A-Z]{2}$/.test(code)) throw new RangeError('Person name provenance country code is invalid')
  }
  if (!(['UNVERIFIED_LEGACY_FAMILY_POOL', 'LINKED_PATERNAL_GIVEN_NAME', 'PROVISIONAL_UNLINKED_CULTURAL_GIVEN_NAME'] as readonly string[]).includes(input.secondComponentKind)) {
    throw new RangeError('Person second-name component kind is invalid')
  }
  const linked = input.secondComponentKind === 'LINKED_PATERNAL_GIVEN_NAME'
  if (linked !== (input.verifiedFatherLogicalKey !== undefined)) {
    throw new RangeError('Verified father must only exist for linked patronymics')
  }
  return {
    namingCountryCode: input.namingCountryCode,
    givenSourceCountry: input.givenSourceCountry,
    secondSourceCountry: input.secondSourceCountry,
    secondComponentKind: input.secondComponentKind,
    ...(linked ? { verifiedFatherLogicalKey: requireNonEmptyString(input.verifiedFatherLogicalKey!, 'Verified father logical key') } : {}),
  }
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
