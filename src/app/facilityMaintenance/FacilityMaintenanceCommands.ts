/**
 * BS17E-A — Authorized maintenance & repair: application commands.
 *
 * Every command is a pure `GameWorld -> result` function that delegates to the canonical authority that
 * owns the fact, and adds only club scoping, preconditions and a stable reason vocabulary:
 *
 *   Facilities  physical need / action / condition (CFI4/CFI5 engines), operation event history.
 *   Governance  `FACILITIES` decisions: proposer, approvers and executor resolved from effective grants and
 *               active appointments. No actor holds implicit authority because the user controls the club.
 *   Finance     `reserveOrganizationFinancialCommitment` (authorization, liquidity, currency, period,
 *               idempotency) and the `AuthorizedOperatingCostFact` seam that the single Calendar owner
 *               (`CLUB_FINANCE_V2`) materializes into commitment, recognition, payable and Treasury settlement.
 *
 * Nothing here writes a Finance balance, a payable, a settlement or a ledger entry. The only Finance facts a
 * command creates are the capacity reservation (through the canonical gateway) and the authorized cost fact.
 *
 * Phases are distinct and each is an event: proposal -> offer selected -> approval requested -> (decision
 * events) -> funds reserved -> contract accepted -> work started -> work completed -> cost fact authorized.
 * Recognition, payable and settlement are NOT events here: Finance produces them on the next Calendar
 * processing date and the read model reads them back.
 */

import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import {
  createFacilityInspection,
  createFacilityMaintenanceAction,
  createFacilityMaintenanceNeed,
  createFacilityFinancialBinding,
  isFacilityMaintenanceNeedOpenStatus,
  type FacilityMaintenanceAction,
} from '@/domain/facilities'
import {
  FACILITY_MAINTENANCE_INTERVENTION_TYPES,
  createFacilityEconomyRecord,
  createFacilityOperationEvent,
  deriveFacilityOperationLifecycle,
  facilityEconomyRecordsOfKind,
  facilityOperationEvents,
  facilityOperationIdFor,
  isFacilityOfferValidOn,
  type FacilityEconomyRecord,
  type FacilityMaintenanceInterventionType,
  type FacilityCapitalOffer,
  type FacilityMaintenanceOffer,
  type FacilityOperationEvent,
  type FacilityOperationEventKind,
  type FacilityOperationLifecycle,
} from '@/domain/facilityEconomy'
import {
  consumeFinancialReservation,
  createAuthorizedOperatingCostFact,
  getOrganizationFinancialAuthorization,
  releaseFinancialReservation,
  reserveOrganizationFinancialCommitment,
} from '@/domain/finance'
import {
  createGovernanceDecision,
  createGovernanceDecisionEvent,
  deriveGovernanceDecisionStatus,
  resolveGovernanceDecisionEventAuthorityGrantIds,
  resolveGovernanceDecisionRights,
  validateGovernanceDecisionLifecycle,
  type GovernanceActor,
  type GovernanceDecision,
  type GovernanceDecisionEvent,
  type GovernanceDecisionEventKind,
  type GovernanceDecisionRightsResolution,
} from '@/domain/governance'
import type { TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { applyFacilityMaintenanceAction } from '@/engine/facilities'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'
import { resolveClubFacilityAuthority } from '@/app/facilities/ClubFacilitiesReadModel'

export const FACILITY_MAINTENANCE_REASONS = [
  'UNKNOWN_TEAM',
  'NEED_NOT_FOUND',
  'NEED_NOT_OPEN',
  'NOT_CLUB_FACILITY',
  'INTERVENTION_NOT_SUPPORTED',
  'OPERATION_NOT_FOUND',
  'OPERATION_ALREADY_ACTIVE',
  'OPERATION_CANCELLED',
  'OPERATION_STAGE_INVALID',
  'COST_UNKNOWN',
  'OFFER_NOT_FOUND',
  'OFFER_SCOPE_MISMATCH',
  'OFFER_NOT_YET_VALID',
  'OFFER_EXPIRED',
  'OFFER_CURRENCY_MISMATCH',
  'OFFER_LOCKED_BY_DECISION',
  'PAYMENT_TERMS_UNKNOWN',
  'FINANCE_PROFILE_UNAVAILABLE',
  'INSTITUTIONAL_AUTHORITY_UNVERIFIED',
  'INITIATOR_HAS_NO_PROPOSER_APPOINTMENT',
  'ACTOR_NOT_APPOINTED_WITH_RIGHT',
  'DECISION_NOT_FOUND',
  'DECISION_NOT_FACILITY_MAINTENANCE',
  'DECISION_ALREADY_TERMINAL',
  'DECISION_NOT_APPROVED',
  'APPROVAL_ALREADY_RECORDED',
  'EXECUTE_RIGHT_UNVERIFIED',
  'FUNDING_BLOCKED',
  'WORK_SCHEDULE_NOT_CURRENT',
  'WORK_NOT_YET_COMPLETABLE',
  'COMPLETION_INSPECTION_REQUIRED',
  'ECONOMIC_FACTS_RECORDED_CANNOT_CANCEL',
  'CANCELLATION_DECISION_REQUIRED',
  'INVALID_INPUT',
  'INVESTMENT_NOT_JUSTIFIED',
  'COMPONENT_NOT_FOUND',
  'PHYSICAL_WORK_CONFLICT',
  'PROJECT_NOT_STARTABLE',
  'PHYSICAL_PHASES_INCOMPLETE',
  'PROJECT_NOT_FOUND',
] as const
export type FacilityMaintenanceReason = (typeof FACILITY_MAINTENANCE_REASONS)[number]

export const FACILITY_MAINTENANCE_REASON_TEXT: Readonly<Record<FacilityMaintenanceReason, string>> = Object.freeze({
  UNKNOWN_TEAM: 'The club is not recognised.',
  NEED_NOT_FOUND: 'The maintenance need does not exist.',
  NEED_NOT_OPEN: 'The maintenance need is already resolved or cancelled.',
  NOT_CLUB_FACILITY: 'The club has no canonical involvement with this facility.',
  INTERVENTION_NOT_SUPPORTED: 'Only routine maintenance, preventive maintenance and repair are supported.',
  OPERATION_NOT_FOUND: 'The maintenance operation does not exist.',
  OPERATION_ALREADY_ACTIVE: 'This need already has an active maintenance operation.',
  OPERATION_CANCELLED: 'The operation was cancelled.',
  OPERATION_STAGE_INVALID: 'The operation is not in a stage that allows this action.',
  COST_UNKNOWN: 'No sourced cost exists: the cost is unknown, so nothing can be approved or reserved.',
  OFFER_NOT_FOUND: 'The offer does not exist.',
  OFFER_SCOPE_MISMATCH: 'The offer does not cover this club, facility, need and intervention.',
  OFFER_NOT_YET_VALID: 'The offer is not valid yet.',
  OFFER_EXPIRED: 'The offer has expired; a contract cannot be accepted under it.',
  OFFER_CURRENCY_MISMATCH: 'The offer currency is not the club\'s canonical Finance currency.',
  OFFER_LOCKED_BY_DECISION: 'The offer is locked by an institutional decision already requested.',
  PAYMENT_TERMS_UNKNOWN: 'The offer does not state payment terms, so Finance has no due date to honour.',
  FINANCE_PROFILE_UNAVAILABLE: 'The club has no canonical Finance profile.',
  INSTITUTIONAL_AUTHORITY_UNVERIFIED: 'The institutional authority for this decision cannot be verified.',
  INITIATOR_HAS_NO_PROPOSER_APPOINTMENT: 'The initiator holds no active appointment with the right to propose.',
  ACTOR_NOT_APPOINTED_WITH_RIGHT: 'The actor holds no active appointment with the required decision right.',
  DECISION_NOT_FOUND: 'The institutional decision does not exist.',
  DECISION_NOT_FACILITY_MAINTENANCE: 'The decision does not belong to a maintenance operation.',
  DECISION_ALREADY_TERMINAL: 'The institutional decision is already closed.',
  DECISION_NOT_APPROVED: 'The institutional decision has not been approved by every required body.',
  APPROVAL_ALREADY_RECORDED: 'This body has already approved the decision.',
  EXECUTE_RIGHT_UNVERIFIED: 'The actor holds no active appointment with the right to execute the decision.',
  FUNDING_BLOCKED: 'Finance refused the reservation; the need and the proposal are preserved.',
  WORK_SCHEDULE_NOT_CURRENT: 'Work can only start on the current date.',
  WORK_NOT_YET_COMPLETABLE: 'The offer\'s own execution window has not elapsed.',
  COMPLETION_INSPECTION_REQUIRED: 'Completion needs an inspection of the facility dated within the work window.',
  ECONOMIC_FACTS_RECORDED_CANNOT_CANCEL: 'The cost is already authorized in Finance; the operation can no longer be cancelled.',
  CANCELLATION_DECISION_REQUIRED: 'An approved cancellation decision is required after the original approval.',
  INVALID_INPUT: 'The command input is invalid.',
  INVESTMENT_NOT_JUSTIFIED: 'The physical situation does not justify this investment.',
  COMPONENT_NOT_FOUND: 'The component does not exist.',
  PHYSICAL_WORK_CONFLICT: 'Another work already occupies the same physical area.',
  PROJECT_NOT_STARTABLE: 'The development project cannot be started from its current status.',
  PHYSICAL_PHASES_INCOMPLETE: 'The project phases are not complete.',
  PROJECT_NOT_FOUND: 'The development project does not exist.',
})

export type FacilityMaintenanceCommandStatus = 'APPLIED' | 'BLOCKED' | 'FUNDING_BLOCKED' | 'NO_CHANGE'

export interface FacilityMaintenanceCommandResult {
  readonly status: FacilityMaintenanceCommandStatus
  /** Changed for APPLIED and for FUNDING_BLOCKED (the blocker is persisted history); otherwise the input world. */
  readonly world: GameWorld
  readonly operationId: string | null
  readonly reasons: readonly FacilityMaintenanceReason[]
  /** Canonical code behind the reason (for example a Finance reason code), passed through unmodified. */
  readonly canonicalReasons: readonly string[]
  readonly decisionId: string | null
}

function result(status: FacilityMaintenanceCommandStatus, world: GameWorld, operationId: string | null, reasons: readonly FacilityMaintenanceReason[] = [], canonicalReasons: readonly string[] = [], decisionId: string | null = null): FacilityMaintenanceCommandResult {
  return Object.freeze({ status, world, operationId, reasons: Object.freeze([...reasons]), canonicalReasons: Object.freeze([...canonicalReasons]), decisionId })
}
const blocked = (world: GameWorld, operationId: string | null, reason: FacilityMaintenanceReason, canonical: readonly string[] = []) => result('BLOCKED', world, operationId, [reason], canonical)

export function facilityMaintenanceCostFactId(operationId: string): string { return `operating-cost-fact:facility-maintenance:${operationId}` }
export function facilityMaintenanceActionId(operationId: string): string { return `facility-maintenance-action:${operationId}` }
export function facilityMaintenanceDecisionId(institutionId: string, operationId: string, purpose: DecisionPurpose = 'WORK'): string {
  return `decision:facility-maintenance${purpose === 'CANCELLATION' ? '-cancel' : ''}:${encodeURIComponent(institutionId)}:${encodeURIComponent(operationId)}`
}
export type DecisionPurpose = 'WORK' | 'CANCELLATION'

// ---------------------------------------------------------------------------------------------
// Shared resolution helpers
// ---------------------------------------------------------------------------------------------

export function userActor(world: GameWorld): GovernanceActor { return { kind: 'COACH', id: world.userCoachId } }

export function clubInstitution(world: GameWorld, teamId: TeamId): { readonly institutionId: string } | { readonly reason: FacilityMaintenanceReason } {
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(teamId))
  return institutions.length === 1 ? { institutionId: institutions[0]!.id } : { reason: 'INSTITUTIONAL_AUTHORITY_UNVERIFIED' }
}

