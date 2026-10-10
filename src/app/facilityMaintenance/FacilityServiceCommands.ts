/**
 * BS17E-C — recurring facility services (the conservation contract).
 *
 * A recurring expense exists ONLY because an explicit, signed contract does: owning a facility never generates a charge. The
 * contract is the selected `SERVICE_OFFER` (its terms are immutable): fee per period, period length, term, notice, payment term
 * and the physical effect of one period.
 *
 *   Governance  the same `FACILITIES` decision rights as any work: PROPOSE, APPROVE (Board), EXECUTE (signature, termination).
 *   Finance     every period is an `AuthorizedOperatingCostFact` created by the Calendar processor the day the period starts and
 *               materialized by the single Finance owner (commitment, recognition, payable, Treasury settlement). A period Finance
 *               would not allow is SKIPPED and recorded: no charge, no fictitious payment, the contract keeps its history.
 *   Facilities  each processed period is a real, completed maintenance action that restores the most worn serviceable component
 *               by the contract's points; the condition engine (not this module) writes the condition record.
 *
 * Exactly once: a period is identified by `period:<index>` on its event and by the deterministic fact/action ids, so reprocessing,
 * Save/reload and the daily Calendar cannot bill or restore a period twice. Loading never renews a contract: a contract ends at the
 * end of its term or at the effective date of a termination notice, and renewal is a new, separately approved contract.
 */

import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import {
  componentConditionAt,
  createFacilityFinancialBinding,
  createFacilityMaintenanceAction,
} from '@/domain/facilities'
import {
  createFacilityServiceOffer,
  deriveFacilityOperationLifecycle,
  facilityEconomyRecordsOfKind,
  facilityOperationEvents,
  facilityOperationIds,
  type FacilityOperationLifecycle,
  type FacilityServiceOffer,
} from '@/domain/facilityEconomy'
import { createAuthorizedOperatingCostFact, evaluateOrganizationFinancialCommitment, getOrganizationFinancialAuthorization } from '@/domain/finance'
import { createGovernanceDecisionEvent, type GovernanceActor } from '@/domain/governance'
import type { FacilityComponentId, TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { applyFacilityMaintenanceAction } from '@/engine/facilities'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'
import { resolveClubFacilityAuthority } from '@/app/facilities/ClubFacilitiesReadModel'
import {
  GAME_BALANCE_MARKETS,
  GAME_BALANCE_OFFER_VALID_DAYS,
  GAME_BALANCE_PAYMENT_DUE_DAYS,
  GAME_BALANCE_PROVIDERS,
  GAME_BALANCE_SERVICE,
  gameBalanceId,
} from '@/app/gameBalance/BdmGameBalanceV1'
import { gameBalanceCatalogEntryId, gameBalanceProviderId, teamEcosystemKind } from '@/app/gameBalance/GameBalanceBootstrap'
import {
  activeBodiesOf,
  appendRecords,
  cancellationGovernancePatch,
  checkServiceOffer,
  clubOperation,
  decisionEventId,
  decisionEvents,
  eventGrantIds,
  facilityMaintenanceDecisionState,
  nextEvent,
  rightsAt,
  userActor,
  type FacilityMaintenanceCommandResult,
  type FacilityMaintenanceReason,
} from './FacilityMaintenanceCommands'

function result(status: FacilityMaintenanceCommandResult['status'], world: GameWorld, operationId: string | null, reasons: readonly FacilityMaintenanceReason[] = [], canonical: readonly string[] = [], decisionId: string | null = null): FacilityMaintenanceCommandResult {
  return Object.freeze({ status, world, operationId, reasons: Object.freeze([...reasons]), canonicalReasons: Object.freeze([...canonical]), decisionId })
}
const blocked = (world: GameWorld, operationId: string | null, reason: FacilityMaintenanceReason, canonical: readonly string[] = []) => result('BLOCKED', world, operationId, [reason], canonical)

export function serviceFactId(operationId: string, periodIndex: number): string { return `operating-cost-fact:facility-service:${operationId}:${periodIndex}` }
export function serviceActionId(operationId: string, periodIndex: number): string { return `facility-service-action:${operationId}:${periodIndex}` }
export function gameBalanceServiceOfferId(operationId: string, providerSlug: string): string { return gameBalanceId('service-offer', operationId, providerSlug) }

// ---------------------------------------------------------------------------------------------
// Options and proposal
// ---------------------------------------------------------------------------------------------

export interface FacilityServiceOption {
  readonly key: string
  readonly facilityId: string
  readonly label: string
  readonly eligible: boolean
  readonly reason: 'NO_CONTRACT' | 'ALREADY_CONTRACTED' | 'NOTHING_TO_CONSERVE'
  readonly description: string
  readonly activeOperationId: string | null
}

function serviceLifecycles(world: GameWorld): readonly FacilityOperationLifecycle[] {
  return facilityOperationIds(world).map((id) => deriveFacilityOperationLifecycle(facilityOperationEvents(world, id))).filter((lifecycle): lifecycle is FacilityOperationLifecycle => lifecycle !== null && lifecycle.interventionType === 'SERVICE_CONSERVATION')
}

export function listFacilityServiceOptions(world: GameWorld, teamId: TeamId): readonly FacilityServiceOption[] {
  const authority = resolveClubFacilityAuthority(world, teamId)
  const lifecycles = serviceLifecycles(world)
  return Object.freeze(authority.facilityIds.map((facilityId) => {
    const active = lifecycles.find((lifecycle) => lifecycle.facilityId === String(facilityId) && !lifecycle.cancelled)
    const components = Object.values(world.facilityComponentsById).filter((component) => component.facilityId === facilityId && component.status === 'ACTIVE' && component.closedAt === null)
    const worn = components.some((component) => (componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), component.id, world.currentDate)?.physicalCondition ?? 100) < 100)
    const reason = active !== undefined ? 'ALREADY_CONTRACTED' as const : worn ? 'NO_CONTRACT' as const : 'NOTHING_TO_CONSERVE' as const
    return Object.freeze({
      key: `SERVICE_CONSERVATION:${facilityId}`, facilityId: String(facilityId), label: 'Conservation service', eligible: reason === 'NO_CONTRACT', reason,
      description: 'A recurring contract: each period a provider visits and restores the most worn serviceable component. It is billed per period and can be terminated with notice.',
      activeOperationId: active === undefined ? null : active.operationId,
    })
  }))
}

