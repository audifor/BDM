import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import {
  consumeFinancialReservation,
  createFinancialAccount,
  createFinancialCommitment,
  createFinancialReservation,
  createFinancialTransaction,
  createOrganizationFinancialProfile,
  evaluateFinancialCommitment,
  releaseFinancialReservation,
  reserveFinancialCommitment,
  sumReservedCapacity,
} from '@/domain/finance'
import { getCashBalancesByCurrency } from '@/domain/finance/CashFlowQueries'

const organizationId = 'team-home'
const profile = createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR' })
const AMOUNT = { currencyCode: 'EUR', minorUnits: 60_000 } as const
const CASH = { currencyCode: 'EUR', minorUnits: 500_000 } as const

function ledgerWorld() {
  const accounts = [
    createFinancialAccount({ id: 'cash:eur', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'equity:eur', organizationId, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-10-01' }),
  ]
  const opening = createFinancialTransaction({
    id: 'finance:opening',
    organizationId,
    effectiveOn: '2032-10-01',
    transactionType: 'OPENING_BALANCE',
    amount: CASH,
    postings: [
      { accountId: 'cash:eur', direction: 'DEBIT', amount: CASH },
      { accountId: 'equity:eur', direction: 'CREDIT', amount: CASH },
    ],
    provenance: { kind: 'MIGRATION', id: 'bs16c-separation' },
  })
  return createGameWorld({
    ...createValidGameWorldInput(),
    financialAccounts: accounts,
    financialTransactions: [opening],
    organizationFinancialProfiles: [profile],
  })
}

function accountingSurface(world: ReturnType<typeof ledgerWorld>) {
  return {
    transactions: Object.keys(world.financialTransactionsById).sort(),
    accounts: Object.keys(world.financialAccountsById).sort(),
    expenseRecognitions: Object.keys(world.expenseRecognitionsById).sort(),
    payables: Object.keys(world.payablesById).sort(),
    receivables: Object.keys(world.receivablesById).sort(),
    cash: getCashBalancesByCurrency(world, organizationId, '2032-10-01'),
  }
}

describe('BS16C reservation / commitment / ledger separation', () => {
  it('never turns reservation state transitions into accounting facts', () => {
    const world = ledgerWorld()
    const baseline = accountingSurface(world)

    const held = reserveFinancialCommitment({
      organizationFinancialProfile: profile,
      organizationId,
      amount: AMOUNT,
      currentCash: CASH,
      sourceAuthority: 'FACILITY',
      sourceEntityId: 'facility:project-1',
      createdOn: '2032-10-01',
    })
    const reservedWorld = updateGameWorld(world, { financialReservations: held.reservations })
    const consumedWorld = updateGameWorld(reservedWorld, { financialReservations: held.reservations.map((reservation) => consumeFinancialReservation(reservation)) })
    const releasedWorld = updateGameWorld(reservedWorld, { financialReservations: held.reservations.map((reservation) => releaseFinancialReservation(reservation)) })

    for (const candidate of [reservedWorld, consumedWorld, releasedWorld]) {
      expect(accountingSurface(candidate)).toEqual(baseline)
      expect(Object.keys(candidate.financialReservationsById)).toHaveLength(1)
      // A reservation is capacity protection, not cash, payable, expense or ledger movement.
      expect(Object.keys(candidate.financialTransactionsById)).toEqual(['finance:opening'])
      expect(candidate.expenseRecognitionsById).toEqual({})
      expect(candidate.payablesById).toEqual({})
    }
  })

  it('does not double-count capacity once the matching commitment becomes authoritative', () => {
    const world = ledgerWorld()
    const held = reserveFinancialCommitment({
      organizationFinancialProfile: profile,
      organizationId,
      amount: AMOUNT,
      currentCash: CASH,
      sourceAuthority: 'FACILITY',
      sourceEntityId: 'facility:project-1',
      createdOn: '2032-10-01',
    })
    const commitment = createFinancialCommitment({
      id: 'commitment:project-1',
      organizationId,
      amount: AMOUNT,
      startsOn: '2032-10-01',
      dueOn: '2032-10-31',
      category: 'FACILITY',
      provenance: { kind: 'FACILITY_AUTHORIZED_EVENT', id: 'facility:project-1' },
    })
    const committed = updateGameWorld(updateGameWorld(world, { financialReservations: held.reservations.map((reservation) => consumeFinancialReservation(reservation)) }), { financialCommitments: [commitment] })

    const decision = evaluateFinancialCommitment({
      organizationFinancialProfile: profile,
      organizationId,
      amount: { currencyCode: 'EUR', minorUnits: 100_000 },
      currentCash: CASH,
      existingCommitments: Object.values(committed.financialCommitmentsById).map((item) => item.amount),
      activeReservations: Object.values(committed.financialReservationsById),
    })

    // The obligation is counted once (as a commitment), the consumed reservation adds nothing.
    expect(decision.liquidity.committedCapacity).toEqual(AMOUNT)
    expect(decision.liquidity.reservedCapacity).toEqual({ currencyCode: 'EUR', minorUnits: 0 })
    expect(decision.liquidity.availableCapacity).toEqual({ currencyCode: 'EUR', minorUnits: 440_000 })
    expect(sumReservedCapacity(Object.values(committed.financialReservationsById), organizationId, 'EUR').minorUnits).toBe(0)
  })

  it('exposes a documented evaluate → reserve → commit → consume seam', () => {
    const world = ledgerWorld()
    const request = { organizationFinancialProfile: profile, organizationId, amount: AMOUNT, currentCash: CASH, sourceAuthority: 'FACILITY' as const, sourceEntityId: 'facility:project-2', createdOn: '2032-10-01' }

    // 1. evaluate: no capacity effect.
    const evaluated = evaluateFinancialCommitment({ ...request, activeReservations: Object.values(world.financialReservationsById) })
    expect(evaluated.status).toBe('AFFORDABLE_NOW')
    expect(world.financialReservationsById).toEqual({})

    // 2. reserve: capacity is protected.
    const reserved = reserveFinancialCommitment(request)
    expect(reserved.outcome).toBe('CREATED')
    expect(reserved.decision.liquidity.reservedCapacity).toEqual(AMOUNT)

    // 3. approve/execute: the authoritative obligation enters Finance and the hold is consumed, not duplicated.
    const consumed = reserved.reservations.map((reservation) => consumeFinancialReservation(reservation))
    expect(consumed[0]?.status).toBe('CONSUMED')
    expect(sumReservedCapacity(consumed, organizationId, 'EUR').minorUnits).toBe(0)

    // 4. release is only meaningful while OPEN.
    const releasingConsumed = consumed.map((reservation) => releaseFinancialReservation(reservation))
    expect(releasingConsumed[0]?.status).toBe('CONSUMED')

    const openAgain = createFinancialReservation({ ...reserved.reservation!, id: reserved.reservation!.id })
    expect(releaseFinancialReservation(openAgain).status).toBe('RELEASED')
  })
})
