/**
 * BS17E-B — capital investments: renovation, capitalizable replacement and expansion of a club facility.
 *
 * The same boundaries as maintenance, with the capital differences made explicit:
 *   Facilities  the physical project (`FacilityDevelopmentProject`) and its engine (start / complete / cancel). No second
 *               construction engine exists; benefits are only what the engine physically changes (a renovated or replaced
 *               component, a new component) plus the contract's promised condition recorded for a new component.
 *   Governance  a `CAPITAL_EXPENDITURE` decision with the same rights model (PROPOSE / APPROVE / EXECUTE).
 *   Finance     one capacity reservation PER payment tranche (category FACILITY_DEVELOPMENT), consumed in the same transition
 *               that Finance's own economic-event adapter recognizes that tranche (commitment, recognition, payable, ledger).
 *               The payable is settled by Treasury through the single Calendar owner. No depreciation, amortization or asset
 *               accounting exists or is introduced: capital spend is recognized under the FACILITY_DEVELOPMENT category.
 *
 * Contract milestones: tranches are stated by the offer (the preset: 30 % when work starts, 70 % when the work is accepted).
 * Recognition happens at the milestone, never because a screen says "done", and never twice (idempotency key = tranche id).
 */

import { addDays, compareGameDates } from '@/domain/date'
import {
  createFacilityComponentConditionRecord,
  createFacilityDevelopmentProject,
  createFacilityFinancialBinding,
  isFacilityMaintenanceNeedOpenStatus,
} from '@/domain/facilities'
import {
  createFacilityCapitalOffer,
  deriveFacilityOperationLifecycle,
  facilityCapitalTrancheAmount,
  facilityCapitalTrancheId,
  facilityEconomyRecordsOfKind,
  facilityOperationEvents,
  facilityOperationIds,
  type FacilityCapitalInterventionType,
  type FacilityCapitalOffer,
  type FacilityCapitalTranche,
  type FacilityOperationLifecycle,
} from '@/domain/facilityEconomy'
import {
  consumeFinancialReservation,
  createAuthorizedEconomicEvent,
  getOrganizationFinanceAccounts,
  processOperatingCostEconomicEvent,
  releaseFinancialReservation,
  reserveOrganizationFinancialCommitment,
} from '@/domain/finance'
import { createGovernanceDecisionEvent, type GovernanceActor } from '@/domain/governance'
import { componentConditionAt, worstServiceabilityImpliedByCondition } from '@/domain/facilities'
import type { FacilityComponentId, FacilityDevelopmentProjectId, TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { cancelFacilityDevelopmentProject, completeFacilityDevelopmentProject, startFacilityDevelopmentProject } from '@/engine/facilities'
import { resolveClubFacilityAuthority } from '@/app/facilities/ClubFacilitiesReadModel'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'
import {
  GAME_BALANCE_CAPITAL_TRANCHES,
  GAME_BALANCE_INVESTMENT,
  GAME_BALANCE_MARKETS,
  GAME_BALANCE_OFFER_VALID_DAYS,
  GAME_BALANCE_PAYMENT_DUE_DAYS,
  GAME_BALANCE_PROVIDERS,
  gameBalanceId,
  type GameBalanceInvestmentKind,
} from '@/app/gameBalance/BdmGameBalanceV1'
import { gameBalanceCatalogEntryId, gameBalanceProviderId, teamEcosystemKind } from '@/app/gameBalance/GameBalanceBootstrap'
import {
  appendRecords,
  cancellationGovernancePatch,
  checkCapitalOfferForOperation,
  clubOperation,
  decisionEventId,
  decisionEvents,
  eventGrantIds,
  facilityLineGuard,
  facilityMaintenanceDecisionState,
  nextEvent,
  rightsAt,
  activeBodiesOf,
  userActor,
  type FacilityMaintenanceCommandResult,
  type FacilityMaintenanceReason,
} from './FacilityMaintenanceCommands'

export type FacilityInvestmentKind = GameBalanceInvestmentKind
const INTERVENTION: Readonly<Record<FacilityInvestmentKind, FacilityCapitalInterventionType>> = { RENOVATION: 'CAPITAL_RENOVATION', REPLACEMENT: 'CAPITAL_REPLACEMENT', EXPANSION: 'CAPITAL_EXPANSION' }
const KIND_OF_INTERVENTION: Readonly<Record<FacilityCapitalInterventionType, FacilityInvestmentKind>> = { CAPITAL_RENOVATION: 'RENOVATION', CAPITAL_REPLACEMENT: 'REPLACEMENT', CAPITAL_EXPANSION: 'EXPANSION' }

function result(status: FacilityMaintenanceCommandResult['status'], world: GameWorld, operationId: string | null, reasons: readonly FacilityMaintenanceReason[] = [], canonical: readonly string[] = [], decisionId: string | null = null): FacilityMaintenanceCommandResult {
  return Object.freeze({ status, world, operationId, reasons: Object.freeze([...reasons]), canonicalReasons: Object.freeze([...canonical]), decisionId })
}
const blocked = (world: GameWorld, operationId: string | null, reason: FacilityMaintenanceReason, canonical: readonly string[] = []) => result('BLOCKED', world, operationId, [reason], canonical)

export function capitalReservationEntityId(operationId: string, tranche: FacilityCapitalTranche): string { return facilityCapitalTrancheId(operationId, tranche) }

// ---------------------------------------------------------------------------------------------
// Opportunities: the physical limitation that makes an investment worth considering
// ---------------------------------------------------------------------------------------------

export interface FacilityInvestmentOption {
  readonly key: string
  readonly kind: FacilityInvestmentKind
  readonly facilityId: string
  readonly componentId: string | null
  readonly label: string
  readonly eligible: boolean
  readonly reason: 'LIMITATION_DETECTED' | 'NO_LIMITATION' | 'CONDITION_UNKNOWN' | 'ALREADY_IN_PROGRESS'
  readonly limitation: string
  readonly currentCondition: number | null
  readonly activeOperationId: string | null
}

function componentLabel(type: string, name: string | null): string { return name ?? type.toLowerCase().replaceAll('_', ' ') }

/** The component a capital project works on (null for an expansion, which adds one). */
function capitalTargetOf(project: { readonly scope: { readonly kind: string; readonly componentId?: unknown; readonly retiredComponentId?: unknown } } | undefined): string | null {
  if (project === undefined) return null
  return project.scope.kind === 'RENOVATE_COMPONENT' ? String(project.scope.componentId) : project.scope.kind === 'REPLACE_COMPONENT' ? String(project.scope.retiredComponentId) : null
}

function activeCapitalOperationFor(world: GameWorld, facilityId: string, kind: FacilityInvestmentKind, componentId: string | null): string | null {
  for (const operationId of facilityOperationIds(world)) {
    const lifecycle = deriveFacilityOperationLifecycle(facilityOperationEvents(world, operationId))
    if (lifecycle === null || lifecycle.projectId === null || lifecycle.cancelled || lifecycle.facilityId !== facilityId || lifecycle.interventionType !== INTERVENTION[kind]) continue
    const project = world.facilityDevelopmentProjectsById[lifecycle.projectId as never]
    if (project === undefined) continue
    if (capitalTargetOf(project) === componentId && lifecycle.stage !== 'WORK_COMPLETED') return operationId
  }
  return null
}

/** Every investment the club's physical situation justifies today (and, for transparency, those it does not). */
export function listFacilityInvestmentOptions(world: GameWorld, teamId: TeamId): readonly FacilityInvestmentOption[] {
  const authority = resolveClubFacilityAuthority(world, teamId)
  const options: FacilityInvestmentOption[] = []
  for (const facilityId of authority.facilityIds) {
    const components = Object.values(world.facilityComponentsById).filter((component) => component.facilityId === facilityId && component.status === 'ACTIVE' && component.closedAt === null).sort((a, b) => a.id.localeCompare(b.id))
    for (const component of components) {
      const condition = componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), component.id, world.currentDate)?.physicalCondition ?? null
      const label = componentLabel(component.type, component.name)
      for (const kind of ['RENOVATION', 'REPLACEMENT'] as const) {
        const threshold = GAME_BALANCE_INVESTMENT[kind].eligibleAtOrBelowCondition
        const activeOperationId = activeCapitalOperationFor(world, String(facilityId), kind, String(component.id))
        const reason = activeOperationId !== null ? 'ALREADY_IN_PROGRESS' as const : condition === null ? 'CONDITION_UNKNOWN' as const : condition <= threshold ? 'LIMITATION_DETECTED' as const : 'NO_LIMITATION' as const
        options.push(Object.freeze({
          key: `${kind}:${component.id}`, kind, facilityId: String(facilityId), componentId: String(component.id), label: `${kind === 'RENOVATION' ? 'Renovate' : 'Replace'} ${label}`,
          eligible: reason === 'LIMITATION_DETECTED', reason,
          limitation: condition === null ? 'Condition not recorded' : `Condition ${Math.round(condition)} (invests at or below ${threshold})`, currentCondition: condition, activeOperationId,
        }))
      }
    }
    const courts = components.filter((component) => component.type === 'PRACTICE_COURT')
    const limit = GAME_BALANCE_INVESTMENT.EXPANSION.eligibleWhenPracticeCourtsBelow
    const activeOperationId = activeCapitalOperationFor(world, String(facilityId), 'EXPANSION', null)
    const reason = activeOperationId !== null ? 'ALREADY_IN_PROGRESS' as const : courts.length < limit ? 'LIMITATION_DETECTED' as const : 'NO_LIMITATION' as const
    options.push(Object.freeze({
      key: `EXPANSION:${facilityId}`, kind: 'EXPANSION', facilityId: String(facilityId), componentId: null, label: 'Add a practice court', eligible: reason === 'LIMITATION_DETECTED', reason,
      limitation: `${courts.length} practice court(s): training capacity is limited to ${courts.length} simultaneous court(s)`, currentCondition: null, activeOperationId,
    }))
  }
  return Object.freeze(options)
}

