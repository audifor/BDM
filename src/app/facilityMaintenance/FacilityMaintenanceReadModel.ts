/**
 * BS17E-A — manager read model for maintenance/repair operations.
 *
 * Pure projection. Facilities, Governance and Finance facts are read from their canonical collections and
 * never copied or cached; money is only ever read from Finance (reservation, expense recognition, payable,
 * Treasury settlement). Every action's availability is decided by DRY-RUNNING the real command against the
 * current world, so the UI can never advertise an action the command layer would refuse.
 */

import type { GameDate } from '@/domain/date'
import { isFacilityMaintenanceNeedOpenStatus } from '@/domain/facilities'
import {
  deriveFacilityOperationLifecycle,
  facilityEconomyRecordsOfKind,
  facilityOperationCostStatus,
  facilityOperationEvents,
  facilityOperationIds,
  isFacilityOfferValidOn,
  type FacilityMaintenanceInterventionType,
  type FacilityMaintenanceOffer,
  type FacilityOperationStage,
} from '@/domain/facilityEconomy'
import { getPayableSettledAmount } from '@/domain/finance'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { resolveClubFacilityAuthority } from '@/app/facilities/ClubFacilitiesReadModel'
import {
  FACILITY_MAINTENANCE_REASON_TEXT,
  cancelFacilityMaintenanceOperation,
  completeFacilityMaintenanceWork,
  facilityMaintenanceDecisionState,
  openFacilityMaintenanceProposal,
  recordFacilityMaintenanceDecisionEvent,
  requestFacilityMaintenanceDecision,
  reserveAndContractFacilityMaintenance,
  selectFacilityMaintenanceOffer,
  startFacilityMaintenanceWork,
  type FacilityMaintenanceReason,
} from './FacilityMaintenanceCommands'

export type FacilityMaintenanceActionId =
  | 'OPEN_PROPOSAL'
  | 'SELECT_OFFER'
  | 'REQUEST_APPROVAL'
  | 'APPROVE'
  | 'RESERVE_AND_CONTRACT'
  | 'START_WORK'
  | 'COMPLETE_WORK'
  | 'REQUEST_CANCELLATION'
  | 'CANCEL'

export interface FacilityMaintenanceActionAvailability {
  readonly id: FacilityMaintenanceActionId
  readonly enabled: boolean
  readonly reason: FacilityMaintenanceReason | null
  readonly reasonText: string | null
  /** Command parameters the dry run resolved (offer, body, inspection), so the UI invokes exactly what was checked. */
  readonly offerId?: string
  readonly bodyId?: string
  readonly decisionId?: string
  readonly inspectionId?: string
}

export type FacilityMaintenanceGovernanceState = 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'VETOED' | 'WITHDRAWN' | 'EXECUTED' | 'INSTITUTIONAL_AUTHORITY_UNVERIFIED'
export type FacilityMaintenanceFundingState = 'NOT_RESERVED' | 'FUNDING_BLOCKED' | 'RESERVED' | 'CONSUMED' | 'RELEASED'
export type FacilityMaintenanceExecutionState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type FacilityMaintenanceEconomicState = 'NONE' | 'COST_AUTHORIZED' | 'ECONOMICALLY_RECOGNIZED' | 'PAYABLE' | 'PARTIALLY_SETTLED' | 'SETTLED'

