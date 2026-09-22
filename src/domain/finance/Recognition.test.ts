import { describe, expect, it } from 'vitest'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createFinancialAccount, createOwnerFundingTransaction, settlePayable, settleReceivable } from './index'
import { createExpenseRecognition, createExpenseRecognitionLedgerTransaction, createFinancialCommitment, createFinancialEntitlement, createRevenueRecognition, createRevenueRecognitionLedgerTransaction, createRevenueRecognitionFromEntitlement, materializeExpensePayable, materializeRevenueReceivable } from './Recognition'
import { getCashBalancesByCurrency } from './CashFlowQueries'
import { getExpenseByCategory, getExpenseBySection, getExpenseBySource, getNetOperatingResult, getOutstandingCommitments, getOutstandingEntitlements, getRecognizedButUncollectedRevenue, getRecognizedButUnpaidExpense, getRecognizedExpense, getRecognizedRevenue, getRevenueByCategory, getRevenueBySource, getRevenueByTeam } from './RecognitionQueries'

const organizationId = 'team-home'

function accounts() {
  return [
    createFinancialAccount({ id: 'cash:eur', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'receivable:eur', organizationId, accountType: 'RECEIVABLE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'payable:eur', organizationId, accountType: 'PAYABLE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'asset:eur', organizationId, accountType: 'ASSET', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'liability:eur', organizationId, accountType: 'LIABILITY', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'revenue:eur', organizationId, accountType: 'REVENUE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'expense:eur', organizationId, accountType: 'EXPENSE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'equity:eur', organizationId, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-10-01' }),
  ]
}

function baseWorld(extra: Record<string, unknown> = {}) {
  return createGameWorld({ ...createValidGameWorldInput(), financialAccounts: accounts(), ...extra } as never)
}

function prizeEntitlement() {
  return createFinancialEntitlement({ id: 'entitlement:prize', organizationId, amount: { currencyCode: 'EUR', minorUnits: 500_000 }, availableOn: '2032-10-01', dueOn: '2032-10-31', category: 'COMPETITION_PRIZE', provenance: { kind: 'COMPETITION_AUTHORIZED_EVENT', id: 'prize-entitlement-1' }, counterparty: { kind: 'EXTERNAL', label: 'League' }, dimensions: { competitionId: 'competition-a' } })
}

function prizeRecognition() {
  return createRevenueRecognitionFromEntitlement(prizeEntitlement(), { id: 'revenue:prize', amount: { currencyCode: 'EUR', minorUnits: 500_000 }, recognizedOn: '2032-10-01', category: 'COMPETITION_PRIZE', provenance: { kind: 'COMPETITION_AUTHORIZED_EVENT', id: 'prize-recognition-1' } })
}

describe('CF3 revenue, expense recognition and commitments', () => {
  it('keeps recognized revenue, receivable and cash as separate stages', () => {
    const entitlement = prizeEntitlement()
    const recognition = prizeRecognition()
    let world = baseWorld({ financialEntitlements: [entitlement], revenueRecognitions: [recognition] })
    const materialized = materializeRevenueReceivable(world, recognition.id, { receivableId: 'receivable:prize', dueOn: '2032-10-31' })
    const ledger = createRevenueRecognitionLedgerTransaction(world, materialized.recognition, { transactionId: 'tx:revenue:prize', offsetAccountId: 'receivable:eur', resultAccountId: 'revenue:eur' })
    world = updateGameWorld(world, { revenueRecognitions: [ledger.recognition], receivables: [materialized.receivable], financialTransactions: [ledger.transaction] })
    expect(getRecognizedRevenue(world, organizationId)).toEqual([{ currencyCode: 'EUR', minorUnits: 500_000 }])
    expect(getRecognizedButUncollectedRevenue(world, organizationId)).toHaveLength(1)
    expect(getCashBalancesByCurrency(world, organizationId)[0]).toMatchObject({ totalCashMinorUnits: 0 })
    const collection = settleReceivable(world, 'receivable:prize', { settlementId: 'settlement:prize', transactionId: 'tx:settlement:prize', amount: { currencyCode: 'EUR', minorUnits: 500_000 }, settledOn: '2032-10-31', cashAccountId: 'cash:eur', offsetAccountId: 'receivable:eur' })
    world = updateGameWorld(world, { financialTransactions: [...Object.values(world.financialTransactionsById), collection.transaction], treasuryApplications: [collection.settlement] })
    expect(getRecognizedRevenue(world, organizationId, '2032-10-31')).toEqual([{ currencyCode: 'EUR', minorUnits: 500_000 }])
    expect(getRecognizedButUncollectedRevenue(world, organizationId, '2032-10-31')).toHaveLength(0)
    expect(getCashBalancesByCurrency(world, organizationId, '2032-10-31')[0]).toMatchObject({ totalCashMinorUnits: 500_000 })
  })

  it('represents a future commitment without recognizing its full amount at signing', () => {
    const commitment = createFinancialCommitment({ id: 'commitment:contract', organizationId, amount: { currencyCode: 'EUR', minorUnits: 3_000_000 }, startsOn: '2032-10-01', dueOn: '2035-09-30', category: 'PLAYER_CONTRACT', provenance: { kind: 'CONTRACT_AUTHORIZED_EVENT', id: 'contract-signing-1' }, dimensions: { teamId: 'team-home' } })
    const world = baseWorld({ financialCommitments: [commitment] })
    expect(getRecognizedExpense(world, organizationId)).toEqual([])
    expect(getOutstandingCommitments(world, organizationId)[0]).toMatchObject({ remaining: { currencyCode: 'EUR', minorUnits: 3_000_000 } })
  })

  it('keeps expense recognition, payable and cash settlement separate', () => {
    const commitment = createFinancialCommitment({ id: 'commitment:vendor', organizationId, amount: { currencyCode: 'EUR', minorUnits: 100_000 }, startsOn: '2032-10-01', dueOn: '2032-10-21', category: 'OPERATING', provenance: { kind: 'OPERATING_AUTHORIZED_EVENT', id: 'vendor-commitment-1' }, counterparty: { kind: 'EXTERNAL', label: 'Vendor' }, dimensions: { teamId: 'team-home' } })
    const expense = createExpenseRecognition({ id: 'expense:vendor', organizationId, amount: { currencyCode: 'EUR', minorUnits: 100_000 }, recognizedOn: '2032-10-01', category: 'OPERATING', provenance: { kind: 'OPERATING_AUTHORIZED_EVENT', id: 'vendor-expense-1' }, commitmentId: commitment.id, counterparty: commitment.counterparty, dimensions: commitment.dimensions })
    let world = baseWorld({ financialCommitments: [commitment], expenseRecognitions: [expense] })
    const materialized = materializeExpensePayable(world, expense.id, { payableId: 'payable:vendor', dueOn: '2032-10-21' })
    const ledger = createExpenseRecognitionLedgerTransaction(world, materialized.recognition, { transactionId: 'tx:expense:vendor', offsetAccountId: 'payable:eur', resultAccountId: 'expense:eur' })
    world = updateGameWorld(world, { expenseRecognitions: [ledger.recognition], payables: [materialized.payable], financialTransactions: [ledger.transaction] })
    expect(getRecognizedExpense(world, organizationId)).toEqual([{ currencyCode: 'EUR', minorUnits: 100_000 }])
    expect(getRecognizedButUnpaidExpense(world, organizationId)).toHaveLength(1)
    expect(getCashBalancesByCurrency(world, organizationId)[0]).toMatchObject({ totalCashMinorUnits: 0 })
    const payment = settlePayable(world, 'payable:vendor', { settlementId: 'settlement:vendor', transactionId: 'tx:settlement:vendor', amount: { currencyCode: 'EUR', minorUnits: 100_000 }, settledOn: '2032-10-21', cashAccountId: 'cash:eur', offsetAccountId: 'payable:eur' })
    world = updateGameWorld(world, { financialTransactions: [...Object.values(world.financialTransactionsById), payment.transaction], treasuryApplications: [payment.settlement] })
    expect(getRecognizedExpense(world, organizationId, '2032-10-21')).toEqual([{ currencyCode: 'EUR', minorUnits: 100_000 }])
    expect(getRecognizedButUnpaidExpense(world, organizationId, '2032-10-21')).toHaveLength(0)
    expect(getCashBalancesByCurrency(world, organizationId, '2032-10-21')[0]).toMatchObject({ totalCashMinorUnits: -100_000 })
  })

  it('keeps owner funding outside revenue recognition', () => {
    const world = baseWorld()
    const funding = createOwnerFundingTransaction(world, { transactionId: 'tx:owner-funding', organizationId, amount: { currencyCode: 'EUR', minorUnits: 2_000_000 }, effectiveOn: '2032-10-01', cashAccountId: 'cash:eur', offsetAccountId: 'equity:eur', provenance: { kind: 'OWNERSHIP_AUTHORIZED_EVENT', id: 'capital-raise-1' } })
    expect(funding.transactionType).toBe('OWNER_FUNDING_RECEIPT')
    expect(getRecognizedRevenue(world, organizationId)).toEqual([])
  })

  it('derives currency, category, source, team, section and net-result queries as of a date', () => {
    const sectionId = String(createValidGameWorldInput().teams[0]!.organizationSectionId)
    const revenue = createRevenueRecognition({ id: 'revenue:as-of', organizationId, amount: { currencyCode: 'EUR', minorUnits: 300_000 }, recognizedOn: '2032-10-01', category: 'SPONSOR', provenance: { kind: 'SPONSOR_AUTHORIZED_EVENT', id: 'sponsor-1' }, dimensions: { teamId: 'team-home', organizationSectionId: sectionId } })
    const expense = createExpenseRecognition({ id: 'expense:as-of', organizationId, amount: { currencyCode: 'EUR', minorUnits: 100_000 }, recognizedOn: '2032-10-15', category: 'TRAVEL', provenance: { kind: 'TRAVEL_AUTHORIZED_EVENT', id: 'travel-1' }, dimensions: { teamId: 'team-home', organizationSectionId: sectionId } })
    const later = createRevenueRecognition({ id: 'revenue:later', organizationId, amount: { currencyCode: 'EUR', minorUnits: 900_000 }, recognizedOn: '2032-11-01', category: 'SPONSOR', provenance: { kind: 'SPONSOR_AUTHORIZED_EVENT', id: 'sponsor-2' } })
    const world = baseWorld({ revenueRecognitions: [revenue, later], expenseRecognitions: [expense] })
    expect(getRecognizedRevenue(world, organizationId, '2032-10-31')).toEqual([{ currencyCode: 'EUR', minorUnits: 300_000 }])
    expect(getRecognizedExpense(world, organizationId, '2032-10-31')).toEqual([{ currencyCode: 'EUR', minorUnits: 100_000 }])
    expect(getRevenueByCategory(world, organizationId, '2032-10-31')).toMatchObject([{ key: 'SPONSOR', minorUnits: 300_000 }])
    expect(getExpenseByCategory(world, organizationId, '2032-10-31')).toMatchObject([{ key: 'TRAVEL', minorUnits: 100_000 }])
    expect(getRevenueBySource(world, organizationId, '2032-10-31')).toMatchObject([{ key: 'SPONSOR_AUTHORIZED_EVENT', minorUnits: 300_000 }])
    expect(getExpenseBySource(world, organizationId, '2032-10-31')).toMatchObject([{ key: 'TRAVEL_AUTHORIZED_EVENT', minorUnits: 100_000 }])
    expect(getRevenueByTeam(world, organizationId, 'team-home', '2032-10-31')).toEqual([{ currencyCode: 'EUR', minorUnits: 300_000 }])
    expect(getExpenseBySection(world, organizationId, sectionId, '2032-10-31')).toEqual([{ currencyCode: 'EUR', minorUnits: 100_000 }])
    expect(getNetOperatingResult(world, organizationId, '2032-10-31')).toEqual([{ currencyCode: 'EUR', revenueMinorUnits: 300_000, expenseMinorUnits: 100_000, netMinorUnits: 200_000 }])
  })

  it('reports outstanding entitlements and rejects duplicate materialization or duplicate recognition sources', () => {
    const entitlement = prizeEntitlement()
    const recognition = createRevenueRecognition({ ...prizeRecognition(), amount: { currencyCode: 'EUR', minorUnits: 200_000 }, entitlementId: entitlement.id })
    const world = baseWorld({ financialEntitlements: [entitlement], revenueRecognitions: [recognition] })
    expect(getOutstandingEntitlements(world, organizationId)[0]).toMatchObject({ recognized: { minorUnits: 200_000 }, remaining: { minorUnits: 300_000 } })
    const materialized = materializeRevenueReceivable(world, recognition.id, { receivableId: 'receivable:partial', dueOn: '2032-10-31' })
    expect(() => materializeRevenueReceivable({ ...world, revenueRecognitionsById: { ...world.revenueRecognitionsById, [recognition.id]: materialized.recognition }, receivablesById: { [materialized.receivable.id]: materialized.receivable } } as never, recognition.id, { receivableId: 'receivable:duplicate', dueOn: '2032-10-31' })).toThrow('already')
    expect(() => baseWorld({ revenueRecognitions: [recognition, createRevenueRecognition({ ...recognition, id: 'revenue:duplicate' })], financialEntitlements: [entitlement] })).toThrow('Duplicate')
  })

  it('rejects cross-organization or cash-based recognition ledger postings', () => {
    const recognition = createRevenueRecognition({ id: 'revenue:invalid', organizationId, amount: { currencyCode: 'EUR', minorUnits: 1 }, recognizedOn: '2032-10-01', category: 'OTHER', provenance: { kind: 'TEST', id: 'invalid-1' } })
    const world = baseWorld({ revenueRecognitions: [recognition] })
    expect(() => createRevenueRecognitionLedgerTransaction(world, recognition, { transactionId: 'tx:invalid', offsetAccountId: 'cash:eur', resultAccountId: 'revenue:eur' })).toThrow('cash')
    expect(() => createRevenueRecognitionLedgerTransaction(world, recognition, { transactionId: 'tx:invalid', offsetAccountId: 'asset:eur', resultAccountId: 'expense:eur' })).toThrow('revenue')
  })

  it('keeps historical recognition immutable while allowing only a one-time link completion', () => {
    const recognition = createRevenueRecognition({ id: 'revenue:immutable', organizationId, amount: { currencyCode: 'EUR', minorUnits: 10_000 }, recognizedOn: '2032-10-01', category: 'OTHER', provenance: { kind: 'TEST', id: 'immutable-1' } })
    const world = baseWorld({ revenueRecognitions: [recognition] })
    const changed = createRevenueRecognition({ id: recognition.id, organizationId, amount: { currencyCode: 'EUR', minorUnits: 20_000 }, recognizedOn: recognition.recognizedOn, category: recognition.category, provenance: recognition.provenance })
    expect(() => updateGameWorld(world, { revenueRecognitions: [changed] })).toThrow('immutable')
    const linked = materializeRevenueReceivable(world, recognition.id, { receivableId: 'receivable:immutable', dueOn: '2032-10-31', counterparty: { kind: 'EXTERNAL', label: 'Customer' } })
    expect(() => updateGameWorld(world, { revenueRecognitions: [linked.recognition], receivables: [linked.receivable] })).not.toThrow()
  })
})
