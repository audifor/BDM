import { parseGameDate, type GameDate } from '@/domain/date'
import { expenseRecognitionIdFromString, organizationIdFromString, type OrganizationId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getCashBalancesByCurrency, getOpenPayables } from './CashFlowQueries'
import { createCurrencyCode, createMoney, type CurrencyCode, type FinancialSource, type Money } from './FinancialLedger'
import { getExpenseRecognitionsAsOfDate, getOutstandingCommitments } from './RecognitionQueries'
import type { Payable } from './Treasury'
import {
  createFinancialReservation,
  financialReservationId,
  getOpenFinancialReservations,
  recordFinancialReservation,
  type FinancialReservation,
  type FinancialReservationSourceAuthority,
} from './FinancialReservations'

/**
 * The canonical financial decision statuses. `INSUFFICIENT_AUTHORIZED_HEADROOM` is reserved for a future
 * budget-authorization milestone: budgets are informational today (`BUDGET_AUTHORIZATION_NOT_MODELLED`),
 * so this status is never emitted yet.
 */
export const FINANCIAL_COMMITMENT_DECISION_STATUSES = [
  'AFFORDABLE_NOW',
  'RESERVED_CAPACITY_CONFLICT',
  'INSUFFICIENT_LIQUIDITY',
  'REQUIRES_FINANCING',
  'INSUFFICIENT_AUTHORIZED_HEADROOM',
  'CURRENCY_MISMATCH',
  'FINANCE_PROFILE_UNAVAILABLE',
] as const

export type FinancialCommitmentDecisionStatus = typeof FINANCIAL_COMMITMENT_DECISION_STATUSES[number]

/** Machine-readable explanations. Every status is also a reason code, plus the explicit budget caveat. */
export const FINANCIAL_COMMITMENT_DECISION_REASONS = [
  'AFFORDABLE_NOW',
  'RESERVED_CAPACITY_CONFLICT',
  'INSUFFICIENT_LIQUIDITY',
  'REQUIRES_FINANCING',
  'INSUFFICIENT_AUTHORIZED_HEADROOM',
  'CURRENCY_MISMATCH',
  'FINANCE_PROFILE_UNAVAILABLE',
  'BUDGET_AUTHORIZATION_NOT_MODELLED',
] as const

export type FinancialCommitmentReasonCode = typeof FINANCIAL_COMMITMENT_DECISION_REASONS[number]

/**
 * Budgets exist as planning records only; no Organization budget is enforced by any consumer, so a
 * decision must never imply that a budget authorized the spend.
 */
export const BUDGET_AUTHORIZATION_NOT_MODELLED = 'BUDGET_AUTHORIZATION_NOT_MODELLED' as const

export type FinancialObligationKind = 'PAYABLE' | 'PROGRAMMATIC_COMMITMENT' | 'RECOGNIZED_WITHOUT_PAYABLE'

/** One already-incurred claim on cash. Cash, obligations and reservations stay separate concepts. */
export interface FinancialObligationComponent {
  readonly kind: FinancialObligationKind
  readonly id: string
  readonly category: string | null
  readonly remainingMinorUnits: number
  readonly dueOn: GameDate | null
}

export interface FinancialCapacitySnapshot {
  readonly organizationId: OrganizationId
  readonly currencyCode: CurrencyCode
  readonly asOfDate: GameDate
  readonly unrestrictedCashMinorUnits: number
  readonly restrictedCashMinorUnits: number
  readonly payablesMinorUnits: number
  readonly commitmentsMinorUnits: number
  readonly recognizedWithoutPayableMinorUnits: number
  readonly obligationsMinorUnits: number
  readonly openReservationsMinorUnits: number
  /** Unrestricted cash minus already-incurred obligations. May be negative; it is never clamped. */
  readonly capacityBeforeReservationsMinorUnits: number
  /** Capacity a new commitment may actually use: capacity before reservations minus OPEN reservations. */
  readonly availableCapacityMinorUnits: number
  readonly obligations: readonly FinancialObligationComponent[]
  readonly reservations: readonly FinancialReservation[]
}

