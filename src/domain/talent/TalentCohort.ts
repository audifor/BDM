import type { Gender } from '@/domain/primitives'
import { requireGender } from '@/domain/primitives'
import type { PlaceId } from '@/domain/ids'
import { placeIdFromString } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

export type TalentCohortId = string & { readonly __talentCohortId: unique symbol }

export interface TalentSupplyInputs {
  /** Synthetic age-cohort population used by a fixture or explicitly versioned data source. */
  readonly ageCohortPopulation: number
  readonly basketballParticipationPerThousand: number
  readonly accessOpportunityBasisPoints: number
}

export interface TalentCohort {
  readonly id: TalentCohortId
  readonly placeId: PlaceId
  readonly birthYear: number
  readonly generationYear: number
  readonly gender: Gender
  readonly seed: number
  readonly candidateCapacity: number
  readonly inputs: TalentSupplyInputs
  readonly inputVersion: string
}

export interface CreateTalentCohortInput {
  readonly id: TalentCohortId | string
  readonly placeId: PlaceId
  readonly birthYear: number
  readonly generationYear: number
  readonly gender: Gender
  readonly seed: number
  readonly inputs: TalentSupplyInputs
  readonly inputVersion: string
}

export const MAX_TALENT_COHORT_CAPACITY = 100_000

export function talentCohortIdFromString(value: string): TalentCohortId {
  return requireNonEmptyString(value, 'Talent cohort id') as TalentCohortId
}

export function createTalentCohort(input: CreateTalentCohortInput): TalentCohort {
  const { ageCohortPopulation, basketballParticipationPerThousand, accessOpportunityBasisPoints } = input.inputs
  requireInteger(ageCohortPopulation, 'Age cohort population', 1, 100_000_000)
  requireInteger(basketballParticipationPerThousand, 'Basketball participation per thousand', 0, 1000)
  requireInteger(accessOpportunityBasisPoints, 'Access opportunity basis points', 0, 10_000)
  requireInteger(input.birthYear, 'Talent cohort birth year', 1800, 9998)
  requireInteger(input.generationYear, 'Talent cohort generation year', 1800, 9999)
  if (input.generationYear < input.birthYear) throw new RangeError('Talent cohort generation year cannot precede its birth year')
  requireInteger(input.seed, 'Talent cohort seed', 0, 0xffff_ffff)
  const candidateCapacity = Math.min(
    MAX_TALENT_COHORT_CAPACITY,
    Math.floor(ageCohortPopulation * basketballParticipationPerThousand / 1000 * accessOpportunityBasisPoints / 10_000),
  )

  return Object.freeze({
    id: talentCohortIdFromString(input.id),
    placeId: placeIdFromString(input.placeId),
    birthYear: input.birthYear,
    generationYear: input.generationYear,
    gender: requireGender(input.gender),
    seed: input.seed,
    candidateCapacity,
    inputs: Object.freeze({ ...input.inputs }),
    inputVersion: requireNonEmptyString(input.inputVersion, 'Talent cohort input version'),
  })
}

function requireInteger(value: number, label: string, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`)
  }
}
