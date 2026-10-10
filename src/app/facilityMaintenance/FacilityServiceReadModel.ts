/**
 * BS17E-C manager read model for recurring conservation services. Pure projection: the contract terms come from the selected
 * `SERVICE_OFFER` (immutable), the periods from the operation's events, the money from the Finance facts those periods created.
 * Action availability is decided by dry-running the real command, exactly as for maintenance and investments.
 */

import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import { deriveFacilityOperationLifecycle, facilityOperationEvents, facilityOperationIds, type FacilityOperationStage } from '@/domain/facilityEconomy'
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
  listFacilityServiceOptions,
  openFacilityServiceProposal,
  requestFacilityServiceOffers,
  selectFacilityServiceOffer,
  serviceOffersForOperation,
  serviceTerm,
  signFacilityServiceContract,
  terminateFacilityServiceContract,
  type FacilityServiceOption,
} from './FacilityServiceCommands'
import type { FacilityMaintenanceGovernanceState } from './FacilityMaintenanceReadModel'

export type FacilityServiceActionId = 'OPEN_PROPOSAL' | 'REQUEST_OFFERS' | 'SELECT_OFFER' | 'REQUEST_APPROVAL' | 'APPROVE' | 'SIGN' | 'TERMINATE'

export interface FacilityServiceActionAvailability {
  readonly id: FacilityServiceActionId
  readonly enabled: boolean
  readonly reason: FacilityMaintenanceReason | null
  readonly reasonText: string | null
  readonly offerId?: string
  readonly bodyId?: string
  readonly decisionId?: string
}

export interface FacilityServiceOfferView {
  readonly offerId: string
  readonly providerName: string
  readonly amountPerPeriodMinorUnits: number
  readonly currencyCode: string
  readonly periodDays: number
  readonly termPeriods: number
  readonly noticeDays: number
  readonly restorationPoints: number
  readonly validUntil: GameDate
  readonly selected: boolean
  readonly blockedReason: FacilityMaintenanceReason | null
}

export interface FacilityServiceOperationView {
  readonly operationId: string
  readonly facilityId: string
  readonly stage: FacilityOperationStage
  readonly offers: readonly FacilityServiceOfferView[]
  readonly contract: { readonly providerName: string; readonly amountPerPeriodMinorUnits: number; readonly currencyCode: string; readonly periodDays: number; readonly termPeriods: number; readonly noticeDays: number; readonly restorationPoints: number; readonly startsOn: GameDate | null; readonly endsOn: GameDate | null; readonly terminationNoticedEffectiveOn: GameDate | null; readonly ended: boolean } | null
  readonly periods: { readonly processed: number; readonly skipped: number; readonly nextDueOn: GameDate | null; readonly billedMinorUnits: number }
  readonly governance: { readonly state: FacilityMaintenanceGovernanceState; readonly decisionId: string | null; readonly requiredBodyIds: readonly string[]; readonly approvedBodyIds: readonly string[] }
  readonly history: readonly { readonly sequence: number; readonly kind: string; readonly effectiveOn: GameDate; readonly reasonCode: string | null }[]
  readonly actions: readonly FacilityServiceActionAvailability[]
}

function availability(id: FacilityServiceActionId, reason: FacilityMaintenanceReason | null, extra: Partial<FacilityServiceActionAvailability> = {}): FacilityServiceActionAvailability {
  return Object.freeze({ id, enabled: reason === null, reason, reasonText: reason === null ? null : FACILITY_MAINTENANCE_REASON_TEXT[reason], ...extra })
}

function userAppointedBodies(world: GameWorld, institutionId: string): readonly string[] {
  return [...new Set(Object.values(world.governanceAppointmentsById)
    .filter((a) => a.actor.kind === 'COACH' && a.actor.id === world.userCoachId && world.governanceBodiesById[a.bodyId]?.institutionId === institutionId && a.startedOn <= world.currentDate && (a.endedOn === undefined || a.endedOn >= world.currentDate))
    .map((a) => a.bodyId))]
}

