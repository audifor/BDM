import { describe, expect, it } from 'vitest'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld, GameWorldValidationError, updateGameWorld } from '@/domain/world'
import { financialAccountIdFromString, financialTransactionIdFromString } from '@/domain/ids'
import { getAccountBalanceAsOfDate, getFinancialTransactionsBetween, getFinancialTransactionsByDimensions, getFinancialTransactionsBySource, getOrganizationFinancialTransactions, getTrialBalanceAsOfDate } from './FinancialQueries'
import { createFinancialAccount, createFinancialTransaction, createFiscalPeriod, createMoney, createOrganizationFinancialProfile } from './FinancialLedger'

const organizationId = 'team-home'

function account(id: string, accountType: string) {
  return createFinancialAccount({ id, organizationId, accountType, currencyCode: 'EUR', openedOn: '2032-01-01' })
}

function transaction(id: string, effectiveOn: string, amount: number, debitAccount = 'account:cash', creditAccount = 'account:revenue') {
  return createFinancialTransaction({
    id,
    organizationId,
    effectiveOn,
    transactionType: 'TEST_ENTRY',
    amount: { currencyCode: 'EUR', minorUnits: amount },
    postings: [
      { accountId: debitAccount, direction: 'DEBIT', amount: { currencyCode: 'EUR', minorUnits: amount } },
      { accountId: creditAccount, direction: 'CREDIT', amount: { currencyCode: 'EUR', minorUnits: amount } },
    ],
    provenance: { kind: 'TEST', id },
  })
}

describe('CF1 financial ledger', () => {
  it('creates validated integer-minor-unit accounts and rejects invalid money', () => {
    expect(account('account:cash', 'CASH')).toMatchObject({ organizationId, currencyCode: 'EUR' })
    expect(() => createMoney({ currencyCode: 'EUR', minorUnits: Number.NaN })).toThrow()
    expect(() => createMoney({ currencyCode: 'EURO', minorUnits: 1 })).toThrow()
    expect(() => createMoney({ currencyCode: 'EUR', minorUnits: Number.POSITIVE_INFINITY })).toThrow()
  })

  it('creates immutable balanced transactions and rejects incoherent postings', () => {
    const entry = transaction('financial-tx:1', '2032-02-01', 1250)
    expect(Object.isFrozen(entry)).toBe(true)
    expect(Object.isFrozen(entry.postings)).toBe(true)
    expect(() => transaction('financial-tx:bad', '2032-02-01', 1250, 'account:cash', 'account:cash')).toThrow()
    expect(() => createFinancialTransaction({ ...entry, id: 'financial-tx:unbalanced', amount: { currencyCode: 'EUR', minorUnits: 1251 } })).toThrow()
  })

  it('derives temporal, source, dimension and organization-isolated balances from the ledger', () => {
    const input = createValidGameWorldInput()
    const first = transaction('financial-tx:1', '2032-02-01', 1250)
    const second = transaction('financial-tx:2', '2032-03-01', 300)
    const otherOrgAccount = createFinancialAccount({ id: 'account:other', organizationId: 'team-away', accountType: 'CASH', currencyCode: 'USD' })
    const world = createGameWorld({
      ...input,
      financialAccounts: [account('account:cash', 'CASH'), account('account:revenue', 'REVENUE'), otherOrgAccount],
      financialTransactions: [first, second],
      fiscalPeriods: [createFiscalPeriod({ id: 'fiscal:2032', organizationId, label: '2032', startsOn: '2032-01-01', endsOn: '2032-12-31' })],
      organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR' })],
    })
    expect(getAccountBalanceAsOfDate(world, 'account:cash', '2032-02-28').balanceMinorUnits).toBe(1250)
    expect(getAccountBalanceAsOfDate(world, 'account:cash').balanceMinorUnits).toBe(1550)
    expect(getFinancialTransactionsBetween(world, '2032-02-01', '2032-02-28')).toHaveLength(1)
    expect(getOrganizationFinancialTransactions(world, organizationId)).toHaveLength(2)
    expect(getOrganizationFinancialTransactions(world, 'team-away')).toHaveLength(0)
    expect(getFinancialTransactionsBySource(world, { kind: 'TEST', id: 'financial-tx:2' })).toHaveLength(1)
    const withDimensions = updateGameWorld(world, { financialTransactions: [first, second, createFinancialTransaction({ ...first, id: 'financial-tx:dimensioned', dimensions: { teamId: 'team-home', organizationSectionId: 'legacy-section:team-home' } })] })
    expect(getFinancialTransactionsByDimensions(withDimensions, { teamId: 'team-home' })).toHaveLength(1)
    expect(getTrialBalanceAsOfDate(world)).toHaveLength(3)
  })

  it('rejects orphaned financial ownership and preserves prior worlds when updated', () => {
    const input = createValidGameWorldInput()
    expect(() => createGameWorld({ ...input, financialAccounts: [createFinancialAccount({ id: 'account:orphan', organizationId: 'organization:missing', accountType: 'CASH', currencyCode: 'EUR' })] })).toThrow(GameWorldValidationError)
    const world = createGameWorld(input)
    const withAccount = updateGameWorld(world, { financialAccounts: [account('account:cash', 'CASH')] })
    expect(world.financialAccountsById).toEqual({})
    expect(withAccount.financialAccountsById[financialAccountIdFromString('account:cash')]).toBeDefined()
  })

  it('does not silently rewrite or remove a historical transaction', () => {
    const input = createValidGameWorldInput()
    const world = createGameWorld({ ...input, financialAccounts: [account('account:cash', 'CASH'), account('account:revenue', 'REVENUE')], financialTransactions: [transaction('financial-tx:1', '2032-02-01', 1250)] })
    const changed = { ...world.financialTransactionsById[financialTransactionIdFromString('financial-tx:1')]!, description: 'rewritten' }
    expect(() => updateGameWorld(world, { financialTransactions: [changed] })).toThrow('immutable')
    expect(() => updateGameWorld(world, { financialTransactions: [] })).toThrow('cannot be removed')
  })
})