function governanceGraph(world: GameWorld) {
  return { bodies: Object.values(world.governanceBodiesById), authorityGrants: Object.values(world.governanceAuthorityGrantsById), participationGrants: Object.values(world.governanceDecisionParticipationGrantsById) }
}
export type FacilityDecisionType = 'FACILITIES' | 'CAPITAL_EXPENDITURE'
export function rightsAt(world: GameWorld, institutionId: string, asOfDate: GameDate, decisionType: FacilityDecisionType = 'FACILITIES'): GovernanceDecisionRightsResolution {
  return resolveGovernanceDecisionRights({ ...governanceGraph(world), decisionType, institutionId, asOfDate })
}
export function eventGrantIds(world: GameWorld, kind: GovernanceDecisionEventKind, bodyId: string, institutionId: string, effectiveOn: GameDate, decisionType: FacilityDecisionType = 'FACILITIES'): readonly string[] {
  return resolveGovernanceDecisionEventAuthorityGrantIds({ event: { kind, bodyId, effectiveOn }, decisionType, institutionId, ...governanceGraph(world) })
}
/** Maintenance and repair are FACILITIES decisions; a capital project is a CAPITAL_EXPENDITURE decision. */
export function decisionTypeOfLifecycle(lifecycle: { readonly projectId: string | null }): FacilityDecisionType { return lifecycle.projectId === null ? 'FACILITIES' : 'CAPITAL_EXPENDITURE' }
export function activeBodiesOf(world: GameWorld, actor: GovernanceActor, institutionId: string, eligible: readonly string[]): readonly string[] {
  const on = world.currentDate
  return [...new Set(Object.values(world.governanceAppointmentsById)
    .filter((a) => a.actor.kind === actor.kind && a.actor.id === actor.id && eligible.includes(a.bodyId) && world.governanceBodiesById[a.bodyId]?.institutionId === institutionId && a.startedOn <= on && (a.endedOn === undefined || a.endedOn >= on))
    .map((a) => a.bodyId))]
}
export function decisionEventId(decisionId: string, date: GameDate, kind: GovernanceDecisionEventKind, bodyId: string): string {
  const order: Readonly<Record<GovernanceDecisionEventKind, string>> = { PROPOSED: '00', REVIEW_STARTED: '10', APPROVED: '20', REJECTED: '30', VETOED: '40', WITHDRAWN: '50', EXECUTED: '99' }
  return `event:${decisionId}:${date}:${order[kind]}:${kind}:${encodeURIComponent(bodyId)}`
}
export function decisionEvents(world: GameWorld, decisionId: string): readonly GovernanceDecisionEvent[] {
  return Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decisionId)
}
export function approvalsComplete(events: readonly GovernanceDecisionEvent[], required: readonly string[]): boolean {
  const approved = new Set(events.filter((event) => event.kind === 'APPROVED').map((event) => event.bodyId))
  return required.length > 0 && required.every((id) => approved.has(id))
}

export function appendRecords(world: GameWorld, records: readonly FacilityEconomyRecord[], patch: Parameters<typeof updateGameWorld>[1] = {}): GameWorld {
  return updateGameWorld(world, { ...patch, facilityEconomyRecords: [...Object.values(world.facilityEconomyRecordsById), ...records] })
}

