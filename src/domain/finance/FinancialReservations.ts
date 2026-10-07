import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  financialReservationIdFromString,
  organizationIdFromString,
  type FinancialReservationId,
  type OrganizationId,
} from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createCurrencyCode, createFinancialSource, createMoney, type CurrencyCode, type FinancialSource, type Money } from './FinancialLedger'

/**
 * BS16C canonical reservation lifecycle. `OPEN` is the only state that blocks financial capacity;
 * `CONSUMED` and `RELEASED` are terminal so that one provenance can never reserve twice.
 */
export const FINANCIAL_RESERVATION_STATUSES = ['OPEN', 'CONSUMED', 'RELEASED'] as const

export type FinancialReservationStatus = typeof FINANCIAL_RESERVATION_STATUSES[number]

/**
 * Every authority allowed to claim Organization financial capacity. Adding an authority is a
 * product decision: the list is persisted data, so unknown authorities are rejected rather than ignored.
 */
export const FINANCIAL_RESERVATION_SOURCE_AUTHORITIES = [
  'CONTRACT',
  'MARKET',
  'STAFF',
  'FACILITIES',
  'TRADE',
  'GOVERNANCE',
  'OWNERSHIP',
  'ORGANIZATION',
  'MANUAL_SYSTEM_ACTION',
] as const

export type FinancialReservationSourceAuthority = typeof FINANCIAL_RESERVATION_SOURCE_AUTHORITIES[number]

/**
 * A claim on an Organization's spendable capacity. A reservation is not money: it creates no ledger
 * entry, no cash movement and no obligation. It only makes the claimed capacity unavailable to other
 * decisions until the claim is consumed (a real commitment was created) or released (abandoned).
 */
export interface FinancialReservation {
  readonly id: FinancialReservationId
  readonly organizationId: OrganizationId
  readonly currencyCode: CurrencyCode
  readonly amount: Money
  readonly category: string | null
  readonly sourceAuthority: FinancialReservationSourceAuthority
  readonly sourceEntityId: string
  readonly createdOn: GameDate
  readonly dueOn: GameDate | null
  readonly status: FinancialReservationStatus
  readonly resolvedOn: GameDate | null
  /** Declared consumption evidence (for example the ledger transaction or commitment id). Only for CONSUMED. */
  readonly consumptionFactId: string | null
  readonly provenance: FinancialSource
}

export interface CreateFinancialReservationInput {
  readonly id: FinancialReservationId | string
  readonly organizationId: OrganizationId | string
  readonly currencyCode: string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly category?: string | null
  readonly sourceAuthority: string
  readonly sourceEntityId: string
  readonly createdOn: GameDate | string
  readonly dueOn?: GameDate | string | null
  readonly status?: FinancialReservationStatus
  readonly resolvedOn?: GameDate | string | null
  readonly consumptionFactId?: string | null
  readonly provenance?: FinancialSource
}

/**
 * Reservation identity is derived from provenance, never chosen: one `(sourceAuthority, sourceEntityId)`
 * pair can hold at most one reservation for the lifetime of the world.
 */
export function financialReservationId(sourceAuthority: string, sourceEntityId: string): FinancialReservationId {
  const authority = nonEmptyText(sourceAuthority, 'Financial reservation source authority')
  if (!isReservationSourceAuthority(authority)) throw new TypeError(`Financial reservation source authority ${authority} is not canonical`)
  return financialReservationIdFromString(`financial-reservation:${authority}:${nonEmptyText(sourceEntityId, 'Financial reservation source entity id')}`)
}

export function isReservationSourceAuthority(value: string): value is FinancialReservationSourceAuthority {
  return (FINANCIAL_RESERVATION_SOURCE_AUTHORITIES as readonly string[]).includes(value)
}

