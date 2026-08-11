import type { CountryId, PlayerId } from '@/domain/ids'
import { requireGender, type Gender } from '@/domain/primitives'
import { requireNonEmptyString } from '@/domain/validation'

export interface Player {
  readonly id: PlayerId
  readonly firstName: string
  readonly lastName: string
  readonly gender: Gender
  readonly nationalityId: CountryId
}

export interface CreatePlayerInput {
  id: PlayerId
  firstName: string
  lastName: string
  gender: Gender
  nationalityId: CountryId
}

export function createPlayer(input: CreatePlayerInput): Player {
  return {
    id: requireNonEmptyString(input.id, 'Player id') as PlayerId,
    firstName: requireNonEmptyString(input.firstName, 'Player first name'),
    lastName: requireNonEmptyString(input.lastName, 'Player last name'),
    gender: requireGender(input.gender),
    nationalityId: requireNonEmptyString(input.nationalityId, 'Player nationality id') as CountryId,
  }
}