// ---------------------------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------------------------

export interface OpenFacilityInvestmentInput { readonly teamId: TeamId; readonly facilityId: string; readonly kind: FacilityInvestmentKind; readonly componentId?: string | null; readonly actor?: GovernanceActor }

/** Opens a capital proposal: a PLANNED development project plus the operation history. The cost is UNKNOWN until offers exist. */
export function openFacilityInvestmentProposal(world: GameWorld, input: OpenFacilityInvestmentInput): FacilityMaintenanceCommandResult {
  const team = world.teams[input.teamId]
  if (team === undefined) return blocked(world, null, 'UNKNOWN_TEAM')
  if (!resolveClubFacilityAuthority(world, input.teamId).facilityIds.some((id) => String(id) === input.facilityId)) return blocked(world, null, 'NOT_CLUB_FACILITY')
  const componentId = input.kind === 'EXPANSION' ? null : (input.componentId ?? null)
  const option = listFacilityInvestmentOptions(world, input.teamId).find((item) => item.kind === input.kind && item.facilityId === input.facilityId && item.componentId === componentId)
  if (option === undefined) return blocked(world, null, input.kind === 'EXPANSION' ? 'NOT_CLUB_FACILITY' : 'COMPONENT_NOT_FOUND')
  if (option.reason === 'ALREADY_IN_PROGRESS') return blocked(world, null, 'OPERATION_ALREADY_ACTIVE')
  if (!option.eligible) return blocked(world, null, 'INVESTMENT_NOT_JUSTIFIED', [option.reason])
  const organizationId = String(team.organizationId)
  const previous = facilityEconomyRecordsOfKind(world, 'OPERATION_EVENT').filter((event) => event.kind === 'PROPOSAL_CREATED' && event.facilityId === input.facilityId && event.interventionType === INTERVENTION[input.kind] && event.projectId !== null && capitalTargetOf(world.facilityDevelopmentProjectsById[event.projectId as never]) === componentId).length
  const attempt = previous + 1
  const slug = componentId === null ? 'facility' : componentId.split(':').at(-1) ?? 'component'
  const projectId = gameBalanceId('project', organizationId, input.kind.toLowerCase(), slug, String(attempt))
  const operationId = gameBalanceId('operation', 'capital', organizationId, input.kind.toLowerCase(), slug, String(attempt))
  const spec = GAME_BALANCE_INVESTMENT[input.kind]
  const standardDays = spec.durationDays
  const component = componentId === null ? undefined : world.facilityComponentsById[componentId as never]
  const scope = input.kind === 'RENOVATION'
    ? { kind: 'RENOVATE_COMPONENT' as const, componentId: componentId!, resultingCondition: spec.promisedCondition }
    : input.kind === 'REPLACEMENT'
      ? { kind: 'REPLACE_COMPONENT' as const, retiredComponentId: componentId!, replacement: { type: component!.type, name: `${component!.name ?? component!.type} replacement (simulated)`, specification: component!.specification === null ? null : (component!.specification as never) }, resultingCondition: spec.promisedCondition }
      : { kind: 'ADD_COMPONENT' as const, components: [{ type: 'PRACTICE_COURT' as const, name: 'Second Practice Court (simulated)', specification: { kind: 'COURT' as const, isFullCourt: true, isIndoor: true, surface: 'HARDWOOD' as const, basketCount: 2 } }] }
  const project = createFacilityDevelopmentProject({
    id: projectId, organizationId, facilityId: input.facilityId, projectType: input.kind === 'RENOVATION' ? 'COMPONENT_RENOVATION' : input.kind === 'REPLACEMENT' ? 'COMPONENT_REPLACEMENT' : 'COMPONENT_ADDITION', status: 'PLANNED', scope,
    plannedStartDate: world.currentDate, plannedCompletionDate: addDays(world.currentDate, standardDays), createdAt: world.currentDate, reason: `${option.label}: ${option.limitation}`,
  })
  const withProject = updateGameWorld(world, { facilityDevelopmentProjects: [...Object.values(world.facilityDevelopmentProjectsById), project] })
  const event = nextEvent(withProject, operationId, 'PROPOSAL_CREATED', {
    organizationId, facilityId: input.facilityId, projectId, interventionType: INTERVENTION[input.kind],
    actor: input.actor ?? (team.coachId === world.userCoachId ? userActor(world) : null),
  })
  return result('APPLIED', appendRecords(withProject, [event]), operationId, ['COST_UNKNOWN'])
}

