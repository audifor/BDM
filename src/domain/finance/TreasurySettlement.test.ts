import { describe, expect, it } from 'vitest'

import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createFinancialAccount, createFinancialTransaction } from '@/domain/finance/FinancialLedger'
import {
  countDuePayablesInOtherCurrency,
  duePayablePaymentTransactionId,
  duePayableSettlementId,
  getEligibleDuePayablesForDate,
  settleDuePayableBatchForDate,
} from '@/domain/finance/TreasurySettlement'
import { createPayable, createFinancialReservation, getPayableStatus } from '@/domain/finance'

/**
 * BS16J Treasury & Settlement Truth at the policy boundary. These tests drive the canonical due-payable batch
 * authority with explicit canonical ledger fixtures (accounts, cash postings, payables), so the approved
 * all-or-none policy, the no-priority rule, the no-partial rule, organization/currency isolation and idempotency
 * are all provable without touching any shipped default.
 */
const ORGANIZATION = 'team-home'

function accounts() {
  return [
    createFinancialAccount({ id: 'cash:operating:eur', organizationId: ORGANIZATION, accountType: 'CASH_OPERATING_BANK', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'cash:operating:usd', organizationId: ORGANIZATION, accountType: 'CASH_OPERATING_BANK', currencyCode: 'USD', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'payable:eur', organizationId: ORGANIZATION, accountType: 'PAYABLE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'payable:usd', organizationId: ORGANIZATION, accountType: 'PAYABLE', currencyCode: 'USD', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'equity:eur', organizationId: ORGANIZATION, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'cash:other-org:eur', organizationId: 'team-away', accountType: 'CASH_OPERATING_BANK', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'payable:other-org:eur', organizationId: 'team-away', accountType: 'PAYABLE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
  ]
}

/** A canonical, explicit cash fact (debit cash / credit equity) — the only way cash enters a fixture world. */
function cashFact(id: string, accountId: string, minorUnits: number, effectiveOn = '2032-10-01', currencyCode: 'EUR' | 'USD' = 'EUR') {
  const amount = { currencyCode, minorUnits }
  return createFinancialTransaction({
    id, organizationId: ORGANIZATION, effectiveOn, transactionType: 'OWNER_FUNDING_RECEIPT', amount,
    postings: [{ accountId, direction: 'DEBIT', amount }, { accountId: 'equity:eur', direction: 'CREDIT', amount }],
    provenance: { kind: 'OWNER_FUNDING', id },
  })
}

function payable(id: string, dueOn: string, minorUnits: number, options: { currencyCode?: 'EUR' | 'USD'; organizationId?: string; cancelledOn?: string | null } = {}) {
  const currencyCode = options.currencyCode ?? 'EUR'
  return createPayable({
    id,
    organizationId: options.organizationId ?? ORGANIZATION,
    amount: { currencyCode, minorUnits },
    counterparty: { kind: 'EXTERNAL', label: 'Vendor' },
    recognizedOn: '2032-10-01',
    dueOn,
    provenance: { kind: 'EXPENSE_COMMITMENT', id: `commitment:${id}` },
    cancelledOn: options.cancelledOn ?? null,
  })
}

function world(input: { readonly cashMinorUnits?: number; readonly payables?: readonly unknown[]; readonly reservations?: readonly unknown[]; readonly transactions?: readonly unknown[] } = {}): GameWorld {
  return createGameWorld({
    ...createValidGameWorldInput(),
    financialAccounts: accounts(),
    financialTransactions: input.transactions ?? (input.cashMinorUnits === undefined ? [] : [cashFact('tx:funding', 'cash:operating:eur', input.cashMinorUnits)]),
    payables: input.payables ?? [],
    financialReservations: input.reservations ?? [],
  } as never)
}

function settleOn(subject: GameWorld, date: string, currencyCode: 'EUR' | 'USD' = 'EUR', organizationId = ORGANIZATION) {
  return settleDuePayableBatchForDate(subject, {
    organizationId,
    currencyCode,
    date,
    cashAccountId: currencyCode === 'EUR' ? 'cash:operating:eur' : 'cash:operating:usd',
    payableAccountId: currencyCode === 'EUR' ? 'payable:eur' : 'payable:usd',
  })
}

function balanceOf(subject: GameWorld, accountId: string): number {
  let total = 0
  for (const transaction of Object.values(subject.financialTransactionsById)) {
    for (const posting of transaction.postings.filter((item) => String(item.accountId) === accountId)) total += posting.direction === 'DEBIT' ? posting.amount.minorUnits : -posting.amount.minorUnits
  }
  return total
}

function settlementTransactions(subject: GameWorld) {
  return Object.values(subject.financialTransactionsById).filter((transaction) => transaction.transactionType === 'PAYABLE_SETTLEMENT')
}

describe('BS16J due payable batch settlement policy', () => {
  it('is a cheap no-op that never reads the ledger when nothing is due', () => {
    const subject = world({ cashMinorUnits: 5_000, payables: [payable('payable:future', '2032-11-01', 1_000)] })
    const application = settleOn(subject, '2032-10-20')

    expect(application.world).toBe(subject)
    expect(application.result.status).toBe('NO_DUE_PAYABLES')
    expect(application.result.eligiblePayableCount).toBe(0)
    expect(application.result.availableCashMinorUnits).toBeNull()
    expect(getPayableStatus(subject, 'payable:future', '2032-10-20')).toBe('OPEN')
  })

  it('excludes future-dated and cancelled payables, and keeps overdue ones eligible', () => {
    const subject = world({
      cashMinorUnits: 1_000,
      payables: [
        payable('payable:future', '2032-10-25', 500),
        payable('payable:cancelled', '2032-10-05', 500, { cancelledOn: '2032-10-06' }),
        payable('payable:overdue', '2032-10-02', 500),
      ],
    })

    const eligible = getEligibleDuePayablesForDate(subject, { organizationId: ORGANIZATION, currencyCode: 'EUR', date: '2032-10-20' })
    expect(eligible.map((entry) => String(entry.payable.id))).toEqual(['payable:overdue'])

    // An overdue payable stays eligible on a much later date and settles once the whole batch is fundable.
    const application = settleOn(subject, '2032-10-20')
    expect(application.result.status).toBe('SETTLED')
    expect(getPayableStatus(application.world, 'payable:overdue', '2032-10-20')).toBe('SETTLED')
    expect(getPayableStatus(application.world, 'payable:future', '2032-10-20')).toBe('OPEN')
    expect(getPayableStatus(application.world, 'payable:cancelled', '2032-10-20')).toBe('CANCELLED')
  })

  it('settles a fundable payable as payable debit / cash credit with no second expense', () => {
    const subject = world({ cashMinorUnits: 6_000, payables: [payable('payable:vendor', '2032-10-20', 6_000)] })
    const application = settleOn(subject, '2032-10-20')

    expect(application.result.status).toBe('SETTLED')
    expect(application.result.settledCount).toBe(1)
    expect(application.result.settledMinorUnits).toBe(6_000)
    expect(application.result.fundingGapMinorUnits).toBe(0)
    expect(getPayableStatus(application.world, 'payable:vendor', '2032-10-20')).toBe('SETTLED')

    const settlements = Object.values(application.world.treasuryApplicationsById)
    expect(settlements).toHaveLength(1)
    expect(String(settlements[0]!.id)).toBe(String(duePayableSettlementId('payable:vendor')))
    expect(String(settlements[0]!.transactionId)).toBe(String(duePayablePaymentTransactionId('payable:vendor')))
    const [payment] = settlementTransactions(application.world)
    expect(payment!.postings.map((posting) => [String(posting.accountId), posting.direction])).toEqual([['payable:eur', 'DEBIT'], ['cash:operating:eur', 'CREDIT']])
    // Cash is ledger-derived and balanced; recognition is never repeated by a payment. The fixture never posted
    // the recognition credit, so the control account carries exactly the settlement debit.
    expect(balanceOf(application.world, 'cash:operating:eur')).toBe(0)
    expect(balanceOf(application.world, 'payable:eur')).toBe(6_000)
    expect(Object.keys(application.world.expenseRecognitionsById)).toHaveLength(0)
    expect(Object.keys(application.world.payablesById)).toHaveLength(1)
  })

  it('leaves the only due payable outstanding when cash is a single unit short', () => {
    const subject = world({ cashMinorUnits: 5_999, payables: [payable('payable:vendor', '2032-10-20', 6_000)] })
    const application = settleOn(subject, '2032-10-20')

    expect(application.result.status).toBe('INSUFFICIENT_LIQUIDITY_FOR_DUE_PAYABLES')
    expect(application.result.eligiblePayableCount).toBe(1)
    expect(application.result.totalDueMinorUnits).toBe(6_000)
    expect(application.result.availableCashMinorUnits).toBe(5_999)
    expect(application.result.fundingGapMinorUnits).toBe(1)
    expect(application.result.settledCount).toBe(0)
    expect(application.world).toBe(subject)
    expect(getPayableStatus(application.world, 'payable:vendor', '2032-10-20')).toBe('OPEN')
    expect(balanceOf(application.world, 'cash:operating:eur')).toBe(5_999)
  })

  it('settles nothing when cash does not cover the whole batch, and never partially', () => {
    const subject = world({
      cashMinorUnits: 8_000,
      payables: [payable('payable:a', '2032-10-10', 4_000), payable('payable:b', '2032-10-11', 3_000), payable('payable:c', '2032-10-12', 2_000)],
    })
    const application = settleOn(subject, '2032-10-20')

    expect(application.result.status).toBe('INSUFFICIENT_LIQUIDITY_FOR_DUE_PAYABLES')
    expect(application.result.eligiblePayableCount).toBe(3)
    expect(application.result.totalDueMinorUnits).toBe(9_000)
    expect(application.result.availableCashMinorUnits).toBe(8_000)
    expect(application.result.fundingGapMinorUnits).toBe(1_000)
    expect(application.result.settledCount).toBe(0)
    // All-or-none: no partial allocation, no negative cash, no settlement artifacts, obligations untouched.
    expect(application.world).toBe(subject)
    expect(Object.keys(application.world.treasuryApplicationsById)).toHaveLength(0)
    expect(settlementTransactions(application.world)).toHaveLength(0)
    expect(balanceOf(application.world, 'cash:operating:eur')).toBe(8_000)
    expect(['payable:a', 'payable:b', 'payable:c'].map((id) => getPayableStatus(application.world, id, '2032-10-20'))).toEqual(['OPEN', 'OPEN', 'OPEN'])
  })

  it('settles every payable in a fully fundable batch in deterministic order and leaves zero cash', () => {
    const payables = [payable('payable:c', '2032-10-12', 2_000), payable('payable:a', '2032-10-10', 4_000), payable('payable:b', '2032-10-11', 3_000)]
    const subject = world({ cashMinorUnits: 9_000, payables })
    const application = settleOn(subject, '2032-10-20')

    expect(application.result.status).toBe('SETTLED')
    expect(application.result.settledCount).toBe(3)
    expect(application.result.settledMinorUnits).toBe(9_000)
    expect(settlementTransactions(application.world).map((transaction) => String(transaction.id))).toEqual([
      String(duePayablePaymentTransactionId('payable:a')),
      String(duePayablePaymentTransactionId('payable:b')),
      String(duePayablePaymentTransactionId('payable:c')),
    ])
    expect(balanceOf(application.world, 'cash:operating:eur')).toBe(0)
    expect(['payable:a', 'payable:b', 'payable:c'].map((id) => getPayableStatus(application.world, id, '2032-10-20'))).toEqual(['SETTLED', 'SETTLED', 'SETTLED'])
  })

  it('is idempotent: a settled batch is no longer eligible and replay changes nothing', () => {
    const subject = world({ cashMinorUnits: 6_000, payables: [payable('payable:vendor', '2032-10-20', 6_000)] })
    const first = settleOn(subject, '2032-10-20')
    const replay = settleOn(first.world, '2032-10-20')

    expect(replay.world).toBe(first.world)
    expect(replay.result.status).toBe('NO_DUE_PAYABLES')
    expect(Object.keys(replay.world.treasuryApplicationsById)).toHaveLength(1)
    expect(settlementTransactions(replay.world)).toHaveLength(1)
    expect(balanceOf(replay.world, 'cash:operating:eur')).toBe(0)
  })

  it('keeps organizations isolated: one club never pays with another club cash', () => {
    const subject = createGameWorld({
      ...createValidGameWorldInput(),
      financialAccounts: accounts(),
      financialTransactions: [cashFact('tx:funding', 'cash:operating:eur', 6_000)],
      payables: [payable('payable:home', '2032-10-20', 6_000), payable('payable:away', '2032-10-20', 6_000, { organizationId: 'team-away' })],
    } as never)

    const home = settleOn(subject, '2032-10-20')
    expect(home.result.status).toBe('SETTLED')
    expect(getPayableStatus(home.world, 'payable:home', '2032-10-20')).toBe('SETTLED')
    // The funded club's cash never reaches the zero-cash club, which still owes its own payable.
    expect(getPayableStatus(home.world, 'payable:away', '2032-10-20')).toBe('OPEN')
    expect(Object.keys(home.world.treasuryApplicationsById)).toHaveLength(1)
  })

  it('never converts currency: a due payable in another currency is reported, not settled or ignored', () => {
    const subject = world({
      cashMinorUnits: 6_000,
      payables: [payable('payable:eur', '2032-10-20', 6_000), payable('payable:usd', '2032-10-20', 5_000, { currencyCode: 'USD' })],
    })
    expect(countDuePayablesInOtherCurrency(subject, { organizationId: ORGANIZATION, currencyCode: 'EUR', date: '2032-10-20' })).toBe(1)

    const application = settleOn(subject, '2032-10-20')
    expect(application.result.status).toBe('SETTLED')
    expect(application.result.ineligibleCurrencyPayableCount).toBe(1)
    expect(application.result.reason).toContain('another currency')
    // The USD obligation is untouched: no FX, no conversion, no cross-currency corruption.
    expect(getPayableStatus(application.world, 'payable:usd', '2032-10-20')).toBe('OPEN')
    expect(balanceOf(application.world, 'payable:usd')).toBe(0)
    expect(balanceOf(application.world, 'cash:operating:eur')).toBe(0)
  })

  it('uses actual cash only: a reservation protects capacity but is never double-subtracted from cash', () => {
    const reservation = createFinancialReservation({ id: 'reservation:pending', organizationId: ORGANIZATION, currency: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 4_000 }, sourceAuthority: 'NEGOTIATION', sourceEntityId: 'negotiation:1', createdOn: '2032-10-05' })
    const subject = world({ cashMinorUnits: 10_000, payables: [payable('payable:vendor', '2032-10-20', 6_000)], reservations: [reservation] })

    const application = settleOn(subject, '2032-10-20')
    expect(application.result.status).toBe('SETTLED')
    expect(balanceOf(application.world, 'cash:operating:eur')).toBe(4_000)
    expect(Object.values(application.world.financialReservationsById)).toHaveLength(1)
    expect(Object.values(application.world.financialReservationsById)[0]!.status).toBe('OPEN')
  })

  it('is deterministic: identical worlds produce identical batch decisions and artifact ids', () => {
    const build = () => world({ cashMinorUnits: 9_000, payables: [payable('payable:b', '2032-10-11', 3_000), payable('payable:a', '2032-10-10', 6_000)] })
    const first = settleOn(build(), '2032-10-20')
    const second = settleOn(build(), '2032-10-20')

    expect(first.result).toEqual(second.result)
    expect(Object.keys(first.world.treasuryApplicationsById).sort()).toEqual(Object.keys(second.world.treasuryApplicationsById).sort())
    expect(Object.keys(first.world.financialTransactionsById).sort()).toEqual(Object.keys(second.world.financialTransactionsById).sort())
  })

  it('blocks the whole batch instead of half-applying it when a settlement cannot be validated', () => {
    const subject = world({ cashMinorUnits: 9_000, payables: [payable('payable:a', '2032-10-10', 4_000), payable('payable:b', '2032-10-11', 5_000)] })
    // A pre-existing artifact that collides with the deterministic settlement id makes the batch unapplicable.
    const blocked = updateGameWorld(subject, {
      financialTransactions: [cashFact('tx:funding', 'cash:operating:eur', 9_000), { ...cashFact('tx:collision', 'cash:operating:eur', 1, '2032-10-20'), id: duePayablePaymentTransactionId('payable:b') }],
    } as never)

    const application = settleOn(blocked, '2032-10-20')
    expect(application.result.status).toBe('BLOCKED')
    expect(application.result.settledCount).toBe(0)
    expect(application.result.reason).toBeTruthy()
    // Atomicity: nothing of the batch was applied, and the world is exactly the pre-settlement world.
    expect(application.world).toBe(blocked)
    expect(Object.keys(application.world.treasuryApplicationsById)).toHaveLength(0)
    expect(settlementTransactions(application.world)).toHaveLength(0)
    expect(getPayableStatus(application.world, 'payable:a', '2032-10-20')).toBe('OPEN')
    expect(getPayableStatus(application.world, 'payable:b', '2032-10-20')).toBe('OPEN')
  })
})