export interface FacilityMaintenanceOperationView {
  readonly operationId: string
  readonly needId: string
  readonly facilityId: string
  readonly interventionType: FacilityMaintenanceInterventionType
  readonly stage: FacilityOperationStage
  readonly cost: {
    readonly status: 'KNOWN' | 'UNKNOWN_COST'
    readonly offerId: string | null
    readonly sourceKind: FacilityMaintenanceOffer['sourceKind'] | null
    readonly providerName: string | null
    readonly providerIdentity: 'DOCUMENTED_ENTITY' | 'SYNTHETIC_SIMULATED' | null
    readonly amountMinorUnits: number | null
    readonly currencyCode: string | null
    readonly validUntil: GameDate | null
    readonly expired: boolean
    /** Quoted evidence only. It is not money committed, reserved or owed. */
    readonly isEvidenceNotCommitment: true
  }
  readonly governance: {
    readonly state: FacilityMaintenanceGovernanceState
    readonly decisionId: string | null
    readonly requiredBodyIds: readonly string[]
    readonly approvedBodyIds: readonly string[]
  }
  readonly funding: { readonly state: FacilityMaintenanceFundingState; readonly reservationId: string | null; readonly blockerCode: string | null; readonly note: string | null }
  readonly execution: { readonly state: FacilityMaintenanceExecutionState; readonly actionId: string | null; readonly startedOn: GameDate | null; readonly completedOn: GameDate | null; readonly outcome: string | null }
  readonly economics: {
    readonly state: FacilityMaintenanceEconomicState
    readonly factId: string | null
    readonly currencyCode: string | null
    readonly recognizedMinorUnits: number
    readonly payableMinorUnits: number
    readonly settledMinorUnits: number
    readonly outstandingMinorUnits: number
    readonly expenseId: string | null
    readonly payableId: string | null
    readonly recognizedOn: GameDate | null
    readonly dueOn: GameDate | null
  }
  readonly history: readonly { readonly sequence: number; readonly kind: string; readonly effectiveOn: GameDate; readonly reasonCode: string | null }[]
  readonly alerts: readonly string[]
  readonly actions: readonly FacilityMaintenanceActionAvailability[]
}

function availability(id: FacilityMaintenanceActionId, blockedReason: FacilityMaintenanceReason | null, extra: Partial<FacilityMaintenanceActionAvailability> = {}): FacilityMaintenanceActionAvailability {
  return Object.freeze({ id, enabled: blockedReason === null, reason: blockedReason, reasonText: blockedReason === null ? null : FACILITY_MAINTENANCE_REASON_TEXT[blockedReason], ...extra })
}

function userAppointedBodies(world: GameWorld, institutionId: string): readonly string[] {
  return [...new Set(Object.values(world.governanceAppointmentsById)
    .filter((a) => a.actor.kind === 'COACH' && a.actor.id === world.userCoachId && world.governanceBodiesById[a.bodyId]?.institutionId === institutionId && a.startedOn <= world.currentDate && (a.endedOn === undefined || a.endedOn >= world.currentDate))
    .map((a) => a.bodyId))]
}

function economicsFor(world: GameWorld, factId: string | null): FacilityMaintenanceOperationView['economics'] {
  const empty = { state: 'NONE' as const, factId, currencyCode: null, recognizedMinorUnits: 0, payableMinorUnits: 0, settledMinorUnits: 0, outstandingMinorUnits: 0, expenseId: null, payableId: null, recognizedOn: null, dueOn: null }
  if (factId === null) return empty
  const fact = world.operatingCostFactsById[factId]
  if (fact === undefined) return empty
  const base = { ...empty, state: 'COST_AUTHORIZED' as const, currencyCode: String(fact.amount.currencyCode), dueOn: fact.dueOn }
  const expense = Object.values(world.expenseRecognitionsById).find((item) => item.dimensions?.reference?.kind === 'OPERATING_COST_FACT' && item.dimensions.reference.id === factId)
  if (expense === undefined) return base
  const payableId = expense.payableId === null ? null : String(expense.payableId)
  const payable = payableId === null ? undefined : world.payablesById[payableId as never]
  const settled = payable === undefined ? 0 : getPayableSettledAmount(world, payable.id).minorUnits
  const recognized = expense.amount.minorUnits
  const payableMinor = payable === undefined ? 0 : payable.amount.minorUnits
  const outstanding = Math.max(payableMinor - settled, 0)
  const state: FacilityMaintenanceEconomicState = payable === undefined ? 'ECONOMICALLY_RECOGNIZED' : settled >= payableMinor ? 'SETTLED' : settled > 0 ? 'PARTIALLY_SETTLED' : 'PAYABLE'
  return { ...base, state, recognizedMinorUnits: recognized, payableMinorUnits: payableMinor, settledMinorUnits: settled, outstandingMinorUnits: outstanding, expenseId: String(expense.id), payableId, recognizedOn: expense.recognizedOn }
}