// ---------------------------------------------------------------------------------------------
// Offers (calibrated model: BDM_GAME_BALANCE_V1) and selection
// ---------------------------------------------------------------------------------------------

export function gameBalanceCapitalOfferId(operationId: string, providerSlug: string): string { return gameBalanceId('capital-offer', operationId, providerSlug) }

function capitalOperation(world: GameWorld, teamId: TeamId, operationId: string) {
  const resolved = clubOperation(world, teamId, operationId, 'CAPITAL')
  if ('reason' in resolved) return resolved
  return { ...resolved, project: world.facilityDevelopmentProjectsById[resolved.lifecycle.projectId as never] }
}

/** Issues (once, persisted, never recalculated) the preset's capital offers for an operation that has no decision yet. */
export function requestFacilityInvestmentOffers(world: GameWorld, input: { readonly teamId: TeamId; readonly operationId: string }): FacilityMaintenanceCommandResult {
  const resolved = capitalOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle } = resolved
  const team = world.teams[input.teamId]!
  if (lifecycle.decisionId !== null) return blocked(world, input.operationId, 'OFFER_LOCKED_BY_DECISION')
  const kind = teamEcosystemKind(world, team.id)
  const profile = world.organizationFinancialProfilesById[team.organizationId]
  if (kind === null || profile === undefined) return blocked(world, input.operationId, 'COST_UNKNOWN', ['NO_AUTHORIZED_COST_MODEL'])
  const market = GAME_BALANCE_MARKETS[kind]
  if (String(profile.baseCurrencyCode) !== market.currencyCode) return blocked(world, input.operationId, 'OFFER_CURRENCY_MISMATCH', ['NO_AUTHORIZED_COST_MODEL'])
  const investment = KIND_OF_INTERVENTION[lifecycle.interventionType as FacilityCapitalInterventionType]
  const spec = GAME_BALANCE_INVESTMENT[investment]
  const issued: FacilityCapitalOffer[] = []
  for (const provider of GAME_BALANCE_PROVIDERS) {
    const id = gameBalanceCapitalOfferId(input.operationId, provider.slug)
    if (world.facilityEconomyRecordsById[id] !== undefined) continue
    issued.push(createFacilityCapitalOffer({
      id, organizationId: String(team.organizationId), facilityId: lifecycle.facilityId!, projectId: lifecycle.projectId!, componentId: capitalTargetOf(resolved.project),
      interventionType: lifecycle.interventionType as FacilityCapitalInterventionType, providerId: gameBalanceProviderId(provider.slug), sourceKind: 'SIMULATED_MODEL',
      evidence: { sourceId: gameBalanceId('catalog-source', kind), catalogEntryId: gameBalanceCatalogEntryId(kind, `CAPITAL_${investment}`), modelVersion: '1' },
      amount: { currencyCode: market.currencyCode, minorUnits: Math.max(100, Math.round(market.investmentPriceMinorUnits[investment] * provider.priceFactorPermille / 1_000 / 100) * 100) }, market: market.key,
      issuedOn: world.currentDate, validFrom: world.currentDate, validUntil: addDays(world.currentDate, GAME_BALANCE_OFFER_VALID_DAYS), paymentDueDays: GAME_BALANCE_PAYMENT_DUE_DAYS,
      executionDays: Math.round(spec.durationDays * provider.capitalDurationPermille / 1_000), promisedCondition: spec.promisedCondition, tranches: GAME_BALANCE_CAPITAL_TRANCHES,
    }))
  }
  if (issued.length === 0) return result('NO_CHANGE', world, input.operationId)
  return result('APPLIED', appendRecords(world, issued), input.operationId)
}