export function nextEvent(world: GameWorld, operationId: string, kind: FacilityOperationEventKind, extra: Omit<Parameters<typeof createFacilityOperationEvent>[0], 'operationId' | 'sequence' | 'kind' | 'effectiveOn'>): FacilityOperationEvent {
  const events = facilityOperationEvents(world, operationId)
  return createFacilityOperationEvent({ operationId, sequence: events.length + 1, kind, effectiveOn: world.currentDate, ...extra })
}

export function lifecycleOf(world: GameWorld, operationId: string): FacilityOperationLifecycle | null {
  return deriveFacilityOperationLifecycle(facilityOperationEvents(world, operationId))
}

export function clubOperation(world: GameWorld, teamId: TeamId, operationId: string, scope: 'MAINTENANCE' | 'CAPITAL' | 'ANY' = 'MAINTENANCE'): { readonly lifecycle: FacilityOperationLifecycle; readonly organizationId: string } | { readonly reason: FacilityMaintenanceReason } {
  const team = world.teams[teamId]
  if (team === undefined) return { reason: 'UNKNOWN_TEAM' }
  const lifecycle = lifecycleOf(world, operationId)
  if (lifecycle === null) return { reason: 'OPERATION_NOT_FOUND' }
  if ((scope === 'MAINTENANCE' && lifecycle.projectId !== null) || (scope === 'CAPITAL' && lifecycle.projectId === null)) return { reason: 'OPERATION_NOT_FOUND' }
  if (lifecycle.organizationId !== team.organizationId) return { reason: 'NOT_CLUB_FACILITY' }
  if (lifecycle.cancelled) return { reason: 'OPERATION_CANCELLED' }
  return { lifecycle, organizationId: String(team.organizationId) }
}

export function canonicalCurrency(world: GameWorld, organizationId: string): string | null {
  const profile = world.organizationFinancialProfilesById[organizationId as never]
  return profile === undefined ? null : String(profile.baseCurrencyCode)
}

// ---------------------------------------------------------------------------------------------
// Cost evidence intake (offers/providers/catalog arrive as sourced records; the manager never authors a price)
// ---------------------------------------------------------------------------------------------

/**
 * Registers sourced cost evidence (catalog entry, provider or offer). It is the intake gateway for documented
 * sources, accredited offers and authorized models. It never derives a price. An identical replay is a no-op,
 * and a different payload under an existing id is refused: issued evidence is immutable.
 */
export function registerFacilityEconomyRecord(world: GameWorld, record: FacilityEconomyRecord): FacilityMaintenanceCommandResult {
  let canonical: FacilityEconomyRecord
  try { canonical = createFacilityEconomyRecord(record) } catch (error) { return blocked(world, null, 'INVALID_INPUT', [error instanceof Error ? error.message : 'INVALID_RECORD']) }
  if (canonical.recordKind === 'OPERATION_EVENT') return blocked(world, null, 'INVALID_INPUT', ['OPERATION_EVENTS_ARE_COMMAND_OWNED'])
  const existing = world.facilityEconomyRecordsById[canonical.id]
  if (existing !== undefined) return JSON.stringify(existing) === JSON.stringify(canonical) ? result('NO_CHANGE', world, null) : blocked(world, null, 'INVALID_INPUT', ['ISSUED_EVIDENCE_IS_IMMUTABLE'])
  try { return result('APPLIED', appendRecords(world, [canonical]), null) } catch (error) { return blocked(world, null, 'INVALID_INPUT', [error instanceof Error ? error.message : 'INVALID_RECORD']) }
}

/** Offers that could price a need on the current date. Expired or out-of-scope offers are excluded; history is untouched. */
export function listFacilityOffersForNeed(world: GameWorld, needId: string, interventionType: FacilityMaintenanceInterventionType | null = null): readonly FacilityMaintenanceOffer[] {
  return facilityEconomyRecordsOfKind(world, 'OFFER')
    .filter((offer) => offer.needId === needId && (interventionType === null || offer.interventionType === interventionType))
    .sort((a, b) => a.id.localeCompare(b.id))
}

// ---------------------------------------------------------------------------------------------
// 1. Proposal
// ---------------------------------------------------------------------------------------------

export interface OpenFacilityMaintenanceProposalInput {
  readonly teamId: TeamId
  readonly needId: string
  readonly interventionType: FacilityMaintenanceInterventionType
  readonly actor?: GovernanceActor
}

/** Opens a persistent operation for an open need. The cost is UNKNOWN until a sourced offer is selected. */
export function openFacilityMaintenanceProposal(world: GameWorld, input: OpenFacilityMaintenanceProposalInput): FacilityMaintenanceCommandResult {
  const team = world.teams[input.teamId]
  if (team === undefined) return blocked(world, null, 'UNKNOWN_TEAM')
  if (!(FACILITY_MAINTENANCE_INTERVENTION_TYPES as readonly string[]).includes(input.interventionType)) return blocked(world, null, 'INTERVENTION_NOT_SUPPORTED')
  const need = world.facilityMaintenanceNeedsById[input.needId as never]
  if (need === undefined) return blocked(world, null, 'NEED_NOT_FOUND')
  if (!isFacilityMaintenanceNeedOpenStatus(need.status)) return blocked(world, null, 'NEED_NOT_OPEN')
  if (!resolveClubFacilityAuthority(world, input.teamId).facilityIds.includes(need.facilityId)) return blocked(world, null, 'NOT_CLUB_FACILITY')
  const previousOperationIds = facilityEconomyRecordsOfKind(world, 'OPERATION_EVENT').filter((item) => item.kind === 'PROPOSAL_CREATED' && item.needId === String(need.id)).map((item) => item.operationId)
  const active = previousOperationIds.some((id) => { const lifecycle = lifecycleOf(world, id); return lifecycle !== null && !lifecycle.cancelled })
  if (active) return blocked(world, null, 'OPERATION_ALREADY_ACTIVE')
  const operationId = facilityOperationIdFor(input.needId, previousOperationIds.length + 1)
  const event = createFacilityOperationEvent({
    operationId, sequence: 1, kind: 'PROPOSAL_CREATED', effectiveOn: world.currentDate, actor: input.actor ?? (team.coachId === world.userCoachId ? userActor(world) : null),
    organizationId: String(team.organizationId), facilityId: String(need.facilityId), needId: String(need.id), interventionType: input.interventionType,
  })
  return result('APPLIED', appendRecords(world, [event]), operationId, ['COST_UNKNOWN'])
}

// ---------------------------------------------------------------------------------------------
// 2. Offer selection (selection is not contracting)
// ---------------------------------------------------------------------------------------------

export interface SelectFacilityMaintenanceOfferInput { readonly teamId: TeamId; readonly operationId: string; readonly offerId: string }

export function checkOfferForOperation(world: GameWorld, lifecycle: FacilityOperationLifecycle, organizationId: string, offerId: string): { readonly offer: FacilityMaintenanceOffer } | { readonly reason: FacilityMaintenanceReason } {
  const offer = world.facilityEconomyRecordsById[offerId]
  if (offer === undefined || offer.recordKind !== 'OFFER') return { reason: 'OFFER_NOT_FOUND' }
  if (offer.organizationId !== organizationId || offer.facilityId !== lifecycle.facilityId || offer.needId !== lifecycle.needId || offer.interventionType !== lifecycle.interventionType) return { reason: 'OFFER_SCOPE_MISMATCH' }
  if (compareGameDates(world.currentDate, offer.validFrom) < 0) return { reason: 'OFFER_NOT_YET_VALID' }
  if (!isFacilityOfferValidOn(offer, world.currentDate)) return { reason: 'OFFER_EXPIRED' }
  const currency = canonicalCurrency(world, organizationId)
  if (currency === null) return { reason: 'FINANCE_PROFILE_UNAVAILABLE' }
  if (offer.amount.currencyCode !== currency) return { reason: 'OFFER_CURRENCY_MISMATCH' }
  return { offer }
}

