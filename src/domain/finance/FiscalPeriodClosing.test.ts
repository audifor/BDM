import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { fiscalPeriodIdFromString } from '@/domain/ids'
import { parseGameDate } from '@/domain/date'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { closeFiscalPeriod } from './FiscalPeriodClosing'
import { createFinancialAccount, createFinancialTransaction, createFiscalPeriod } from './FinancialLedger'
import { organizationFinanceAccountId } from './FinanceFoundation'
import { getAccountBalance } from './FinancialQueries'

const organizationId = 'team-home', periodId = fiscalPeriodIdFromString('test:fiscal:2032')
const equity = organizationFinanceAccountId(organizationId, 'EUR', 'EQUITY_CONTROL')
function fixture(income = 100, expense = 70) {
  const entry = (id: string, debit: string, credit: string, amount: number) => createFinancialTransaction({ id, organizationId,
    effectiveOn: '2032-09-30', transactionType: 'TEST_FACT', amount: { currencyCode: 'EUR', minorUnits: amount },
    postings: [{ accountId: debit, direction: 'DEBIT', amount: { currencyCode: 'EUR', minorUnits: amount } }, { accountId: credit, direction: 'CREDIT', amount: { currencyCode: 'EUR', minorUnits: amount } }], provenance: { kind: 'TEST_SOURCE', id } })
  return createGameWorld({ ...createValidGameWorldInput(), currentDate: parseGameDate('2032-10-01'),
    financialAccounts: [['cash', 'CASH'], ['revenue', 'REVENUE'], ['expense', 'EXPENSE'], [equity, 'EQUITY']].map(([id, accountType]) => createFinancialAccount({ id: id!, organizationId, accountType: accountType!, currencyCode: 'EUR' })),
    fiscalPeriods: [createFiscalPeriod({ id: periodId, organizationId, label: '2032', startsOn: '2032-01-01', endsOn: '2032-09-30' })],
    financialTransactions: [...(income ? [entry('income', 'cash', 'revenue', income)] : []), ...(expense ? [entry('expense', 'expense', 'cash', expense)] : [])],
  })
}

describe('recorded fiscal result closing', () => {
  it.each([[100, 70, -30], [70, 100, 30], [100, 100, 0]])('closes income %i / expense %i into equity without changing cash or economic facts', (income, expense, expectedEquity) => {
    const world = fixture(income, expense), closed = closeFiscalPeriod(world, periodId)
    expect(closed.fiscalPeriodsById[periodId]!.status).toBe('CLOSED')
    expect(getAccountBalance(closed, 'revenue').balanceMinorUnits).toBe(0)
    expect(getAccountBalance(closed, 'expense').balanceMinorUnits).toBe(0)
    expect(getAccountBalance(closed, equity).balanceMinorUnits).toBe(expectedEquity)
    expect(getAccountBalance(closed, 'cash')).toEqual(getAccountBalance(world, 'cash'))
    for (const [id, fact] of Object.entries(world.financialTransactionsById)) expect(closed.financialTransactionsById[id as keyof typeof closed.financialTransactionsById]).toEqual(fact)
    expect(closed.revenueRecognitionsById).toEqual(world.revenueRecognitionsById)
    expect(closed.expenseRecognitionsById).toEqual(world.expenseRecognitionsById)
    expect(world.fiscalPeriodsById[periodId]!.status).toBe('OPEN')
    expect(closeFiscalPeriod(closed, periodId)).toBe(closed)
    const restored = deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(serializeGameWorldV4(closed, '2026-10-28T00:00:00Z'))))
    expect(closeFiscalPeriod(restored, periodId)).toBe(restored)
    expect(restored.financialTransactionsById).toEqual(closed.financialTransactionsById)
  })
  it('closes an empty period without inventing a transaction', () => {
    const closed = closeFiscalPeriod(fixture(0, 0), periodId)
    expect(Object.values(closed.financialTransactionsById)).toHaveLength(0)
    expect(closed.fiscalPeriodsById[periodId]!.status).toBe('CLOSED')
  })
  it('refuses premature closure and preserves closed period identity and historical postings', () => {
    const world = fixture(), period = world.fiscalPeriodsById[periodId]!
    expect(() => closeFiscalPeriod(updateGameWorld(world, { currentDate: period.endsOn }), periodId)).toThrow('must have ended')
    const closed = closeFiscalPeriod(world, periodId)
    expect(() => updateGameWorld(closed, { fiscalPeriods: [{ ...period, status: 'OPEN' }] })).toThrow('immutable')
    expect(() => updateGameWorld(closed, { fiscalPeriods: [] })).toThrow('immutable')
    expect(() => updateGameWorld(closed, { fiscalPeriods: [{ ...period, status: 'CLOSED', endsOn: '2032-10-01' as never }] })).toThrow('immutable')
    const late = createFinancialTransaction({ ...world.financialTransactionsById['income' as never]!, id: 'late' })
    expect(() => updateGameWorld(closed, { financialTransactions: [...Object.values(closed.financialTransactionsById), late] })).toThrow('closed fiscal period')
    expect(() => updateGameWorld(closed, { financialTransactions: Object.values(closed.financialTransactionsById).filter(t => t.transactionType !== 'FISCAL_PERIOD_CLOSING') })).toThrow('cannot be removed')
  })
})