export function openFacilityServiceProposal(world: GameWorld, input: { readonly teamId: TeamId; readonly facilityId: string; readonly actor?: GovernanceActor }): FacilityMaintenanceCommandResult {
  const team = world.teams[input.teamId]
  if (team === undefined) return blocked(world, null, 'UNKNOWN_TEAM')
  const option = listFacilityServiceOptions(world, input.teamId).find((item) => item.facilityId === input.facilityId)
  if (option === undefined) return blocked(world, null, 'NOT_CLUB_FACILITY')
  if (option.reason === 'ALREADY_CONTRACTED') return blocked(world, null, 'OPERATION_ALREADY_ACTIVE')
  if (!option.eligible) return blocked(world, null, 'INVESTMENT_NOT_JUSTIFIED', [option.reason])
  const organizationId = String(team.organizationId)
  const attempt = serviceLifecycles(world).filter((lifecycle) => lifecycle.facilityId === input.facilityId).length + 1
  const operationId = gameBalanceId('operation', 'service', organizationId, 'conservation', String(attempt))
  const event = nextEvent(world, operationId, 'PROPOSAL_CREATED', { organizationId, facilityId: input.facilityId, interventionType: 'SERVICE_CONSERVATION', actor: input.actor ?? (team.coachId === world.userCoachId ? userActor(world) : null) })
  return result('APPLIED', appendRecords(world, [event]), operationId, ['COST_UNKNOWN'])
}

// ---------------------------------------------------------------------------------------------
// Offers (calibrated model) and selection
// ---------------------------------------------------------------------------------------------

function serviceOperation(world: GameWorld, teamId: TeamId, operationId: string) {
  const resolved = clubOperation(world, teamId, operationId, 'ANY')
  if ('reason' in resolved) return resolved
  if (resolved.lifecycle.interventionType !== 'SERVICE_CONSERVATION') return { reason: 'OPERATION_NOT_FOUND' as const }
  return resolved
}

