import { personIdForProfile } from '@/domain/person'
import { staffPersonIdFromString, type CoachId, type CountryId, type PersonId, type StaffPersonId } from '@/domain/ids'
import { requireGender, type Gender } from '@/domain/primitives'
import { requireNonEmptyString } from '@/domain/validation'

export interface Coach {
  readonly id: CoachId
  /** Compatibility facade reference to the canonical Person carried by StaffProfile. */
  readonly personId: PersonId
  /** Compatibility facade reference to the canonical coaching StaffProfile. */
  readonly staffProfileId: StaffPersonId
  readonly firstName: string
  readonly lastName: string
  readonly gender: Gender
  readonly nationalityId: CountryId
}

export interface CreateCoachInput {
  id: CoachId
  /** Existing canonical Person root for this gameplay facade. */
  readonly personId: PersonId
  /** Existing canonical StaffProfile for this gameplay facade. */
  readonly staffProfileId: StaffPersonId
  firstName: string
  lastName: string
  gender: Gender
  nationalityId: CountryId
}

export function createCoach(input: CreateCoachInput): Coach {
  const personId = requireNonEmptyString(input.personId, 'Coach person id') as PersonId
  const staffProfileId = requireNonEmptyString(input.staffProfileId, 'Coach Staff profile id') as StaffPersonId
  if (String(personId).startsWith('person:coach:')) throw new RangeError('Coach must reference a Staff-backed Person, not a Coach Person profile')
  return {
    id: requireNonEmptyString(input.id, 'Coach id') as CoachId,
    personId,
    staffProfileId,
    firstName: requireNonEmptyString(input.firstName, 'Coach first name'),
    lastName: requireNonEmptyString(input.lastName, 'Coach last name'),
    gender: requireGender(input.gender),
    nationalityId: requireNonEmptyString(input.nationalityId, 'Coach nationality id') as CountryId,
  }
}

/** Legacy save/caller adapter only. New runtime state must use `createCoach`. */
export interface CreateLegacyCoachInput extends Omit<CreateCoachInput, 'personId' | 'staffProfileId'> {
  readonly personId?: PersonId
  readonly staffProfileId?: StaffPersonId
}

export function createLegacyCoach(input: CreateLegacyCoachInput): Coach {
  const defaults = coachProfileRefsForCoachId(input.id)
  return createCoach({ ...input, personId: input.personId ?? defaults.personId, staffProfileId: input.staffProfileId ?? defaults.staffProfileId })
}

export interface CoachProfileRefs { readonly personId: PersonId; readonly staffProfileId: StaffPersonId }

/** Stable migration identifiers for a Coach facade backed by StaffProfile. */
export function coachProfileRefsForCoachId(coachId: CoachId): CoachProfileRefs {
  const staffProfileId = staffPersonIdFromString('staff:coach:' + coachId)
  return { personId: personIdForProfile('staff', 'coach:' + coachId), staffProfileId }
}

/** Compatibility projection: Coach gameplay is a projection of an existing coaching StaffProfile. */
export interface CoachStaffRoleProjection {
  readonly personId: PersonId
  readonly staffProfileId: StaffPersonId
  readonly sourceCoachId: CoachId
  readonly roleFamily: 'coaching'
  readonly role: 'headCoach'
}

export function projectCoachToStaffRole(coach: Coach, staffProfile: { readonly id: StaffPersonId; readonly personId?: PersonId; readonly marketRole?: string }): CoachStaffRoleProjection {
  if (staffProfile.id !== coach.staffProfileId || staffProfile.personId !== coach.personId || staffProfile.marketRole !== 'headCoach') throw new RangeError('Coach facade requires its canonical headCoach StaffProfile')
  return {
    personId: coach.personId,
    staffProfileId: staffProfile.id,
    sourceCoachId: coach.id,
    roleFamily: 'coaching',
    role: 'headCoach',
  }
}
