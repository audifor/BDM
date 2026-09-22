import { describe, expect, it } from 'vitest'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createExpenseRecognition } from './Recognition'
import { createFinancialAccount } from './FinancialLedger'
import { createFinancialBudget, createBudgetLine, createFinancialPlanningPeriod, getBudgetComparison } from './BudgetForecasting'
import { settlePayable } from './Treasury'
import { createAuthorizedOperatingCostFact, createOperatingCostSource, getFutureOperatingCostCommitments, getOperatingExpenseByCategory, getOperatingExpenseYtd, materializeOperatingCostsForDate } from './OperatingCostEngine'
import { createFinancialForecast } from './BudgetForecasting'
import { getCashBalancesByCurrency } from './CashFlowQueries'

function accounts(organizationId: string) {
  return [
    createFinancialAccount({ id: 'cash:eur', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-01-01' }),
    createFinancialAccount({ id: 'cash:usd', organizationId, accountType: 'CASH', currencyCode: 'USD', openedOn: '2032-01-01' }),
    createFinancialAccount({ id: 'payable:eur', organizationId, accountType: 'PAYABLE', currencyCode: 'EUR', openedOn: '2032-01-01' }),
    createFinancialAccount({ id: 'payable:usd', organizationId, accountType: 'PAYABLE', currencyCode: 'USD', openedOn: '2032-01-01' }),
    createFinancialAccount({ id: 'expense:eur', organizationId, accountType: 'EXPENSE', currencyCode: 'EUR', openedOn: '2032-01-01' }),
    createFinancialAccount({ id: 'expense:usd', organizationId, accountType: 'EXPENSE', currencyCode: 'USD', openedOn: '2032-01-01' }),
  ]
}

const provenance = (id: string) => ({ kind: 'CF8_TEST', id })
const ledger = (currencyCode: 'EUR' | 'USD') => ({ offsetAccountId: `payable:${currencyCode.toLowerCase()}`, resultAccountId: `expense:${currencyCode.toLowerCase()}` })

function baseWorld(extra: Partial<ReturnType<typeof createValidGameWorldInput>> = {}) {
  return createGameWorld({ ...createValidGameWorldInput(), financialAccounts: accounts('team-home'), ...extra })
}

describe('CF8 operating cost engine', () => {
  it('generates a deterministic facility annual schedule and recognizes 600k once', () => {
    const source = createOperatingCostSource({ id: 'facility:arena', organizationId: 'team-home', category: 'FACILITY', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 600_000 }, startsOn: '2032-10-01', endsOn: '2033-09-30', sourceAuthority: 'FACILITY', generationPolicy: 'ANNUAL', dueDatePolicy: 'ON_RECOGNITION', teamId: 'team-home', facilityId: 'arena-1', provenance: provenance('facility') })
    const world = baseWorld({ operatingCostSources: [source] })
    const result = materializeOperatingCostsForDate(world, '2032-10-01', { organizationId: 'team-home', ledger: ledger('EUR') })
    expect(result.status).toBe('accepted')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.amount.minorUnits).toBe(600_000)
    expect(Object.values(result.world.expenseRecognitionsById)[0]?.amount.minorUnits).toBe(600_000)
    expect(Object.values(result.world.payablesById)[0]?.amount.minorUnits).toBe(600_000)
    expect(getOperatingExpenseYtd(result.world, 'team-home', '2032-12-31')).toEqual([{ currencyCode: 'EUR', minorUnits: 600_000 }])
  })

  it('recognizes only an explicitly authorized travel fact', () => {
    const fact = createAuthorizedOperatingCostFact({ id: 'travel:trip-1', authority: 'TRAVEL', sourceEntityId: 'trip-1', organizationId: 'team-home', category: 'TRAVEL', amount: { currencyCode: 'EUR', minorUnits: 25_000 }, incurredOn: '2032-10-02', dueOn: '2032-10-02', teamId: 'team-home', provenance: provenance('travel') })
    const world = baseWorld({ operatingCostFacts: [fact] })
    const result = materializeOperatingCostsForDate(world, '2032-10-02', { organizationId: 'team-home', ledger: ledger('EUR') })
    expect(result.status).toBe('accepted')
    expect(getOperatingExpenseByCategory(result.world, 'team-home', '2032-10-01', '2032-10-31')).toEqual([{ category: 'TRAVEL', currencyCode: 'EUR', minorUnits: 25_000 }])
    expect(materializeOperatingCostsForDate(baseWorld(), '2032-10-02', { organizationId: 'team-home', ledger: ledger('EUR') }).entries).toHaveLength(0)
  })

  it('is idempotent and settlement changes cash, not expense recognition', () => {
    const source = createOperatingCostSource({ id: 'venue:event', organizationId: 'team-home', category: 'VENUE', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 100_000 }, startsOn: '2032-10-03', endsOn: '2032-10-03', sourceAuthority: 'FACILITY', generationPolicy: 'ONE_OFF', dueDatePolicy: 'ON_RECOGNITION', provenance: provenance('venue') })
    const first = materializeOperatingCostsForDate(baseWorld({ operatingCostSources: [source] }), '2032-10-03', { organizationId: 'team-home', ledger: ledger('EUR') })
    const retry = materializeOperatingCostsForDate(first.world, '2032-10-03', { organizationId: 'team-home', ledger: ledger('EUR') })
    expect(retry.status).toBe('alreadyProcessed')
    expect(Object.keys(retry.world.expenseRecognitionsById)).toHaveLength(1)
    const payable = Object.values(first.world.payablesById)[0]!
    const settlement = settlePayable(first.world, payable.id, { settlementId: 'settlement:venue:event', transactionId: 'transaction:settlement:venue:event', amount: payable.amount, settledOn: '2032-10-04', cashAccountId: 'cash:eur', offsetAccountId: 'payable:eur' })
    const settled = updateGameWorld(first.world, { financialTransactions: [...Object.values(first.world.financialTransactionsById), settlement.transaction], treasuryApplications: [...Object.values(first.world.treasuryApplicationsById), settlement.settlement] })
    expect(getOperatingExpenseYtd(settled, 'team-home', '2032-12-31')).toEqual([{ currencyCode: 'EUR', minorUnits: 100_000 }])
    expect(getCashBalancesByCurrency(settled, 'team-home', '2032-10-04')[0]).toMatchObject({ totalCashMinorUnits: -100_000 })
  })

  it('feeds known future OPEX into a budget forecast without inventing recognition', () => {
    const source = createOperatingCostSource({ id: 'travel:future', organizationId: 'team-home', category: 'TRAVEL', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 150_000 }, startsOn: '2032-01-01', endsOn: '2032-12-31', sourceAuthority: 'TRAVEL', generationPolicy: 'EXPLICIT_SCHEDULE', dueDatePolicy: 'ON_RECOGNITION', paymentSchedule: [{ recognitionOn: '2032-11-01', dueOn: '2032-11-01', amount: { currencyCode: 'EUR', minorUnits: 150_000 } }], provenance: provenance('future-travel') })
    const period = createFinancialPlanningPeriod({ kind: 'FISCAL_YEAR', startsOn: '2032-01-01', endsOn: '2032-12-31' })
    const budget = createFinancialBudget({ id: 'budget:2032', organizationId: 'team-home', currencyCode: 'EUR', period, status: 'DRAFT', label: '2032', createdOn: '2032-01-01', provenance: provenance('budget') })
    const line = createBudgetLine({ id: 'budget-line:travel', budgetId: budget.id, organizationId: 'team-home', category: 'TRAVEL', direction: 'EXPENSE', amount: { currencyCode: 'EUR', minorUnits: 500_000 }, provenance: provenance('line') })
    const actual = createExpenseRecognition({ id: 'expense:actual-travel', organizationId: 'team-home', amount: { currencyCode: 'EUR', minorUnits: 300_000 }, recognizedOn: '2032-04-01', category: 'TRAVEL', provenance: provenance('actual') })
    const world = baseWorld({ operatingCostSources: [source], financialBudgets: [budget], budgetLines: [line], expenseRecognitions: [actual] })
    expect(getFutureOperatingCostCommitments(world, 'team-home', '2032-06-01')).toHaveLength(1)
    const forecast = createFinancialForecast(world, { organizationId: 'team-home', asOfDate: '2032-06-01', period, currencyCode: 'EUR' })
    expect(forecast.lines).toContainEqual(expect.objectContaining({ category: 'TRAVEL', amount: { currencyCode: 'EUR', minorUnits: 450_000 }, actualMinorUnits: 300_000, committedMinorUnits: 150_000 }))
    expect(getBudgetComparison(world, budget.id, '2032-06-01')).toContainEqual(expect.objectContaining({ category: 'TRAVEL', actualMinorUnits: 300_000, committedMinorUnits: 150_000, forecastMinorUnits: 450_000 }))
    expect(Object.keys(world.expenseRecognitionsById)).toHaveLength(1)
  })

  it('keeps payroll outside CF8 and CAPEX outside OPEX materialization', () => {
    expect(() => createOperatingCostSource({ id: 'payroll:bad', organizationId: 'team-home', category: 'PAYROLL' as never, currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 1 }, startsOn: '2032-10-01', endsOn: '2032-10-01', sourceAuthority: 'ORGANIZATION', generationPolicy: 'ONE_OFF', dueDatePolicy: 'ON_RECOGNITION', provenance: provenance('payroll') })).toThrow()
    const capex = createOperatingCostSource({ id: 'facility:capex', organizationId: 'team-home', category: 'FACILITY', costNature: 'CAPITAL', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 900_000 }, startsOn: '2032-10-05', endsOn: '2032-10-05', sourceAuthority: 'FACILITY', generationPolicy: 'ONE_OFF', dueDatePolicy: 'ON_RECOGNITION', provenance: provenance('capex') })
    const result = materializeOperatingCostsForDate(baseWorld({ operatingCostSources: [capex] }), '2032-10-05', { organizationId: 'team-home', ledger: ledger('EUR') })
    expect(result.entries).toHaveLength(0)
    expect(Object.keys(result.world.expenseRecognitionsById)).toHaveLength(0)
  })

  it('keeps currencies and organization ownership isolated', () => {
    const usd = createAuthorizedOperatingCostFact({ id: 'scouting:usd', authority: 'SCOUTING', sourceEntityId: 'scouting-1', organizationId: 'team-home', category: 'SCOUTING', amount: { currencyCode: 'USD', minorUnits: 40_000 }, incurredOn: '2032-10-06', dueOn: '2032-10-06', provenance: provenance('usd') })
    const world = baseWorld({ operatingCostFacts: [usd] })
    const result = materializeOperatingCostsForDate(world, '2032-10-06', { organizationId: 'team-home', currencyCode: 'USD', ledger: ledger('USD') })
    expect(getOperatingExpenseYtd(result.world, 'team-home', '2032-12-31')).toEqual([{ currencyCode: 'USD', minorUnits: 40_000 }])
    expect(() => createAuthorizedOperatingCostFact({ id: 'crossing', authority: 'TRAVEL', sourceEntityId: 'trip', organizationId: 'team-away', category: 'TRAVEL', amount: { currencyCode: 'EUR', minorUnits: 1 }, incurredOn: '2032-10-06', dueOn: '2032-10-06', teamId: 'team-home', provenance: provenance('crossing') })).not.toThrow()
    expect(() => createGameWorld({ ...createValidGameWorldInput(), financialAccounts: accounts('team-home'), operatingCostFacts: [usd, createAuthorizedOperatingCostFact({ id: 'crossing', authority: 'TRAVEL', sourceEntityId: 'trip', organizationId: 'team-away', category: 'TRAVEL', amount: { currencyCode: 'EUR', minorUnits: 1 }, incurredOn: '2032-10-06', dueOn: '2032-10-06', teamId: 'team-home', provenance: provenance('crossing') })] })).toThrow(/crosses organizations/)
  })
})
