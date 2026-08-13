import type { CountryId, PlayerId } from '@/domain/ids'
import { parseGameDate, type GameDate } from '@/domain/date'
import {
  requireBasketballPosition,
  requireGender,
  type BasketballPosition,
  type Gender,
} from '@/domain/primitives'
import { requireNonEmptyString } from '@/domain/validation'
import { calculateBootstrapAbilityProxy, type PlayerPotential } from './PlayerPotential'

export interface Player {
  readonly id: PlayerId
  readonly firstName: string
  readonly lastName: string
  readonly gender: Gender
  readonly nationalityId: CountryId
  readonly basketball: BasketballProfile
  readonly bio: PlayerBio
  readonly potential: PlayerPotential
}

export interface PlayerBio {
  readonly dateOfBirth: GameDate
  readonly heightCm: number
  readonly weightKg: number
}

export interface PlayerBioInput {
  dateOfBirth: GameDate | string
  heightCm: number
  weightKg: number
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

/** Bootstrap rating surface only; later player taxonomies may replace it. */
export const BASKETBALL_RATING_KEYS = ['finishing', 'shooting', 'playmaking', 'perimeterDefense', 'interiorDefense', 'rebounding', 'athleticism'] as const
export type BasketballRatingKey = typeof BASKETBALL_RATING_KEYS[number]

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
  bio: PlayerBioInput
  potential?: PlayerPotential
}

export function createPlayer(input: CreatePlayerInput): Player {
  const ratings = input.basketball.ratings
  validateRatings(ratings)
  const bio = validateBio(input.bio)
  const potential = validatePotential(input.potential ?? { ceiling: Math.round(calculateBootstrapAbilityProxy(ratings)) })

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
    bio,
    potential,
  }
}

function validatePotential(potential: PlayerPotential): PlayerPotential {
  return { ceiling: requireIntegerInRange(potential.ceiling, 'Player potential ceiling', 0, 100) }
}

function validateBio(bio: PlayerBioInput): PlayerBio {
  const heightCm = requireIntegerInRange(bio.heightCm, 'Player heightCm', 120, 250)
  const weightKg = requireIntegerInRange(bio.weightKg, 'Player weightKg', 30, 250)
  return { dateOfBirth: parseGameDate(bio.dateOfBirth), heightCm, weightKg }
}

function requireIntegerInRange(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}`)
  return value
}

function validateRatings(ratings: PlayerRatings): void {
  for (const name of BASKETBALL_RATING_KEYS) {
    const value = ratings[name]
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 100) {
      throw new RangeError(`Player ${name} must be an integer from 0 to 100`)
    }
  }
}