/** Same checks for a capital offer: club, facility, project, intervention, validity and canonical currency. */
export function checkCapitalOfferForOperation(world: GameWorld, lifecycle: FacilityOperationLifecycle, organizationId: string, offerId: string): { readonly offer: FacilityCapitalOffer } | { readonly reason: FacilityMaintenanceReason } {
  const offer = world.facilityEconomyRecordsById[offerId]
  if (offer === undefined || offer.recordKind !== 'CAPITAL_OFFER') return { reason: 'OFFER_NOT_FOUND' }
  if (offer.organizationId !== organizationId || offer.facilityId !== lifecycle.facilityId || offer.projectId !== lifecycle.projectId || offer.interventionType !== lifecycle.interventionType) return { reason: 'OFFER_SCOPE_MISMATCH' }
  if (compareGameDates(world.currentDate, offer.validFrom) < 0) return { reason: 'OFFER_NOT_YET_VALID' }
  if (compareGameDates(world.currentDate, offer.validUntil) > 0) return { reason: 'OFFER_EXPIRED' }
  const currency = canonicalCurrency(world, organizationId)
  if (currency === null) return { reason: 'FINANCE_PROFILE_UNAVAILABLE' }
  if (offer.amount.currencyCode !== currency) return { reason: 'OFFER_CURRENCY_MISMATCH' }
  return { offer }
}

export function selectFacilityMaintenanceOffer(world: GameWorld, input: SelectFacilityMaintenanceOfferInput): FacilityMaintenanceCommandResult {
  const resolved = clubOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle, organizationId } = resolved
  if (lifecycle.decisionId !== null) return blocked(world, input.operationId, 'OFFER_LOCKED_BY_DECISION')
  if (lifecycle.stage !== 'COST_UNKNOWN' && lifecycle.stage !== 'PENDING_APPROVAL') return blocked(world, input.operationId, 'OPERATION_STAGE_INVALID')
  const checked = checkOfferForOperation(world, lifecycle, organizationId, input.offerId)
  if ('reason' in checked) return blocked(world, input.operationId, checked.reason)
  if (lifecycle.selectedOfferId === input.offerId) return result('NO_CHANGE', world, input.operationId)
  return result('APPLIED', appendRecords(world, [nextEvent(world, input.operationId, 'OFFER_SELECTED', { offerId: input.offerId, actor: world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : null })]), input.operationId)
}

// ---------------------------------------------------------------------------------------------
// 3. Institutional decision
// ---------------------------------------------------------------------------------------------

export interface RequestFacilityMaintenanceDecisionInput {
  readonly teamId: TeamId
  readonly operationId: string
  readonly purpose?: DecisionPurpose
  readonly initiator?: GovernanceActor
  readonly proposerBodyId?: string
}

/**
 * Creates the exact per-operation `FACILITIES` decision (or, for purpose CANCELLATION, the linked cancellation
 * decision) and the PROPOSED event. The initiator must be an active appointee of a body holding PROPOSE.
 * Requesting a decision is never an approval.
 */
export function requestFacilityMaintenanceDecision(world: GameWorld, input: RequestFacilityMaintenanceDecisionInput): FacilityMaintenanceCommandResult {
  const purpose: DecisionPurpose = input.purpose ?? 'WORK'
  const resolved = clubOperation(world, input.teamId, input.operationId, 'ANY')
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle, organizationId } = resolved
  if (purpose === 'WORK') {
    if (lifecycle.selectedOfferId === null) return blocked(world, input.operationId, 'COST_UNKNOWN')
    if (lifecycle.decisionId !== null) return result('NO_CHANGE', world, input.operationId, [], [], lifecycle.decisionId)
    const offer = lifecycle.projectId === null ? checkOfferForOperation(world, lifecycle, organizationId, lifecycle.selectedOfferId) : checkCapitalOfferForOperation(world, lifecycle, organizationId, lifecycle.selectedOfferId)
    if ('reason' in offer) return blocked(world, input.operationId, offer.reason)
  } else {
    if (lifecycle.decisionId === null) return blocked(world, input.operationId, 'OPERATION_STAGE_INVALID')
    if (lifecycle.costFactId !== null) return blocked(world, input.operationId, 'ECONOMIC_FACTS_RECORDED_CANNOT_CANCEL')
    if (lifecycle.cancellationRequestedDecisionId !== null) return result('NO_CHANGE', world, input.operationId, [], [], lifecycle.cancellationRequestedDecisionId)
  }
  const institution = clubInstitution(world, input.teamId)
  if ('reason' in institution) return blocked(world, input.operationId, institution.reason)
  const decisionType = decisionTypeOfLifecycle(lifecycle)
  const rights = rightsAt(world, institution.institutionId, world.currentDate, decisionType)
  if (rights.proposerBodyIds.length === 0 || rights.approverBodyIds.length === 0) return blocked(world, input.operationId, 'INSTITUTIONAL_AUTHORITY_UNVERIFIED')
  const initiator = input.initiator ?? (world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : undefined)
  if (initiator === undefined) return blocked(world, input.operationId, 'INITIATOR_HAS_NO_PROPOSER_APPOINTMENT')
  const candidates = activeBodiesOf(world, initiator, institution.institutionId, rights.proposerBodyIds).filter((id) => input.proposerBodyId === undefined || id === input.proposerBodyId)
  if (candidates.length !== 1) return blocked(world, input.operationId, 'INITIATOR_HAS_NO_PROPOSER_APPOINTMENT')
  const proposerBodyId = candidates[0]!
  const grantIds = eventGrantIds(world, 'PROPOSED', proposerBodyId, institution.institutionId, world.currentDate, decisionType)
  if (grantIds.length === 0) return blocked(world, input.operationId, 'INSTITUTIONAL_AUTHORITY_UNVERIFIED')
  const decisionId = facilityMaintenanceDecisionId(institution.institutionId, input.operationId, purpose)
  if (world.governanceDecisionsById[decisionId] !== undefined) return result('NO_CHANGE', world, input.operationId, [], [], decisionId)
  const decision = createGovernanceDecision({ id: decisionId, institutionId: institution.institutionId, decisionType, proposedByBodyId: proposerBodyId, proposedOn: world.currentDate, subject: { kind: 'FACILITY', facilityId: lifecycle.facilityId! } })
  const proposed = createGovernanceDecisionEvent({ id: decisionEventId(decisionId, world.currentDate, 'PROPOSED', proposerBodyId), decisionId, kind: 'PROPOSED', bodyId: proposerBodyId, effectiveOn: world.currentDate, authorityGrantIds: [...grantIds] })
  const operationEvent = nextEvent(world, input.operationId, purpose === 'WORK' ? 'APPROVAL_REQUESTED' : 'CANCELLATION_REQUESTED', { decisionId, offerId: purpose === 'WORK' ? lifecycle.selectedOfferId : null, actor: initiator })
  const next = appendRecords(world, [operationEvent], {
    governanceDecisions: [...Object.values(world.governanceDecisionsById), decision],
    governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), proposed],
  })
  return result('APPLIED', next, input.operationId, [], [], decisionId)
}

export interface RecordFacilityMaintenanceDecisionEventInput {
  readonly teamId: TeamId
  readonly decisionId: string
  readonly kind: 'APPROVED' | 'REJECTED' | 'VETOED' | 'WITHDRAWN'
  readonly actor?: GovernanceActor
  readonly bodyId: string
}

