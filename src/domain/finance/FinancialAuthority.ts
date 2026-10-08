import { parseGameDate, type GameDate } from '@/domain/date'
import { organizationIdFromString, type OrganizationId } from '@/domain/ids'
import {
  createCurrencyCode,
  createMoney,
  type CurrencyCode,
  type Money,
  type OrganizationFinancialProfile,
} from './FinancialLedger'

export type FinancialReservationStatus = 'OPEN' | 'CONSUMED' | 'RELEASED'

export type FinancialDecisionStatus =
  | 'AFFORDABLE_NOW'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'INSUFFICIENT_AUTHORIZED_HEADROOM'
  | 'RESERVED_CAPACITY_CONFLICT'
  | 'CURRENCY_MISMATCH'
  | 'FINANCE_PROFILE_UNAVAILABLE'
  | 'REQUIRES_FINANCING'

export type FinancialReasonCode =
  | 'AFFORDABLE_NOW'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'INSUFFICIENT_AUTHORIZED_HEADROOM'
  | 'RESERVED_CAPACITY_CONFLICT'
  | 'CURRENCY_MISMATCH'
  | 'FINANCE_PROFILE_UNAVAILABLE'
  | 'REQUIRES_FINANCING'
  | 'BUDGET_AUTHORIZATION_NOT_MODELLED'
  | 'AUTHORIZATION_OUT_OF_PERIOD'

export interface FinancialAuthorizationReference {
  readonly state: 'ACTIVE' | 'NOT_PROVISIONED' | 'OUT_OF_PERIOD'
  readonly budgetId?: string
}

/**
 * `FinancialReservation` protects available financial capacity for a business operation that has been
 * evaluated but not yet converted into an authoritative obligation. It is deliberately NOT a ledger
 * fact, an expense, a payable or cash. Entering the obligation remains a `FinancialCommitment` concern.
 */
export interface FinancialReservation {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly currency: CurrencyCode
  readonly amount: Money
  readonly sourceAuthority: string
  readonly sourceEntityId: string
  readonly createdOn: GameDate
  readonly status: FinancialReservationStatus
}

export interface FinancialReservationProvenance {
  readonly organizationId: OrganizationId | string
  readonly sourceAuthority: string
  readonly sourceEntityId: string
}

export interface FinancialCommitmentLiquidity {
  readonly availableCash: Money | null
  readonly existingCommitments: readonly Money[]
  readonly committedCapacity: Money
  readonly reservedCapacity: Money
  readonly availableCapacity: Money | null
  readonly fundingGap: Money | null
}

export interface FinancialCommitmentDecision {
  readonly status: FinancialDecisionStatus
  readonly organizationId: OrganizationId
  readonly currency: CurrencyCode
  readonly amount: Money
  readonly liquidity: FinancialCommitmentLiquidity
  readonly availableAuthorizedHeadroom: Money | null
  readonly reservationState: readonly FinancialReservation[]
  readonly reasonCodes: readonly FinancialReasonCode[]
}

export interface EvaluateFinancialCommitmentInput {
  readonly organizationFinancialProfile?: OrganizationFinancialProfile | null
  readonly organizationId: OrganizationId | string
  readonly currency?: string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly currentCash?: Money | { readonly currencyCode: string; readonly minorUnits: number } | null
  readonly existingCommitments?: readonly (Money | { readonly currencyCode: string; readonly minorUnits: number })[]
  /** Explicit authorization limit. Informational budgets must not be passed here. */
  readonly authorizedHeadroom?: Money | { readonly currencyCode: string; readonly minorUnits: number } | null
  readonly activeReservations?: readonly FinancialReservation[]
  readonly commitmentCategory?: string
  /**
   * Canonical authorization resolution result. When no authorization is in effect the decision keeps
   * `BUDGET_AUTHORIZATION_NOT_MODELLED`; an approved budget that is simply not in effect for the
   * effective date additionally reports `AUTHORIZATION_OUT_OF_PERIOD`.
   */
  readonly authorization?: FinancialAuthorizationReference | null
}

export type FinancialReservationOutcome = 'CREATED' | 'REPLAYED' | 'REJECTED'

