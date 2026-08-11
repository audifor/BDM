import type { CountryId, PlayerId } from '@/domain/ids'
import {
  requireBasketballPosition,
  requireGender,
  type BasketballPosition,
  type Gender,
} from '@/domain/primitives'
import { requireNonEmptyString } from '@/domain/validation'

export interface Player {
  readonly id: PlayerId
  readonly firstName: string
  readonly lastName: string
  readonly gender: Gender
  readonly nationalityId: CountryId
  readonly basketball: BasketballProfile
}

export interface PlayerRatings {
  readonly finishing: number
  readonly shooting: number
  readonly playmaking: number
  readonly perimeterDefense: number
  readonly interiorDefense: number
  readonly rebounding: number
  readonly athleticism: number
}

export interface BasketballProfile {
  readonly primaryPosition: BasketballPosition
  readonly ratings: PlayerRatings
}

export interface CreatePlayerInput {
  id: PlayerId
  firstName: string
  lastName: string
  gender: Gender
  nationalityId: CountryId
  basketball: BasketballProfile
}

export function createPlayer(input: CreatePlayerInput): Player {
  const ratings = input.basketball.ratings
  validateRatings(ratings)

  return {
    id: requireNonEmptyString(input.id, 'Player id') as PlayerId,
    firstName: requireNonEmptyString(input.firstName, 'Player first name'),
    lastName: requireNonEmptyString(input.lastName, 'Player last name'),
    gender: requireGender(input.gender),
    nationalityId: requireNonEmptyString(input.nationalityId, 'Player nationality id') as CountryId,
    basketball: {
      primaryPosition: requireBasketballPosition(input.basketball.primaryPosition),
      ratings,
    },
  }
}

function validateRatings(ratings: PlayerRatings): void {
  const ratingNames: readonly (keyof PlayerRatings)[] = [
    'finishing', 'shooting', 'playmaking', 'perimeterDefense', 'interiorDefense', 'rebounding', 'athleticism',
  ]

  for (const name of ratingNames) {
    const value = ratings[name]
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 100) {
      throw new RangeError(`Player ${name} must be an integer from 0 to 100`)
    }
  }
}