function operationForDecision(world: GameWorld, decisionId: string): { readonly operationId: string; readonly purpose: DecisionPurpose } | null {
  const event = facilityEconomyRecordsOfKind(world, 'OPERATION_EVENT').find((item) => item.decisionId === decisionId && (item.kind === 'APPROVAL_REQUESTED' || item.kind === 'CANCELLATION_REQUESTED'))
  return event === undefined ? null : { operationId: event.operationId, purpose: event.kind === 'APPROVAL_REQUESTED' ? 'WORK' : 'CANCELLATION' }
}

/** Records one real appointed actor's approval, rejection, veto or withdrawal. Every event cites the grants that support it. */
export function recordFacilityMaintenanceDecisionEvent(world: GameWorld, input: RecordFacilityMaintenanceDecisionEventInput): FacilityMaintenanceCommandResult {
  const decision = world.governanceDecisionsById[input.decisionId]
  if (decision === undefined) return result('BLOCKED', world, null, ['DECISION_NOT_FOUND'], [], input.decisionId)
  const link = operationForDecision(world, input.decisionId)
  if ((decision.decisionType !== 'FACILITIES' && decision.decisionType !== 'CAPITAL_EXPENDITURE') || link === null) return result('BLOCKED', world, null, ['DECISION_NOT_FACILITY_MAINTENANCE'], [], input.decisionId)
  const operationId = link.operationId
  const resolved = clubOperation(world, input.teamId, operationId, 'ANY')
  if ('reason' in resolved) return result('BLOCKED', world, operationId, [resolved.reason], [], input.decisionId)
  const institution = world.governanceInstitutionsById[decision.institutionId]
  if (institution === undefined || !institution.teamIds.includes(input.teamId)) return result('BLOCKED', world, operationId, ['NOT_CLUB_FACILITY'], [], input.decisionId)
  const actor = input.actor ?? (world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : undefined)
  if (actor === undefined) return result('BLOCKED', world, operationId, ['ACTOR_NOT_APPOINTED_WITH_RIGHT'], [], input.decisionId)
  const events = decisionEvents(world, decision.id)
  try { validateGovernanceDecisionLifecycle(events) } catch { return result('BLOCKED', world, operationId, ['DECISION_NOT_FOUND'], ['LIFECYCLE_INVALID'], input.decisionId) }
  const atProposal = rightsAt(world, decision.institutionId, decision.proposedOn, decision.decisionType as FacilityDecisionType)
  const current = rightsAt(world, decision.institutionId, world.currentDate, decision.decisionType as FacilityDecisionType)
  const eligible = input.kind === 'APPROVED' || input.kind === 'REJECTED' ? atProposal.approverBodyIds : input.kind === 'VETOED' ? current.vetoBodyIds : atProposal.proposerBodyIds
  if (!eligible.includes(input.bodyId) || !activeBodiesOf(world, actor, decision.institutionId, [input.bodyId]).includes(input.bodyId)) return result('BLOCKED', world, operationId, ['ACTOR_NOT_APPOINTED_WITH_RIGHT'], [], input.decisionId)
  const status = deriveGovernanceDecisionStatus(events, atProposal.approverBodyIds)
  if (status === 'REJECTED' || status === 'VETOED' || status === 'WITHDRAWN' || status === 'EXECUTED') return result('BLOCKED', world, operationId, ['DECISION_ALREADY_TERMINAL'], [status], input.decisionId)
  if (status === 'APPROVED' && (input.kind === 'REJECTED' || input.kind === 'WITHDRAWN')) return result('BLOCKED', world, operationId, ['DECISION_ALREADY_TERMINAL'], ['INVALID_AFTER_APPROVAL'], input.decisionId)
  if (input.kind === 'APPROVED' && events.some((event) => event.kind === 'APPROVED' && event.bodyId === input.bodyId)) return result('NO_CHANGE', world, operationId, ['APPROVAL_ALREADY_RECORDED'], [], input.decisionId)
  if (link.purpose === 'WORK' && input.kind === 'APPROVED') {
    // Approval is of one exact cost: an expired selected offer cannot be approved against.
    const lifecycle = resolved.lifecycle
    const offer = lifecycle.selectedOfferId === null ? undefined : world.facilityEconomyRecordsById[lifecycle.selectedOfferId]
    if (offer === undefined || (offer.recordKind !== 'OFFER' && offer.recordKind !== 'CAPITAL_OFFER')) return result('BLOCKED', world, operationId, ['COST_UNKNOWN'], [], input.decisionId)
    if (compareGameDates(world.currentDate, offer.validFrom) < 0 || compareGameDates(world.currentDate, offer.validUntil) > 0) return result('BLOCKED', world, operationId, ['OFFER_EXPIRED'], [], input.decisionId)
  }
  const grantIds = eventGrantIds(world, input.kind, input.bodyId, decision.institutionId, world.currentDate, decision.decisionType as FacilityDecisionType)
  if (grantIds.length === 0) return result('BLOCKED', world, operationId, ['INSTITUTIONAL_AUTHORITY_UNVERIFIED'], [], input.decisionId)
  const event = createGovernanceDecisionEvent({ id: decisionEventId(decision.id, world.currentDate, input.kind, input.bodyId), decisionId: decision.id, kind: input.kind, bodyId: input.bodyId, effectiveOn: world.currentDate, authorityGrantIds: [...grantIds] })
  return result('APPLIED', updateGameWorld(world, { governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), event] }), operationId, [], [], decision.id)
}

/** Read-only summary of an operation's decision (also used by the read model). */
export function facilityMaintenanceDecisionState(world: GameWorld, decision: GovernanceDecision | undefined): { readonly status: ReturnType<typeof deriveGovernanceDecisionStatus>; readonly requiredBodyIds: readonly string[]; readonly approvedBodyIds: readonly string[]; readonly complete: boolean } | null {
  if (decision === undefined) return null
  const required = rightsAt(world, decision.institutionId, decision.proposedOn, decision.decisionType as FacilityDecisionType).approverBodyIds
  const events = decisionEvents(world, decision.id)
  const approved = required.filter((id) => events.some((event) => event.kind === 'APPROVED' && event.bodyId === id))
  return { status: deriveGovernanceDecisionStatus(events, required), requiredBodyIds: required, approvedBodyIds: approved, complete: approvalsComplete(events, required) }
}

// ---------------------------------------------------------------------------------------------
// 4. Finance gate: reserve -> binding contract
// ---------------------------------------------------------------------------------------------

export interface ContractFacilityMaintenanceInput { readonly teamId: TeamId; readonly operationId: string; readonly actor?: GovernanceActor }

/**
 * Funds reservation and binding contract acceptance in ONE atomic transition, ordered reserve -> accept.
 * Preconditions: the exact decision is approved by every required body, the offer is valid today, its
 * payment terms are stated, and the actor is an active appointee holding EXECUTE. Finance decides the
 * reservation (authorization, liquidity, currency, period, idempotency). When Finance refuses, only a
 * FUNDING_BLOCKED history event is persisted: no reservation, no contract, no work, and the need is untouched.
 */