export interface ReserveFinancialCommitmentInput extends EvaluateFinancialCommitmentInput {
  readonly sourceAuthority: string
  readonly sourceEntityId: string
  readonly createdOn: GameDate | string
  readonly reservationId?: string
}

export interface FinancialReservationResult {
  readonly outcome: FinancialReservationOutcome
  readonly idempotent: boolean
  readonly reservation: FinancialReservation | null
  /** Canonical reservation collection after the operation; unchanged for REPLAYED and REJECTED. */
  readonly reservations: readonly FinancialReservation[]
  readonly decision: FinancialCommitmentDecision
}

export function createFinancialReservation(input: {
  readonly id: string
  readonly organizationId: OrganizationId | string
  readonly currency: string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly sourceAuthority: string
  readonly sourceEntityId: string
  readonly createdOn: GameDate | string
  readonly status?: FinancialReservationStatus
}): FinancialReservation {
  const currency = createCurrencyCode(input.currency)
  const amount = normalizeMoney(input.amount, 'Financial reservation amount')
  if (amount.currencyCode !== currency) throw new RangeError('Financial reservation amount must use the reservation currency')
  const status = input.status ?? 'OPEN'
  assertReservationStatus(status)
  return Object.freeze({
    id: nonEmptyText(input.id, 'Financial reservation id'),
    organizationId: organizationIdFromString(input.organizationId),
    currency,
    amount,
    sourceAuthority: nonEmptyText(input.sourceAuthority, 'Financial reservation source authority'),
    sourceEntityId: nonEmptyText(input.sourceEntityId, 'Financial reservation source entity id'),
    createdOn: parseGameDate(input.createdOn),
    status,
  })
}

/** Stable business-operation identity. The same provenance must never consume capacity twice. */
export function financialReservationProvenanceKey(provenance: FinancialReservationProvenance | FinancialReservation): string {
  const organizationId = organizationIdFromString(provenance.organizationId)
  const sourceAuthority = nonEmptyText(provenance.sourceAuthority, 'Financial reservation source authority')
  const sourceEntityId = nonEmptyText(provenance.sourceEntityId, 'Financial reservation source entity id')
  return `${organizationId}|${sourceAuthority}|${sourceEntityId}`
}

/** Deterministic reservation id derived from provenance; no random source is involved. */
export function financialReservationIdForProvenance(provenance: FinancialReservationProvenance | FinancialReservation): string {
  return `reservation:${financialReservationProvenanceKey(provenance)}`
}

export function findFinancialReservationByProvenance(
  reservations: readonly FinancialReservation[],
  provenance: FinancialReservationProvenance | FinancialReservation
): FinancialReservation | null {
  const key = financialReservationProvenanceKey(provenance)
  const matches = reservations.filter((reservation) => financialReservationProvenanceKey(reservation) === key)
  if (matches.length === 0) return null
  return matches.find((reservation) => reservation.status === 'OPEN') ?? matches[matches.length - 1]!
}

export function isFinancialReservationActive(reservation: FinancialReservation): boolean {
  return reservation.status === 'OPEN'
}

/** Only OPEN reservations consume capacity; CONSUMED and RELEASED never do. */
export function sumReservedCapacity(
  reservations: readonly FinancialReservation[],
  organizationId: OrganizationId | string,
  currency: string
): Money {
  const organization = organizationIdFromString(organizationId)
  const currencyCode = createCurrencyCode(currency)
  const total = reservations
    .filter((reservation) => reservation.status === 'OPEN' && reservation.organizationId === organization && reservation.currency === currencyCode)
    .reduce((sum, reservation) => sum + reservation.amount.minorUnits, 0)
  if (!Number.isSafeInteger(total)) throw new RangeError('Reserved capacity total exceeds safe integer range')
  return createMoney({ currencyCode, minorUnits: total })
}

/**
 * Consumes an OPEN reservation, optionally partially. Terminal states are deterministic no-ops so a
 * repeated transition can never adjust available capacity twice.
 */
