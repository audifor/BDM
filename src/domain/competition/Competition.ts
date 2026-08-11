import type { CompetitionId, TeamId } from '@/domain/ids'
import { requireGender, type Gender } from '@/domain/primitives'
import { copyUniqueIds, requireNonEmptyString } from '@/domain/validation'

export interface Competition {
  readonly id: CompetitionId
  readonly name: string
  readonly gender: Gender
  readonly participantTeamIds: readonly TeamId[]
}

export interface CreateCompetitionInput {
  id: CompetitionId
  name: string
  gender: Gender
  participantTeamIds: readonly TeamId[]
}

export function createCompetition(input: CreateCompetitionInput): Competition {
  return {
    id: requireNonEmptyString(input.id, 'Competition id') as CompetitionId,
    name: requireNonEmptyString(input.name, 'Competition name'),
    gender: requireGender(input.gender),
    participantTeamIds: copyUniqueIds(input.participantTeamIds, 'Competition participant team ids'),
  }
}
