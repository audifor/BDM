/**
 * BS17E-B manager read model for capital investments. Pure projection over Facilities, Governance and Finance facts; money is
 * read from Finance only (reservations, expense recognitions, payables, settlements). Action availability is decided by
 * dry-running the real command against the current world, exactly as for maintenance.
 */

import type { GameDate } from '@/domain/date'
import { deriveFacilityOperationLifecycle, facilityCapitalTrancheAmount, facilityCapitalTrancheId, facilityOperationEvents, facilityOperationIds, type FacilityCapitalOffer, type FacilityOperationStage } from '@/domain/facilityEconomy'
import { getPayableSettledAmount } from '@/domain/finance'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import {
  FACILITY_MAINTENANCE_REASON_TEXT,
  facilityMaintenanceDecisionState,
  recordFacilityMaintenanceDecisionEvent,
  requestFacilityMaintenanceDecision,
  type FacilityMaintenanceReason,
} from './FacilityMaintenanceCommands'
import {
  acceptFacilityInvestmentWork,
  cancelFacilityInvestment,
  capitalOffersForOperation,
  listFacilityInvestmentOptions,
  openFacilityInvestmentProposal,
  requestFacilityInvestmentOffers,
  reserveAndContractFacilityInvestment,
  selectFacilityInvestmentOffer,
  startFacilityInvestmentWork,
  type FacilityInvestmentKind,
  type FacilityInvestmentOption,
} from './FacilityCapitalCommands'
import type { FacilityMaintenanceGovernanceState, FacilityMaintenanceFundingState } from './FacilityMaintenanceReadModel'

export type FacilityInvestmentActionId = 'OPEN_PROPOSAL' | 'REQUEST_OFFERS' | 'SELECT_OFFER' | 'REQUEST_APPROVAL' | 'APPROVE' | 'RESERVE_AND_CONTRACT' | 'START_WORK' | 'ACCEPT_WORK' | 'REQUEST_CANCELLATION' | 'CANCEL'

export interface FacilityInvestmentActionAvailability {
  readonly id: FacilityInvestmentActionId
  readonly enabled: boolean
  readonly reason: FacilityMaintenanceReason | null
  readonly reasonText: string | null
  readonly offerId?: string
  readonly bodyId?: string
  readonly decisionId?: string
}

export interface FacilityInvestmentTrancheView {
  readonly label: string
  readonly trigger: 'WORK_STARTED' | 'WORK_ACCEPTED'
  readonly permille: number
  readonly amountMinorUnits: number
  readonly state: 'NOT_DUE' | 'RECOGNIZED' | 'PAYABLE' | 'PARTIALLY_SETTLED' | 'SETTLED'
  readonly recognizedOn: GameDate | null
  readonly dueOn: GameDate | null
  readonly settledMinorUnits: number
  readonly outstandingMinorUnits: number
}

export interface FacilityInvestmentOfferView {
  readonly offerId: string
  readonly providerName: string
  readonly amountMinorUnits: number
  readonly currencyCode: string
  readonly executionDays: number | null
  readonly promisedCondition: number | null
  readonly validUntil: GameDate
  readonly expired: boolean
  readonly selected: boolean
  readonly blockedReason: FacilityMaintenanceReason | null
}

export interface FacilityInvestmentOperationView {
  readonly operationId: string
  readonly projectId: string
  readonly facilityId: string
  readonly kind: FacilityInvestmentKind
  readonly label: string
  readonly justification: string | null
  readonly stage: FacilityOperationStage
  readonly projectStatus: string
  readonly cost: { readonly status: 'KNOWN' | 'UNKNOWN_COST'; readonly offerId: string | null; readonly amountMinorUnits: number | null; readonly currencyCode: string | null; readonly providerName: string | null; readonly executionDays: number | null; readonly promisedCondition: number | null; readonly isEvidenceNotCommitment: true }
  readonly offers: readonly FacilityInvestmentOfferView[]
  readonly governance: { readonly state: FacilityMaintenanceGovernanceState; readonly decisionId: string | null; readonly requiredBodyIds: readonly string[]; readonly approvedBodyIds: readonly string[] }
  readonly funding: { readonly state: FacilityMaintenanceFundingState; readonly blockerCode: string | null; readonly openReservations: number; readonly consumedReservations: number }
  readonly execution: { readonly state: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; readonly startedOn: GameDate | null; readonly completedOn: GameDate | null }
  readonly tranches: readonly FacilityInvestmentTrancheView[]
  readonly economics: { readonly currencyCode: string | null; readonly recognizedMinorUnits: number; readonly owedMinorUnits: number; readonly paidMinorUnits: number }
  readonly history: readonly { readonly sequence: number; readonly kind: string; readonly effectiveOn: GameDate; readonly reasonCode: string | null }[]
  readonly alerts: readonly string[]
  readonly actions: readonly FacilityInvestmentActionAvailability[]
}

