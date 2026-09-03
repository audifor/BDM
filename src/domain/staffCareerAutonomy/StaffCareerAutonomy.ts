import type { GameDate } from '@/domain/date'
import { parseGameDate } from '@/domain/date'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { ResponsibilityKind } from '@/domain/responsibility'
import type { StaffRoleId } from '@/domain/staff'
import type { StaffHumanContextId } from '@/domain/staffHumanState'

export const STAFF_CAREER_OUTLOOKS = ['COMMITTED', 'STABLE', 'OPEN', 'RESTLESS', 'EXIT_MINDED'] as const
export type StaffCareerOutlook = typeof STAFF_CAREER_OUTLOOKS[number]
export const STAFF_CAREER_INTENTS = ['NONE', 'MORE_RESPONSIBILITY', 'ROLE_CHANGE', 'PROMOTION', 'CONTRACT_IMPROVEMENT', 'EXPLORE_MARKET', 'LEAVE_AT_END', 'EXIT_NOW'] as const
export type StaffCareerIntent = typeof STAFF_CAREER_INTENTS[number]
export const STAFF_CAREER_REQUEST_KINDS = ['MORE_RESPONSIBILITY', 'ROLE_CHANGE', 'PROMOTION', 'CONTRACT_DISCUSSION', 'RELEASE'] as const
export type StaffCareerRequestKind = typeof STAFF_CAREER_REQUEST_KINDS[number]
export const STAFF_CAREER_REQUEST_STATUSES = ['OPEN', 'GRANTED', 'DECLINED', 'WITHDRAWN', 'SUPERSEDED'] as const
export type StaffCareerRequestStatus = typeof STAFF_CAREER_REQUEST_STATUSES[number]

export interface StaffCareerAutonomyState {
  readonly contextId: StaffHumanContextId
  readonly staffId: StaffPersonId
  readonly teamId: TeamId
  readonly outlook: StaffCareerOutlook
  readonly primaryIntent: StaffCareerIntent
  readonly intensity: number
  readonly intentSince: GameDate
  readonly lastEvaluatedOn: GameDate
  readonly lastActionOn?: GameDate
}

export interface StaffCareerRequest {
  readonly id: string
  readonly contextId: StaffHumanContextId
  readonly staffId: StaffPersonId
  readonly teamId: TeamId
  readonly kind: StaffCareerRequestKind
  readonly createdOn: GameDate
  readonly status: StaffCareerRequestStatus
  readonly resolvedOn?: GameDate
  readonly targetRoleId?: StaffRoleId
  readonly targetResponsibilityKind?: ResponsibilityKind
}

export function createStaffCareerAutonomyState(value: StaffCareerAutonomyState): StaffCareerAutonomyState {
  if (!STAFF_CAREER_OUTLOOKS.includes(value.outlook) || !STAFF_CAREER_INTENTS.includes(value.primaryIntent)) throw new RangeError('Invalid Staff career autonomy state')
  if (!Number.isFinite(value.intensity) || value.intensity < 0 || value.intensity > 100) throw new RangeError('Staff career intensity must be between 0 and 100')
  return { ...value, intensity: Math.round(value.intensity), intentSince: parseGameDate(value.intentSince), lastEvaluatedOn: parseGameDate(value.lastEvaluatedOn), ...(value.lastActionOn === undefined ? {} : { lastActionOn: parseGameDate(value.lastActionOn) }) }
}

export function createStaffCareerRequest(value: StaffCareerRequest): StaffCareerRequest {
  if (!STAFF_CAREER_REQUEST_KINDS.includes(value.kind) || !STAFF_CAREER_REQUEST_STATUSES.includes(value.status)) throw new RangeError('Invalid Staff career request')
  if ((value.status === 'OPEN') !== (value.resolvedOn === undefined)) throw new RangeError('Open Staff career request resolution is invalid')
  if ((value.kind === 'PROMOTION' || value.kind === 'ROLE_CHANGE') && value.targetRoleId === undefined) throw new RangeError('Role request requires target role')
  if (value.kind === 'MORE_RESPONSIBILITY' && value.targetResponsibilityKind === undefined) throw new RangeError('Responsibility request requires a target')
  return { ...value, createdOn: parseGameDate(value.createdOn), ...(value.resolvedOn === undefined ? {} : { resolvedOn: parseGameDate(value.resolvedOn) }) }
}

export function staffCareerRequestIdFor(contextId: StaffHumanContextId, kind: StaffCareerRequestKind, target?: string, createdOn?: GameDate): string {
  return `staff-career-request:${contextId}:${kind}:${target ?? 'none'}:${createdOn ?? 'initial'}`
}
