import { parseGameDate, type GameDate } from '@/domain/date'
import type { GovernanceInteractionParty } from './GovernanceMeeting'

export const GOVERNANCE_REQUEST_CATEGORIES = ['PERFORMANCE', 'STRATEGY', 'BUDGET', 'STAFFING', 'ROSTER', 'COMPLIANCE', 'OPERATIONS', 'INSTITUTIONAL', 'OTHER'] as const
export const GOVERNANCE_REQUEST_EVENT_KINDS = ['ISSUED', 'ACKNOWLEDGED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'FULFILLED'] as const
export type GovernanceRequestCategory = typeof GOVERNANCE_REQUEST_CATEGORIES[number]
export type GovernanceRequestEventKind = typeof GOVERNANCE_REQUEST_EVENT_KINDS[number]
export type GovernanceRequestOrigin = { readonly kind: 'MEETING'; readonly meetingId: string; readonly agendaItemId?: string } | { readonly kind: 'STANDALONE' }
export type GovernanceRequest = { readonly id: string; readonly institutionId: string; readonly issuer: GovernanceInteractionParty; readonly recipient: GovernanceInteractionParty; readonly category: GovernanceRequestCategory; readonly summary: string; readonly dueOn?: GameDate; readonly origin: GovernanceRequestOrigin }
export type GovernanceRequestFulfillmentEvidence = { readonly kind: 'GOVERNANCE_DECISION'; readonly decisionId: string }
export type GovernanceRequestEvent = { readonly id: string; readonly requestId: string; readonly kind: Exclude<GovernanceRequestEventKind, 'FULFILLED'>; readonly effectiveOn: GameDate; readonly actor: GovernanceInteractionParty } | { readonly id: string; readonly requestId: string; readonly kind: 'FULFILLED'; readonly effectiveOn: GameDate; readonly actor: GovernanceInteractionParty; readonly evidence?: GovernanceRequestFulfillmentEvidence }

const nonempty = (value: string) => value.trim() !== ''
const validParty = (party: GovernanceInteractionParty): boolean => party.kind === 'BODY' ? nonempty(party.bodyId) : party.kind === 'APPOINTMENT' ? nonempty(party.appointmentId) : party.kind === 'ACTOR' && (party.actor.kind === 'COACH' || party.actor.kind === 'STAFF') && nonempty(party.actor.id)
export const sameGovernanceInteractionParty = (a: GovernanceInteractionParty, b: GovernanceInteractionParty): boolean => a.kind === 'BODY' && b.kind === 'BODY' ? a.bodyId === b.bodyId : a.kind === 'APPOINTMENT' && b.kind === 'APPOINTMENT' ? a.appointmentId === b.appointmentId : a.kind === 'ACTOR' && b.kind === 'ACTOR' ? a.actor.kind === b.actor.kind && a.actor.id === b.actor.id : false

export function createGovernanceRequest(value: GovernanceRequest): GovernanceRequest {
  if (!nonempty(value.id) || !nonempty(value.institutionId) || !validParty(value.issuer) || !validParty(value.recipient) || sameGovernanceInteractionParty(value.issuer, value.recipient) || !GOVERNANCE_REQUEST_CATEGORIES.includes(value.category) || !nonempty(value.summary) || (value.origin.kind === 'MEETING' && (!nonempty(value.origin.meetingId) || (value.origin.agendaItemId !== undefined && !nonempty(value.origin.agendaItemId)))) || value.origin.kind !== 'MEETING' && value.origin.kind !== 'STANDALONE') throw new RangeError('Invalid governance request')
  return { ...value, ...(value.dueOn === undefined ? {} : { dueOn: parseGameDate(value.dueOn) }) }
}
export function createGovernanceRequestEvent(value: GovernanceRequestEvent): GovernanceRequestEvent {
  if (!nonempty(value.id) || !nonempty(value.requestId) || !GOVERNANCE_REQUEST_EVENT_KINDS.includes(value.kind) || !validParty(value.actor) || (value.kind === 'FULFILLED' && value.evidence !== undefined && (value.evidence.kind !== 'GOVERNANCE_DECISION' || !nonempty(value.evidence.decisionId)))) throw new RangeError('Invalid governance request event')
  return { ...value, effectiveOn: parseGameDate(value.effectiveOn) }
}
export const sortGovernanceRequestEvents = (events: readonly GovernanceRequestEvent[]) => [...events].sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn) || a.id.localeCompare(b.id))
export function validateGovernanceRequestLifecycle(events: readonly GovernanceRequestEvent[]): void {
  let status: GovernanceRequestEventKind | undefined; let issued = 0
  for (const event of sortGovernanceRequestEvents(events)) { const allowed = status === undefined ? event.kind === 'ISSUED' : status === 'ISSUED' ? ['ACKNOWLEDGED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'FULFILLED'].includes(event.kind) : status === 'ACKNOWLEDGED' ? ['ACCEPTED', 'DECLINED', 'WITHDRAWN', 'FULFILLED'].includes(event.kind) : status === 'ACCEPTED' ? ['WITHDRAWN', 'FULFILLED'].includes(event.kind) : false; if (!allowed) throw new RangeError('Invalid governance request lifecycle'); if (event.kind === 'ISSUED') issued++; status = event.kind }
  if (issued !== 1) throw new RangeError('Governance request requires exactly one ISSUED event')
}
export const deriveGovernanceRequestStatus = (events: readonly GovernanceRequestEvent[]): GovernanceRequestEventKind | undefined => sortGovernanceRequestEvents(events).at(-1)?.kind
export const isGovernanceRequestOverdue = (request: GovernanceRequest, events: readonly GovernanceRequestEvent[], currentDate: GameDate): boolean => request.dueOn !== undefined && currentDate > request.dueOn && !['DECLINED', 'WITHDRAWN', 'FULFILLED'].includes(deriveGovernanceRequestStatus(events) ?? '')