export function consumeFinancialReservation(
  reservation: FinancialReservation,
  input?: { readonly amount?: Money | { readonly currencyCode: string; readonly minorUnits: number } }
): FinancialReservation {
  const consumedAmount = input?.amount === undefined ? reservation.amount : normalizeMoney(input.amount, 'Consumed reservation amount')
  if (consumedAmount.currencyCode !== reservation.currency) throw new RangeError('Consumed reservation must use the same currency as the reservation')
  if (consumedAmount.minorUnits > reservation.amount.minorUnits) throw new RangeError('Consumed reservation amount cannot exceed the original reservation amount')
  if (reservation.status === 'OPEN') return Object.freeze({ ...reservation, amount: consumedAmount, status: 'CONSUMED' })
  if (reservation.status === 'CONSUMED' && consumedAmount.minorUnits !== reservation.amount.minorUnits) {
    throw new RangeError('Consumed reservation replay must use the original consumed amount')
  }
  return reservation
}

/** Releases an OPEN reservation. RELEASED and CONSUMED are terminal and never restore consumed capacity. */
export function releaseFinancialReservation(reservation: FinancialReservation): FinancialReservation {
  if (reservation.status === 'OPEN') return Object.freeze({ ...reservation, status: 'RELEASED' })
  return reservation
}

export function evaluateFinancialCommitment(input: EvaluateFinancialCommitmentInput): FinancialCommitmentDecision {
  const organizationId = organizationIdFromString(input.organizationId)
  const profile = input.organizationFinancialProfile ?? null
  const amount = normalizeMoney(input.amount, 'Financial commitment amount')
  const currency = input.currency === undefined ? (profile?.baseCurrencyCode ?? amount.currencyCode) : createCurrencyCode(input.currency)
  const requestedReservations = input.activeReservations ?? []

  if (profile === null || profile.organizationId !== organizationId) {
    return decision({
      status: 'FINANCE_PROFILE_UNAVAILABLE',
      organizationId,
      currency,
      amount,
      liquidity: emptyLiquidity(currency, amount),
      availableAuthorizedHeadroom: null,
      reservationState: [],
      reasonCodes: ['FINANCE_PROFILE_UNAVAILABLE'],
    })
  }

  if (currency !== profile.baseCurrencyCode || amount.currencyCode !== currency) {
    return decision({
      status: 'CURRENCY_MISMATCH',
      organizationId,
      currency,
      amount,
      liquidity: emptyLiquidity(currency, amount),
      availableAuthorizedHeadroom: null,
      reservationState: [],
      reasonCodes: ['CURRENCY_MISMATCH'],
    })
  }

  const existingCommitments = (input.existingCommitments ?? []).map((item) => normalizeMoney(item, 'Existing commitment amount'))
  const authorizedHeadroom = input.authorizedHeadroom === undefined || input.authorizedHeadroom === null
    ? null
    : normalizeMoney(input.authorizedHeadroom, 'Authorized headroom')
  const currentCash = input.currentCash === undefined || input.currentCash === null
    ? null
    : normalizeMoney(input.currentCash, 'Current cash')

  // Different currencies are never silently compared and no FX authority exists yet.
  if (
    existingCommitments.some((commitment) => commitment.currencyCode !== currency)
    || (authorizedHeadroom !== null && authorizedHeadroom.currencyCode !== currency)
    || (currentCash !== null && currentCash.currencyCode !== currency)
  ) {
    return decision({
      status: 'CURRENCY_MISMATCH',
      organizationId,
      currency,
      amount,
      liquidity: emptyLiquidity(currency, amount),
      availableAuthorizedHeadroom: null,
      reservationState: [],
      reasonCodes: ['CURRENCY_MISMATCH'],
    })
  }

  const reservationState = requestedReservations.filter(
    (reservation) => reservation.status === 'OPEN' && reservation.organizationId === organizationId && reservation.currency === currency
  )
  const reservedCapacity = sumReservedCapacity(requestedReservations, organizationId, currency)
  const committedCapacity = createMoney({ currencyCode: currency, minorUnits: sumSafe(existingCommitments) })
  const availableCapacity = currentCash === null
    ? null
    : createMoney({ currencyCode: currency, minorUnits: Math.max(currentCash.minorUnits - committedCapacity.minorUnits - reservedCapacity.minorUnits, 0) })
  const reasons: FinancialReasonCode[] = authorizedHeadroom === null
    ? ['BUDGET_AUTHORIZATION_NOT_MODELLED', ...(input.authorization?.state === 'OUT_OF_PERIOD' ? ['AUTHORIZATION_OUT_OF_PERIOD' as const] : [])]
    : []
  const liquidity: FinancialCommitmentLiquidity = {
    availableCash: currentCash,
    existingCommitments,
    committedCapacity,
    reservedCapacity,
    availableCapacity,
    fundingGap: null,
  }

  if (authorizedHeadroom !== null && amount.minorUnits > authorizedHeadroom.minorUnits) {
    return decision({
      status: 'INSUFFICIENT_AUTHORIZED_HEADROOM',
      organizationId,
      currency,
      amount,
      liquidity,
      availableAuthorizedHeadroom: authorizedHeadroom,
      reservationState,
      reasonCodes: [...reasons, 'INSUFFICIENT_AUTHORIZED_HEADROOM'],
    })
  }

  if (availableCapacity === null) {
    return decision({
      status: 'REQUIRES_FINANCING',
      organizationId,
      currency,
      amount,
      liquidity: { ...liquidity, fundingGap: amount },
      availableAuthorizedHeadroom: authorizedHeadroom,
      reservationState,
      reasonCodes: [...reasons, 'REQUIRES_FINANCING'],
    })
  }

  if (amount.minorUnits > availableCapacity.minorUnits) {
    const capacityWithoutReservations = currentCash!.minorUnits - committedCapacity.minorUnits
    const status: FinancialDecisionStatus = reservedCapacity.minorUnits > 0 && amount.minorUnits <= capacityWithoutReservations
      ? 'RESERVED_CAPACITY_CONFLICT'
      : 'INSUFFICIENT_LIQUIDITY'
    return decision({
      status,
      organizationId,
      currency,
      amount,
      liquidity: { ...liquidity, fundingGap: createMoney({ currencyCode: currency, minorUnits: amount.minorUnits - availableCapacity.minorUnits }) },
      availableAuthorizedHeadroom: authorizedHeadroom,
      reservationState,
      reasonCodes: [...reasons, status, 'REQUIRES_FINANCING'],
    })
  }

  return decision({
    status: 'AFFORDABLE_NOW',
    organizationId,
    currency,
    amount,
    liquidity,
    availableAuthorizedHeadroom: authorizedHeadroom,
    reservationState,
    reasonCodes: [...reasons, 'AFFORDABLE_NOW'],
  })
}

