import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { organizationCapitalRaiseIdFromString, organizationIdFromString, type OrganizationCapitalRaiseId, type OrganizationId } from '@/domain/ids'

export const ORGANIZATION_CAPITAL_RAISE_EVENT_KINDS = ['OPENED', 'PAUSED', 'REOPENED', 'CLOSED', 'COMPLETED', 'CANCELLED'] as const
export type OrganizationCapitalRaiseEventKind = typeof ORGANIZATION_CAPITAL_RAISE_EVENT_KINDS[number]
export type OrganizationCapitalRaiseStatus = 'NONE' | OrganizationCapitalRaiseEventKind

export interface OrganizationCapitalRaise {
  readonly id: OrganizationCapitalRaiseId
  readonly organizationId: OrganizationId
  readonly openedOn: GameDate
  readonly targetAmount: number
  readonly currencyCode: string
  readonly maximumEquityPercentage: number
  readonly governanceDecisionId?: string
}

export interface CreateOrganizationCapitalRaiseInput {
  readonly id: OrganizationCapitalRaiseId | string
  readonly organizationId: OrganizationId | string
  readonly openedOn: GameDate | string
  readonly targetAmount: number
  readonly currencyCode: string
  readonly maximumEquityPercentage: number
  readonly governanceDecisionId?: string
}

export interface OrganizationCapitalRaiseEvent {
  readonly id: string
  readonly capitalRaiseId: OrganizationCapitalRaiseId
  readonly kind: OrganizationCapitalRaiseEventKind
  readonly effectiveOn: GameDate
  readonly governanceDecisionId?: string
}

export interface CreateOrganizationCapitalRaiseEventInput {
  readonly id: string
  readonly capitalRaiseId: OrganizationCapitalRaiseId | string
  readonly kind: OrganizationCapitalRaiseEventKind
  readonly effectiveOn: GameDate | string
  readonly governanceDecisionId?: string
}

const allowedTransitions: Readonly<Record<OrganizationCapitalRaiseStatus, readonly OrganizationCapitalRaiseEventKind[]>> = {
  NONE: ['OPENED'],
  OPENED: ['PAUSED', 'CLOSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['REOPENED', 'CLOSED', 'CANCELLED'],
  REOPENED: ['PAUSED', 'CLOSED', 'COMPLETED', 'CANCELLED'],
  CLOSED: ['REOPENED'],
  COMPLETED: [],
  CANCELLED: [],
}

export function createOrganizationCapitalRaise(input: CreateOrganizationCapitalRaiseInput): OrganizationCapitalRaise {
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) throw new RangeError('Organization capital raise target amount must be greater than 0')
  if (!Number.isFinite(input.maximumEquityPercentage) || input.maximumEquityPercentage <= 0 || input.maximumEquityPercentage >= 100) throw new RangeError('Organization capital raise maximum equity percentage must be greater than 0 and less than 100')
  const currencyCode = nonEmptyText(input.currencyCode, 'Organization capital raise currency code')
  if (input.governanceDecisionId !== undefined) nonEmptyText(input.governanceDecisionId, 'Organization capital raise Governance decision ID')
  return Object.freeze({
    id: organizationCapitalRaiseIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    openedOn: parseGameDate(input.openedOn),
    targetAmount: input.targetAmount,
    currencyCode,
    maximumEquityPercentage: input.maximumEquityPercentage,
    ...(input.governanceDecisionId === undefined ? {} : { governanceDecisionId: input.governanceDecisionId }),
  })
}

export function createOrganizationCapitalRaiseEvent(input: CreateOrganizationCapitalRaiseEventInput): OrganizationCapitalRaiseEvent {
  nonEmptyText(input.id, 'Organization capital raise event ID')
  if (!ORGANIZATION_CAPITAL_RAISE_EVENT_KINDS.includes(input.kind)) throw new TypeError('Organization capital raise event kind is invalid')
  if (input.governanceDecisionId !== undefined) nonEmptyText(input.governanceDecisionId, 'Organization capital raise event Governance decision ID')
  return Object.freeze({
    id: input.id,
    capitalRaiseId: organizationCapitalRaiseIdFromString(input.capitalRaiseId),
    kind: input.kind,
    effectiveOn: parseGameDate(input.effectiveOn),
    ...(input.governanceDecisionId === undefined ? {} : { governanceDecisionId: input.governanceDecisionId }),
  })
}

export function deriveOrganizationCapitalRaiseStatus(events: readonly OrganizationCapitalRaiseEvent[]): OrganizationCapitalRaiseStatus {
  return sortOrganizationCapitalRaiseEvents(events).at(-1)?.kind ?? 'NONE'
}

export function deriveOrganizationCapitalRaiseStatusAt(events: readonly OrganizationCapitalRaiseEvent[], onDate: GameDate): OrganizationCapitalRaiseStatus {
  return deriveOrganizationCapitalRaiseStatus(events.filter((event) => compareGameDates(event.effectiveOn, onDate) <= 0))
}

export function validateOrganizationCapitalRaiseLifecycle(events: readonly OrganizationCapitalRaiseEvent[]): void {
  let status: OrganizationCapitalRaiseStatus = 'NONE'
  let opened = 0
  for (const event of sortOrganizationCapitalRaiseEvents(events)) {
    if (!allowedTransitions[status].includes(event.kind)) throw new RangeError(`Invalid organization capital raise transition ${status} -> ${event.kind}`)
    if (event.kind === 'OPENED') opened += 1
    status = event.kind
  }
  if (opened !== 1) throw new RangeError('Organization capital raise requires exactly one OPENED event')
}

export function sortOrganizationCapitalRaiseEvents(events: readonly OrganizationCapitalRaiseEvent[]): readonly OrganizationCapitalRaiseEvent[] {
  return [...events].sort((left, right) => compareGameDates(left.effectiveOn, right.effectiveOn) || left.id.localeCompare(right.id))
}

function nonEmptyText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be non-empty`)
  return value
}