export function reserveAndContractFacilityMaintenance(world: GameWorld, input: ContractFacilityMaintenanceInput): FacilityMaintenanceCommandResult {
  const resolved = clubOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle, organizationId } = resolved
  if (lifecycle.stage === 'CONTRACTED' || lifecycle.stage === 'WORK_IN_PROGRESS' || lifecycle.stage === 'WORK_COMPLETED') return result('NO_CHANGE', world, input.operationId)
  if (lifecycle.decisionId === null || lifecycle.selectedOfferId === null) return blocked(world, input.operationId, lifecycle.selectedOfferId === null ? 'COST_UNKNOWN' : 'DECISION_NOT_APPROVED')
  const decision = world.governanceDecisionsById[lifecycle.decisionId]
  const state = facilityMaintenanceDecisionState(world, decision)
  if (decision === undefined || state === null || !state.complete || state.status === 'REJECTED' || state.status === 'VETOED' || state.status === 'WITHDRAWN') return blocked(world, input.operationId, 'DECISION_NOT_APPROVED')
  const checked = checkOfferForOperation(world, lifecycle, organizationId, lifecycle.selectedOfferId)
  if ('reason' in checked) return blocked(world, input.operationId, checked.reason)
  const { offer } = checked
  if (offer.terms.paymentDueDays === null) return blocked(world, input.operationId, 'PAYMENT_TERMS_UNKNOWN')
  const actor = input.actor ?? (world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : undefined)
  const executors = actor === undefined ? [] : activeBodiesOf(world, actor, decision.institutionId, rightsAt(world, decision.institutionId, world.currentDate).executorBodyIds)
  if (actor === undefined || executors.length !== 1) return blocked(world, input.operationId, 'EXECUTE_RIGHT_UNVERIFIED')
  const executorBodyId = executors[0]!
  const executeGrantIds = eventGrantIds(world, 'EXECUTED', executorBodyId, decision.institutionId, world.currentDate)
  if (executeGrantIds.length === 0) return blocked(world, input.operationId, 'EXECUTE_RIGHT_UNVERIFIED')

  const factId = facilityMaintenanceCostFactId(input.operationId)
  // Finance reservations are organization-scoped, so on their own they do not protect a category line from a second
  // concurrent operation. Facilities therefore also refuses a reservation the FACILITY line cannot honour once every
  // other OPEN Facility reservation is counted. It only READS Finance facts; the reservation itself stays Finance's.
  const lineGuard = facilityLineGuard(world, organizationId, offer.amount.currencyCode, offer.amount.minorUnits, factId)
  if (lineGuard !== null) {
    const last = facilityOperationEvents(world, input.operationId).at(-1)
    const persisted = last?.kind === 'FUNDING_BLOCKED' && last.reasonCode === lineGuard ? world : appendRecords(world, [nextEvent(world, input.operationId, 'FUNDING_BLOCKED', { reasonCode: lineGuard, offerId: offer.id, actor })])
    return result('FUNDING_BLOCKED', persisted, input.operationId, ['FUNDING_BLOCKED'], [lineGuard])
  }
  const reserved = reserveOrganizationFinancialCommitment(world, {
    organizationId, currency: offer.amount.currencyCode, amount: offer.amount, category: 'FACILITY',
    sourceAuthority: 'FACILITY', sourceEntityId: factId, createdOn: world.currentDate,
  })
  if (reserved.outcome === 'REJECTED' || reserved.reservation === null) {
    const reasonCode = reserved.decision.reasonCodes[0] ?? reserved.decision.status
    const last = facilityOperationEvents(world, input.operationId).at(-1)
    const persisted = last?.kind === 'FUNDING_BLOCKED' && last.reasonCode === reasonCode
      ? world
      : appendRecords(world, [nextEvent(world, input.operationId, 'FUNDING_BLOCKED', { reasonCode, offerId: offer.id, actor })])
    return result('FUNDING_BLOCKED', persisted, input.operationId, ['FUNDING_BLOCKED'], [...reserved.decision.reasonCodes])
  }
  // Finance may allow a reservation on liquidity alone when the category has no authorization line ("not modelled").
  // That verdict is Finance's; it is surfaced, never hidden and never overridden here.
  const reservationNote = reserved.decision.reasonCodes.includes('BUDGET_AUTHORIZATION_NOT_MODELLED') ? 'BUDGET_AUTHORIZATION_NOT_MODELLED' : null
  const executedEvent = createGovernanceDecisionEvent({ id: decisionEventId(decision.id, world.currentDate, 'EXECUTED', executorBodyId), decisionId: decision.id, kind: 'EXECUTED', bodyId: executorBodyId, effectiveOn: world.currentDate, authorityGrantIds: [...executeGrantIds] })
  const events = [
    ...(lifecycle.stage === 'RESERVED' && lifecycle.reservationId !== null ? [] : [nextEvent(world, input.operationId, 'FUNDS_RESERVED', { reservationId: reserved.reservation.id, offerId: offer.id, actor, reasonCode: reservationNote })]),
  ]
  const afterReserve = appendRecords(world, events, { financialReservations: [...reserved.reservations] })
  const contractEvent = nextEvent(afterReserve, input.operationId, 'CONTRACT_ACCEPTED', { offerId: offer.id, reservationId: reserved.reservation.id, actor })
  const alreadyExecuted = decisionEvents(world, decision.id).some((event) => event.kind === 'EXECUTED')
  const finalWorld = appendRecords(afterReserve, [contractEvent], alreadyExecuted ? {} : { governanceDecisionEvents: [...Object.values(afterReserve.governanceDecisionEventsById), executedEvent] })
  return result('APPLIED', finalWorld, input.operationId, [], reservationNote === null ? [] : [reservationNote], decision.id)
}

export function facilityLineGuard(world: GameWorld, organizationId: string, currencyCode: string, minorUnits: number, ownEntityPrefix: string, category: 'FACILITY' | 'FACILITY_DEVELOPMENT' = 'FACILITY'): string | null {
  const authorization = getOrganizationFinancialAuthorization(world, { organizationId, currencyCode })
  const line = authorization.lines.find((item) => item.category === category)
  if (authorization.state !== 'ACTIVE' || line === undefined) return null
  // Maintenance reservations are keyed by an operating-cost fact id, capital reservations by a tranche id: each line only counts its own.
  const belongs = (entityId: string) => category === 'FACILITY' ? !entityId.startsWith('capital-tranche:') : entityId.startsWith('capital-tranche:')
  const heldByOthers = Object.values(world.financialReservationsById)
    .filter((reservation) => reservation.sourceAuthority === 'FACILITY' && reservation.status === 'OPEN' && String(reservation.organizationId) === organizationId && String(reservation.currency) === currencyCode && belongs(reservation.sourceEntityId) && reservation.sourceEntityId !== ownEntityPrefix && !reservation.sourceEntityId.startsWith(`${ownEntityPrefix}:`))
    .reduce((sum, reservation) => sum + reservation.amount.minorUnits, 0)
  // Only when Finance alone would allow the amount: an exhausted line is reported by Finance with its own canonical code.
  return minorUnits <= line.availableHeadroomMinorUnits && minorUnits > line.availableHeadroomMinorUnits - heldByOthers ? 'FACILITY_LINE_HELD_BY_OTHER_OPERATIONS' : null
}

// ---------------------------------------------------------------------------------------------
// 5. Physical execution (Facilities owns scope, progress and restoration)
// ---------------------------------------------------------------------------------------------

export interface StartFacilityMaintenanceWorkInput { readonly teamId: TeamId; readonly operationId: string; readonly startedOn?: GameDate }