export function capitalOffersForOperation(world: GameWorld, operationId: string): readonly FacilityCapitalOffer[] {
  const lifecycle = deriveFacilityOperationLifecycle(facilityOperationEvents(world, operationId))
  if (lifecycle === null || lifecycle.projectId === null) return []
  return facilityEconomyRecordsOfKind(world, 'CAPITAL_OFFER').filter((offer) => offer.projectId === lifecycle.projectId).sort((a, b) => a.amount.minorUnits - b.amount.minorUnits || a.id.localeCompare(b.id))
}

export function selectFacilityInvestmentOffer(world: GameWorld, input: { readonly teamId: TeamId; readonly operationId: string; readonly offerId: string }): FacilityMaintenanceCommandResult {
  const resolved = capitalOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle, organizationId } = resolved
  if (lifecycle.decisionId !== null) return blocked(world, input.operationId, 'OFFER_LOCKED_BY_DECISION')
  if (lifecycle.stage !== 'COST_UNKNOWN' && lifecycle.stage !== 'PENDING_APPROVAL') return blocked(world, input.operationId, 'OPERATION_STAGE_INVALID')
  const checked = checkCapitalOfferForOperation(world, lifecycle, organizationId, input.offerId)
  if ('reason' in checked) return blocked(world, input.operationId, checked.reason)
  if (lifecycle.selectedOfferId === input.offerId) return result('NO_CHANGE', world, input.operationId)
  return result('APPLIED', appendRecords(world, [nextEvent(world, input.operationId, 'OFFER_SELECTED', { offerId: input.offerId, actor: world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : null })]), input.operationId)
}