function availability(id: FacilityInvestmentActionId, reason: FacilityMaintenanceReason | null, extra: Partial<FacilityInvestmentActionAvailability> = {}): FacilityInvestmentActionAvailability {
  return Object.freeze({ id, enabled: reason === null, reason, reasonText: reason === null ? null : FACILITY_MAINTENANCE_REASON_TEXT[reason], ...extra })
}

function userAppointedBodies(world: GameWorld, institutionId: string): readonly string[] {
  return [...new Set(Object.values(world.governanceAppointmentsById)
    .filter((a) => a.actor.kind === 'COACH' && a.actor.id === world.userCoachId && world.governanceBodiesById[a.bodyId]?.institutionId === institutionId && a.startedOn <= world.currentDate && (a.endedOn === undefined || a.endedOn >= world.currentDate))
    .map((a) => a.bodyId))]
}

const KIND_BY_INTERVENTION: Readonly<Record<string, FacilityInvestmentKind>> = { CAPITAL_RENOVATION: 'RENOVATION', CAPITAL_REPLACEMENT: 'REPLACEMENT', CAPITAL_EXPANSION: 'EXPANSION' }

export function buildFacilityInvestmentOperationView(world: GameWorld, teamId: TeamId, operationId: string): FacilityInvestmentOperationView | null {
  const events = facilityOperationEvents(world, operationId)
  const lifecycle = deriveFacilityOperationLifecycle(events)
  const team = world.teams[teamId]
  if (lifecycle === null || team === undefined || lifecycle.projectId === null || lifecycle.organizationId !== team.organizationId || lifecycle.facilityId === null || lifecycle.interventionType === null) return null
  const project = world.facilityDevelopmentProjectsById[lifecycle.projectId as never]
  if (project === undefined) return null
  const kind = KIND_BY_INTERVENTION[lifecycle.interventionType]
  if (kind === undefined) return null
  const offerRecord = lifecycle.selectedOfferId === null ? undefined : world.facilityEconomyRecordsById[lifecycle.selectedOfferId]
  const offer = offerRecord?.recordKind === 'CAPITAL_OFFER' ? offerRecord : undefined
  const provider = offer === undefined ? undefined : world.facilityEconomyRecordsById[offer.providerId]
  const decision = lifecycle.decisionId === null ? undefined : world.governanceDecisionsById[lifecycle.decisionId]
  const decisionState = facilityMaintenanceDecisionState(world, decision)
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(teamId))
  const lastFunding = [...events].reverse().find((event) => event.kind === 'FUNDING_BLOCKED' || event.kind === 'FUNDS_RESERVED')
  const trancheReservations = offer === undefined ? [] : offer.tranches.map((tranche) => Object.values(world.financialReservationsById).find((item) => item.sourceAuthority === 'FACILITY' && item.sourceEntityId === facilityCapitalTrancheId(operationId, tranche)))

  const tranches: FacilityInvestmentTrancheView[] = (offer === undefined ? [] : offer.tranches.map((tranche) => {
    const trancheId = facilityCapitalTrancheId(operationId, tranche)
    const expense = Object.values(world.expenseRecognitionsById).find((item) => item.dimensions?.reference?.kind === 'FACILITY_CAPITAL_TRANCHE' && item.dimensions.reference.id === trancheId)
    const payable = expense === undefined || expense.payableId === null ? undefined : world.payablesById[expense.payableId as never]
    const settled = payable === undefined ? 0 : getPayableSettledAmount(world, payable.id).minorUnits
    const amount = facilityCapitalTrancheAmount(offer, tranche)
    const state: FacilityInvestmentTrancheView['state'] = expense === undefined ? 'NOT_DUE' : payable === undefined ? 'RECOGNIZED' : settled >= payable.amount.minorUnits ? 'SETTLED' : settled > 0 ? 'PARTIALLY_SETTLED' : 'PAYABLE'
    return Object.freeze({ label: tranche.label, trigger: tranche.trigger, permille: tranche.permille, amountMinorUnits: amount, state, recognizedOn: expense?.recognizedOn ?? null, dueOn: payable?.dueOn ?? null, settledMinorUnits: settled, outstandingMinorUnits: payable === undefined ? 0 : Math.max(payable.amount.minorUnits - settled, 0) })
  }))
  const recognizedMinorUnits = tranches.filter((item) => item.state !== 'NOT_DUE').reduce((sum, item) => sum + item.amountMinorUnits, 0)
  const paidMinorUnits = tranches.reduce((sum, item) => sum + item.settledMinorUnits, 0)
  const owedMinorUnits = tranches.reduce((sum, item) => sum + item.outstandingMinorUnits, 0)

  const governanceState: FacilityMaintenanceGovernanceState = decisionState === null
    ? (institutions.length === 1 ? 'NOT_REQUESTED' : 'INSTITUTIONAL_AUTHORITY_UNVERIFIED')
    : decisionState.status === 'REJECTED' ? 'REJECTED' : decisionState.status === 'VETOED' ? 'VETOED' : decisionState.status === 'WITHDRAWN' ? 'WITHDRAWN' : decisionState.status === 'EXECUTED' ? 'EXECUTED' : decisionState.complete ? 'APPROVED' : 'PENDING'
  const open = trancheReservations.filter((item) => item?.status === 'OPEN').length
  const consumed = trancheReservations.filter((item) => item?.status === 'CONSUMED').length
  const fundingState: FacilityMaintenanceFundingState = trancheReservations.length > 0 && trancheReservations.every((item) => item !== undefined)
    ? (open > 0 ? 'RESERVED' : consumed > 0 ? 'CONSUMED' : 'RELEASED')
    : lastFunding?.kind === 'FUNDING_BLOCKED' ? 'FUNDING_BLOCKED' : 'NOT_RESERVED'
  const executionState = lifecycle.cancelled ? 'CANCELLED' as const : project.status === 'COMPLETED' ? 'COMPLETED' as const : project.status === 'IN_PROGRESS' || project.status === 'PAUSED' ? 'IN_PROGRESS' as const : 'NOT_STARTED' as const

  const offerViews: FacilityInvestmentOfferView[] = capitalOffersForOperation(world, operationId).map((item: FacilityCapitalOffer) => {
    const itemProvider = world.facilityEconomyRecordsById[item.providerId]
    const attempt = selectFacilityInvestmentOffer(world, { teamId, operationId, offerId: item.id })
    return Object.freeze({ offerId: item.id, providerName: itemProvider?.recordKind === 'PROVIDER' ? itemProvider.displayName : item.providerId, amountMinorUnits: item.amount.minorUnits, currencyCode: item.amount.currencyCode, executionDays: item.executionDays, promisedCondition: item.promisedCondition, validUntil: item.validUntil, expired: world.currentDate > item.validUntil, selected: item.id === lifecycle.selectedOfferId, blockedReason: attempt.status === 'APPLIED' || item.id === lifecycle.selectedOfferId ? null : (attempt.reasons[0] ?? 'INVALID_INPUT') })
  })

  const alerts: string[] = []
  if (lifecycle.cancelled) alerts.push('OPERATION_CANCELLED')
  else {
    if (offer === undefined) alerts.push('COST_UNKNOWN')
    if (offer !== undefined && world.currentDate > offer.validUntil && fundingState !== 'RESERVED' && fundingState !== 'CONSUMED') alerts.push('OFFER_EXPIRED')
    if (governanceState === 'INSTITUTIONAL_AUTHORITY_UNVERIFIED') alerts.push('INSTITUTIONAL_AUTHORITY_UNVERIFIED')
    if (fundingState === 'FUNDING_BLOCKED') alerts.push(`FUNDING_BLOCKED:${lastFunding?.reasonCode ?? 'UNKNOWN'}`)
    if (fundingState === 'RESERVED') alerts.push('FUNDS_RESERVED')
    if (executionState === 'IN_PROGRESS') alerts.push('WORKS_IN_PROGRESS')
    if (executionState === 'COMPLETED') alerts.push('INVESTMENT_COMPLETED')
    if (owedMinorUnits > 0) alerts.push('PAYMENT_PENDING')
  }

  const actions: FacilityInvestmentActionAvailability[] = []
  const actionFor = (id: FacilityInvestmentActionId, run: () => { readonly status: string; readonly reasons: readonly FacilityMaintenanceReason[] }, extra: Partial<FacilityInvestmentActionAvailability> = {}) => {
    const outcome = run()
    if (outcome.status === 'FUNDING_BLOCKED') actions.push(Object.freeze({ ...availability(id, null, extra), reason: 'FUNDING_BLOCKED' as const, reasonText: FACILITY_MAINTENANCE_REASON_TEXT.FUNDING_BLOCKED }))
    else actions.push(availability(id, outcome.status === 'BLOCKED' ? (outcome.reasons[0] ?? 'INVALID_INPUT') : outcome.status === 'NO_CHANGE' ? 'OPERATION_STAGE_INVALID' : null, extra))
  }
  if (!lifecycle.cancelled) {
    actionFor('REQUEST_OFFERS', () => requestFacilityInvestmentOffers(world, { teamId, operationId }))
    const selectable = offerViews.find((item) => !item.selected && item.blockedReason === null)
    if (selectable !== undefined) actionFor('SELECT_OFFER', () => selectFacilityInvestmentOffer(world, { teamId, operationId, offerId: selectable.offerId }), { offerId: selectable.offerId })
    else actions.push(availability('SELECT_OFFER', offerViews.length === 0 ? 'COST_UNKNOWN' : (offerViews.find((item) => !item.selected)?.blockedReason ?? 'OPERATION_STAGE_INVALID')))
    actionFor('REQUEST_APPROVAL', () => requestFacilityMaintenanceDecision(world, { teamId, operationId }))
    if (decisionState !== null && decision !== undefined) {
      const mine = userAppointedBodies(world, decision.institutionId)
      const body = decisionState.requiredBodyIds.find((id) => mine.includes(id) && !decisionState.approvedBodyIds.includes(id))
      if (body !== undefined) actionFor('APPROVE', () => recordFacilityMaintenanceDecisionEvent(world, { teamId, decisionId: decision.id, kind: 'APPROVED', bodyId: body }), { bodyId: body, decisionId: decision.id })
      else actions.push(availability('APPROVE', decisionState.complete ? 'APPROVAL_ALREADY_RECORDED' : 'ACTOR_NOT_APPOINTED_WITH_RIGHT', { decisionId: decision.id }))
    } else actions.push(availability('APPROVE', 'DECISION_NOT_FOUND'))
    actionFor('RESERVE_AND_CONTRACT', () => reserveAndContractFacilityInvestment(world, { teamId, operationId }))
    actionFor('START_WORK', () => startFacilityInvestmentWork(world, { teamId, operationId }))
    actionFor('ACCEPT_WORK', () => acceptFacilityInvestmentWork(world, { teamId, operationId }))
    actionFor('REQUEST_CANCELLATION', () => requestFacilityMaintenanceDecision(world, { teamId, operationId, purpose: 'CANCELLATION' }))
    actionFor('CANCEL', () => cancelFacilityInvestment(world, { teamId, operationId }))
  }

  return Object.freeze({
    operationId, projectId: lifecycle.projectId, facilityId: lifecycle.facilityId, kind, label: project.reason ?? kind, justification: project.reason,
    stage: lifecycle.stage, projectStatus: project.status,
    cost: Object.freeze({ status: offer === undefined ? 'UNKNOWN_COST' as const : 'KNOWN' as const, offerId: offer?.id ?? null, amountMinorUnits: offer?.amount.minorUnits ?? null, currencyCode: offer?.amount.currencyCode ?? null, providerName: provider?.recordKind === 'PROVIDER' ? provider.displayName : null, executionDays: offer?.executionDays ?? null, promisedCondition: offer?.promisedCondition ?? null, isEvidenceNotCommitment: true as const }),
    offers: Object.freeze(offerViews),
    governance: Object.freeze({ state: governanceState, decisionId: lifecycle.decisionId, requiredBodyIds: decisionState?.requiredBodyIds ?? [], approvedBodyIds: decisionState?.approvedBodyIds ?? [] }),
    funding: Object.freeze({ state: fundingState, blockerCode: fundingState === 'FUNDING_BLOCKED' ? lastFunding?.reasonCode ?? null : null, openReservations: open, consumedReservations: consumed }),
    execution: Object.freeze({ state: executionState, startedOn: project.actualStartDate, completedOn: project.actualCompletionDate }),
    tranches: Object.freeze(tranches),
    economics: Object.freeze({ currencyCode: offer?.amount.currencyCode ?? null, recognizedMinorUnits, owedMinorUnits, paidMinorUnits }),
    history: Object.freeze(events.map((event) => Object.freeze({ sequence: event.sequence, kind: event.kind, effectiveOn: event.effectiveOn, reasonCode: event.reasonCode }))),
    alerts: Object.freeze(alerts),
    actions: Object.freeze(actions),
  })
}