export function buildFacilityMaintenanceOperationView(world: GameWorld, teamId: TeamId, operationId: string): FacilityMaintenanceOperationView | null {
  const events = facilityOperationEvents(world, operationId)
  const lifecycle = deriveFacilityOperationLifecycle(events)
  const team = world.teams[teamId]
  if (lifecycle === null || team === undefined || lifecycle.organizationId !== team.organizationId || lifecycle.needId === null || lifecycle.facilityId === null || lifecycle.interventionType === null) return null
  const offerRecord = lifecycle.selectedOfferId === null ? undefined : world.facilityEconomyRecordsById[lifecycle.selectedOfferId]
  const offer = offerRecord?.recordKind === 'OFFER' ? offerRecord : undefined
  const provider = offer === undefined ? undefined : world.facilityEconomyRecordsById[offer.providerId]
  const decision = lifecycle.decisionId === null ? undefined : world.governanceDecisionsById[lifecycle.decisionId]
  const decisionState = facilityMaintenanceDecisionState(world, decision)
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(teamId))
  const reservation = lifecycle.reservationId === null ? undefined : world.financialReservationsById[lifecycle.reservationId]
  const action = lifecycle.actionId === null ? undefined : world.facilityMaintenanceActionsById[lifecycle.actionId as never]
  const lastFunding = [...events].reverse().find((event) => event.kind === 'FUNDING_BLOCKED' || event.kind === 'FUNDS_RESERVED')
  const economics = economicsFor(world, lifecycle.costFactId)

  const governanceState: FacilityMaintenanceGovernanceState = decisionState === null
    ? (institutions.length === 1 ? 'NOT_REQUESTED' : 'INSTITUTIONAL_AUTHORITY_UNVERIFIED')
    : decisionState.status === 'REJECTED' ? 'REJECTED' : decisionState.status === 'VETOED' ? 'VETOED' : decisionState.status === 'WITHDRAWN' ? 'WITHDRAWN' : decisionState.status === 'EXECUTED' ? 'EXECUTED' : decisionState.complete ? 'APPROVED' : 'PENDING'
  const fundingState: FacilityMaintenanceFundingState = reservation !== undefined
    ? (reservation.status === 'OPEN' ? 'RESERVED' : reservation.status === 'CONSUMED' ? 'CONSUMED' : 'RELEASED')
    : lastFunding?.kind === 'FUNDING_BLOCKED' ? 'FUNDING_BLOCKED' : 'NOT_RESERVED'
  const executionState: FacilityMaintenanceExecutionState = lifecycle.cancelled ? 'CANCELLED' : action === undefined ? 'NOT_STARTED' : action.completedAt === null ? 'IN_PROGRESS' : 'COMPLETED'
  const offerExpired = offer !== undefined && !isFacilityOfferValidOn(offer, world.currentDate)

  const alerts: string[] = []
  if (lifecycle.cancelled) alerts.push('OPERATION_CANCELLED')
  else {
    if (facilityOperationCostStatus(world, lifecycle) === 'UNKNOWN_COST') alerts.push('COST_UNKNOWN')
    if (offerExpired && fundingState !== 'RESERVED' && fundingState !== 'CONSUMED' && executionState === 'NOT_STARTED') alerts.push('OFFER_EXPIRED')
    if (governanceState === 'INSTITUTIONAL_AUTHORITY_UNVERIFIED') alerts.push('INSTITUTIONAL_AUTHORITY_UNVERIFIED')
    if (fundingState === 'FUNDING_BLOCKED') alerts.push(`FUNDING_BLOCKED:${lastFunding?.reasonCode ?? 'UNKNOWN'}`)
    if (fundingState === 'RESERVED') alerts.push('FUNDS_RESERVED')
    if (executionState === 'IN_PROGRESS') alerts.push('WORK_IN_PROGRESS')
    if (executionState === 'COMPLETED') alerts.push('REPAIR_COMPLETED')
    if (economics.state === 'ECONOMICALLY_RECOGNIZED' || economics.state === 'PAYABLE' || economics.state === 'PARTIALLY_SETTLED') alerts.push('OBLIGATION_PENDING')
    if (economics.state === 'PAYABLE' || economics.state === 'PARTIALLY_SETTLED') alerts.push('PAYMENT_PENDING')
  }

  // Dry-run every action against the real command: enabled only when the command would apply.
  const actions: FacilityMaintenanceActionAvailability[] = []
  const actionFor = (id: FacilityMaintenanceActionId, run: () => { readonly status: string; readonly reasons: readonly FacilityMaintenanceReason[] }, extra: Partial<FacilityMaintenanceActionAvailability> = {}) => {
    const outcome = run()
    // A Finance refusal is still an available action: running it persists the FUNDING_BLOCKED history. The prediction is shown beside it.
    if (outcome.status === 'FUNDING_BLOCKED') actions.push(Object.freeze({ ...availability(id, null, extra), reasonText: FACILITY_MAINTENANCE_REASON_TEXT.FUNDING_BLOCKED, reason: 'FUNDING_BLOCKED' as const }))
    else actions.push(availability(id, outcome.status === 'BLOCKED' ? (outcome.reasons[0] ?? 'INVALID_INPUT') : outcome.status === 'NO_CHANGE' ? 'OPERATION_STAGE_INVALID' : null, extra))
  }
  if (!lifecycle.cancelled) {
    const offers = facilityEconomyRecordsOfKind(world, 'OFFER').filter((item) => item.needId === lifecycle.needId && item.organizationId === lifecycle.organizationId).sort((a, b) => a.id.localeCompare(b.id))
    const selectable = offers.find((item) => item.id !== lifecycle.selectedOfferId && selectFacilityMaintenanceOffer(world, { teamId, operationId, offerId: item.id }).status === 'APPLIED')
    if (selectable !== undefined) actionFor('SELECT_OFFER', () => selectFacilityMaintenanceOffer(world, { teamId, operationId, offerId: selectable.id }), { offerId: selectable.id })
    else actions.push(availability('SELECT_OFFER', offers.length === 0 ? 'COST_UNKNOWN' : 'OFFER_EXPIRED'))
    actionFor('REQUEST_APPROVAL', () => requestFacilityMaintenanceDecision(world, { teamId, operationId }))
    if (decisionState !== null && decision !== undefined) {
      const mine = userAppointedBodies(world, decision.institutionId)
      const body = decisionState.requiredBodyIds.find((id) => mine.includes(id) && !decisionState.approvedBodyIds.includes(id))
      if (body !== undefined) actionFor('APPROVE', () => recordFacilityMaintenanceDecisionEvent(world, { teamId, decisionId: decision.id, kind: 'APPROVED', bodyId: body }), { bodyId: body, decisionId: decision.id })
      else actions.push(availability('APPROVE', decisionState.complete ? 'APPROVAL_ALREADY_RECORDED' : 'ACTOR_NOT_APPOINTED_WITH_RIGHT', { decisionId: decision.id }))
    } else actions.push(availability('APPROVE', 'DECISION_NOT_FOUND'))
    actionFor('RESERVE_AND_CONTRACT', () => reserveAndContractFacilityMaintenance(world, { teamId, operationId }))
    actionFor('START_WORK', () => startFacilityMaintenanceWork(world, { teamId, operationId }))
    const inspection = Object.values(world.facilityInspectionsById).filter((item) => item.facilityId === lifecycle.facilityId).sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt) || a.id.localeCompare(b.id))[0]
    if (inspection !== undefined) actionFor('COMPLETE_WORK', () => completeFacilityMaintenanceWork(world, { teamId, operationId, inspectionId: inspection.id }), { inspectionId: inspection.id })
    else actions.push(availability('COMPLETE_WORK', 'COMPLETION_INSPECTION_REQUIRED'))
    actionFor('REQUEST_CANCELLATION', () => requestFacilityMaintenanceDecision(world, { teamId, operationId, purpose: 'CANCELLATION' }))
    actionFor('CANCEL', () => cancelFacilityMaintenanceOperation(world, { teamId, operationId }))
  }

  return Object.freeze({
    operationId,
    needId: lifecycle.needId,
    facilityId: lifecycle.facilityId,
    interventionType: lifecycle.interventionType,
    stage: lifecycle.stage,
    cost: Object.freeze({
      status: facilityOperationCostStatus(world, lifecycle),
      offerId: offer?.id ?? null,
      sourceKind: offer?.sourceKind ?? null,
      providerName: provider?.recordKind === 'PROVIDER' ? provider.displayName : null,
      providerIdentity: provider?.recordKind === 'PROVIDER' ? provider.identityKind : null,
      amountMinorUnits: offer?.amount.minorUnits ?? null,
      currencyCode: offer?.amount.currencyCode ?? null,
      validUntil: offer?.validUntil ?? null,
      expired: offerExpired,
      isEvidenceNotCommitment: true as const,
    }),
    governance: Object.freeze({ state: governanceState, decisionId: lifecycle.decisionId, requiredBodyIds: decisionState?.requiredBodyIds ?? [], approvedBodyIds: decisionState?.approvedBodyIds ?? [] }),
    funding: Object.freeze({ state: fundingState, reservationId: lifecycle.reservationId, blockerCode: fundingState === 'FUNDING_BLOCKED' ? lastFunding?.reasonCode ?? null : null, note: lastFunding?.kind === 'FUNDS_RESERVED' ? lastFunding.reasonCode : null }),
    execution: Object.freeze({ state: executionState, actionId: lifecycle.actionId, startedOn: action?.startedAt ?? null, completedOn: action?.completedAt ?? null, outcome: action?.outcome ?? null }),
    economics: Object.freeze(economics),
    history: Object.freeze(events.map((event) => Object.freeze({ sequence: event.sequence, kind: event.kind, effectiveOn: event.effectiveOn, reasonCode: event.reasonCode }))),
    alerts: Object.freeze(alerts),
    actions: Object.freeze(actions),
  })
}

