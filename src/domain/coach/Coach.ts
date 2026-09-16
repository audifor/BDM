import type { CoachId, CountryId, PersonId, StaffPersonId } from '@/domain/ids'
import { requireGender, type Gender } from '@/domain/primitives'
import { requireNonEmptyString } from '@/domain/validation'

export interface Coach {
  readonly id: CoachId
  /** Canonical human root reference. */
  readonly personId?: PersonId
  /** Optional link to the Staff profile that carries coaching responsibilities. */
  readonly staffProfileId?: StaffPersonId
  readonly firstName: string
  readonly lastName: string
  readonly gender: Gender
  readonly nationalityId: CountryId
}

export interface CreateCoachInput {
  id: CoachId
  readonly personId?: PersonId
  readonly staffProfileId?: StaffPersonId
  firstName: string
  lastName: string
  gender: Gender
  nationalityId: CountryId
}

export function createCoach(input: CreateCoachInput): Coach {
  return {
    id: requireNonEmptyString(input.id, 'Coach id') as CoachId,
    personId: input.personId ?? (`person:coach:${input.id}` as PersonId),
    ...(input.staffProfileId === undefined ? {} : { staffProfileId: input.staffProfileId }),
    firstName: requireNonEmptyString(input.firstName, 'Coach first name'),
    lastName: requireNonEmptyString(input.lastName, 'Coach last name'),
    gender: requireGender(input.gender),
    nationalityId: requireNonEmptyString(input.nationalityId, 'Coach nationality id') as CountryId,
  }
}

/** Compatibility projection: Coach gameplay is a coaching Staff role, not another human root. */
export interface CoachStaffRoleProjection {
  readonly personId: PersonId
  readonly sourceCoachId: CoachId
  readonly roleFamily: 'coaching'
  readonly role: 'headCoach'
}

export function projectCoachToStaffRole(coach: Coach): CoachStaffRoleProjection {
  return {
    personId: coach.personId ?? (`person:coach:${coach.id}` as PersonId),
    sourceCoachId: coach.id,
    roleFamily: 'coaching',
    role: 'headCoach',
  }
}
