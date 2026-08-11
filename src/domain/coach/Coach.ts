import type { CoachId, CountryId } from '@/domain/ids'
import { requireGender, type Gender } from '@/domain/primitives'
import { requireNonEmptyString } from '@/domain/validation'

export interface Coach {
  readonly id: CoachId
  readonly firstName: string
  readonly lastName: string
  readonly gender: Gender
  readonly nationalityId: CountryId
}

export interface CreateCoachInput {
  id: CoachId
  firstName: string
  lastName: string
  gender: Gender
  nationalityId: CountryId
}

export function createCoach(input: CreateCoachInput): Coach {
  return {
    id: requireNonEmptyString(input.id, 'Coach id') as CoachId,
    firstName: requireNonEmptyString(input.firstName, 'Coach first name'),
    lastName: requireNonEmptyString(input.lastName, 'Coach last name'),
    gender: requireGender(input.gender),
    nationalityId: requireNonEmptyString(input.nationalityId, 'Coach nationality id') as CountryId,
  }
}
