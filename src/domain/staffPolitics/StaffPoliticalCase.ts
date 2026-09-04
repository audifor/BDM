import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { teamIdFromString, type StaffPersonId, type TeamId } from '@/domain/ids'
import { POLITICAL_AGENDAS, POLITICAL_CASE_SOURCE_KINDS, type PoliticalAgenda, type PoliticalCaseSourceKind } from './StaffPolitics'

export const STAFF_POLITICAL_CASE_STATUSES = ['OPEN', 'RESOLVED', 'EXPIRED'] as const
export type StaffPoliticalCaseStatus = typeof STAFF_POLITICAL_CASE_STATUSES[number]
export const STAFF_POLITICAL_CASE_RESOLUTION_KINDS = ['APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED', 'EXPIRED'] as const
export type StaffPoliticalCaseResolutionKind = typeof STAFF_POLITICAL_CASE_RESOLUTION_KINDS[number]

export interface StaffPoliticalCaseResolution { readonly kind: StaffPoliticalCaseResolutionKind; readonly resolvedOn: GameDate }
export interface StaffPoliticalCase {
  readonly id: string; readonly scopeKey: string; readonly teamId: TeamId; readonly sourceKind: PoliticalCaseSourceKind; readonly sourceId: string; readonly agenda: PoliticalAgenda; readonly subjectStaffId?: StaffPersonId; readonly openedOn: GameDate; readonly lastEvaluatedOn: GameDate; readonly status: StaffPoliticalCaseStatus; readonly resolution?: StaffPoliticalCaseResolution
}

export function createStaffPoliticalCase(value: StaffPoliticalCase): StaffPoliticalCase {
  if (value.id.trim().length === 0 || value.scopeKey.trim().length === 0 || value.sourceId.trim().length === 0) throw new TypeError('Staff political case identity fields must be non-empty')
  const teamId = teamIdFromString(value.teamId)
  if (!POLITICAL_CASE_SOURCE_KINDS.includes(value.sourceKind) || !POLITICAL_AGENDAS.includes(value.agenda) || !STAFF_POLITICAL_CASE_STATUSES.includes(value.status)) throw new RangeError('Invalid Staff political case')
  if (value.id !== staffPoliticalCaseIdFor(teamId, value.sourceKind, value.sourceId)) throw new RangeError('Staff political case ID must match its canonical source identity')
  const openedOn = parseGameDate(value.openedOn)
  const lastEvaluatedOn = parseGameDate(value.lastEvaluatedOn)
  if (compareGameDates(lastEvaluatedOn, openedOn) < 0) throw new RangeError('Staff political case cannot be evaluated before opening')
  const resolution = value.resolution === undefined ? undefined : { kind: value.resolution.kind, resolvedOn: parseGameDate(value.resolution.resolvedOn) }
  if (resolution !== undefined && (!STAFF_POLITICAL_CASE_RESOLUTION_KINDS.includes(resolution.kind) || compareGameDates(resolution.resolvedOn, openedOn) < 0)) throw new RangeError('Invalid Staff political case resolution')
  if (value.status === 'OPEN' && resolution !== undefined) throw new RangeError('Open Staff political case cannot have a resolution')
  if (value.status === 'RESOLVED' && (resolution === undefined || resolution.kind === 'EXPIRED')) throw new RangeError('Resolved Staff political case requires a non-expired resolution')
  if (value.status === 'EXPIRED' && (resolution === undefined || resolution.kind !== 'EXPIRED')) throw new RangeError('Expired Staff political case requires an expired resolution')
  return { ...value, teamId, openedOn, lastEvaluatedOn, ...(resolution === undefined ? {} : { resolution }) }
}

export function staffPoliticalCaseIdFor(teamId: TeamId, sourceKind: PoliticalCaseSourceKind, sourceId: string): string {
  if (sourceId.trim().length === 0) throw new TypeError('Staff political case source ID must be non-empty')
  return `staff-political-case:${teamId}:${sourceKind}:${sourceId}`
}