export function requestFacilityServiceOffers(world: GameWorld, input: { readonly teamId: TeamId; readonly operationId: string }): FacilityMaintenanceCommandResult {
  const resolved = serviceOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle } = resolved
  const team = world.teams[input.teamId]!
  if (lifecycle.decisionId !== null) return blocked(world, input.operationId, 'OFFER_LOCKED_BY_DECISION')
  const kind = teamEcosystemKind(world, team.id)
  const profile = world.organizationFinancialProfilesById[team.organizationId]
  if (kind === null || profile === undefined) return blocked(world, input.operationId, 'COST_UNKNOWN', ['NO_AUTHORIZED_COST_MODEL'])
  const market = GAME_BALANCE_MARKETS[kind]
  if (String(profile.baseCurrencyCode) !== market.currencyCode) return blocked(world, input.operationId, 'OFFER_CURRENCY_MISMATCH', ['NO_AUTHORIZED_COST_MODEL'])
  const issued: FacilityServiceOffer[] = []
  for (const provider of GAME_BALANCE_PROVIDERS) {
    const id = gameBalanceServiceOfferId(input.operationId, provider.slug)
    if (world.facilityEconomyRecordsById[id] !== undefined) continue
    issued.push(createFacilityServiceOffer({
      id, organizationId: String(team.organizationId), facilityId: lifecycle.facilityId!, interventionType: 'SERVICE_CONSERVATION', providerId: gameBalanceProviderId(provider.slug), sourceKind: 'SIMULATED_MODEL',
      evidence: { sourceId: gameBalanceId('catalog-source', kind), catalogEntryId: gameBalanceCatalogEntryId(kind, 'SERVICE_CONSERVATION'), modelVersion: '1' },
      amountPerPeriod: { currencyCode: market.currencyCode, minorUnits: Math.max(100, Math.round(market.servicePriceMinorUnits * provider.priceFactorPermille / 1_000 / 100) * 100) }, market: market.key,
      issuedOn: world.currentDate, validFrom: world.currentDate, validUntil: addDays(world.currentDate, GAME_BALANCE_OFFER_VALID_DAYS),
      periodDays: GAME_BALANCE_SERVICE.periodDays, termPeriods: GAME_BALANCE_SERVICE.termPeriods, noticeDays: GAME_BALANCE_SERVICE.noticeDays, paymentDueDays: GAME_BALANCE_PAYMENT_DUE_DAYS,
      restorationPoints: provider.serviceRestorationPoints,
    }))
  }
  if (issued.length === 0) return result('NO_CHANGE', world, input.operationId)
  return result('APPLIED', appendRecords(world, issued), input.operationId)
}

export function serviceOffersForOperation(world: GameWorld, operationId: string): readonly FacilityServiceOffer[] {
  const lifecycle = deriveFacilityOperationLifecycle(facilityOperationEvents(world, operationId))
  if (lifecycle === null || lifecycle.interventionType !== 'SERVICE_CONSERVATION') return []
  const prefix = gameBalanceServiceOfferId(operationId, '')
  return facilityEconomyRecordsOfKind(world, 'SERVICE_OFFER').filter((offer) => offer.id.startsWith(prefix) || offer.id === lifecycle.selectedOfferId).sort((a, b) => a.amountPerPeriod.minorUnits - b.amountPerPeriod.minorUnits || a.id.localeCompare(b.id))
}

export function selectFacilityServiceOffer(world: GameWorld, input: { readonly teamId: TeamId; readonly operationId: string; readonly offerId: string }): FacilityMaintenanceCommandResult {
  const resolved = serviceOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle, organizationId } = resolved
  if (lifecycle.decisionId !== null) return blocked(world, input.operationId, 'OFFER_LOCKED_BY_DECISION')
  if (lifecycle.stage !== 'COST_UNKNOWN' && lifecycle.stage !== 'PENDING_APPROVAL') return blocked(world, input.operationId, 'OPERATION_STAGE_INVALID')
  const checked = checkServiceOffer(world, lifecycle, organizationId, input.offerId)
  if ('reason' in checked) return blocked(world, input.operationId, checked.reason)
  if (lifecycle.selectedOfferId === input.offerId) return result('NO_CHANGE', world, input.operationId)
  return result('APPLIED', appendRecords(world, [nextEvent(world, input.operationId, 'OFFER_SELECTED', { offerId: input.offerId, actor: world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : null })]), input.operationId)
}

// ---------------------------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------------------------

/** The value the contract commits the club to over its whole term, used for the authorization check at signature and by the Board. */
export function serviceContractValue(offer: FacilityServiceOffer): number { return offer.amountPerPeriod.minorUnits * offer.termPeriods }

/**
 * Signs the contract once the Board has approved it. There is no reservation for the whole term (the commitment is recurring);
 * instead Finance must allow the FIRST period now and the full contract value must fit the FACILITY authorization line, and every
 * later period is checked again when it falls due. The signature starts the term today.
 */
