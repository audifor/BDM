import type { CoachId, CountryId, PlayerId, TeamId } from '@/domain/ids'
import { requireGender, type Gender } from '@/domain/primitives'
import { copyUniqueIds, requireNonEmptyString } from '@/domain/validation'

export interface Team {
  readonly id: TeamId
  readonly name: string
  readonly gender: Gender
  readonly countryId: CountryId
  readonly rosterPlayerIds: readonly PlayerId[]
  readonly coachId?: CoachId
}

export interface CreateTeamInput {
  id: TeamId
  name: string
  gender: Gender
  countryId: CountryId
  rosterPlayerIds: readonly PlayerId[]
  coachId?: CoachId
}

export function createTeam(input: CreateTeamInput): Team {
  return {
    id: requireNonEmptyString(input.id, 'Team id') as TeamId,
    name: requireNonEmptyString(input.name, 'Team name'),
    gender: requireGender(input.gender),
    countryId: requireNonEmptyString(input.countryId, 'Team country id') as CountryId,
    rosterPlayerIds: copyUniqueIds(input.rosterPlayerIds, 'Team roster player ids'),
    ...(input.coachId === undefined
      ? {}
      : { coachId: requireNonEmptyString(input.coachId, 'Team coach id') as CoachId }),
  }
}
