import { describe, expect, it } from 'vitest'
import { organizationIdFromString } from '@/domain/ids'
import { createOrganizationFinancialProfile } from './FinancialLedger'
import {
  consumeFinancialReservation,
  createFinancialReservation,
  evaluateFinancialCommitment,
  financialReservationIdForProvenance,
  financialReservationProvenanceKey,
  findFinancialReservationByProvenance,
  releaseFinancialReservation,
  reserveFinancialCommitment,
  sumReservedCapacity,
  type FinancialReservation,
} from './FinancialAuthority'

const ORG_A = 'org-a'
const ORG_B = 'org-b'
const profileA = createOrganizationFinancialProfile({ organizationId: ORG_A, baseCurrencyCode: 'EUR' })
const profileB = createOrganizationFinancialProfile({ organizationId: ORG_B, baseCurrencyCode: 'USD' })

const money = (minorUnits: number, currencyCode = 'EUR') => ({ currencyCode, minorUnits })

function reserve(overrides: Partial<Parameters<typeof reserveFinancialCommitment>[0]> = {}) {
  return reserveFinancialCommitment({
    organizationFinancialProfile: profileA,
    organizationId: ORG_A,
    currency: 'EUR',
    amount: money(60_000),
    currentCash: money(100_000),
    sourceAuthority: 'FACILITY',
    sourceEntityId: 'facility:1',
    createdOn: '2032-10-01',
    ...overrides,
  })
}