export function buildFacilityServiceOperationView(world: GameWorld, teamId: TeamId, operationId: string): FacilityServiceOperationView | null {
  const events = facilityOperationEvents(world, operationId)
  const lifecycle = deriveFacilityOperationLifecycle(events)
  const team = world.teams[teamId]
  if (lifecycle === null || team === undefined || lifecycle.interventionType !== 'SERVICE_CONSERVATION' || lifecycle.organizationId !== team.organizationId || lifecycle.facilityId === null) return null
  const offerRecord = lifecycle.selectedOfferId === null ? undefined : world.facilityEconomyRecordsById[lifecycle.selectedOfferId]
  const offer = offerRecord?.recordKind === 'SERVICE_OFFER' ? offerRecord : undefined
  const provider = offer === undefined ? undefined : world.facilityEconomyRecordsById[offer.providerId]
  const providerName = provider?.recordKind === 'PROVIDER' ? provider.displayName : offer?.providerId ?? 'unknown provider'
  const decision = lifecycle.decisionId === null ? undefined : world.governanceDecisionsById[lifecycle.decisionId]
  const decisionState = facilityMaintenanceDecisionState(world, decision)
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(teamId))
  const governanceState: FacilityMaintenanceGovernanceState = decisionState === null
    ? (institutions.length === 1 ? 'NOT_REQUESTED' : 'INSTITUTIONAL_AUTHORITY_UNVERIFIED')
    : decisionState.status === 'REJECTED' ? 'REJECTED' : decisionState.status === 'VETOED' ? 'VETOED' : decisionState.status === 'WITHDRAWN' ? 'WITHDRAWN' : decisionState.status === 'EXECUTED' ? 'EXECUTED' : decisionState.complete ? 'APPROVED' : 'PENDING'

  const term = offer === undefined ? null : serviceTerm(world, operationId, offer)
  const offers: FacilityServiceOfferView[] = serviceOffersForOperation(world, operationId).map((item) => {
    const itemProvider = world.facilityEconomyRecordsById[item.providerId]
    const attempt = selectFacilityServiceOffer(world, { teamId, operationId, offerId: item.id })
    return Object.freeze({
      offerId: item.id, providerName: itemProvider?.recordKind === 'PROVIDER' ? itemProvider.displayName : item.providerId, amountPerPeriodMinorUnits: item.amountPerPeriod.minorUnits, currencyCode: item.amountPerPeriod.currencyCode,
      periodDays: item.periodDays, termPeriods: item.termPeriods, noticeDays: item.noticeDays, restorationPoints: item.restorationPoints, validUntil: item.validUntil, selected: item.id === lifecycle.selectedOfferId,
      blockedReason: attempt.status === 'APPLIED' || item.id === lifecycle.selectedOfferId ? null : (attempt.reasons[0] ?? 'INVALID_INPUT'),
    })
  })
  const processed = lifecycle.servicePeriodsProcessed.length
  const skipped = lifecycle.servicePeriodsSkipped.length
  const done = new Set([...lifecycle.servicePeriodsProcessed, ...lifecycle.servicePeriodsSkipped])
  let nextDueOn: GameDate | null = null
  if (offer !== undefined && term !== null && !lifecycle.serviceEnded) {
    const end = lifecycle.serviceEndsOn !== null && compareGameDates(lifecycle.serviceEndsOn, term.endsOn) < 0 ? lifecycle.serviceEndsOn : term.endsOn
    for (let index = 0; index < offer.termPeriods; index += 1) {
      if (done.has(index)) continue
      const start = addDays(term.startsOn, offer.periodDays * index)
      if (compareGameDates(start, end) < 0) nextDueOn = start
      break
    }
  }

  const actions: FacilityServiceActionAvailability[] = []
  const actionFor = (id: FacilityServiceActionId, run: () => { readonly status: string; readonly reasons: readonly FacilityMaintenanceReason[] }, extra: Partial<FacilityServiceActionAvailability> = {}) => {
    const outcome = run()
    if (outcome.status === 'FUNDING_BLOCKED') actions.push(Object.freeze({ ...availability(id, null, extra), reason: 'FUNDING_BLOCKED' as const, reasonText: FACILITY_MAINTENANCE_REASON_TEXT.FUNDING_BLOCKED }))
    else actions.push(availability(id, outcome.status === 'BLOCKED' ? (outcome.reasons[0] ?? 'INVALID_INPUT') : outcome.status === 'NO_CHANGE' ? 'OPERATION_STAGE_INVALID' : null, extra))
  }
  if (!lifecycle.cancelled && !lifecycle.serviceEnded) {
    const contracted = lifecycle.stage === 'CONTRACTED'
    if (!contracted) {
      actionFor('REQUEST_OFFERS', () => requestFacilityServiceOffers(world, { teamId, operationId }))
      const selectable = offers.find((item) => !item.selected && item.blockedReason === null)
      if (selectable !== undefined) actionFor('SELECT_OFFER', () => selectFacilityServiceOffer(world, { teamId, operationId, offerId: selectable.offerId }), { offerId: selectable.offerId })
      else actions.push(availability('SELECT_OFFER', offers.length === 0 ? 'COST_UNKNOWN' : (offers.find((item) => !item.selected)?.blockedReason ?? 'OPERATION_STAGE_INVALID')))
      actionFor('REQUEST_APPROVAL', () => requestFacilityMaintenanceDecision(world, { teamId, operationId }))
      if (decisionState !== null && decision !== undefined) {
        const mine = userAppointedBodies(world, decision.institutionId)
        const body = decisionState.requiredBodyIds.find((id) => mine.includes(id) && !decisionState.approvedBodyIds.includes(id))
        if (body !== undefined) actionFor('APPROVE', () => recordFacilityMaintenanceDecisionEvent(world, { teamId, decisionId: decision.id, kind: 'APPROVED', bodyId: body }), { bodyId: body, decisionId: decision.id })
        else actions.push(availability('APPROVE', decisionState.complete ? 'APPROVAL_ALREADY_RECORDED' : 'ACTOR_NOT_APPOINTED_WITH_RIGHT', { decisionId: decision.id }))
      } else actions.push(availability('APPROVE', 'DECISION_NOT_FOUND'))
      actionFor('SIGN', () => signFacilityServiceContract(world, { teamId, operationId }))
    }
    actionFor('TERMINATE', () => terminateFacilityServiceContract(world, { teamId, operationId }))
  }

  return Object.freeze({
    operationId, facilityId: lifecycle.facilityId, stage: lifecycle.stage, offers: Object.freeze(offers),
    contract: offer === undefined ? null : Object.freeze({
      providerName, amountPerPeriodMinorUnits: offer.amountPerPeriod.minorUnits, currencyCode: offer.amountPerPeriod.currencyCode, periodDays: offer.periodDays, termPeriods: offer.termPeriods, noticeDays: offer.noticeDays,
      restorationPoints: offer.restorationPoints, startsOn: term?.startsOn ?? null, endsOn: term?.endsOn ?? null, terminationNoticedEffectiveOn: lifecycle.serviceEndsOn, ended: lifecycle.serviceEnded,
    }),
    periods: Object.freeze({ processed, skipped, nextDueOn, billedMinorUnits: offer === undefined ? 0 : processed * offer.amountPerPeriod.minorUnits }),
    governance: Object.freeze({ state: governanceState, decisionId: lifecycle.decisionId, requiredBodyIds: decisionState?.requiredBodyIds ?? [], approvedBodyIds: decisionState?.approvedBodyIds ?? [] }),
    history: Object.freeze(events.map((event) => Object.freeze({ sequence: event.sequence, kind: event.kind, effectiveOn: event.effectiveOn, reasonCode: event.reasonCode }))),
    actions: Object.freeze(actions),
  })
}

