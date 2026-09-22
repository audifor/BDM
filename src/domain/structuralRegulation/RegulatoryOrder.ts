import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { organizationIdFromString, regulatoryOrderIdFromString, type OrganizationId, type RegulatoryOrderId } from '@/domain/ids'

export const REGULATORY_ORDER_TYPES = ['DIVESTMENT_REQUIRED', 'OWNERSHIP_RESTRUCTURE_REQUIRED', 'CONTROL_RESTRUCTURE_REQUIRED', 'LICENSE_CONDITION', 'LICENSE_SUSPENSION', 'LICENSE_REVOCATION', 'COMPETITION_EXCLUSION', 'COMPETITION_RESTRICTION', 'STRUCTURAL_REORGANIZATION_REQUIRED', 'ADMINISTRATION_ORDER', 'DISSOLUTION_ORDER', 'OTHER'] as const
export type RegulatoryOrderType = typeof REGULATORY_ORDER_TYPES[number]
export type RegulatoryOrderStatus = 'PROPOSED' | 'ACTIVE' | 'SATISFIED' | 'EXPIRED' | 'REVOKED' | 'FAILED'

export interface RegulatoryOrder {
  readonly id: RegulatoryOrderId
  readonly issuerOrganizationId: OrganizationId
  readonly targetOrganizationId: OrganizationId
  readonly orderType: RegulatoryOrderType
  readonly status: RegulatoryOrderStatus
  readonly issuedAt: GameDate
  readonly effectiveDate: GameDate
  readonly deadline: GameDate | null
  readonly resolvedAt: GameDate | null
  readonly sourceAssessmentId: string | null
  readonly sourceDecisionId: string | null
  readonly reasonCode: string | null
  readonly notes: string | null
}

export interface CreateRegulatoryOrderInput extends Omit<RegulatoryOrder, 'id' | 'status' | 'issuedAt' | 'effectiveDate' | 'deadline' | 'resolvedAt' | 'sourceAssessmentId' | 'sourceDecisionId' | 'reasonCode' | 'notes'> {
  readonly id: RegulatoryOrderId | string
  readonly issuedAt: GameDate | string
  readonly effectiveDate: GameDate | string
  readonly status?: RegulatoryOrderStatus
  readonly deadline?: GameDate | string | null
  readonly resolvedAt?: GameDate | string | null
  readonly sourceAssessmentId?: string | null
  readonly sourceDecisionId?: string | null
  readonly reasonCode?: string | null
  readonly notes?: string | null
}

const transitions: Readonly<Record<RegulatoryOrderStatus, readonly RegulatoryOrderStatus[]>> = {
  PROPOSED: ['ACTIVE', 'REVOKED', 'FAILED'], ACTIVE: ['SATISFIED', 'EXPIRED', 'REVOKED', 'FAILED'], SATISFIED: [], EXPIRED: [], REVOKED: [], FAILED: [],
}

export function createRegulatoryOrder(input: CreateRegulatoryOrderInput): RegulatoryOrder {
  if (!REGULATORY_ORDER_TYPES.includes(input.orderType)) throw new TypeError('Regulatory order type is invalid')
  const issuedAt = parseGameDate(input.issuedAt); const effectiveDate = parseGameDate(input.effectiveDate)
  const deadline = input.deadline === undefined || input.deadline === null ? null : parseGameDate(input.deadline)
  if (compareGameDates(effectiveDate, issuedAt) < 0) throw new RangeError('Regulatory order effectiveDate cannot precede issuedAt')
  if (deadline !== null && compareGameDates(deadline, effectiveDate) < 0) throw new RangeError('Regulatory order deadline cannot precede effectiveDate')
  const status = input.status ?? 'PROPOSED'
  if (!Object.prototype.hasOwnProperty.call(transitions, status)) throw new TypeError('Regulatory order status is invalid')
  const resolvedAt = input.resolvedAt === undefined || input.resolvedAt === null ? null : parseGameDate(input.resolvedAt)
  if (['SATISFIED', 'EXPIRED', 'REVOKED', 'FAILED'].includes(status) && resolvedAt === null) throw new RangeError(`Regulatory order ${status} requires resolvedAt`)
  if (resolvedAt !== null && compareGameDates(resolvedAt, issuedAt) < 0) throw new RangeError('Regulatory order resolvedAt cannot precede issuedAt')
  return Object.freeze({ id: regulatoryOrderIdFromString(input.id), issuerOrganizationId: organizationIdFromString(input.issuerOrganizationId), targetOrganizationId: organizationIdFromString(input.targetOrganizationId), orderType: input.orderType, status, issuedAt, effectiveDate, deadline, resolvedAt, sourceAssessmentId: nullableText(input.sourceAssessmentId), sourceDecisionId: nullableText(input.sourceDecisionId), reasonCode: nullableText(input.reasonCode), notes: nullableText(input.notes) })
}

export function transitionRegulatoryOrder(order: RegulatoryOrder, status: RegulatoryOrderStatus, resolvedAt?: GameDate | string): RegulatoryOrder {
  if (!transitions[order.status].includes(status)) throw new RangeError(`Invalid regulatory order transition ${order.status} -> ${status}`)
  const resolutionDate = status === 'SATISFIED' || status === 'EXPIRED' || status === 'REVOKED' || status === 'FAILED' ? parseGameDate(resolvedAt ?? order.effectiveDate) : null
  if (status === 'ACTIVE' && resolutionDate === null && compareGameDates(parseGameDate(resolvedAt ?? order.effectiveDate), order.effectiveDate) < 0) throw new RangeError('Regulatory order cannot activate before its effectiveDate')
  if (status === 'EXPIRED' && order.deadline !== null && compareGameDates(resolutionDate!, order.deadline) < 0) throw new RangeError('Regulatory order cannot expire before its deadline')
  return createRegulatoryOrder({ ...order, status, resolvedAt: resolutionDate })
}

export function isRegulatoryOrderActiveOn(order: RegulatoryOrder, onDate: GameDate | string): boolean {
  const date = parseGameDate(onDate)
  return order.status === 'ACTIVE' && compareGameDates(order.effectiveDate, date) <= 0 && (order.deadline === null || compareGameDates(date, order.deadline) <= 0)
}

function nullableText(value: string | null | undefined): string | null { return value === undefined || value === null ? null : value }