// ---------------------------------------------------------------------------------------------
// Finance gate: one reservation per tranche, then the binding contract
// ---------------------------------------------------------------------------------------------

export function reserveAndContractFacilityInvestment(world: GameWorld, input: { readonly teamId: TeamId; readonly operationId: string; readonly actor?: GovernanceActor }): FacilityMaintenanceCommandResult {
  const resolved = capitalOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle, organizationId } = resolved
  if (['CONTRACTED', 'WORK_IN_PROGRESS', 'WORK_COMPLETED'].includes(lifecycle.stage)) return result('NO_CHANGE', world, input.operationId)
  if (lifecycle.decisionId === null || lifecycle.selectedOfferId === null) return blocked(world, input.operationId, lifecycle.selectedOfferId === null ? 'COST_UNKNOWN' : 'DECISION_NOT_APPROVED')
  const decision = world.governanceDecisionsById[lifecycle.decisionId]
  const state = facilityMaintenanceDecisionState(world, decision)
  if (decision === undefined || state === null || !state.complete || ['REJECTED', 'VETOED', 'WITHDRAWN'].includes(state.status ?? '')) return blocked(world, input.operationId, 'DECISION_NOT_APPROVED')
  const checked = checkCapitalOfferForOperation(world, lifecycle, organizationId, lifecycle.selectedOfferId)
  if ('reason' in checked) return blocked(world, input.operationId, checked.reason)
  const { offer } = checked
  if (offer.paymentDueDays === null) return blocked(world, input.operationId, 'PAYMENT_TERMS_UNKNOWN')
  const actor = input.actor ?? (world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : undefined)
  const executors = actor === undefined ? [] : activeBodiesOf(world, actor, decision.institutionId, rightsAt(world, decision.institutionId, world.currentDate, 'CAPITAL_EXPENDITURE').executorBodyIds)
  if (actor === undefined || executors.length !== 1) return blocked(world, input.operationId, 'EXECUTE_RIGHT_UNVERIFIED')
  const executorBodyId = executors[0]!
  const executeGrantIds = eventGrantIds(world, 'EXECUTED', executorBodyId, decision.institutionId, world.currentDate, 'CAPITAL_EXPENDITURE')
  if (executeGrantIds.length === 0) return blocked(world, input.operationId, 'EXECUTE_RIGHT_UNVERIFIED')

  const persistBlocker = (reasonCode: string): FacilityMaintenanceCommandResult => {
    const last = facilityOperationEvents(world, input.operationId).at(-1)
    const persisted = last?.kind === 'FUNDING_BLOCKED' && last.reasonCode === reasonCode ? world : appendRecords(world, [nextEvent(world, input.operationId, 'FUNDING_BLOCKED', { reasonCode, offerId: offer.id, actor })])
    return result('FUNDING_BLOCKED', persisted, input.operationId, ['FUNDING_BLOCKED'], [reasonCode])
  }
  const lineGuard = facilityLineGuard(world, organizationId, offer.amount.currencyCode, offer.amount.minorUnits, `capital-tranche:${input.operationId}`, 'FACILITY_DEVELOPMENT')
  if (lineGuard !== null) return persistBlocker(lineGuard)
  let reservations = Object.values(world.financialReservationsById)
  const created: string[] = []
  let note: string | null = null
  for (const tranche of offer.tranches) {
    const reserved = reserveOrganizationFinancialCommitment(world, {
      organizationId, currency: offer.amount.currencyCode, amount: { currencyCode: offer.amount.currencyCode, minorUnits: facilityCapitalTrancheAmount(offer, tranche) }, category: 'FACILITY_DEVELOPMENT',
      sourceAuthority: 'FACILITY', sourceEntityId: capitalReservationEntityId(input.operationId, tranche), createdOn: world.currentDate, reservations,
    })
    if (reserved.outcome === 'REJECTED' || reserved.reservation === null) return persistBlocker(reserved.decision.reasonCodes[0] ?? reserved.decision.status)
    reservations = [...reserved.reservations]
    created.push(reserved.reservation.id)
    if (reserved.decision.reasonCodes.includes('BUDGET_AUTHORIZATION_NOT_MODELLED')) note = 'BUDGET_AUTHORIZATION_NOT_MODELLED'
  }
  const executedEvent = createGovernanceDecisionEvent({ id: decisionEventId(decision.id, world.currentDate, 'EXECUTED', executorBodyId), decisionId: decision.id, kind: 'EXECUTED', bodyId: executorBodyId, effectiveOn: world.currentDate, authorityGrantIds: [...executeGrantIds] })
  const reserveEvent = nextEvent(world, input.operationId, 'FUNDS_RESERVED', { reservationId: created[0]!, offerId: offer.id, actor, reasonCode: note })
  const afterReserve = appendRecords(world, [reserveEvent], { financialReservations: reservations })
  const contractEvent = nextEvent(afterReserve, input.operationId, 'CONTRACT_ACCEPTED', { offerId: offer.id, reservationId: created[0]!, actor })
  const alreadyExecuted = decisionEvents(world, decision.id).some((event) => event.kind === 'EXECUTED')
  const finalWorld = appendRecords(afterReserve, [contractEvent], alreadyExecuted ? {} : { governanceDecisionEvents: [...Object.values(afterReserve.governanceDecisionEventsById), executedEvent] })
  return result('APPLIED', finalWorld, input.operationId, [], note === null ? [] : [note], decision.id)
}