export function createFinancialReservation(input: CreateFinancialReservationInput): FinancialReservation {
  const sourceAuthority = nonEmptyText(input.sourceAuthority, 'Financial reservation source authority')
  if (!isReservationSourceAuthority(sourceAuthority)) throw new TypeError(`Financial reservation source authority ${sourceAuthority} is not canonical`)
  const sourceEntityId = nonEmptyText(input.sourceEntityId, 'Financial reservation source entity id')
  const id = financialReservationIdFromString(input.id)
  const expectedId = financialReservationId(sourceAuthority, sourceEntityId)
  if (id !== expectedId) throw new RangeError(`Financial reservation id ${id} does not match its provenance; expected ${expectedId}`)

  const currencyCode = createCurrencyCode(input.currencyCode)
  const amount = createMoney(input.amount)
  if (amount.minorUnits <= 0) throw new RangeError('Financial reservation amount must be greater than zero')
  if (amount.currencyCode !== currencyCode) throw new RangeError('Financial reservation amount currency must match its currencyCode')

  const createdOn = parseGameDate(input.createdOn)
  const dueOn = input.dueOn === undefined || input.dueOn === null ? null : parseGameDate(input.dueOn)
  if (dueOn !== null && compareGameDates(dueOn, createdOn) < 0) throw new RangeError('Financial reservation dueOn cannot precede createdOn')

  const status = input.status ?? 'OPEN'
  if (!(FINANCIAL_RESERVATION_STATUSES as readonly string[]).includes(status)) throw new TypeError(`Financial reservation status ${status} is not canonical`)
  const resolvedOn = input.resolvedOn === undefined || input.resolvedOn === null ? null : parseGameDate(input.resolvedOn)
  if (status === 'OPEN' && resolvedOn !== null) throw new RangeError('Financial reservation OPEN cannot carry a resolution date')
  if (status !== 'OPEN' && resolvedOn === null) throw new RangeError(`Financial reservation ${status} requires a resolution date`)
  if (resolvedOn !== null && compareGameDates(resolvedOn, createdOn) < 0) throw new RangeError('Financial reservation resolvedOn cannot precede createdOn')

  const consumptionFactId = input.consumptionFactId === undefined || input.consumptionFactId === null
    ? null
    : nonEmptyText(input.consumptionFactId, 'Financial reservation consumption fact id')
  if (consumptionFactId !== null && status !== 'CONSUMED') throw new RangeError('Financial reservation consumption fact requires CONSUMED status')

  return Object.freeze({
    id,
    organizationId: organizationIdFromString(input.organizationId),
    currencyCode,
    amount,
    category: input.category === undefined || input.category === null ? null : nonEmptyText(input.category, 'Financial reservation category'),
    sourceAuthority,
    sourceEntityId,
    createdOn,
    dueOn,
    status,
    resolvedOn,
    consumptionFactId,
    provenance: reservationProvenance(input.provenance, sourceAuthority, sourceEntityId),
  })
}

export function getFinancialReservation(world: GameWorld, reservationId: FinancialReservationId | string): FinancialReservation | null {
  return world.financialReservationsById[financialReservationIdFromString(reservationId)] ?? null
}

/**
 * Reservations known at `asOfDate`, later creations excluded so that a decision cannot be blocked by a
 * claim that did not exist yet.
 */
export function getOrganizationFinancialReservations(
  world: GameWorld,
  organizationId: OrganizationId | string,
  filter: { readonly status?: FinancialReservationStatus; readonly currencyCode?: string; readonly asOfDate?: GameDate | string } = {},
): readonly FinancialReservation[] {
  const organization = String(organizationId)
  const asOfDate = filter.asOfDate === undefined ? undefined : parseGameDate(filter.asOfDate)
  return Object.freeze(Object.values(world.financialReservationsById)
    .filter((reservation) => String(reservation.organizationId) === organization)
    .filter((reservation) => filter.status === undefined || reservation.status === filter.status)
    .filter((reservation) => filter.currencyCode === undefined || reservation.currencyCode === createCurrencyCode(filter.currencyCode))
    .filter((reservation) => asOfDate === undefined || compareGameDates(reservation.createdOn, asOfDate) <= 0)
    .sort((left, right) => String(left.id).localeCompare(String(right.id))))
}

/** The canonical blocking set: OPEN reservations of one currency known as of the decision date. */
export function getOpenFinancialReservations(
  world: GameWorld,
  organizationId: OrganizationId | string,
  currencyCode: string,
  asOfDate: GameDate | string = world.currentDate,
): readonly FinancialReservation[] {
  return getOrganizationFinancialReservations(world, organizationId, { status: 'OPEN', currencyCode, asOfDate })
}

