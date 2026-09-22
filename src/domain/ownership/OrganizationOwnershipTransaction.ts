import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  deriveGovernanceDecisionStatus,
  resolveGovernanceDecisionRights,
  type GovernanceDecisionEvent,
} from '@/domain/governance'
import {
  organizationIdFromString,
  organizationOwnershipTransactionIdFromString,
  type OrganizationId,
  type OrganizationOwnershipTransactionId,
} from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'
import { createOrganizationOwnershipActor, type OrganizationOwnershipActor } from './OrganizationOwnership'

export const ORGANIZATION_OWNERSHIP_TRANSACTION_EVENT_KINDS = [
  'PROPOSED',
  'APPROVAL_REQUESTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXECUTED',
] as const
export type OrganizationOwnershipTransactionEventKind = typeof ORGANIZATION_OWNERSHIP_TRANSACTION_EVENT_KINDS[number]
export type OrganizationOwnershipTransactionStatus = 'NONE' | OrganizationOwnershipTransactionEventKind

export interface OrganizationOwnershipTransactionConsideration {
  readonly amount: number
  readonly currencyCode: string
}

export interface OrganizationOwnershipTransaction {
  readonly id: OrganizationOwnershipTransactionId
  readonly organizationId: OrganizationId
  readonly seller: OrganizationOwnershipActor
  readonly buyer: OrganizationOwnershipActor
  readonly transferredPercentage: number
  readonly agreedOn: GameDate
  readonly consideration: OrganizationOwnershipTransactionConsideration | null
  readonly governanceDecisionId?: string
}

export interface CreateOrganizationOwnershipTransactionInput {
  readonly id: OrganizationOwnershipTransactionId | string
  readonly organizationId: OrganizationId | string
  readonly seller: OrganizationOwnershipActor
  readonly buyer: OrganizationOwnershipActor
  readonly transferredPercentage: number
  readonly agreedOn: GameDate | string
  readonly consideration?: OrganizationOwnershipTransactionConsideration | null
  readonly governanceDecisionId?: string
}

export interface OrganizationOwnershipTransactionEvent {
  readonly id: string
  readonly transactionId: OrganizationOwnershipTransactionId
  readonly kind: OrganizationOwnershipTransactionEventKind
  readonly effectiveOn: GameDate
  readonly governanceDecisionId?: string
}

export interface CreateOrganizationOwnershipTransactionEventInput {
  readonly id: string
  readonly transactionId: OrganizationOwnershipTransactionId | string
  readonly kind: OrganizationOwnershipTransactionEventKind
  readonly effectiveOn: GameDate | string
  readonly governanceDecisionId?: string
}

