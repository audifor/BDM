import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { CompetitionId, SeasonId, TeamId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

export interface Season {
  readonly id: SeasonId
  readonly competitionId: CompetitionId
  readonly label: string
  readonly startDate: GameDate
  readonly endDate: GameDate
  readonly participantTeamIds?: readonly TeamId[]
}

export interface CreateSeasonInput {
  id: SeasonId
  competitionId: CompetitionId
  label: string
  startDate: GameDate
  endDate: GameDate
  participantTeamIds?: readonly TeamId[]
}

export function createSeason(input: CreateSeasonInput): Season {
  const startDate = parseGameDate(input.startDate)
  const endDate = parseGameDate(input.endDate)

  if (compareGameDates(startDate, endDate) > 0) {
    throw new RangeError('Season start date must not be after end date')
  }

  return Object.freeze({
    id: requireNonEmptyString(input.id, 'Season id') as SeasonId,
    competitionId: requireNonEmptyString(input.competitionId, 'Season competition id') as CompetitionId,
    label: requireNonEmptyString(input.label, 'Season label'),
    startDate,
    endDate,
    ...(input.participantTeamIds === undefined ? {} : { participantTeamIds: Object.freeze([...new Set(input.participantTeamIds)]) }),
  })
}