/**
 * Appends a reservation as-is. Re-recording the same provenance is idempotent and returns the existing
 * reservation unchanged; a terminal provenance stays terminal. Capacity is NOT checked here — use
 * `reserveFinancialCapacity` from `FinancialDecision` when the claim must be authorized first.
 */
export function recordFinancialReservation(
  world: GameWorld,
  input: CreateFinancialReservationInput,
): { readonly world: GameWorld; readonly reservation: FinancialReservation; readonly created: boolean } {
  const reservation = createFinancialReservation(input)
  const existing = world.financialReservationsById[reservation.id]
  if (existing !== undefined) {
    if (!sameReservation(existing, reservation)) {
      throw new RangeError(`Financial reservation ${reservation.id} already exists with different content; reprovisioning must repeat the original request`)
    }
    return Object.freeze({ world, reservation: existing, created: false })
  }
  return Object.freeze({ world: updateGameWorld(world, { financialReservations: [...Object.values(world.financialReservationsById), reservation] }), reservation, created: true })
}

/** Releases an OPEN reservation without spending it. Releasing an already released reservation is idempotent. */
export function releaseFinancialReservation(world: GameWorld, input: { readonly reservationId: FinancialReservationId | string; readonly releasedOn?: GameDate | string }): { readonly world: GameWorld; readonly reservation: FinancialReservation } {
  const existing = requireReservation(world, input.reservationId)
  if (existing.status === 'RELEASED') return Object.freeze({ world, reservation: existing })
  if (existing.status === 'CONSUMED') throw new RangeError(`Financial reservation ${existing.id} was consumed and cannot be released`)
  const reservation = createFinancialReservation({ ...existing, status: 'RELEASED', resolvedOn: input.releasedOn ?? world.currentDate, consumptionFactId: null, provenance: existing.provenance })
  return Object.freeze({ world: replaceReservation(world, reservation), reservation })
}

/** Consumes an OPEN reservation after the claim became a real commitment. Consuming twice is idempotent. */
export function consumeFinancialReservation(world: GameWorld, input: { readonly reservationId: FinancialReservationId | string; readonly consumedOn?: GameDate | string; readonly consumptionFactId?: string | null }): { readonly world: GameWorld; readonly reservation: FinancialReservation } {
  const existing = requireReservation(world, input.reservationId)
  const consumptionFactId = input.consumptionFactId === undefined || input.consumptionFactId === null ? null : input.consumptionFactId
  if (existing.status === 'CONSUMED') {
    if (existing.consumptionFactId !== consumptionFactId && consumptionFactId !== null) throw new RangeError(`Financial reservation ${existing.id} was consumed by ${existing.consumptionFactId ?? 'an unspecified fact'}`)
    return Object.freeze({ world, reservation: existing })
  }
  if (existing.status === 'RELEASED') throw new RangeError(`Financial reservation ${existing.id} was released and cannot be consumed`)
  const reservation = createFinancialReservation({ ...existing, status: 'CONSUMED', resolvedOn: input.consumedOn ?? world.currentDate, consumptionFactId, provenance: existing.provenance })
  return Object.freeze({ world: replaceReservation(world, reservation), reservation })
}

function requireReservation(world: GameWorld, reservationId: FinancialReservationId | string): FinancialReservation {
  const id = financialReservationIdFromString(reservationId)
  const existing = world.financialReservationsById[id]
  if (existing === undefined) throw new RangeError(`Financial reservation ${id} does not exist`)
  return existing
}

function replaceReservation(world: GameWorld, reservation: FinancialReservation): GameWorld {
  return updateGameWorld(world, { financialReservations: Object.values(world.financialReservationsById).map((item) => (item.id === reservation.id ? reservation : item)) })
}

function sameReservation(left: FinancialReservation, right: FinancialReservation): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function reservationProvenance(input: FinancialSource | undefined, sourceAuthority: string, sourceEntityId: string): FinancialSource {
  const source = createFinancialSource(input ?? { kind: 'FINANCIAL_RESERVATION', id: `${sourceAuthority}:${sourceEntityId}` })
  if (source.id === undefined) throw new TypeError('Financial reservation provenance requires an id')
  return source
}

function nonEmptyText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be non-empty`)
  return value
}