export function signFacilityServiceContract(world: GameWorld, input: { readonly teamId: TeamId; readonly operationId: string; readonly actor?: GovernanceActor }): FacilityMaintenanceCommandResult {
  const resolved = serviceOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle, organizationId } = resolved
  if (lifecycle.stage === 'CONTRACTED') return result('NO_CHANGE', world, input.operationId)
  if (lifecycle.decisionId === null || lifecycle.selectedOfferId === null) return blocked(world, input.operationId, lifecycle.selectedOfferId === null ? 'COST_UNKNOWN' : 'DECISION_NOT_APPROVED')
  const decision = world.governanceDecisionsById[lifecycle.decisionId]
  const state = facilityMaintenanceDecisionState(world, decision)
  if (decision === undefined || state === null || !state.complete || ['REJECTED', 'VETOED', 'WITHDRAWN'].includes(state.status ?? '')) return blocked(world, input.operationId, 'DECISION_NOT_APPROVED')
  const checked = checkServiceOffer(world, lifecycle, organizationId, lifecycle.selectedOfferId)
  if ('reason' in checked) return blocked(world, input.operationId, checked.reason)
  const { offer } = checked
  const actor = input.actor ?? (world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : undefined)
  const executors = actor === undefined ? [] : activeBodiesOf(world, actor, decision.institutionId, rightsAt(world, decision.institutionId, world.currentDate).executorBodyIds)
  if (actor === undefined || executors.length !== 1) return blocked(world, input.operationId, 'EXECUTE_RIGHT_UNVERIFIED')
  const executeGrantIds = eventGrantIds(world, 'EXECUTED', executors[0]!, decision.institutionId, world.currentDate)
  if (executeGrantIds.length === 0) return blocked(world, input.operationId, 'EXECUTE_RIGHT_UNVERIFIED')

  const persistBlocker = (reasonCode: string): FacilityMaintenanceCommandResult => {
    const last = facilityOperationEvents(world, input.operationId).at(-1)
    const persisted = last?.kind === 'FUNDING_BLOCKED' && last.reasonCode === reasonCode ? world : appendRecords(world, [nextEvent(world, input.operationId, 'FUNDING_BLOCKED', { reasonCode, offerId: offer.id, actor })])
    return result('FUNDING_BLOCKED', persisted, input.operationId, ['FUNDING_BLOCKED'], [reasonCode])
  }
  const authorization = getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: offer.amountPerPeriod.currencyCode })
  const line = authorization.lines.find((item) => item.category === 'FACILITY')
  if (line !== undefined && serviceContractValue(offer) > line.availableHeadroomMinorUnits) return persistBlocker('INSUFFICIENT_AUTHORIZED_HEADROOM')
  const first = evaluateOrganizationFinancialCommitment(world, { organizationId, currency: offer.amountPerPeriod.currencyCode, amount: offer.amountPerPeriod, category: 'FACILITY' })
  if (first.status !== 'AFFORDABLE_NOW') return persistBlocker(first.reasonCodes[0] ?? first.status)
  const executedEvent = createGovernanceDecisionEvent({ id: decisionEventId(decision.id, world.currentDate, 'EXECUTED', executors[0]!), decisionId: decision.id, kind: 'EXECUTED', bodyId: executors[0]!, effectiveOn: world.currentDate, authorityGrantIds: [...executeGrantIds] })
  const contractEvent = nextEvent(world, input.operationId, 'CONTRACT_ACCEPTED', { offerId: offer.id, actor, endsOn: addDays(world.currentDate, offer.periodDays * offer.termPeriods), reasonCode: 'SERVICE_SIGNED' })
  const alreadyExecuted = decisionEvents(world, decision.id).some((event) => event.kind === 'EXECUTED')
  return result('APPLIED', appendRecords(world, [contractEvent], alreadyExecuted ? {} : { governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), executedEvent] }), input.operationId, [], [], decision.id)
}

/** Date the term started (the signing event) and the contract end date implied by the term. */
export function serviceTerm(world: GameWorld, operationId: string, offer: FacilityServiceOffer): { readonly startsOn: GameDate; readonly endsOn: GameDate } | null {
  const signed = facilityOperationEvents(world, operationId).find((event) => event.kind === 'CONTRACT_ACCEPTED')
  if (signed === undefined) return null
  return { startsOn: signed.effectiveOn, endsOn: addDays(signed.effectiveOn, offer.periodDays * offer.termPeriods) }
}