describe('FinancialAuthority decision contract', () => {
  it('reports AFFORDABLE_NOW when cash net of commitments and reservations covers the amount', () => {
    const decision = evaluateFinancialCommitment({
      organizationFinancialProfile: profileA,
      organizationId: ORG_A,
      amount: money(100_000),
      currentCash: money(500_000),
      existingCommitments: [money(50_000)],
    })

    expect(decision.status).toBe('AFFORDABLE_NOW')
    expect(decision.reasonCodes).toContain('AFFORDABLE_NOW')
    expect(decision.liquidity.availableCapacity).toEqual(money(450_000))
    expect(decision.liquidity.fundingGap).toBeNull()
  })

  it('reports INSUFFICIENT_LIQUIDITY with an explicit funding gap', () => {
    const decision = evaluateFinancialCommitment({
      organizationFinancialProfile: profileA,
      organizationId: ORG_A,
      amount: money(100_000),
      currentCash: money(50_000),
    })

    expect(decision.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(decision.liquidity.fundingGap).toEqual(money(50_000))
    expect(decision.reasonCodes).toContain('REQUIRES_FINANCING')
  })

  it('reports REQUIRES_FINANCING when cash is unknown rather than assuming affordability', () => {
    const decision = evaluateFinancialCommitment({
      organizationFinancialProfile: profileA,
      organizationId: ORG_A,
      amount: money(10_000),
      currentCash: null,
    })

    expect(decision.status).toBe('REQUIRES_FINANCING')
    expect(decision.liquidity.fundingGap).toEqual(money(10_000))
  })

  it('reports FINANCE_PROFILE_UNAVAILABLE without an organization financial profile', () => {
    const missing = evaluateFinancialCommitment({ organizationId: ORG_A, amount: money(10_000), currentCash: money(10_000) })
    const mismatched = evaluateFinancialCommitment({
      organizationFinancialProfile: profileB,
      organizationId: ORG_A,
      amount: money(10_000),
      currentCash: money(10_000),
    })

    for (const decision of [missing, mismatched]) {
      expect(decision.status).toBe('FINANCE_PROFILE_UNAVAILABLE')
      expect(decision.reasonCodes).toEqual(['FINANCE_PROFILE_UNAVAILABLE'])
    }
  })

  it('refuses to compare different currencies without an FX authority', () => {
    const crossCurrencyAmount = evaluateFinancialCommitment({
      organizationFinancialProfile: profileA,
      organizationId: ORG_A,
      amount: money(10_000, 'USD'),
      currentCash: money(100_000, 'EUR'),
    })
    const crossCurrencyCommitment = evaluateFinancialCommitment({
      organizationFinancialProfile: profileA,
      organizationId: ORG_A,
      amount: money(10_000, 'EUR'),
      currentCash: money(100_000, 'EUR'),
      existingCommitments: [money(10_000, 'USD')],
    })
    const crossCurrencyCash = evaluateFinancialCommitment({
      organizationFinancialProfile: profileA,
      organizationId: ORG_A,
      amount: money(10_000, 'EUR'),
      currentCash: money(100_000, 'USD'),
    })

    for (const decision of [crossCurrencyAmount, crossCurrencyCommitment, crossCurrencyCash]) {
      expect(decision.status).toBe('CURRENCY_MISMATCH')
      expect(decision.reasonCodes).toEqual(['CURRENCY_MISMATCH'])
    }
  })

  it('excludes foreign-currency reservations instead of silently comparing them', () => {
    const usdReservation = createFinancialReservation({ id: 'usd-hold', organizationId: ORG_A, currency: 'USD', amount: money(90_000, 'USD'), sourceAuthority: 'FACILITY', sourceEntityId: 'facility:usd', createdOn: '2032-10-01' })
    const eurDecision = evaluateFinancialCommitment({
      organizationFinancialProfile: profileA,
      organizationId: ORG_A,
      amount: money(100_000, 'EUR'),
      currentCash: money(100_000, 'EUR'),
      activeReservations: [usdReservation],
    })

    expect(eurDecision.status).toBe('AFFORDABLE_NOW')
    expect(eurDecision.liquidity.reservedCapacity).toEqual(money(0, 'EUR'))
    expect(eurDecision.reservationState).toHaveLength(0)
  })

  it('keeps informational budgets non-binding while exposing an explicit authorization limit', () => {
    const informational = evaluateFinancialCommitment({
      organizationFinancialProfile: profileA,
      organizationId: ORG_A,
      amount: money(900_000),
      currentCash: money(1_000_000),
    })
    const explicitlyAuthorized = evaluateFinancialCommitment({
      organizationFinancialProfile: profileA,
      organizationId: ORG_A,
      amount: money(900_000),
      currentCash: money(1_000_000),
      authorizedHeadroom: money(500_000),
    })

    expect(informational.status).toBe('AFFORDABLE_NOW')
    expect(informational.reasonCodes).toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
    expect(explicitlyAuthorized.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(explicitlyAuthorized.reasonCodes).not.toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
  })
})

describe('FinancialAuthority reservation authority', () => {
  it('creates an OPEN reservation with a provenance-derived deterministic id', () => {
    const result = reserve()

    expect(result.outcome).toBe('CREATED')
    expect(result.idempotent).toBe(false)
    expect(result.reservation?.status).toBe('OPEN')
    expect(result.reservation?.id).toBe(financialReservationIdForProvenance({ organizationId: ORG_A, sourceAuthority: 'FACILITY', sourceEntityId: 'facility:1' }))
    expect(result.reservation?.id).toBe('reservation:org-a|FACILITY|facility:1')
    expect(result.decision.liquidity.reservedCapacity).toEqual(money(60_000))
    expect(sumReservedCapacity(result.reservations, ORG_A, 'EUR').minorUnits).toBe(60_000)
  })

  it('is idempotent for a replayed provenance and never consumes capacity twice', () => {
    const first = reserve()
    const replay = reserve({ activeReservations: first.reservations })

    expect(replay.outcome).toBe('REPLAYED')
    expect(replay.idempotent).toBe(true)
    expect(replay.reservation?.id).toBe(first.reservation?.id)
    expect(replay.reservations).toHaveLength(1)
    expect(sumReservedCapacity(replay.reservations, ORG_A, 'EUR').minorUnits).toBe(60_000)
    expect(replay.decision.liquidity.reservedCapacity.minorUnits).toBe(0)
  })

  it('rejects a provenance replay that changes the economics', () => {
    const first = reserve()

    expect(() => reserve({ activeReservations: first.reservations, amount: money(70_000) })).toThrow(/different economics/)
  })

  it('allocates independent capacity per provenance and blocks beyond capacity', () => {
    const first = reserve()
    const second = reserve({ sourceAuthority: 'FACILITY', sourceEntityId: 'facility:2', amount: money(30_000), activeReservations: first.reservations })
    const blocked = reserve({ sourceAuthority: 'FACILITY', sourceEntityId: 'facility:3', amount: money(30_000), activeReservations: second.reservations })

    expect(second.outcome).toBe('CREATED')
    expect(sumReservedCapacity(second.reservations, ORG_A, 'EUR').minorUnits).toBe(90_000)
    expect(blocked.outcome).toBe('REJECTED')
    expect(blocked.reservation).toBeNull()
    expect(blocked.decision.status).toBe('RESERVED_CAPACITY_CONFLICT')
    expect(blocked.decision.liquidity.fundingGap).toEqual(money(20_000))
    expect(blocked.reservations).toEqual(second.reservations)
  })

  it('prevents two simultaneous decisions from overspending the same capacity', () => {
    // Capacity X = 100_000. A = 50_000, B = 50_000 fit; C = 50_000 does not.
    const a = reserve({ sourceEntityId: 'decision:a', amount: money(50_000) })
    const b = reserve({ sourceEntityId: 'decision:b', amount: money(50_000), activeReservations: a.reservations })
    const c = reserve({ sourceEntityId: 'decision:c', amount: money(50_000), activeReservations: b.reservations })

    expect(a.outcome).toBe('CREATED')
    expect(b.outcome).toBe('CREATED')
    expect(c.outcome).toBe('REJECTED')
    expect(sumReservedCapacity(b.reservations, ORG_A, 'EUR').minorUnits).toBe(100_000)

    // Without the reservation ledger both reads would have seen X and approved 150_000.
    const naive = evaluateFinancialCommitment({ organizationFinancialProfile: profileA, organizationId: ORG_A, amount: money(50_000), currentCash: money(100_000) })
    expect(naive.status).toBe('AFFORDABLE_NOW')
    expect(c.decision.status).toBe('RESERVED_CAPACITY_CONFLICT')
  })

  it('restores capacity after release and stops counting a consumed reservation', () => {
    const first = reserve({ amount: money(100_000) })
    const released = first.reservations.map(releaseFinancialReservation)
    const consumed = first.reservations.map((reservation) => consumeFinancialReservation(reservation))

    expect(released[0]?.status).toBe('RELEASED')
    expect(consumed[0]?.status).toBe('CONSUMED')
    expect(sumReservedCapacity(released, ORG_A, 'EUR').minorUnits).toBe(0)
    expect(sumReservedCapacity(consumed, ORG_A, 'EUR').minorUnits).toBe(0)

    const afterRelease = reserve({ amount: money(100_000), sourceEntityId: 'facility:after-release', activeReservations: released })
    expect(afterRelease.outcome).toBe('CREATED')
  })

  it('treats terminal states as deterministic no-ops that never double-adjust capacity', () => {
    const open = reserve().reservation!
    const consumed = consumeFinancialReservation(open)
    const released = releaseFinancialReservation(open)

    expect(consumeFinancialReservation(consumed)).toBe(consumed)
    expect(releaseFinancialReservation(released)).toBe(released)
    // Releasing a CONSUMED reservation must not resurrect capacity for the obligation.
    expect(releaseFinancialReservation(consumed)).toBe(consumed)
    // Consuming a RELEASED reservation must not create accounting capacity out of nothing.
    expect(consumeFinancialReservation(released)).toBe(released)
    expect(() => consumeFinancialReservation(consumed, { amount: money(1_000) })).toThrow(/replay/)

    for (const terminal of [consumed, released]) {
      expect(sumReservedCapacity([terminal], ORG_A, 'EUR').minorUnits).toBe(0)
      expect(sumReservedCapacity([releaseFinancialReservation(terminal), consumeFinancialReservation(terminal)], ORG_A, 'EUR').minorUnits).toBe(0)
    }
  })

  it('keeps reservation provenance organization-scoped so identical business keys cannot collide', () => {
    const aOnly = reserve()
    const bSameKey = reserve({
      organizationFinancialProfile: profileB,
      organizationId: ORG_B,
      currency: 'USD',
      amount: money(60_000, 'USD'),
      currentCash: money(100_000, 'USD'),
      sourceAuthority: 'FACILITY',
      sourceEntityId: 'facility:1',
      activeReservations: aOnly.reservations,
    })

    expect(financialReservationProvenanceKey({ organizationId: ORG_A, sourceAuthority: 'FACILITY', sourceEntityId: 'facility:1' }))
      .not.toBe(financialReservationProvenanceKey({ organizationId: ORG_B, sourceAuthority: 'FACILITY', sourceEntityId: 'facility:1' }))
    expect(bSameKey.outcome).toBe('CREATED')
    expect(bSameKey.reservations).toHaveLength(2)
    expect(sumReservedCapacity(bSameKey.reservations, ORG_A, 'EUR').minorUnits).toBe(60_000)
    expect(sumReservedCapacity(bSameKey.reservations, ORG_B, 'USD').minorUnits).toBe(60_000)
    expect(findFinancialReservationByProvenance(aOnly.reservations, { organizationId: ORG_B, sourceAuthority: 'FACILITY', sourceEntityId: 'facility:1' })).toBeNull()
  })

  it('isolates organizations in cash, commitments and reservations', () => {
    const reservedByA = reserve({ amount: money(100_000) }).reservations
    const decisionForB = evaluateFinancialCommitment({
      organizationFinancialProfile: profileB,
      organizationId: ORG_B,
      currency: 'USD',
      amount: money(50_000, 'USD'),
      currentCash: money(100_000, 'USD'),
      existingCommitments: [money(20_000, 'USD')],
      activeReservations: reservedByA,
    })

    expect(decisionForB.status).toBe('AFFORDABLE_NOW')
    expect(decisionForB.liquidity.reservedCapacity).toEqual(money(0, 'USD'))
    expect(decisionForB.reservationState).toHaveLength(0)
    expect(decisionForB.liquidity.availableCapacity).toEqual(money(80_000, 'USD'))
  })

  it('evaluates a second organization in its own currency without conversion', () => {
    const usdDecision = evaluateFinancialCommitment({
      organizationFinancialProfile: profileB,
      organizationId: ORG_B,
      currency: 'USD',
      amount: money(250_000, 'USD'),
      currentCash: money(1_000_000, 'USD'),
    })
    const eurOrgRequestingUsd = evaluateFinancialCommitment({
      organizationFinancialProfile: profileA,
      organizationId: ORG_A,
      amount: money(250_000, 'USD'),
      currentCash: money(1_000_000, 'EUR'),
    })

    expect(usdDecision.currency).toBe('USD')
    expect(usdDecision.status).toBe('AFFORDABLE_NOW')
    expect(eurOrgRequestingUsd.status).toBe('CURRENCY_MISMATCH')
  })

  it('does not double-count capacity once the matching commitment becomes authoritative', () => {
    const created = reserve({ amount: money(60_000) })
    const consumed = created.reservations.map((reservation) => consumeFinancialReservation(reservation))
    const decision = evaluateFinancialCommitment({
      organizationFinancialProfile: profileA,
      organizationId: ORG_A,
      amount: money(40_000),
      currentCash: money(100_000),
      existingCommitments: [money(60_000)],
      activeReservations: consumed,
    })

    expect(decision.liquidity.reservedCapacity).toEqual(money(0))
    expect(decision.liquidity.committedCapacity).toEqual(money(60_000))
    expect(decision.liquidity.availableCapacity).toEqual(money(40_000))
    expect(decision.status).toBe('AFFORDABLE_NOW')
  })
})

describe('FinancialReservation value object', () => {
  it('rejects malformed reservations and never stores derived currency duplicates', () => {
    expect(() => createFinancialReservation({ id: 'x', organizationId: ORG_A, currency: 'EUR', amount: money(10_000, 'USD'), sourceAuthority: 'FACILITY', sourceEntityId: 'f', createdOn: '2032-10-01' })).toThrow(/currency/)
    expect(() => createFinancialReservation({ id: 'x', organizationId: ORG_A, currency: 'EUR', amount: money(10_000), sourceAuthority: '  ', sourceEntityId: 'f', createdOn: '2032-10-01' })).toThrow(/source authority/)
    expect(() => createFinancialReservation({ id: 'x', organizationId: ORG_A, currency: 'EUR', amount: money(10_000), sourceAuthority: 'FACILITY', sourceEntityId: 'f', createdOn: '2032-10-01', status: 'NOPE' as never })).toThrow(/status/)

    const reservation: FinancialReservation = createFinancialReservation({ id: 'x', organizationId: ORG_A, currency: 'EUR', amount: money(10_000), sourceAuthority: 'FACILITY', sourceEntityId: 'f', createdOn: '2032-10-01' })
    expect(Object.keys(reservation).sort()).toEqual(['amount', 'createdOn', 'currency', 'id', 'organizationId', 'sourceAuthority', 'sourceEntityId', 'status'])
    expect(reservation.organizationId).toBe(organizationIdFromString(ORG_A))
  })
})
