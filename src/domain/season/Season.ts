import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { CompetitionId, SeasonId, TeamId } from '@/domain/ids'
import type { ConferenceMembership } from '@/domain/conference'
import { requireNonEmptyString } from '@/domain/validation'
import type { WorldCompetitionFormatDocument } from '@/domain/competition'

export interface Season {
  readonly id: SeasonId
  readonly competitionId: CompetitionId
  readonly label: string
  readonly startDate: GameDate
  readonly endDate: GameDate
  readonly participantTeamIds?: readonly TeamId[]
  readonly conferenceMembershipSnapshot?: readonly ConferenceMembership[]
  /** Immutable B04 format for this edition; tournament progress is derived from its Games. */
  readonly worldCompetitionFormat?: WorldCompetitionFormatDocument
}

export interface CreateSeasonInput {
  id: SeasonId
  competitionId: CompetitionId
  label: string
  startDate: GameDate
  endDate: GameDate
  participantTeamIds?: readonly TeamId[]
  conferenceMembershipSnapshot?: readonly ConferenceMembership[]
  worldCompetitionFormat?: WorldCompetitionFormatDocument
}

export function createSeason(input: CreateSeasonInput): Season {
  const startDate = parseGameDate(input.startDate)
  const endDate = parseGameDate(input.endDate)
  if (input.worldCompetitionFormat !== undefined && input.worldCompetitionFormat.competitionId !== input.competitionId) {
    throw new RangeError('Season competition format must belong to the same Competition')
  }

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
    ...(input.conferenceMembershipSnapshot === undefined ? {} : { conferenceMembershipSnapshot: Object.freeze(input.conferenceMembershipSnapshot.map((membership) => ({ ...membership }))) }),
    ...(input.worldCompetitionFormat === undefined ? {} : { worldCompetitionFormat: input.worldCompetitionFormat }),
  })
}