// ---------------------------------------------------------------------------------------------
// Milestone recognition through Finance's own economic-event adapter
// ---------------------------------------------------------------------------------------------

interface TrancheRecognition { readonly world: GameWorld; readonly recognitionId: string }

function recognizeTranche(world: GameWorld, lifecycle: FacilityOperationLifecycle, operationId: string, organizationId: string, teamId: TeamId, offer: FacilityCapitalOffer, tranche: FacilityCapitalTranche): TrancheRecognition | { readonly reason: FacilityMaintenanceReason } {
  const provider = world.facilityEconomyRecordsById[offer.providerId]
  if (provider === undefined || provider.recordKind !== 'PROVIDER' || offer.paymentDueDays === null) return { reason: 'PAYMENT_TERMS_UNKNOWN' }
  const trancheId = facilityCapitalTrancheId(operationId, tranche)
  const accounts = getOrganizationFinanceAccounts(world, organizationId, offer.amount.currencyCode)
  const event = createAuthorizedEconomicEvent({
    id: `capital-event:${trancheId}`, eventType: 'OPERATING_COST_RECOGNITION', sourceAuthority: 'FUTURE_COST_ENGINE', sourceEntityId: trancheId, organizationId,
    effectiveOn: world.currentDate, dueOn: addDays(world.currentDate, offer.paymentDueDays), amount: { currencyCode: offer.amount.currencyCode, minorUnits: facilityCapitalTrancheAmount(offer, tranche) },
    provenance: { kind: 'FACILITY_DEVELOPMENT_PROJECT', id: lifecycle.projectId! }, idempotencyKey: trancheId, counterparty: { kind: 'EXTERNAL', id: provider.id, label: provider.displayName },
    dimensions: { reference: { kind: 'FACILITY_CAPITAL_TRANCHE', id: trancheId } }, teamId, expenseCategory: 'FACILITY_DEVELOPMENT',
  })
  const processed = processOperatingCostEconomicEvent(world, event, { recognize: true, materializeSubledger: true, ledger: { offsetAccountId: accounts.payableControl.id, resultAccountId: accounts.expenseOperating.id } })
  if (processed.status === 'rejected' || processed.recognition === undefined) return { reason: 'INVALID_INPUT' }
  const recognition = processed.recognition
  const reservationId = Object.values(processed.world.financialReservationsById).find((item) => item.sourceAuthority === 'FACILITY' && item.sourceEntityId === trancheId)?.id
  const consumed = reservationId === undefined ? processed.world : updateGameWorld(processed.world, { financialReservations: Object.values(processed.world.financialReservationsById).map((item) => item.id === reservationId && item.status === 'OPEN' ? consumeFinancialReservation(item) : item) })
  const binding = createFacilityFinancialBinding({
    id: `facility-financial-binding:${trancheId}`, sourceKind: 'FACILITY_DEVELOPMENT_PROJECT', sourceId: lifecycle.projectId!, facilityId: lifecycle.facilityId, factKind: 'EXPENSE_RECOGNITION', factId: String(recognition.id),
    organizationId, createdOn: world.currentDate, role: `CAPITAL_${tranche.label}`,
  })
  return { world: updateGameWorld(consumed, { facilityFinancialBindings: [...Object.values(consumed.facilityFinancialBindingsById), binding] }), recognitionId: String(recognition.id) }
}

