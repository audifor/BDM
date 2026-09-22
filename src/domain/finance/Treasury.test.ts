import { describe, expect, it } from 'vitest'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createFinancialAccount, createFinancialTransaction } from './FinancialLedger'
import { createPayable, createReceivable, createCompetitionDistributionTransaction, createOwnerFundingTransaction, settlePayable, settleReceivable } from './Treasury'
import { getCashBalancesByCurrency, getCashFlowProjection, getCashFlowTotalsBetween, getCashInflowsBetween, getCashOutflowsBetween, getDuePayables, getDueReceivables, getLiquiditySnapshot } from './CashFlowQueries'

const organizationId = 'team-home'

function accounts() {
  return [
    createFinancialAccount({ id: 'cash:operating:eur', organizationId, accountType: 'CASH_OPERATING_BANK', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'cash:restricted:eur', organizationId, accountType: 'CASH_RESTRICTED', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'cash:usd', organizationId, accountType: 'CASH_SECONDARY_BANK', currencyCode: 'USD', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'receivable:eur', organizationId, accountType: 'RECEIVABLE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'payable:eur', organizationId, accountType: 'PAYABLE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'equity:eur', organizationId, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'equity:usd', organizationId, accountType: 'EQUITY', currencyCode: 'USD', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'revenue:eur', organizationId, accountType: 'REVENUE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
  ]
}

function openingTransaction(id: string, accountId: string, amount: number, date = '2032-10-01') {
  const currencyCode = accountId === 'cash:usd' ? 'USD' : 'EUR'
  return createFinancialTransaction({ id, organizationId, effectiveOn: date, transactionType: 'OPENING_CASH', amount: { currencyCode, minorUnits: amount }, postings: [{ accountId, direction: 'DEBIT', amount: { currencyCode, minorUnits: amount } }, { accountId: currencyCode === 'USD' ? 'equity:usd' : 'equity:eur', direction: 'CREDIT', amount: { currencyCode, minorUnits: amount } }], provenance: { kind: 'TEST', id } })
}

function baseWorld(extra: Record<string, unknown> = {}) {
  return createGameWorld({ ...createValidGameWorldInput(), financialAccounts: accounts(), ...extra } as never)
}

function receivable(cancelledOn: string | null = null) {
  return createReceivable({ id: 'receivable:prize', organizationId, amount: { currencyCode: 'EUR', minorUnits: 3_000_000 }, counterparty: { kind: 'EXTERNAL', label: 'League' }, recognizedOn: '2032-10-01', dueOn: '2032-10-31', provenance: { kind: 'COMPETITION_ENTITLEMENT', id: 'prize-1' }, dimensions: { competitionId: 'competition-a' }, cancelledOn })
}

function payable(cancelledOn: string | null = null) {
  return createPayable({ id: 'payable:vendor', organizationId, amount: { currencyCode: 'EUR', minorUnits: 2_000_000 }, counterparty: { kind: 'EXTERNAL', label: 'Vendor' }, recognizedOn: '2032-10-01', dueOn: '2032-10-20', provenance: { kind: 'EXPENSE_COMMITMENT', id: 'commitment-1' }, dimensions: { teamId: 'team-home' }, cancelledOn })
}

describe('CF2 Treasury and Cash Flow', () => {
  it('derives multiple cash accounts, restrictions, currencies and known obligations without conflating them', () => {
    const world = baseWorld({ financialTransactions: [openingTransaction('tx:eur', 'cash:operating:eur', 1_000_000), openingTransaction('tx:usd', 'cash:usd', 500_000)], receivables: [receivable()], payables: [payable()] })
    expect(getCashBalancesByCurrency(world, organizationId)).toMatchObject([
      { currencyCode: 'EUR', totalCashMinorUnits: 1_000_000, unrestrictedCashMinorUnits: 1_000_000, restrictedCashMinorUnits: 0 },
      { currencyCode: 'USD', totalCashMinorUnits: 500_000 },
    ])
    expect(getDueReceivables(world, organizationId, '2032-11-01')).toHaveLength(1)
    expect(getDuePayables(world, organizationId, '2032-11-01')).toHaveLength(1)
    const projection = getCashFlowProjection(world, organizationId, { throughDate: '2032-11-01' })
    expect(projection.byCurrency.find((row) => row.currencyCode === 'EUR')).toMatchObject({ openingCashMinorUnits: 1_000_000, receivablesDueMinorUnits: 3_000_000, payablesDueMinorUnits: 2_000_000, projectedClosingCashMinorUnits: 2_000_000 })
    expect(projection.byCurrency.find((row) => row.currencyCode === 'USD')).toMatchObject({ openingCashMinorUnits: 500_000, projectedClosingCashMinorUnits: 500_000 })
    expect(getLiquiditySnapshot(world, organizationId, { horizonDays: 90 }).byCurrency).toHaveLength(2)
  })

  it('collects receivables and settles payables through balanced ledger transactions, including partial settlement', () => {
    const world = baseWorld({ financialTransactions: [openingTransaction('tx:eur', 'cash:operating:eur', 1_000_000)], receivables: [receivable()], payables: [payable()] })
    const firstCollection = settleReceivable(world, 'receivable:prize', { settlementId: 'settlement:receivable:1', transactionId: 'tx:collection:1', amount: { currencyCode: 'EUR', minorUnits: 1_000_000 }, settledOn: '2032-10-15', cashAccountId: 'cash:operating:eur', offsetAccountId: 'receivable:eur' })
    const afterCollection = updateGameWorld(world, { financialTransactions: [...Object.values(world.financialTransactionsById), firstCollection.transaction], treasuryApplications: [firstCollection.settlement] })
    expect(getCashBalancesByCurrency(afterCollection, organizationId, '2032-10-31')[0]).toMatchObject({ totalCashMinorUnits: 2_000_000 })
    expect(getDueReceivables(afterCollection, organizationId, '2032-11-01', '2032-10-31')[0]).toMatchObject({ status: 'PARTIALLY_SETTLED', remainingMinorUnits: 2_000_000 })
    const secondCollection = settleReceivable(afterCollection, 'receivable:prize', { settlementId: 'settlement:receivable:2', transactionId: 'tx:collection:2', amount: { currencyCode: 'EUR', minorUnits: 2_000_000 }, settledOn: '2032-10-20', cashAccountId: 'cash:operating:eur', offsetAccountId: 'receivable:eur' })
    const afterFullCollection = updateGameWorld(afterCollection, { financialTransactions: [...Object.values(afterCollection.financialTransactionsById), secondCollection.transaction], treasuryApplications: [...Object.values(afterCollection.treasuryApplicationsById), secondCollection.settlement] })
    expect(getDueReceivables(afterFullCollection, organizationId, '2032-11-01', '2032-10-31')).toHaveLength(0)
    const payment = settlePayable(afterFullCollection, 'payable:vendor', { settlementId: 'settlement:payable:1', transactionId: 'tx:payment:1', amount: { currencyCode: 'EUR', minorUnits: 500_000 }, settledOn: '2032-10-20', cashAccountId: 'cash:operating:eur', offsetAccountId: 'payable:eur' })
    const afterPayment = updateGameWorld(afterFullCollection, { financialTransactions: [...Object.values(afterFullCollection.financialTransactionsById), payment.transaction], treasuryApplications: [...Object.values(afterFullCollection.treasuryApplicationsById), payment.settlement] })
    expect(getDuePayables(afterPayment, organizationId, '2032-11-01', '2032-10-31')[0]).toMatchObject({ status: 'PARTIALLY_SETTLED', remainingMinorUnits: 1_500_000 })
    expect(getCashFlowTotalsBetween(afterPayment, organizationId, '2032-10-01', '2032-10-31')[0]).toMatchObject({ inflowMinorUnits: 4_000_000, outflowMinorUnits: 500_000, netMinorUnits: 3_500_000 })
  })

  it('rejects invalid settlement paths and keeps Organization isolation', () => {
    const world = baseWorld({ financialAccounts: [...accounts(), createFinancialAccount({ id: 'cash:away', organizationId: 'team-away', accountType: 'CASH', currencyCode: 'EUR' })], receivables: [receivable()], payables: [payable()] })
    expect(() => settleReceivable(world, 'receivable:prize', { settlementId: 'settlement:bad', transactionId: 'tx:bad', amount: { currencyCode: 'USD', minorUnits: 1 }, settledOn: '2032-10-15', cashAccountId: 'cash:operating:eur', offsetAccountId: 'receivable:eur' })).toThrow('currency')
    expect(() => settleReceivable(world, 'receivable:prize', { settlementId: 'settlement:bad', transactionId: 'tx:bad', amount: { currencyCode: 'EUR', minorUnits: 3_000_001 }, settledOn: '2032-10-15', cashAccountId: 'cash:operating:eur', offsetAccountId: 'receivable:eur' })).toThrow('exceeds')
    expect(() => settleReceivable(world, 'receivable:prize', { settlementId: 'settlement:bad', transactionId: 'tx:bad', amount: { currencyCode: 'EUR', minorUnits: 1 }, settledOn: '2032-10-15', cashAccountId: 'cash:away', offsetAccountId: 'receivable:eur' })).toThrow('Organization')
    expect(() => settleReceivable(world, 'receivable:prize', { settlementId: 'settlement:bad', transactionId: 'tx:bad', amount: { currencyCode: 'EUR', minorUnits: 0 }, settledOn: '2032-10-15', cashAccountId: 'cash:operating:eur', offsetAccountId: 'receivable:eur' })).toThrow('greater than zero')
    const existing = settleReceivable(world, 'receivable:prize', { settlementId: 'settlement:existing', transactionId: 'tx:existing', amount: { currencyCode: 'EUR', minorUnits: 1 }, settledOn: '2032-10-15', cashAccountId: 'cash:operating:eur', offsetAccountId: 'receivable:eur' })
    const withExisting = updateGameWorld(world, { financialTransactions: [...Object.values(world.financialTransactionsById), existing.transaction], treasuryApplications: [existing.settlement] })
    expect(() => settleReceivable(withExisting, 'receivable:prize', { settlementId: 'settlement:existing', transactionId: 'tx:duplicate', amount: { currencyCode: 'EUR', minorUnits: 1 }, settledOn: '2032-10-15', cashAccountId: 'cash:operating:eur', offsetAccountId: 'receivable:eur' })).toThrow('Duplicate')
    const cancelled = baseWorld({ receivables: [receivable('2032-10-12')] })
    expect(() => settleReceivable(cancelled, 'receivable:prize', { settlementId: 'settlement:cancelled', transactionId: 'tx:cancelled', amount: { currencyCode: 'EUR', minorUnits: 1 }, settledOn: '2032-10-13', cashAccountId: 'cash:operating:eur', offsetAccountId: 'receivable:eur' })).toThrow('Cancelled')
  })

  it('records authorized owner funding and competition distributions as cash receipts without inventing authority', () => {
    const world = baseWorld()
    const funding = createOwnerFundingTransaction(world, { transactionId: 'tx:owner-funding', organizationId, amount: { currencyCode: 'EUR', minorUnits: 250_000 }, effectiveOn: '2032-10-02', cashAccountId: 'cash:operating:eur', offsetAccountId: 'equity:eur', provenance: { kind: 'OWNERSHIP_AUTHORIZED_EVENT', id: 'capital-raise-event-1' } })
    const distribution = createCompetitionDistributionTransaction(world, { transactionId: 'tx:distribution', organizationId, amount: { currencyCode: 'EUR', minorUnits: 100_000 }, effectiveOn: '2032-10-03', cashAccountId: 'cash:operating:eur', offsetAccountId: 'revenue:eur', provenance: { kind: 'COMPETITION_AUTHORIZED_EVENT', id: 'distribution-event-1' } })
    expect(funding.transactionType).toBe('OWNER_FUNDING_RECEIPT')
    expect(distribution.transactionType).toBe('COMPETITION_DISTRIBUTION_RECEIPT')
    expect(() => createOwnerFundingTransaction(world, { transactionId: 'tx:no-source', organizationId, amount: { currencyCode: 'EUR', minorUnits: 1 }, effectiveOn: '2032-10-02', cashAccountId: 'cash:operating:eur', offsetAccountId: 'equity:eur', provenance: { kind: 'OWNERSHIP_AUTHORIZED_EVENT' } })).toThrow('provenance')
    expect(getCashInflowsBetween({ ...world, financialTransactionsById: { ...world.financialTransactionsById, [funding.id]: funding } }, organizationId, '2032-10-01', '2032-10-31')).toHaveLength(1)
  })
})