export interface FacilityMaintenanceNeedRow {
  readonly needId: string
  readonly facilityId: string
  readonly componentId: string | null
  readonly severity: string
  readonly needStatus: string
  readonly operations: readonly FacilityMaintenanceOperationView[]
  /** The single operation that is not cancelled, if any. */
  readonly active: FacilityMaintenanceOperationView | null
  readonly offerCount: number
  readonly openProposalAction: FacilityMaintenanceActionAvailability
}

/** Every need of the club's facilities with its operation history. Needs with no operation expose the OPEN_PROPOSAL action. */
export function buildFacilityMaintenanceNeedRows(world: GameWorld, teamId: TeamId): readonly FacilityMaintenanceNeedRow[] {
  const authority = resolveClubFacilityAuthority(world, teamId)
  const operationsByNeed = new Map<string, FacilityMaintenanceOperationView[]>()
  for (const operationId of facilityOperationIds(world)) {
    const view = buildFacilityMaintenanceOperationView(world, teamId, operationId)
    if (view === null) continue
    operationsByNeed.set(view.needId, [...(operationsByNeed.get(view.needId) ?? []), view])
  }
  return Object.freeze(Object.values(world.facilityMaintenanceNeedsById)
    .filter((need) => authority.facilityIds.includes(need.facilityId))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((need) => {
      const operations = operationsByNeed.get(String(need.id)) ?? []
      const active = operations.find((item) => item.stage !== 'CANCELLED') ?? null
      const open = isFacilityMaintenanceNeedOpenStatus(need.status)
      const dry = open && active === null ? openFacilityMaintenanceProposal(world, { teamId, needId: String(need.id), interventionType: 'REPAIR' }) : null
      return Object.freeze({
        needId: String(need.id),
        facilityId: String(need.facilityId),
        componentId: need.componentId === null ? null : String(need.componentId),
        severity: need.severity,
        needStatus: need.status,
        operations: Object.freeze(operations),
        active,
        offerCount: facilityEconomyRecordsOfKind(world, 'OFFER').filter((item) => item.needId === String(need.id)).length,
        openProposalAction: availability('OPEN_PROPOSAL', dry === null ? (active === null ? 'NEED_NOT_OPEN' : 'OPERATION_ALREADY_ACTIVE') : dry.status === 'APPLIED' ? null : (dry.reasons[0] ?? 'INVALID_INPUT')),
      })
    }))
}