export interface FacilityInvestmentRow {
  readonly option: FacilityInvestmentOption
  readonly active: FacilityInvestmentOperationView | null
  /** The latest finished investment on this target, kept visible with its milestones, payables and payments. */
  readonly lastCompleted: FacilityInvestmentOperationView | null
  readonly operations: readonly FacilityInvestmentOperationView[]
  readonly openAction: FacilityInvestmentActionAvailability
}

/** Every investment option of the club's facilities, with the operation (if any) that is working on it and its history. */
export function buildFacilityInvestmentRows(world: GameWorld, teamId: TeamId): readonly FacilityInvestmentRow[] {
  const views: FacilityInvestmentOperationView[] = []
  for (const operationId of facilityOperationIds(world)) {
    const view = buildFacilityInvestmentOperationView(world, teamId, operationId)
    if (view !== null) views.push(view)
  }
  return Object.freeze(listFacilityInvestmentOptions(world, teamId).map((option) => {
    const project = (view: FacilityInvestmentOperationView) => world.facilityDevelopmentProjectsById[view.projectId as never]
    const target = (view: FacilityInvestmentOperationView): string | null => { const p = project(view); return p === undefined ? null : p.scope.kind === 'RENOVATE_COMPONENT' ? String(p.scope.componentId) : p.scope.kind === 'REPLACE_COMPONENT' ? String(p.scope.retiredComponentId) : null }
    const operations = views.filter((view) => view.facilityId === option.facilityId && view.kind === option.kind && target(view) === option.componentId)
    const active = operations.find((view) => view.stage !== 'CANCELLED' && view.stage !== 'WORK_COMPLETED') ?? null
    const lastCompleted = [...operations].reverse().find((view) => view.stage === 'WORK_COMPLETED') ?? null
    const dry = active === null && option.eligible ? openFacilityInvestmentProposal(world, { teamId, facilityId: option.facilityId, kind: option.kind, componentId: option.componentId }) : null
    return Object.freeze({
      option, active, lastCompleted, operations: Object.freeze(operations),
      openAction: availability('OPEN_PROPOSAL', active !== null ? 'OPERATION_ALREADY_ACTIVE' : dry === null ? 'INVESTMENT_NOT_JUSTIFIED' : dry.status === 'APPLIED' ? null : (dry.reasons[0] ?? 'INVALID_INPUT')),
    })
  }))
}
