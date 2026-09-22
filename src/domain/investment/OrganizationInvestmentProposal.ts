import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { organizationInvestmentProposalIdFromString, organizationCapitalRaiseIdFromString, type OrganizationInvestmentProposalId, type OrganizationCapitalRaiseId } from '@/domain/ids'
import { createOrganizationOwnershipActor, type OrganizationOwnershipActor } from '@/domain/ownership/OrganizationOwnership'

export const ORGANIZATION_INVESTMENT_PROPOSAL_EVENT_KINDS = ['PROPOSED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXECUTED'] as const
export type OrganizationInvestmentProposalEventKind = typeof ORGANIZATION_INVESTMENT_PROPOSAL_EVENT_KINDS[number]
export type OrganizationInvestmentProposalStatus = 'NONE' | OrganizationInvestmentProposalEventKind

export interface OrganizationInvestmentProposal {
  readonly id: OrganizationInvestmentProposalId
  readonly capitalRaiseId: OrganizationCapitalRaiseId
  readonly investor: OrganizationOwnershipActor
  readonly amount: number
  readonly currencyCode: string
  readonly requestedEquityPercentage: number
  readonly proposedOn: GameDate
  readonly governanceDecisionId?: string
}

export interface CreateOrganizationInvestmentProposalInput {
  readonly id: OrganizationInvestmentProposalId | string
  readonly capitalRaiseId: OrganizationCapitalRaiseId | string
  readonly investor: OrganizationOwnershipActor
  readonly amount: number
  readonly currencyCode: string
  readonly requestedEquityPercentage: number
  readonly proposedOn: GameDate | string
  readonly governanceDecisionId?: string
}

export interface OrganizationInvestmentProposalEvent {
  readonly id: string
  readonly proposalId: OrganizationInvestmentProposalId
  readonly kind: OrganizationInvestmentProposalEventKind
  readonly effectiveOn: GameDate
  readonly governanceDecisionId?: string
}

export interface CreateOrganizationInvestmentProposalEventInput {
  readonly id: string
  readonly proposalId: OrganizationInvestmentProposalId | string
  readonly kind: OrganizationInvestmentProposalEventKind
  readonly effectiveOn: GameDate | string
  readonly governanceDecisionId?: string
}

const allowedTransitions: Readonly<Record<OrganizationInvestmentProposalStatus, readonly OrganizationInvestmentProposalEventKind[]>> = {
  NONE: ['PROPOSED'],
  PROPOSED: ['UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: ['EXECUTED'],
  REJECTED: [],
  WITHDRAWN: [],
  EXECUTED: [],
}

export function createOrganizationInvestmentProposal(input: CreateOrganizationInvestmentProposalInput): OrganizationInvestmentProposal {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new RangeError('Organization investment proposal amount must be greater than 0')
  if (!Number.isFinite(input.requestedEquityPercentage) || input.requestedEquityPercentage <= 0 || input.requestedEquityPercentage >= 100) throw new RangeError('Organization investment proposal equity percentage must be greater than 0 and less than 100')
  if (input.governanceDecisionId !== undefined) nonEmptyText(input.governanceDecisionId, 'Organization investment proposal Governance decision ID')
  return Object.freeze({
    id: organizationInvestmentProposalIdFromString(input.id),
    capitalRaiseId: organizationCapitalRaiseIdFromString(input.capitalRaiseId),
    investor: createOrganizationOwnershipActor(input.investor),
    amount: input.amount,
    currencyCode: nonEmptyText(input.currencyCode, 'Organization investment proposal currency code'),
    requestedEquityPercentage: input.requestedEquityPercentage,
    proposedOn: parseGameDate(input.proposedOn),
    ...(input.governanceDecisionId === undefined ? {} : { governanceDecisionId: input.governanceDecisionId }),
  })
}

export function createOrganizationInvestmentProposalEvent(input: CreateOrganizationInvestmentProposalEventInput): OrganizationInvestmentProposalEvent {
  nonEmptyText(input.id, 'Organization investment proposal event ID')
  if (!ORGANIZATION_INVESTMENT_PROPOSAL_EVENT_KINDS.includes(input.kind)) throw new TypeError('Organization investment proposal event kind is invalid')
  if (input.governanceDecisionId !== undefined) nonEmptyText(input.governanceDecisionId, 'Organization investment proposal event Governance decision ID')
  return Object.freeze({
    id: input.id,
    proposalId: organizationInvestmentProposalIdFromString(input.proposalId),
    kind: input.kind,
    effectiveOn: parseGameDate(input.effectiveOn),
    ...(input.governanceDecisionId === undefined ? {} : { governanceDecisionId: input.governanceDecisionId }),
  })
}

export function deriveOrganizationInvestmentProposalStatus(events: readonly OrganizationInvestmentProposalEvent[]): OrganizationInvestmentProposalStatus {
  return sortOrganizationInvestmentProposalEvents(events).at(-1)?.kind ?? 'NONE'
}

export function validateOrganizationInvestmentProposalLifecycle(events: readonly OrganizationInvestmentProposalEvent[]): void {
  let status: OrganizationInvestmentProposalStatus = 'NONE'
  let proposed = 0
  for (const event of sortOrganizationInvestmentProposalEvents(events)) {
    if (!allowedTransitions[status].includes(event.kind)) throw new RangeError(`Invalid organization investment proposal transition ${status} -> ${event.kind}`)
    if (event.kind === 'PROPOSED') proposed += 1
    status = event.kind
  }
  if (proposed !== 1) throw new RangeError('Organization investment proposal requires exactly one PROPOSED event')
}

export function sortOrganizationInvestmentProposalEvents(events: readonly OrganizationInvestmentProposalEvent[]): readonly OrganizationInvestmentProposalEvent[] {
  return [...events].sort((left, right) => compareGameDates(left.effectiveOn, right.effectiveOn) || left.id.localeCompare(right.id))
}

function nonEmptyText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be non-empty`)
  return value
}
