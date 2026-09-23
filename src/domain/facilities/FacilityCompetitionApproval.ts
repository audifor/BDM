import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { competitionIdFromString, facilityCompetitionApprovalIdFromString, facilityIdFromString, type CompetitionId, type FacilityCompetitionApprovalId, type FacilityId } from '@/domain/ids'

/**
 * Minimal hosting-eligibility hook. This intentionally does not implement homologation rules,
 * minimum-capacity policy, or an approval workflow: it only records that a Facility was (or was
 * not) approved to host a given Competition's games as of a date, so future regulatory systems
 * have a place to attach without a redesign.
 */
export interface FacilityCompetitionApproval {
  readonly id: FacilityCompetitionApprovalId
  readonly facilityId: FacilityId
  readonly competitionId: CompetitionId
  readonly approved: boolean
  readonly validFrom: GameDate | null
  readonly validTo: GameDate | null
}

export interface CreateFacilityCompetitionApprovalInput {
  readonly id: FacilityCompetitionApprovalId | string
  readonly facilityId: FacilityId | string
  readonly competitionId: CompetitionId | string
  readonly approved: boolean
  readonly validFrom?: GameDate | string | null
  readonly validTo?: GameDate | string | null
}

export function createFacilityCompetitionApproval(input: CreateFacilityCompetitionApprovalInput): FacilityCompetitionApproval {
  const validFrom = input.validFrom === undefined || input.validFrom === null ? null : parseGameDate(input.validFrom)
  const validTo = input.validTo === undefined || input.validTo === null ? null : parseGameDate(input.validTo)
  if (validFrom !== null && validTo !== null && compareGameDates(validTo, validFrom) < 0) {
    throw new RangeError('Facility competition approval validTo cannot precede validFrom')
  }
  return Object.freeze({
    id: facilityCompetitionApprovalIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    competitionId: competitionIdFromString(input.competitionId),
    approved: input.approved,
    validFrom,
    validTo,
  })
}