// ---------------------------------------------------------------------------------------------
// Termination
// ---------------------------------------------------------------------------------------------

/**
 * Gives notice of termination. The contract keeps running, and billing, until the notice elapses (the offer's notice days), and
 * never beyond its term. Before signature, an unsigned proposal is withdrawn/cancelled through the ordinary Governance path.
 */
export function terminateFacilityServiceContract(world: GameWorld, input: { readonly teamId: TeamId; readonly operationId: string; readonly actor?: GovernanceActor; readonly bodyId?: string }): FacilityMaintenanceCommandResult {
  const resolved = serviceOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle } = resolved
  const actor = input.actor ?? (world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : undefined)
  if (lifecycle.stage !== 'CONTRACTED') {
    const governance = cancellationGovernancePatch(world, lifecycle, actor, input.bodyId)
    if ('reason' in governance) return blocked(world, input.operationId, governance.reason)
    const current = updateGameWorld(world, governance.patch)
    return result('APPLIED', appendRecords(current, [nextEvent(current, input.operationId, 'CANCELLED', { actor: actor ?? null, reasonCode: lifecycle.stage })]), input.operationId)
  }
  if (lifecycle.serviceEndsOn !== null) return result('NO_CHANGE', world, input.operationId)
  const decision = lifecycle.decisionId === null ? undefined : world.governanceDecisionsById[lifecycle.decisionId]
  const bodies = actor === undefined || decision === undefined ? [] : activeBodiesOf(world, actor, decision.institutionId, rightsAt(world, decision.institutionId, world.currentDate).executorBodyIds)
  if (bodies.length === 0) return blocked(world, input.operationId, 'EXECUTE_RIGHT_UNVERIFIED')
  const offer = lifecycle.selectedOfferId === null ? undefined : world.facilityEconomyRecordsById[lifecycle.selectedOfferId]
  if (offer === undefined || offer.recordKind !== 'SERVICE_OFFER') return blocked(world, input.operationId, 'OFFER_NOT_FOUND')
  const term = serviceTerm(world, input.operationId, offer)!
  const effective = addDays(world.currentDate, offer.noticeDays)
  const endsOn = compareGameDates(effective, term.endsOn) > 0 ? term.endsOn : effective
  return result('APPLIED', appendRecords(world, [nextEvent(world, input.operationId, 'SERVICE_TERMINATION_NOTICED', { actor: actor ?? null, endsOn, reasonCode: 'NOTICE' })]), input.operationId)
}

// ---------------------------------------------------------------------------------------------
// The Calendar processor: one period per contract per day, exactly once
// ---------------------------------------------------------------------------------------------

