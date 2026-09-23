import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { organizationIdFromString, organizationStructuralChangeIdFromString, type OrganizationId, type OrganizationStructuralChangeId } from '@/domain/ids'

export const ORGANIZATION_STRUCTURAL_CHANGE_TYPES = [
  'LEGAL_FORM_CHANGE', 'RENAME', 'RELOCATION', 'REORGANIZATION', 'MERGER', 'SPLIT',
  'SUCCESSION', 'DISSOLUTION', 'NEW_ENTITY', 'ADMINISTRATION', 'RECEIVERSHIP', 'OTHER',
] as const
export type OrganizationStructuralChangeType = typeof ORGANIZATION_STRUCTURAL_CHANGE_TYPES[number]
export type OrganizationStructuralChangeStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'CANCELLED'

export interface OrganizationStructuralChange {
  readonly id: OrganizationStructuralChangeId
  readonly organizationId: OrganizationId
  readonly changeType: OrganizationStructuralChangeType
  readonly status: OrganizationStructuralChangeStatus
  readonly effectiveDate: GameDate
  readonly requestedAt: GameDate
  readonly approvedAt: GameDate | null
  readonly executedAt: GameDate | null
  readonly sourceDecisionId: string | null
  readonly regulatoryOrderId: string | null
  readonly predecessorOrganizationIds: readonly OrganizationId[]
  readonly successorOrganizationIds: readonly OrganizationId[]
  readonly notes: string | null
}

export interface CreateOrganizationStructuralChangeInput {
  readonly id: OrganizationStructuralChangeId | string
  readonly organizationId: OrganizationId | string
  readonly changeType: OrganizationStructuralChangeType
  readonly status?: OrganizationStructuralChangeStatus
  readonly effectiveDate: GameDate | string
  readonly requestedAt: GameDate | string
  readonly approvedAt?: GameDate | string | null
  readonly executedAt?: GameDate | string | null
  readonly sourceDecisionId?: string | null
  readonly regulatoryOrderId?: string | null
  readonly predecessorOrganizationIds?: readonly (OrganizationId | string)[]
  readonly successorOrganizationIds?: readonly (OrganizationId | string)[]
  readonly notes?: string | null
}

const allowedTransitions: Readonly<Record<OrganizationStructuralChangeStatus, readonly OrganizationStructuralChangeStatus[]>> = {
  PROPOSED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['EXECUTED', 'CANCELLED'],
  REJECTED: [],
  EXECUTED: [],
  CANCELLED: [],
}

export function createOrganizationStructuralChange(input: CreateOrganizationStructuralChangeInput): OrganizationStructuralChange {
  if (!ORGANIZATION_STRUCTURAL_CHANGE_TYPES.includes(input.changeType)) throw new TypeError('Organization structural change type is invalid')
  const status = input.status ?? 'PROPOSED'
  if (!Object.prototype.hasOwnProperty.call(allowedTransitions, status)) throw new TypeError('Organization structural change status is invalid')
  const effectiveDate = parseGameDate(input.effectiveDate)
  const requestedAt = parseGameDate(input.requestedAt)
  const approvedAt = input.approvedAt === undefined || input.approvedAt === null ? null : parseGameDate(input.approvedAt)
  const executedAt = input.executedAt === undefined || input.executedAt === null ? null : parseGameDate(input.executedAt)
  if (compareGameDates(effectiveDate, requestedAt) < 0) throw new RangeError('Organization structural change effectiveDate cannot precede requestedAt')
  if (approvedAt !== null && compareGameDates(approvedAt, requestedAt) < 0) throw new RangeError('Organization structural change approvedAt cannot precede requestedAt')
  if ((status === 'APPROVED' || status === 'EXECUTED') && approvedAt === null) throw new RangeError(`Organization structural change ${status} requires approvedAt`)
  if (status === 'EXECUTED' && executedAt === null) throw new RangeError('Executed organization structural change requires executedAt')
  if (executedAt !== null && approvedAt === null) throw new RangeError('Executed organization structural change requires approvedAt')
  if (executedAt !== null && compareGameDates(executedAt, approvedAt!) < 0) throw new RangeError('Organization structural change executedAt cannot precede approvedAt')
  const predecessors = ids(input.predecessorOrganizationIds ?? [], 'predecessorOrganizationIds')
  const successors = ids(input.successorOrganizationIds ?? [], 'successorOrganizationIds')
  if (input.changeType === 'MERGER' && (predecessors.length < 2 || successors.length !== 1)) throw new RangeError('MERGER requires at least two predecessors and one successor')
  if (input.changeType === 'SPLIT' && (predecessors.length !== 1 || successors.length < 2)) throw new RangeError('SPLIT requires one predecessor and at least two successors')
  return Object.freeze({
    id: organizationStructuralChangeIdFromString(input.id), organizationId: organizationIdFromString(input.organizationId),
    changeType: input.changeType, status, effectiveDate, requestedAt, approvedAt, executedAt,
    sourceDecisionId: nullableText(input.sourceDecisionId, 'Organization structural change sourceDecisionId'),
    regulatoryOrderId: nullableText(input.regulatoryOrderId, 'Organization structural change regulatoryOrderId'),
    predecessorOrganizationIds: Object.freeze(predecessors), successorOrganizationIds: Object.freeze(successors),
    notes: nullableText(input.notes, 'Organization structural change notes'),
  })
}

export function transitionOrganizationStructuralChange(change: OrganizationStructuralChange, status: OrganizationStructuralChangeStatus, effectiveOn: GameDate | string): OrganizationStructuralChange {
  if (!allowedTransitions[change.status].includes(status)) throw new RangeError(`Invalid organization structural change transition ${change.status} -> ${status}`)
  const onDate = parseGameDate(effectiveOn)
  if (compareGameDates(onDate, change.requestedAt) < 0) throw new RangeError('Organization structural change transition precedes requestedAt')
  if (status === 'APPROVED') return createOrganizationStructuralChange({ ...change, status, approvedAt: onDate })
  if (status === 'EXECUTED') return createOrganizationStructuralChange({ ...change, status, executedAt: onDate })
  return createOrganizationStructuralChange({ ...change, status })
}

function ids(values: readonly (OrganizationId | string)[], label: string): OrganizationId[] {
  const result = values.map((value) => organizationIdFromString(value))
  if (new Set(result).size !== result.length) throw new RangeError(`${label} must not contain duplicates`)
  return result
}

function nullableText(value: string | null | undefined, label: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string or null`)
  return value
}