export interface FinancialCommitmentEvaluation {
  readonly asOfDate: GameDate
  readonly organizationId: OrganizationId
  /** The Organization's canonical currency, or null when no financial profile exists. */
  readonly currencyCode: CurrencyCode | null
  readonly requestedAmount: Money
  readonly status: FinancialCommitmentDecisionStatus
  readonly reasons: readonly FinancialCommitmentReasonCode[]
  readonly affordable: boolean
  readonly requiresFinancing: boolean
  readonly reservationConflict: boolean
  readonly fundingGapMinorUnits: number
  readonly reservationBlockedMinorUnits: number
  readonly existingCommitments: readonly FinancialObligationComponent[]
  readonly requestedCategoryCommittedMinorUnits: number | null
  /** Full capacity context for the decision currency, or null when no currency could be resolved. */
  readonly capacity: FinancialCapacitySnapshot | null
  /** Always null today: no budget authorization exists, so there is no authorized headroom to report. */
  readonly availableAuthorizedHeadroomMinorUnits: number | null
  readonly budgetAuthorization: typeof BUDGET_AUTHORIZATION_NOT_MODELLED
}

export interface EvaluateFinancialCommitmentInput {
  readonly organizationId: OrganizationId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly category?: string | null
  readonly asOfDate?: GameDate | string
  /** Excludes one existing reservation, so a reserved claim is not counted twice against itself. */
  readonly excludeReservationId?: string
}

/**
 * Currency-scoped capacity. Returns null when the Organization has no financial profile and no explicit
 * currency was supplied: without a canonical currency there is nothing to evaluate in.
 */
export function getFinancialCapacitySnapshot(
  world: GameWorld,
  organizationIdInput: OrganizationId | string,
  currencyCodeInput?: string,
  asOfDateInput: GameDate | string = world.currentDate,
  options: { readonly excludeReservationId?: string } = {},
): FinancialCapacitySnapshot | null {
  const organizationId = organizationIdFromString(organizationIdInput)
  const profile = world.organizationFinancialProfilesById[organizationId]
  const currencyCode = currencyCodeInput === undefined ? profile?.baseCurrencyCode : createCurrencyCode(currencyCodeInput)
  if (currencyCode === undefined) return null
  const asOfDate = parseGameDate(asOfDateInput)
  const cash = getCashBalancesByCurrency(world, organizationId, asOfDate).find((item) => item.currencyCode === currencyCode)
  const obligations = getFinancialObligationComponents(world, organizationId, currencyCode, asOfDate)
  const obligationsMinorUnits = sum(obligations.map((item) => item.remainingMinorUnits))
  const reservations = getOpenFinancialReservations(world, organizationId, currencyCode, asOfDate)
    .filter((reservation) => options.excludeReservationId === undefined || String(reservation.id) !== String(options.excludeReservationId))
  const openReservationsMinorUnits = sum(reservations.map((reservation) => reservation.amount.minorUnits))
  const unrestrictedCashMinorUnits = cash?.unrestrictedCashMinorUnits ?? 0
  const capacityBeforeReservationsMinorUnits = unrestrictedCashMinorUnits - obligationsMinorUnits
  return Object.freeze({
    organizationId,
    currencyCode,
    asOfDate,
    unrestrictedCashMinorUnits,
    restrictedCashMinorUnits: cash?.restrictedCashMinorUnits ?? 0,
    payablesMinorUnits: sum(obligations.filter((item) => item.kind === 'PAYABLE').map((item) => item.remainingMinorUnits)),
    commitmentsMinorUnits: sum(obligations.filter((item) => item.kind === 'PROGRAMMATIC_COMMITMENT').map((item) => item.remainingMinorUnits)),
    recognizedWithoutPayableMinorUnits: sum(obligations.filter((item) => item.kind === 'RECOGNIZED_WITHOUT_PAYABLE').map((item) => item.remainingMinorUnits)),
    obligationsMinorUnits,
    openReservationsMinorUnits,
    capacityBeforeReservationsMinorUnits,
    availableCapacityMinorUnits: capacityBeforeReservationsMinorUnits - openReservationsMinorUnits,
    obligations,
    reservations,
  })
}

