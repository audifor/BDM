import { organizationIdForTeam, organizationIdFromString, organizationSectionIdFromString, type CoachId, type CountryId, type OrganizationId, type OrganizationSectionId, type PlayerId, type TeamId } from '@/domain/ids'
import { requireGender, type Gender } from '@/domain/primitives'
import { copyUniqueIds, requireNonEmptyString } from '@/domain/validation'

export interface Team {
  readonly id: TeamId
  readonly name: string
  readonly gender: Gender
  readonly countryId: CountryId
  /** Canonical Organization and Section references; omitted only at legacy/generated input boundaries. */
  readonly organizationId: OrganizationId
  readonly organizationSectionId: OrganizationSectionId
  readonly rosterPlayerIds: readonly PlayerId[]
  readonly coachId?: CoachId
}

export interface CreateTeamInput {
  id: TeamId
  name: string
  gender: Gender
  countryId: CountryId
  organizationId?: OrganizationId
  organizationSectionId?: OrganizationSectionId
  rosterPlayerIds: readonly PlayerId[]
  coachId?: CoachId
}

export function createTeam(input: CreateTeamInput): Team {
  return {
    id: requireNonEmptyString(input.id, 'Team id') as TeamId,
    name: requireNonEmptyString(input.name, 'Team name'),
    gender: requireGender(input.gender),
    countryId: requireNonEmptyString(input.countryId, 'Team country id') as CountryId,
    organizationId: input.organizationId === undefined ? organizationIdForTeam(input.id) : organizationIdFromString(input.organizationId),
    organizationSectionId: input.organizationSectionId === undefined ? organizationSectionIdFromString(`legacy-section:${input.id}`) : organizationSectionIdFromString(input.organizationSectionId),
    rosterPlayerIds: copyUniqueIds(input.rosterPlayerIds, 'Team roster player ids'),
    ...(input.coachId === undefined
      ? {}
      : { coachId: requireNonEmptyString(input.coachId, 'Team coach id') as CoachId }),
  }
}