function trancheOf(offer: FacilityCapitalOffer, trigger: FacilityCapitalTranche['trigger']): FacilityCapitalTranche { return offer.tranches.find((item) => item.trigger === trigger)! }

// ---------------------------------------------------------------------------------------------
// Physical execution
// ---------------------------------------------------------------------------------------------

export function startFacilityInvestmentWork(world: GameWorld, input: { readonly teamId: TeamId; readonly operationId: string }): FacilityMaintenanceCommandResult {
  const resolved = capitalOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle, organizationId } = resolved
  if (lifecycle.stage === 'WORK_IN_PROGRESS' || lifecycle.stage === 'WORK_COMPLETED') return result('NO_CHANGE', world, input.operationId)
  if (lifecycle.stage !== 'CONTRACTED' || lifecycle.selectedOfferId === null) return blocked(world, input.operationId, 'OPERATION_STAGE_INVALID')
  const offer = world.facilityEconomyRecordsById[lifecycle.selectedOfferId]
  if (offer === undefined || offer.recordKind !== 'CAPITAL_OFFER') return blocked(world, input.operationId, 'OFFER_NOT_FOUND')
  // One physical work at a time: a maintenance repair already occupying the target component blocks the project start.
  const target = capitalTargetOf(resolved.project)
  if (target !== null) {
    const occupancy = componentPhysicalAvailabilityAt(world, target as FacilityComponentId, world.currentDate)
    if (occupancy.affectedMaintenanceActionIds.length > 0) return blocked(world, input.operationId, 'PHYSICAL_WORK_CONFLICT')
  }
  let started
  try { started = startFacilityDevelopmentProject(world, lifecycle.projectId as FacilityDevelopmentProjectId, world.currentDate) } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return blocked(world, input.operationId, message.includes('PHYSICAL_WORK_CONFLICT') ? 'PHYSICAL_WORK_CONFLICT' : 'PROJECT_NOT_STARTABLE', [message])
  }
  const recognized = recognizeTranche(started.world, lifecycle, input.operationId, organizationId, input.teamId, offer, trancheOf(offer, 'WORK_STARTED'))
  if ('reason' in recognized) return blocked(world, input.operationId, recognized.reason)
  const actor = world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : null
  const workEvent = nextEvent(recognized.world, input.operationId, 'WORK_STARTED', { projectId: lifecycle.projectId, actor })
  const withWork = appendRecords(recognized.world, [workEvent])
  const factEvent = nextEvent(withWork, input.operationId, 'COST_FACT_AUTHORIZED', { recognitionId: recognized.recognitionId, offerId: offer.id, actor, reasonCode: trancheOf(offer, 'WORK_STARTED').label })
  return result('APPLIED', appendRecords(withWork, [factEvent]), input.operationId)
}