/**
 * Already-incurred claims on one currency's cash: open payables, outstanding commitment remainders and
 * expense recognitions that never reached a payable subledger. Receivables and expected income are
 * deliberately absent — expectation is not capacity.
 */
export function getFinancialObligationComponents(
  world: GameWorld,
  organizationIdInput: OrganizationId | string,
  currencyCodeInput: string,
  asOfDateInput: GameDate | string = world.currentDate,
): readonly FinancialObligationComponent[] {
  const organizationId = organizationIdFromString(organizationIdInput)
  const currencyCode = currencyCodeInput
  const asOfDate = parseGameDate(asOfDateInput)
  const components: FinancialObligationComponent[] = []
  for (const payable of getOpenPayables(world, organizationId, asOfDate)) {
    if (payable.obligation.amount.currencyCode !== currencyCode) continue
    components.push(Object.freeze({ kind: 'PAYABLE', id: String(payable.obligation.id), category: payableCategory(world, payable.obligation), remainingMinorUnits: payable.remainingMinorUnits, dueOn: payable.obligation.dueOn }))
  }
  for (const outstanding of getOutstandingCommitments(world, organizationId, asOfDate)) {
    if (outstanding.commitment.amount.currencyCode !== currencyCode) continue
    components.push(Object.freeze({ kind: 'PROGRAMMATIC_COMMITMENT', id: String(outstanding.commitment.id), category: outstanding.commitment.category, remainingMinorUnits: outstanding.remaining.minorUnits, dueOn: outstanding.commitment.dueOn }))
  }
  for (const recognition of getExpenseRecognitionsAsOfDate(world, organizationId, asOfDate)) {
    if (recognition.amount.currencyCode !== currencyCode || recognition.payableId !== null) continue
    components.push(Object.freeze({ kind: 'RECOGNIZED_WITHOUT_PAYABLE', id: String(recognition.id), category: recognition.category, remainingMinorUnits: recognition.amount.minorUnits, dueOn: null }))
  }
  return Object.freeze(components.sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)))
}

/**
 * The single canonical affordability decision. Consumers must not re-derive affordability from cash
 * alone: cash, incurred obligations and reserved capacity are three different questions.
 */
export function evaluateFinancialCommitment(world: GameWorld, input: EvaluateFinancialCommitmentInput): FinancialCommitmentEvaluation {
  const organizationId = organizationIdFromString(input.organizationId)
  const amount = createMoney(input.amount)
  if (amount.minorUnits <= 0) throw new RangeError('Financial commitment amount must be greater than zero')
  const asOfDate = parseGameDate(input.asOfDate ?? world.currentDate)
  const category = input.category === undefined || input.category === null ? null : input.category
  if (category !== null && category.trim().length === 0) throw new TypeError('Financial commitment category must be non-empty')
  const profile = world.organizationFinancialProfilesById[organizationId]
  if (profile === undefined) {
    return evaluation({ asOfDate, organizationId, currencyCode: null, requestedAmount: amount, status: 'FINANCE_PROFILE_UNAVAILABLE', reasons: ['FINANCE_PROFILE_UNAVAILABLE', BUDGET_AUTHORIZATION_NOT_MODELLED], existingCommitments: [], requestedCategoryCommittedMinorUnits: null })
  }
  if (amount.currencyCode !== profile.baseCurrencyCode) {
    return evaluation({ asOfDate, organizationId, currencyCode: profile.baseCurrencyCode, requestedAmount: amount, status: 'CURRENCY_MISMATCH', reasons: ['CURRENCY_MISMATCH', BUDGET_AUTHORIZATION_NOT_MODELLED], existingCommitments: [], requestedCategoryCommittedMinorUnits: null })
  }
  const capacity = getFinancialCapacitySnapshot(world, organizationId, profile.baseCurrencyCode, asOfDate, { excludeReservationId: input.excludeReservationId })!
  const existingCommitments = capacity.obligations
  const requestedCategoryCommittedMinorUnits = category === null ? null : sum(existingCommitments.filter((item) => item.category === category).map((item) => item.remainingMinorUnits))
  const shared = { asOfDate, organizationId, currencyCode: capacity.currencyCode, requestedAmount: amount, capacity, existingCommitments, requestedCategoryCommittedMinorUnits }
  if (amount.minorUnits <= capacity.availableCapacityMinorUnits) {
    return evaluation({ ...shared, status: 'AFFORDABLE_NOW', reasons: ['AFFORDABLE_NOW', BUDGET_AUTHORIZATION_NOT_MODELLED] })
  }
  if (amount.minorUnits <= capacity.capacityBeforeReservationsMinorUnits) {
    return evaluation({ ...shared, status: 'RESERVED_CAPACITY_CONFLICT', reasons: ['RESERVED_CAPACITY_CONFLICT', BUDGET_AUTHORIZATION_NOT_MODELLED], reservationBlockedMinorUnits: amount.minorUnits - capacity.availableCapacityMinorUnits })
  }
  return evaluation({ ...shared, status: 'INSUFFICIENT_LIQUIDITY', reasons: ['INSUFFICIENT_LIQUIDITY', 'REQUIRES_FINANCING', BUDGET_AUTHORIZATION_NOT_MODELLED], requiresFinancing: true, fundingGapMinorUnits: amount.minorUnits - capacity.capacityBeforeReservationsMinorUnits })
}