export function startFacilityMaintenanceWork(world: GameWorld, input: StartFacilityMaintenanceWorkInput): FacilityMaintenanceCommandResult {
  const resolved = clubOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle } = resolved
  if (lifecycle.stage === 'WORK_IN_PROGRESS' || lifecycle.stage === 'WORK_COMPLETED') return result('NO_CHANGE', world, input.operationId)
  if (lifecycle.stage !== 'CONTRACTED') return blocked(world, input.operationId, 'OPERATION_STAGE_INVALID')
  if (input.startedOn !== undefined && input.startedOn !== world.currentDate) return blocked(world, input.operationId, 'WORK_SCHEDULE_NOT_CURRENT')
  const need = world.facilityMaintenanceNeedsById[lifecycle.needId as never]
  if (need === undefined || !isFacilityMaintenanceNeedOpenStatus(need.status)) return blocked(world, input.operationId, 'NEED_NOT_OPEN')
  // One physical work at a time on a component: a development project (or another maintenance action) already occupying it blocks the start.
  if (need.componentId !== null) {
    const occupancy = componentPhysicalAvailabilityAt(world, need.componentId, world.currentDate)
    if (occupancy.affectedProjectIds.length > 0 || occupancy.affectedMaintenanceActionIds.length > 0) return blocked(world, input.operationId, 'PHYSICAL_WORK_CONFLICT')
  }
  const actionId = facilityMaintenanceActionId(input.operationId)
  const action = createFacilityMaintenanceAction({ id: actionId, needId: need.id, facilityId: need.facilityId, componentId: need.componentId, type: lifecycle.interventionType as FacilityMaintenanceInterventionType, startedAt: world.currentDate })
  const event = nextEvent(world, input.operationId, 'WORK_STARTED', { actionId, actor: world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : null })
  const next = appendRecords(world, [event], {
    facilityMaintenanceActions: [...Object.values(world.facilityMaintenanceActionsById), action],
    facilityMaintenanceNeeds: Object.values(world.facilityMaintenanceNeedsById).map((item) => item.id === need.id ? createFacilityMaintenanceNeed({ ...item, status: 'IN_PROGRESS' }) : item),
  })
  return result('APPLIED', next, input.operationId)
}

export interface CompleteFacilityMaintenanceWorkInput {
  readonly teamId: TeamId
  readonly operationId: string
  /** A real inspection of the facility. When absent, the contract's own promised result is accepted (acceptance milestone). */
  readonly inspectionId?: string
  /** The accepting actor. Acceptance is a contractual act: it needs an active appointment holding EXECUTE. */
  readonly actor?: GovernanceActor
}

/**
 * Accepts the physical work, which is the contractual milestone that lets Finance recognize the cost. Either a real
 * inspection of the facility supplies the result (its finding gives the action outcome: NO_ISSUE -> SUCCESSFUL, a new
 * need -> PARTIAL, a serviceability restriction -> UNSUCCESSFUL), or, for a contract that states its own promised
 * result (`terms.resultingCondition`), the accepted contract result is recorded as the acceptance inspection. Nothing
 * is invented. If the offer states an execution window it must have elapsed. Acceptance authorizes the cost fact for
 * the NEXT Calendar processing date, because Finance's single processor handles the current date before commands run.
 */
export function completeFacilityMaintenanceWork(world: GameWorld, input: CompleteFacilityMaintenanceWorkInput): FacilityMaintenanceCommandResult {
  const resolved = clubOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle, organizationId } = resolved
  if (lifecycle.stage === 'WORK_COMPLETED') return result('NO_CHANGE', world, input.operationId)
  if (lifecycle.stage !== 'WORK_IN_PROGRESS' || lifecycle.actionId === null || lifecycle.selectedOfferId === null) return blocked(world, input.operationId, 'OPERATION_STAGE_INVALID')
  const action = world.facilityMaintenanceActionsById[lifecycle.actionId as never]
  const offer = world.facilityEconomyRecordsById[lifecycle.selectedOfferId]
  if (action === undefined || offer === undefined || offer.recordKind !== 'OFFER' || offer.terms.paymentDueDays === null) return blocked(world, input.operationId, 'PAYMENT_TERMS_UNKNOWN')
  const completedOn = world.currentDate
  if (offer.terms.executionDays !== null && compareGameDates(completedOn, addDays(action.startedAt, offer.terms.executionDays)) < 0) return blocked(world, input.operationId, 'WORK_NOT_YET_COMPLETABLE')
  const acceptor = input.actor ?? (world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : undefined)
  const authorityDecision = lifecycle.decisionId === null ? undefined : world.governanceDecisionsById[lifecycle.decisionId]
  const acceptingBodies = acceptor === undefined || authorityDecision === undefined ? [] : activeBodiesOf(world, acceptor, authorityDecision.institutionId, rightsAt(world, authorityDecision.institutionId, world.currentDate).executorBodyIds)
  if (acceptingBodies.length === 0) return blocked(world, input.operationId, 'EXECUTE_RIGHT_UNVERIFIED')
  let inspection = input.inspectionId === undefined ? undefined : world.facilityInspectionsById[input.inspectionId as never]
  let baseWorld = world
  if (input.inspectionId === undefined) {
    if (offer.terms.resultingCondition === null) return blocked(world, input.operationId, 'COMPLETION_INSPECTION_REQUIRED')
    inspection = createFacilityInspection({ id: `facility-inspection:acceptance:${input.operationId}`, facilityId: action.facilityId, componentId: action.componentId, inspectedAt: completedOn, finding: 'NO_ISSUE', observedCondition: offer.terms.resultingCondition, observedServiceability: 'FULL' })
    baseWorld = updateGameWorld(world, { facilityInspections: [...Object.values(world.facilityInspectionsById), inspection] })
  }
  if (inspection === undefined || inspection.facilityId !== action.facilityId || compareGameDates(inspection.inspectedAt, action.startedAt) < 0 || compareGameDates(inspection.inspectedAt, completedOn) > 0) return blocked(world, input.operationId, 'COMPLETION_INSPECTION_REQUIRED')
  const outcome = inspection.finding === 'NO_ISSUE' ? 'SUCCESSFUL' : inspection.finding === 'MAINTENANCE_NEED_IDENTIFIED' ? 'PARTIAL' : 'UNSUCCESSFUL'
  const completed: FacilityMaintenanceAction = createFacilityMaintenanceAction({
    ...action, completedAt: completedOn, outcome, resultingCondition: inspection.observedCondition, resultingServiceability: inspection.observedServiceability,
  })
  const withAction = updateGameWorld(baseWorld, { facilityMaintenanceActions: Object.values(world.facilityMaintenanceActionsById).map((item) => item.id === action.id ? completed : item) })
  const appliedAction = applyFacilityMaintenanceAction(withAction, action.id)
  // The engine closes the need only on a SUCCESSFUL outcome. If the work finished without resolving it, the need is not
  // left IN_PROGRESS forever: it returns to OPEN so a new, separately authorized operation can address it.
  const stillOpenNeed = outcome === 'SUCCESSFUL' ? undefined : appliedAction.world.facilityMaintenanceNeedsById[lifecycle.needId as never]
  const applied = stillOpenNeed !== undefined && stillOpenNeed.status === 'IN_PROGRESS'
    ? { ...appliedAction, world: updateGameWorld(appliedAction.world, { facilityMaintenanceNeeds: Object.values(appliedAction.world.facilityMaintenanceNeedsById).map((item) => item.id === stillOpenNeed.id ? createFacilityMaintenanceNeed({ ...item, status: 'OPEN' }) : item) }) }
    : appliedAction

  const provider = world.facilityEconomyRecordsById[offer.providerId]
  if (provider === undefined || provider.recordKind !== 'PROVIDER') return blocked(world, input.operationId, 'OFFER_NOT_FOUND')
  const incurredOn = addDays(completedOn, 1)
  const factId = facilityMaintenanceCostFactId(input.operationId)
  const team = world.teams[input.teamId]!
  const fact = createAuthorizedOperatingCostFact({
    id: factId, authority: 'FACILITY', sourceEntityId: String(action.id), organizationId, category: 'FACILITY', costNature: 'OPERATING',
    amount: offer.amount, incurredOn, dueOn: addDays(incurredOn, offer.terms.paymentDueDays), teamId: team.id, facilityId: String(action.facilityId),
    counterparty: { kind: 'EXTERNAL', id: provider.id, label: provider.displayName },
    provenance: { kind: 'FACILITY_MAINTENANCE_ACTION', id: String(action.id) },
  })
  const binding = createFacilityFinancialBinding({
    id: `facility-financial-binding:maintenance:${input.operationId}`, sourceKind: 'FACILITY_MAINTENANCE_ACTION', sourceId: action.id, facilityId: action.facilityId,
    factKind: 'OPERATING_COST_FACT', factId, organizationId, createdOn: completedOn, role: 'MAINTENANCE_COST_AUTHORIZED',
  })
  const actor = team.coachId === world.userCoachId ? userActor(world) : null
  const completedEvent = nextEvent(applied.world, input.operationId, 'WORK_COMPLETED', { actionId: String(action.id), actor, reasonCode: outcome })
  // The authorized fact is now visible to Finance's own commitment authority (future operating cost commitments), so the
  // capacity hold becomes CONSUMED in the SAME transition (the BS16M-B1C bridge discipline): never counted twice.
  const hold = lifecycle.reservationId === null ? undefined : applied.world.financialReservationsById[lifecycle.reservationId]
  const withCompleted = appendRecords(applied.world, [completedEvent], {
    ...(hold !== undefined && hold.status === 'OPEN' ? { financialReservations: Object.values(applied.world.financialReservationsById).map((item) => item.id === hold.id ? consumeFinancialReservation(item) : item) } : {}),
    operatingCostFacts: [...Object.values(applied.world.operatingCostFactsById), fact],
    facilityFinancialBindings: [...Object.values(applied.world.facilityFinancialBindingsById), binding],
  })
  const factEvent = nextEvent(withCompleted, input.operationId, 'COST_FACT_AUTHORIZED', { costFactId: factId, offerId: offer.id, actor })
  return result('APPLIED', appendRecords(withCompleted, [factEvent]), input.operationId)
}