/**
 * Canonical evaluate → reserve operation. A reservation is created only when the commitment is
 * affordable net of every other active reservation, so two sequential decisions can never spend the
 * same capacity. Replaying the same provenance is idempotent and never consumes capacity twice.
 */
export function reserveFinancialCommitment(input: ReserveFinancialCommitmentInput): FinancialReservationResult {
  const organizationId = organizationIdFromString(input.organizationId)
  const amount = normalizeMoney(input.amount, 'Financial commitment amount')
  const currency = input.currency === undefined
    ? (input.organizationFinancialProfile?.baseCurrencyCode ?? amount.currencyCode)
    : createCurrencyCode(input.currency)
  const reservations = input.activeReservations ?? []
  const provenance = { organizationId, sourceAuthority: input.sourceAuthority, sourceEntityId: input.sourceEntityId }
  const existing = findFinancialReservationByProvenance(reservations, provenance)

  if (existing !== null && existing.status === 'OPEN') {
    if (existing.amount.minorUnits !== amount.minorUnits || existing.currency !== currency) {
      throw new RangeError('Financial reservation provenance was already used with different economics')
    }
    return Object.freeze({
      outcome: 'REPLAYED' as const,
      idempotent: true,
      reservation: existing,
      reservations,
      decision: evaluateFinancialCommitment({ ...input, activeReservations: reservations.filter((reservation) => reservation !== existing) }),
    })
  }

  if (existing !== null && existing.status === 'CONSUMED') {
    return Object.freeze({
      outcome: 'REPLAYED' as const,
      idempotent: true,
      reservation: existing,
      reservations,
      decision: evaluateFinancialCommitment({ ...input, activeReservations: reservations }),
    })
  }

  const evaluated = evaluateFinancialCommitment({ ...input, activeReservations: reservations })
  if (evaluated.status !== 'AFFORDABLE_NOW') {
    return Object.freeze({ outcome: 'REJECTED' as const, idempotent: false, reservation: null, reservations, decision: evaluated })
  }

  const created = createFinancialReservation({
    id: input.reservationId ?? financialReservationIdForProvenance(provenance),
    organizationId,
    currency,
    amount,
    sourceAuthority: input.sourceAuthority,
    sourceEntityId: input.sourceEntityId,
    createdOn: input.createdOn,
  })
  const next = existing === null
    ? Object.freeze([...reservations, created])
    : Object.freeze(reservations.map((reservation) => (reservation === existing ? created : reservation)))
  const postState = evaluateFinancialCommitment({ ...input, activeReservations: next })
  return Object.freeze({
    outcome: 'CREATED' as const,
    idempotent: false,
    reservation: created,
    reservations: next,
    decision: decision({
      status: evaluated.status,
      organizationId,
      currency,
      amount,
      liquidity: postState.liquidity,
      availableAuthorizedHeadroom: evaluated.availableAuthorizedHeadroom,
      reservationState: postState.reservationState,
      reasonCodes: evaluated.reasonCodes,
    }),
  })
}