export interface ReserveFinancialCapacityInput {
  readonly organizationId: OrganizationId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly category?: string | null
  readonly sourceAuthority: FinancialReservationSourceAuthority
  readonly sourceEntityId: string
  readonly createdOn?: GameDate | string
  readonly dueOn?: GameDate | string | null
  readonly provenance?: FinancialSource
}

export type ReserveFinancialCapacityStatus = 'RESERVED' | 'ALREADY_RESERVED' | 'REJECTED'

/** Why a reservation request did not create or re-confirm an OPEN claim. */
export const FINANCIAL_RESERVATION_REJECTION_REASONS = [
  'FINANCE_PROFILE_UNAVAILABLE',
  'CURRENCY_MISMATCH',
  'RESERVED_CAPACITY_CONFLICT',
  'INSUFFICIENT_LIQUIDITY',
  'FINANCIAL_RESERVATION_PROVENANCE_RESOLVED',
  'FINANCIAL_RESERVATION_PROVENANCE_CONFLICT',
] as const

export type FinancialReservationRejectionReason = typeof FINANCIAL_RESERVATION_REJECTION_REASONS[number]

export interface ReserveFinancialCapacityResult {
  readonly status: ReserveFinancialCapacityStatus
  readonly world: GameWorld
  readonly reservation: FinancialReservation | null
  readonly evaluation: FinancialCommitmentEvaluation
  readonly rejectionReason: FinancialReservationRejectionReason | null
}

/**
 * The canonical authority for claiming capacity. Reservation itself moves no money: it only removes the
 * claimed amount from the capacity later decisions may use. Repeating the identical request is
 * idempotent, and a consumed/released provenance never reserves again.
 */
