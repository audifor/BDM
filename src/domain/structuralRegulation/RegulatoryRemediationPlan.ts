import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { organizationStructuralChangeIdFromString, regulatoryOrderIdFromString, regulatoryRemediationPlanIdFromString, type OrganizationStructuralChangeId, type RegulatoryOrderId, type RegulatoryRemediationPlanId } from '@/domain/ids'

export const REGULATORY_REMEDIATION_ACTION_TYPES = ['DIVEST_OWNERSHIP', 'TERMINATE_CONTROL', 'RESTRUCTURE_OWNERSHIP', 'RESTRUCTURE_ORGANIZATION', 'WITHDRAW_FROM_COMPETITION', 'TRANSFER_PARTICIPATION_RIGHTS', 'DISSOLVE_ORGANIZATION'] as const
export type RegulatoryRemediationActionType = typeof REGULATORY_REMEDIATION_ACTION_TYPES[number]
export type RegulatoryRemediationPlanStatus = 'PROPOSED' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export interface RegulatoryRemediationAction {
  readonly id: string
  readonly type: RegulatoryRemediationActionType
  readonly organizationStructuralChangeId: OrganizationStructuralChangeId | null
  readonly ownershipTransactionId: string | null
  readonly competitionId: string | null
  readonly seasonId: string | null
  readonly notes: string | null
}

export interface RegulatoryRemediationPlan {
  readonly id: RegulatoryRemediationPlanId
  readonly regulatoryOrderId: RegulatoryOrderId
  readonly actions: readonly RegulatoryRemediationAction[]
  readonly deadline: GameDate | null
  readonly status: RegulatoryRemediationPlanStatus
  readonly proposedAt: GameDate
  readonly completedAt: GameDate | null
  readonly evidenceIds: readonly string[]
}

export interface CreateRegulatoryRemediationPlanInput {
  readonly id: RegulatoryRemediationPlanId | string
  readonly regulatoryOrderId: RegulatoryOrderId | string
  readonly actions: readonly RegulatoryRemediationAction[]
  readonly deadline?: GameDate | string | null
  readonly status?: RegulatoryRemediationPlanStatus
  readonly proposedAt: GameDate | string
  readonly completedAt?: GameDate | string | null
  readonly evidenceIds?: readonly string[]
}

export function createRegulatoryRemediationPlan(input: CreateRegulatoryRemediationPlanInput): RegulatoryRemediationPlan {
  const proposedAt = parseGameDate(input.proposedAt); const deadline = input.deadline === undefined || input.deadline === null ? null : parseGameDate(input.deadline)
  if (deadline !== null && compareGameDates(deadline, proposedAt) < 0) throw new RangeError('Remediation deadline cannot precede proposedAt')
  const actions = input.actions.map(createAction)
  if (new Set(actions.map((action) => action.id)).size !== actions.length) throw new RangeError('Remediation action IDs must be unique')
  const status = input.status ?? 'PROPOSED'
  if (!['PROPOSED', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) throw new TypeError('Remediation plan status is invalid')
  return Object.freeze({ id: regulatoryRemediationPlanIdFromString(input.id), regulatoryOrderId: regulatoryOrderIdFromString(input.regulatoryOrderId), actions: Object.freeze(actions), deadline, status, proposedAt, completedAt: input.completedAt === undefined || input.completedAt === null ? null : parseGameDate(input.completedAt), evidenceIds: Object.freeze([...(input.evidenceIds ?? [])]) })
}

export function transitionRegulatoryRemediationPlan(plan: RegulatoryRemediationPlan, status: RegulatoryRemediationPlanStatus, completedAt?: GameDate | string): RegulatoryRemediationPlan {
  const allowed: Readonly<Record<RegulatoryRemediationPlanStatus, readonly RegulatoryRemediationPlanStatus[]>> = { PROPOSED: ['ACTIVE', 'FAILED', 'CANCELLED'], ACTIVE: ['COMPLETED', 'FAILED', 'CANCELLED'], COMPLETED: [], FAILED: [], CANCELLED: [] }
  if (!allowed[plan.status].includes(status)) throw new RangeError(`Invalid remediation plan transition ${plan.status} -> ${status}`)
  return createRegulatoryRemediationPlan({ ...plan, status, completedAt: status === 'COMPLETED' ? (completedAt ?? plan.proposedAt) : plan.completedAt })
}

function createAction(value: RegulatoryRemediationAction): RegulatoryRemediationAction {
  if (!value.id.trim() || !REGULATORY_REMEDIATION_ACTION_TYPES.includes(value.type)) throw new TypeError('Remediation action is invalid')
  return Object.freeze({ id: value.id, type: value.type, organizationStructuralChangeId: value.organizationStructuralChangeId === null ? null : organizationStructuralChangeIdFromString(value.organizationStructuralChangeId), ownershipTransactionId: nullableText(value.ownershipTransactionId), competitionId: nullableText(value.competitionId), seasonId: nullableText(value.seasonId), notes: nullableText(value.notes) })
}
function nullableText(value: string | null | undefined): string | null { return value === undefined || value === null ? null : value }