function processPeriod(world: GameWorld, lifecycle: FacilityOperationLifecycle, offer: FacilityServiceOffer, index: number): GameWorld {
  const operationId = lifecycle.operationId
  const provider = world.facilityEconomyRecordsById[offer.providerId]
  const team = Object.values(world.teams).find((item) => String(item.organizationId) === lifecycle.organizationId)
  if (provider === undefined || provider.recordKind !== 'PROVIDER' || team === undefined || lifecycle.organizationId === null || lifecycle.facilityId === null) return world
  const preview = evaluateOrganizationFinancialCommitment(world, { organizationId: lifecycle.organizationId, currency: offer.amountPerPeriod.currencyCode, amount: offer.amountPerPeriod, category: 'FACILITY' })
  if (preview.status !== 'AFFORDABLE_NOW') {
    return appendRecords(world, [nextEvent(world, operationId, 'SERVICE_PERIOD_SKIPPED', { reasonCode: `period:${index}:${preview.reasonCodes[0] ?? preview.status}` })])
  }
  const factId = serviceFactId(operationId, index)
  const fact = createAuthorizedOperatingCostFact({
    id: factId, authority: 'FACILITY', sourceEntityId: serviceActionId(operationId, index), organizationId: lifecycle.organizationId, category: 'FACILITY', costNature: 'OPERATING',
    amount: offer.amountPerPeriod, incurredOn: world.currentDate, dueOn: addDays(world.currentDate, offer.paymentDueDays), teamId: team.id, facilityId: lifecycle.facilityId,
    counterparty: { kind: 'EXTERNAL', id: provider.id, label: provider.displayName }, provenance: { kind: 'FACILITY_MAINTENANCE_ACTION', id: serviceActionId(operationId, index) },
  })
  // Physical effect: the most worn serviceable component that no work currently occupies.
  const records = Object.values(world.facilityComponentConditionRecordsById)
  const target = Object.values(world.facilityComponentsById)
    .filter((component) => String(component.facilityId) === lifecycle.facilityId && component.status === 'ACTIVE' && component.closedAt === null)
    .map((component) => ({ component, condition: componentConditionAt(records, component.id, world.currentDate)?.physicalCondition ?? null }))
    .filter((row): row is { component: typeof row.component; condition: number } => row.condition !== null && row.condition < 100)
    .filter((row) => { const occupancy = componentPhysicalAvailabilityAt(world, row.component.id as FacilityComponentId, world.currentDate); return occupancy.affectedProjectIds.length === 0 && occupancy.affectedMaintenanceActionIds.length === 0 })
    .sort((a, b) => a.condition - b.condition || a.component.id.localeCompare(b.component.id))[0]
  let current = updateGameWorld(world, { operatingCostFacts: [...Object.values(world.operatingCostFactsById), fact] })
  let actionId: string | null = null
  if (target !== undefined) {
    actionId = serviceActionId(operationId, index)
    const action = createFacilityMaintenanceAction({
      id: actionId, facilityId: lifecycle.facilityId, componentId: target.component.id, type: 'PREVENTIVE_MAINTENANCE', startedAt: world.currentDate, completedAt: world.currentDate, outcome: 'SUCCESSFUL',
      resultingCondition: Math.min(100, Math.round(target.condition + offer.restorationPoints)),
    })
    current = updateGameWorld(current, { facilityMaintenanceActions: [...Object.values(current.facilityMaintenanceActionsById), action] })
    current = applyFacilityMaintenanceAction(current, action.id).world
    const binding = createFacilityFinancialBinding({ id: `facility-financial-binding:service:${operationId}:${index}`, sourceKind: 'FACILITY_MAINTENANCE_ACTION', sourceId: action.id, facilityId: lifecycle.facilityId, factKind: 'OPERATING_COST_FACT', factId, organizationId: lifecycle.organizationId, createdOn: world.currentDate, role: 'SERVICE_PERIOD_COST' })
    current = updateGameWorld(current, { facilityFinancialBindings: [...Object.values(current.facilityFinancialBindingsById), binding] })
  }
  return appendRecords(current, [nextEvent(current, operationId, 'SERVICE_PERIOD_PROCESSED', { costFactId: factId, actionId, offerId: offer.id, reasonCode: `period:${index}` })])
}

/**
 * Daily processor (called from the single FACILITY_MANAGEMENT Calendar phase, before Finance). For every signed contract: ends it when
 * its term or noticed termination has elapsed, and otherwise processes the earliest due, unprocessed period. Idempotent by period index.
 */
export function processFacilityServices(world: GameWorld): GameWorld {
  let current = world
  for (const lifecycle of serviceLifecycles(world)) {
    if (lifecycle.stage !== 'CONTRACTED' || lifecycle.serviceEnded || lifecycle.selectedOfferId === null) continue
    const offer = current.facilityEconomyRecordsById[lifecycle.selectedOfferId]
    if (offer === undefined || offer.recordKind !== 'SERVICE_OFFER') continue
    const term = serviceTerm(current, lifecycle.operationId, offer)
    if (term === null) continue
    const end = lifecycle.serviceEndsOn !== null && compareGameDates(lifecycle.serviceEndsOn, term.endsOn) < 0 ? lifecycle.serviceEndsOn : term.endsOn
    if (compareGameDates(current.currentDate, end) >= 0) {
      current = appendRecords(current, [nextEvent(current, lifecycle.operationId, 'SERVICE_ENDED', { reasonCode: lifecycle.serviceEndsOn !== null && compareGameDates(lifecycle.serviceEndsOn, term.endsOn) < 0 ? 'TERMINATED' : 'TERM_COMPLETED' })])
      continue
    }
    const done = new Set([...lifecycle.servicePeriodsProcessed, ...lifecycle.servicePeriodsSkipped])
    for (let index = 0; index < offer.termPeriods; index += 1) {
      const start = addDays(term.startsOn, offer.periodDays * index)
      if (compareGameDates(start, end) >= 0 || compareGameDates(start, current.currentDate) > 0) break
      if (done.has(index)) continue
      current = processPeriod(current, lifecycle, offer, index)
      break
    }
  }
  return current
}