export interface FacilityServiceRow {
  readonly option: FacilityServiceOption
  readonly active: FacilityServiceOperationView | null
  readonly operations: readonly FacilityServiceOperationView[]
  readonly openAction: FacilityServiceActionAvailability
}

export function buildFacilityServiceRows(world: GameWorld, teamId: TeamId): readonly FacilityServiceRow[] {
  const views: FacilityServiceOperationView[] = []
  for (const operationId of facilityOperationIds(world)) {
    const view = buildFacilityServiceOperationView(world, teamId, operationId)
    if (view !== null) views.push(view)
  }
  return Object.freeze(listFacilityServiceOptions(world, teamId).map((option) => {
    const operations = views.filter((view) => view.facilityId === option.facilityId)
    const active = operations.find((view) => view.stage !== 'CANCELLED' && view.actions.length > 0) ?? null
    const dry = active === null && option.eligible ? openFacilityServiceProposal(world, { teamId, facilityId: option.facilityId }) : null
    return Object.freeze({
      option, active, operations: Object.freeze(operations),
      openAction: availability('OPEN_PROPOSAL', active !== null ? 'OPERATION_ALREADY_ACTIVE' : dry === null ? 'INVESTMENT_NOT_JUSTIFIED' : dry.status === 'APPLIED' ? null : (dry.reasons[0] ?? 'INVALID_INPUT')),
    })
  }))
}