export function reserveFinancialCapacity(world: GameWorld, input: ReserveFinancialCapacityInput): ReserveFinancialCapacityResult {
  const createdOn = parseGameDate(input.createdOn ?? world.currentDate)
  const amount = createMoney(input.amount)
  if (amount.minorUnits <= 0) throw new RangeError('Financial reservation amount must be greater than zero')
  const category = input.category === undefined || input.category === null ? null : input.category
  const reservationId = financialReservationId(input.sourceAuthority, input.sourceEntityId)
  const evaluation = (excludeReservationId?: string): FinancialCommitmentEvaluation => evaluateFinancialCommitment(world, { organizationId: input.organizationId, amount, category, asOfDate: createdOn, ...(excludeReservationId === undefined ? {} : { excludeReservationId }) })
  const existing = world.financialReservationsById[reservationId]
  if (existing !== undefined) {
    const sameRequest = existing.organizationId === String(input.organizationId) && existing.amount.minorUnits === amount.minorUnits && existing.currencyCode === amount.currencyCode && existing.category === category
    if (!sameRequest) return Object.freeze({ status: 'REJECTED' as const, world, reservation: existing, evaluation: evaluation(String(existing.id)), rejectionReason: 'FINANCIAL_RESERVATION_PROVENANCE_CONFLICT' as const })
    if (existing.status !== 'OPEN') return Object.freeze({ status: 'REJECTED' as const, world, reservation: existing, evaluation: evaluation(String(existing.id)), rejectionReason: 'FINANCIAL_RESERVATION_PROVENANCE_RESOLVED' as const })
    return Object.freeze({ status: 'ALREADY_RESERVED' as const, world, reservation: existing, evaluation: evaluation(String(existing.id)), rejectionReason: null })
  }
  const decision = evaluation()
  if (decision.status !== 'AFFORDABLE_NOW') {
    return Object.freeze({ status: 'REJECTED' as const, world, reservation: null, evaluation: decision, rejectionReason: rejectionReasonFor(decision.status) })
  }
  const reservation = createFinancialReservation({ id: reservationId, organizationId: decision.organizationId, currencyCode: decision.currencyCode ?? amount.currencyCode, amount, category, sourceAuthority: input.sourceAuthority, sourceEntityId: input.sourceEntityId, createdOn, dueOn: input.dueOn ?? null, ...(input.provenance === undefined ? {} : { provenance: input.provenance }) })
  const recorded = recordFinancialReservation(world, reservation)
  return Object.freeze({ status: 'RESERVED' as const, world: recorded.world, reservation: recorded.reservation, evaluation: decision, rejectionReason: null })
}

function rejectionReasonFor(status: FinancialCommitmentDecisionStatus): FinancialReservationRejectionReason {
  if (status === 'FINANCE_PROFILE_UNAVAILABLE' || status === 'CURRENCY_MISMATCH' || status === 'RESERVED_CAPACITY_CONFLICT' || status === 'INSUFFICIENT_LIQUIDITY') return status
  throw new Error(`Financial commitment status ${status} cannot reject a reservation`)
}

/** Payables carry no category of their own; the linked expense recognition is the authoritative label. */
function payableCategory(world: GameWorld, payable: Payable): string | null {
  if (payable.provenance.kind !== 'EXPENSE_RECOGNITION' || payable.provenance.id === undefined) return null
  return world.expenseRecognitionsById[expenseRecognitionIdFromString(payable.provenance.id)]?.category ?? null
}

interface EvaluationInput {
  readonly asOfDate: GameDate
  readonly organizationId: OrganizationId
  readonly currencyCode: CurrencyCode | null
  readonly requestedAmount: Money
  readonly status: FinancialCommitmentDecisionStatus
  readonly reasons: readonly FinancialCommitmentReasonCode[]
  readonly existingCommitments: readonly FinancialObligationComponent[]
  readonly requestedCategoryCommittedMinorUnits: number | null
  readonly capacity?: FinancialCapacitySnapshot
  readonly requiresFinancing?: boolean
  readonly fundingGapMinorUnits?: number
  readonly reservationBlockedMinorUnits?: number
}

function evaluation(input: EvaluationInput): FinancialCommitmentEvaluation {
  return Object.freeze({
    asOfDate: input.asOfDate,
    organizationId: input.organizationId,
    currencyCode: input.currencyCode,
    requestedAmount: input.requestedAmount,
    status: input.status,
    reasons: Object.freeze([...input.reasons]),
    affordable: input.status === 'AFFORDABLE_NOW',
    requiresFinancing: input.requiresFinancing ?? false,
    reservationConflict: input.status === 'RESERVED_CAPACITY_CONFLICT',
    fundingGapMinorUnits: input.fundingGapMinorUnits ?? 0,
    reservationBlockedMinorUnits: input.reservationBlockedMinorUnits ?? 0,
    existingCommitments: input.existingCommitments,
    requestedCategoryCommittedMinorUnits: input.requestedCategoryCommittedMinorUnits,
    availableAuthorizedHeadroomMinorUnits: null,
    budgetAuthorization: BUDGET_AUTHORIZATION_NOT_MODELLED,
    capacity: input.capacity ?? null,
  })
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