// ---------------------------------------------------------------------------------------------
// 6. Cancellation
// ---------------------------------------------------------------------------------------------

/**
 * The Governance side of a cancellation, shared by maintenance and capital operations. Before any approval the proposer
 * withdraws the pending decision; once the original decision is approved, an approved linked cancellation decision is
 * required and the original decision is preserved untouched. Returns the world patch (possibly empty) or the exact reason.
 */
export function cancellationGovernancePatch(world: GameWorld, lifecycle: FacilityOperationLifecycle, actor: GovernanceActor | undefined, bodyId: string | undefined): { readonly patch: Parameters<typeof updateGameWorld>[1] } | { readonly reason: FacilityMaintenanceReason } {
  if (lifecycle.decisionId === null) return { patch: {} }
  const decision = world.governanceDecisionsById[lifecycle.decisionId]
  const state = facilityMaintenanceDecisionState(world, decision)
  if (decision === undefined || state === null) return { reason: 'DECISION_NOT_FOUND' }
  if (state.status === 'APPROVED' || state.status === 'EXECUTED') {
    const cancelDecision = lifecycle.cancellationRequestedDecisionId === null ? undefined : world.governanceDecisionsById[lifecycle.cancellationRequestedDecisionId]
    const cancelState = facilityMaintenanceDecisionState(world, cancelDecision)
    if (cancelState === null || !cancelState.complete || cancelState.status === 'REJECTED' || cancelState.status === 'VETOED' || cancelState.status === 'WITHDRAWN') return { reason: 'CANCELLATION_DECISION_REQUIRED' }
    return { patch: {} }
  }
  if (state.status === 'PROPOSED' || state.status === 'REVIEW_STARTED') {
    if (actor === undefined) return { reason: 'ACTOR_NOT_APPOINTED_WITH_RIGHT' }
    const bodies = activeBodiesOf(world, actor, decision.institutionId, [decision.proposedByBodyId]).filter((id) => bodyId === undefined || id === bodyId)
    const grantIds = bodies.length === 1 ? eventGrantIds(world, 'WITHDRAWN', bodies[0]!, decision.institutionId, world.currentDate, decision.decisionType as FacilityDecisionType) : []
    if (bodies.length !== 1 || grantIds.length === 0) return { reason: 'ACTOR_NOT_APPOINTED_WITH_RIGHT' }
    const withdrawn = createGovernanceDecisionEvent({ id: decisionEventId(decision.id, world.currentDate, 'WITHDRAWN', bodies[0]!), decisionId: decision.id, kind: 'WITHDRAWN', bodyId: bodies[0]!, effectiveOn: world.currentDate, authorityGrantIds: [...grantIds] })
    return { patch: { governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), withdrawn] } }
  }
  return { patch: {} }
}

export interface CancelFacilityMaintenanceInput { readonly teamId: TeamId; readonly operationId: string; readonly actor?: GovernanceActor; readonly bodyId?: string }

/**
 * Cancels an operation that has not reached an economic fact. Before any approval it is a direct withdrawal;
 * once the original decision is approved, an approved linked cancellation decision is required and the
 * original decision is preserved untouched. An OPEN reservation is released through Finance's own release;
 * no penalty, credit or refund is ever invented. After the cost fact exists, cancellation is refused and every
 * Finance fact stays exactly as it is.
 */
export function cancelFacilityMaintenanceOperation(world: GameWorld, input: CancelFacilityMaintenanceInput): FacilityMaintenanceCommandResult {
  const resolved = clubOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle } = resolved
  if (lifecycle.costFactId !== null || lifecycle.stage === 'WORK_COMPLETED') return blocked(world, input.operationId, 'ECONOMIC_FACTS_RECORDED_CANNOT_CANCEL')
  const actor = input.actor ?? (world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : undefined)
  let patch: Parameters<typeof updateGameWorld>[1] = {}
  let current = world
  const governance = cancellationGovernancePatch(world, lifecycle, actor, input.bodyId)
  if ('reason' in governance) return blocked(world, input.operationId, governance.reason)
  patch = { ...patch, ...governance.patch }
  if (lifecycle.reservationId !== null) {
    const reservation = world.financialReservationsById[lifecycle.reservationId]
    if (reservation !== undefined && reservation.status === 'OPEN') {
      patch = { ...patch, financialReservations: Object.values(world.financialReservationsById).map((item) => item.id === reservation.id ? releaseFinancialReservation(item) : item) }
    }
  }
  if (lifecycle.actionId !== null) {
    // Stopped work is a physical fact: the action is closed UNSUCCESSFUL with no restoration, so the component is released.
    const started = world.facilityMaintenanceActionsById[lifecycle.actionId as never]
    if (started !== undefined && started.completedAt === null) {
      patch = { ...patch, facilityMaintenanceActions: Object.values(world.facilityMaintenanceActionsById).map((item) => item.id === started.id ? createFacilityMaintenanceAction({ ...started, completedAt: world.currentDate, outcome: 'UNSUCCESSFUL' }) : item) }
    }
    const need = world.facilityMaintenanceNeedsById[lifecycle.needId as never]
    if (need !== undefined && need.status === 'IN_PROGRESS') patch = { ...patch, facilityMaintenanceNeeds: Object.values(world.facilityMaintenanceNeedsById).map((item) => item.id === need.id ? createFacilityMaintenanceNeed({ ...item, status: 'OPEN' }) : item) }
  }
  current = updateGameWorld(world, patch)
  const event = nextEvent(current, input.operationId, 'CANCELLED', { actor: actor ?? null, reasonCode: lifecycle.stage })
  return result('APPLIED', appendRecords(current, [event]), input.operationId)
}