function decision(initial: {
  readonly status: FinancialDecisionStatus
  readonly organizationId: OrganizationId
  readonly currency: CurrencyCode
  readonly amount: Money
  readonly liquidity: FinancialCommitmentLiquidity
  readonly availableAuthorizedHeadroom: Money | null
  readonly reservationState: readonly FinancialReservation[]
  readonly reasonCodes: readonly FinancialReasonCode[]
}): FinancialCommitmentDecision {
  return Object.freeze({
    status: initial.status,
    organizationId: initial.organizationId,
    currency: initial.currency,
    amount: initial.amount,
    liquidity: Object.freeze({
      availableCash: initial.liquidity.availableCash,
      existingCommitments: Object.freeze([...initial.liquidity.existingCommitments]),
      committedCapacity: initial.liquidity.committedCapacity,
      reservedCapacity: initial.liquidity.reservedCapacity,
      availableCapacity: initial.liquidity.availableCapacity,
      fundingGap: initial.liquidity.fundingGap,
    }),
    availableAuthorizedHeadroom: initial.availableAuthorizedHeadroom,
    reservationState: Object.freeze([...initial.reservationState]),
    reasonCodes: Object.freeze([...new Set(initial.reasonCodes)]),
  })
}

function emptyLiquidity(currency: CurrencyCode, amount: Money): FinancialCommitmentLiquidity {
  const zero = createMoney({ currencyCode: currency, minorUnits: 0 })
  return { availableCash: null, existingCommitments: [], committedCapacity: zero, reservedCapacity: zero, availableCapacity: null, fundingGap: amount }
}

function sumSafe(values: readonly Money[]): number {
  const total = values.reduce((sum, value) => sum + value.minorUnits, 0)
  if (!Number.isSafeInteger(total)) throw new RangeError('Money total exceeds safe integer range')
  return total
}

function assertReservationStatus(status: FinancialReservationStatus): void {
  if (status !== 'OPEN' && status !== 'CONSUMED' && status !== 'RELEASED') throw new TypeError('Financial reservation status is invalid')
}

function normalizeMoney(value: Money | { readonly currencyCode: string; readonly minorUnits: number }, label: string): Money {
  const currencyCode = createCurrencyCode(value.currencyCode)
  if (!Number.isSafeInteger(value.minorUnits) || value.minorUnits < 0) throw new RangeError(`${label} must use a non-negative safe integer minorUnits value`)
  return createMoney({ currencyCode, minorUnits: value.minorUnits })
}

function nonEmptyText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be non-empty`)
  return value
}