const allowedTransitions: Readonly<Record<OrganizationOwnershipTransactionStatus, readonly OrganizationOwnershipTransactionEventKind[]>> = {
  NONE: ['PROPOSED'],
  PROPOSED: ['APPROVAL_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVAL_REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['EXECUTED', 'CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
  EXECUTED: [],
}

export function createOrganizationOwnershipTransaction(input: CreateOrganizationOwnershipTransactionInput): OrganizationOwnershipTransaction {
  const transferredPercentage = input.transferredPercentage
  if (!Number.isFinite(transferredPercentage) || transferredPercentage <= 0 || transferredPercentage > 100) throw new RangeError('Organization ownership transaction percentage must be greater than 0 and at most 100')
  const consideration = input.consideration === undefined || input.consideration === null
    ? null
    : createConsideration(input.consideration)
  if (input.governanceDecisionId !== undefined && input.governanceDecisionId.trim().length === 0) throw new TypeError('Organization ownership transaction governance decision ID must be non-empty')
  const seller = createOrganizationOwnershipActor(input.seller)
  const buyer = createOrganizationOwnershipActor(input.buyer)
  if (sameOrganizationOwnershipActor(seller, buyer)) throw new RangeError('Organization ownership transaction seller and buyer must differ')
  return Object.freeze({
    id: organizationOwnershipTransactionIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    seller,
    buyer,
    transferredPercentage,
    agreedOn: parseGameDate(input.agreedOn),
    consideration,
    ...(input.governanceDecisionId === undefined ? {} : { governanceDecisionId: input.governanceDecisionId }),
  })
}

export function createOrganizationOwnershipTransactionEvent(input: CreateOrganizationOwnershipTransactionEventInput): OrganizationOwnershipTransactionEvent {
  if (input.id.trim().length === 0) throw new TypeError('Organization ownership transaction event ID must be non-empty')
  if (!ORGANIZATION_OWNERSHIP_TRANSACTION_EVENT_KINDS.includes(input.kind)) throw new TypeError('Organization ownership transaction event kind is invalid')
  if (input.governanceDecisionId !== undefined && input.governanceDecisionId.trim().length === 0) throw new TypeError('Organization ownership transaction event governance decision ID must be non-empty')
  return Object.freeze({
    id: input.id,
    transactionId: organizationOwnershipTransactionIdFromString(input.transactionId),
    kind: input.kind,
    effectiveOn: parseGameDate(input.effectiveOn),
    ...(input.governanceDecisionId === undefined ? {} : { governanceDecisionId: input.governanceDecisionId }),
  })
}

export function deriveOrganizationOwnershipTransactionStatus(events: readonly OrganizationOwnershipTransactionEvent[]): OrganizationOwnershipTransactionStatus {
  return sortOrganizationOwnershipTransactionEvents(events).at(-1)?.kind ?? 'NONE'
}

export function validateOrganizationOwnershipTransactionLifecycle(events: readonly OrganizationOwnershipTransactionEvent[]): void {
  let status: OrganizationOwnershipTransactionStatus = 'NONE'
  let proposed = 0
  for (const event of sortOrganizationOwnershipTransactionEvents(events)) {
    if (!allowedTransitions[status].includes(event.kind)) throw new RangeError(`Invalid organization ownership transaction transition ${status} -> ${event.kind}`)
    if (event.kind === 'PROPOSED') proposed += 1
    status = event.kind
  }
  if (proposed !== 1) throw new RangeError('Organization ownership transaction requires exactly one PROPOSED event')
}

export function sortOrganizationOwnershipTransactionEvents(events: readonly OrganizationOwnershipTransactionEvent[]): readonly OrganizationOwnershipTransactionEvent[] {
  return [...events].sort((left, right) => compareGameDates(left.effectiveOn, right.effectiveOn) || left.id.localeCompare(right.id))
}

export function sameOrganizationOwnershipActor(left: OrganizationOwnershipActor, right: OrganizationOwnershipActor): boolean {
  if (left.kind === 'PERSON') return right.kind === 'PERSON' && left.personId === right.personId
  return right.kind === 'ORGANIZATION' && left.organizationId === right.organizationId
}

export function isOrganizationOwnershipGovernanceApproved(world: GameWorld, transaction: OrganizationOwnershipTransaction, onDate: GameDate): boolean {
  if (transaction.governanceDecisionId === undefined) return true
  const decision = world.governanceDecisionsById[transaction.governanceDecisionId]
  if (decision === undefined || decision.decisionType !== 'OWNERSHIP_CHANGE') return false
  const events = Object.values(world.governanceDecisionEventsById)
    .filter((event) => event.decisionId === decision.id && compareGameDates(event.effectiveOn, onDate) <= 0)
  const rights = resolveGovernanceDecisionRights({
    decisionType: decision.decisionType,
    institutionId: decision.institutionId,
    asOfDate: onDate,
    bodies: Object.values(world.governanceBodiesById),
    authorityGrants: Object.values(world.governanceAuthorityGrantsById),
    participationGrants: Object.values(world.governanceDecisionParticipationGrantsById),
  })
  const status = deriveGovernanceDecisionStatus(events as readonly GovernanceDecisionEvent[], rights.approverBodyIds)
  return status === 'APPROVED' || status === 'EXECUTED'
}

function createConsideration(value: OrganizationOwnershipTransactionConsideration): OrganizationOwnershipTransactionConsideration {
  if (!Number.isFinite(value.amount) || value.amount < 0) throw new RangeError('Organization ownership transaction consideration amount must be non-negative')
  if (typeof value.currencyCode !== 'string' || value.currencyCode.trim().length === 0) throw new TypeError('Organization ownership transaction consideration currency code must be non-empty')
  return Object.freeze({ amount: value.amount, currencyCode: value.currencyCode })
}