/** Accepts the finished works: the physical completion by the project engine plus the acceptance milestone for Finance. */
export function acceptFacilityInvestmentWork(world: GameWorld, input: { readonly teamId: TeamId; readonly operationId: string; readonly actor?: GovernanceActor }): FacilityMaintenanceCommandResult {
  const resolved = capitalOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle, organizationId } = resolved
  if (lifecycle.stage === 'WORK_COMPLETED') return result('NO_CHANGE', world, input.operationId)
  if (lifecycle.stage !== 'WORK_IN_PROGRESS' || lifecycle.selectedOfferId === null) return blocked(world, input.operationId, 'OPERATION_STAGE_INVALID')
  const offer = world.facilityEconomyRecordsById[lifecycle.selectedOfferId]
  const project = world.facilityDevelopmentProjectsById[lifecycle.projectId as never]
  if (offer === undefined || offer.recordKind !== 'CAPITAL_OFFER' || project === undefined || project.actualStartDate === null) return blocked(world, input.operationId, 'OFFER_NOT_FOUND')
  if (offer.executionDays !== null && compareGameDates(world.currentDate, addDays(project.actualStartDate, offer.executionDays)) < 0) return blocked(world, input.operationId, 'WORK_NOT_YET_COMPLETABLE')
  const acceptor = input.actor ?? (world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : undefined)
  const decision = lifecycle.decisionId === null ? undefined : world.governanceDecisionsById[lifecycle.decisionId]
  const bodies = acceptor === undefined || decision === undefined ? [] : activeBodiesOf(world, acceptor, decision.institutionId, rightsAt(world, decision.institutionId, world.currentDate, 'CAPITAL_EXPENDITURE').executorBodyIds)
  if (bodies.length === 0) return blocked(world, input.operationId, 'EXECUTE_RIGHT_UNVERIFIED')
  let completed
  try { completed = completeFacilityDevelopmentProject(world, project.id, world.currentDate) } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return blocked(world, input.operationId, message.includes('PHASES') ? 'PHYSICAL_PHASES_INCOMPLETE' : message.includes('CONFLICT') ? 'PHYSICAL_WORK_CONFLICT' : 'PROJECT_NOT_STARTABLE', [message])
  }
  let current = completed.world
  // A new component has no condition history; the contract promised its condition, so that is the first recorded observation.
  const promised = offer.promisedCondition
  if (completed.outcome.createdComponentIds.length > 0 && promised !== null) {
    const records = completed.outcome.createdComponentIds.map((componentId) => createFacilityComponentConditionRecord({
      id: `facility-component-condition:${componentId}:${world.currentDate}:project:${project.id}`, componentId, effectiveFrom: world.currentDate,
      physicalCondition: promised, serviceability: worstServiceabilityImpliedByCondition(promised),
    }))
    current = updateGameWorld(current, { facilityComponentConditionRecords: [...Object.values(current.facilityComponentConditionRecordsById), ...records] })
  }
  const recognized = recognizeTranche(current, lifecycle, input.operationId, organizationId, input.teamId, offer, trancheOf(offer, 'WORK_ACCEPTED'))
  if ('reason' in recognized) return blocked(world, input.operationId, recognized.reason)
  const actor = acceptor ?? null
  const completedEvent = nextEvent(recognized.world, input.operationId, 'WORK_COMPLETED', { projectId: lifecycle.projectId, actor, reasonCode: 'ACCEPTED' })
  const withCompleted = appendRecords(recognized.world, [completedEvent])
  const factEvent = nextEvent(withCompleted, input.operationId, 'COST_FACT_AUTHORIZED', { recognitionId: recognized.recognitionId, offerId: offer.id, actor, reasonCode: trancheOf(offer, 'WORK_ACCEPTED').label })
  return result('APPLIED', appendRecords(withCompleted, [factEvent]), input.operationId)
}

// ---------------------------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------------------------

/**
 * Cancels an investment that is not finished. Recognized tranches (and their payables and payments) are legitimate Finance
 * facts and stay exactly as they are; only OPEN reservations are released through Finance's own release. Once the works have
 * started, cancellation needs an approved linked cancellation decision. A finished investment cannot be cancelled.
 */
export function cancelFacilityInvestment(world: GameWorld, input: { readonly teamId: TeamId; readonly operationId: string; readonly actor?: GovernanceActor; readonly bodyId?: string }): FacilityMaintenanceCommandResult {
  const resolved = capitalOperation(world, input.teamId, input.operationId)
  if ('reason' in resolved) return blocked(world, input.operationId, resolved.reason)
  const { lifecycle } = resolved
  if (lifecycle.stage === 'WORK_COMPLETED') return blocked(world, input.operationId, 'ECONOMIC_FACTS_RECORDED_CANNOT_CANCEL')
  const actor = input.actor ?? (world.teams[input.teamId]?.coachId === world.userCoachId ? userActor(world) : undefined)
  const governance = cancellationGovernancePatch(world, lifecycle, actor, input.bodyId)
  if ('reason' in governance) return blocked(world, input.operationId, governance.reason)
  const project = world.facilityDevelopmentProjectsById[lifecycle.projectId as never]
  if (project === undefined) return blocked(world, input.operationId, 'PROJECT_NOT_FOUND')
  let current = updateGameWorld(world, governance.patch)
  if (project.status === 'PLANNED' || project.status === 'APPROVED' || project.status === 'SCHEDULED' || project.status === 'IN_PROGRESS' || project.status === 'PAUSED') {
    try { current = cancelFacilityDevelopmentProject(current, project.id, world.currentDate).world } catch (error) { return blocked(world, input.operationId, 'PROJECT_NOT_STARTABLE', [error instanceof Error ? error.message : '']) }
  }
  const open = Object.values(current.financialReservationsById).filter((item) => item.sourceAuthority === 'FACILITY' && item.status === 'OPEN' && item.sourceEntityId.startsWith(`capital-tranche:${input.operationId}:`))
  if (open.length > 0) current = updateGameWorld(current, { financialReservations: Object.values(current.financialReservationsById).map((item) => open.some((candidate) => candidate.id === item.id) ? releaseFinancialReservation(item) : item) })
  const event = nextEvent(current, input.operationId, 'CANCELLED', { actor: actor ?? null, reasonCode: lifecycle.stage })
  return result('APPLIED', appendRecords(current, [event]), input.operationId)
}

export { isFacilityMaintenanceNeedOpenStatus, type FacilityComponentId }
