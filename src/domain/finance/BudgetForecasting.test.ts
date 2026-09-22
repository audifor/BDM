import { describe, expect, it } from 'vitest'
import { createExpenseRecognition } from './Recognition'
import { createFinancialCommitment } from './Recognition'
import { createFinancialAccount, createFinancialTransaction } from './FinancialLedger'
import { createPlayerContract } from '@/domain/contract'
import { contractIdFromString } from '@/domain/ids'
import { createGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createFinancialBudget, createBudgetAllocation, createBudgetLine, createBudgetRevision, createFinancialForecast, createForecastAssumption, createFinancialPlanningPeriod, getBudgetComparison, getBudgetLifecycleStatus, getBudgetRevisionHistory, getProjectedLiquidity, getUnbudgetedRecognizedExpenses } from './BudgetForecasting'

const input = createValidGameWorldInput()
const organizationId = input.teams![0]!.organizationId
const period = createFinancialPlanningPeriod({ kind: 'DATE_RANGE', startsOn: '2032-01-01', endsOn: '2032-12-31' })
const source = { kind: 'CF6_TEST', id: 'cf6' }

function budgetWorld(options: { readonly budgets?: readonly ReturnType<typeof createFinancialBudget>[]; readonly lines?: readonly ReturnType<typeof createBudgetLine>[]; readonly revisions?: readonly ReturnType<typeof createBudgetRevision>[]; readonly allocations?: readonly ReturnType<typeof createBudgetAllocation>[]; readonly assumptions?: readonly ReturnType<typeof createForecastAssumption>[]; readonly recognitions?: readonly ReturnType<typeof createExpenseRecognition>[]; readonly commitments?: readonly ReturnType<typeof createFinancialCommitment>[] } = {}) {
  return createGameWorld({ ...input, financialBudgets: options.budgets, budgetLines: options.lines, budgetRevisions: options.revisions, budgetAllocations: options.allocations, forecastAssumptions: options.assumptions, expenseRecognitions: options.recognitions, financialCommitments: options.commitments })
}

function approvedBudget(id = 'budget:cf6:v1', amount = 10_000_000) {
  return createFinancialBudget({ id, organizationId, currencyCode: 'EUR', period, status: 'APPROVED', label: id, createdOn: '2032-01-01', approval: { authorityKind: 'GOVERNANCE', authorityId: 'governance:budget', approvedOn: '2032-01-01', provenance: source }, provenance: source })
}

function expenseLine(budgetId: string, amount = 10_000_000, category = 'OPERATIONS') {
  return createBudgetLine({ id: `line:${budgetId}`, budgetId, organizationId, category, direction: 'EXPENSE', amount: { currencyCode: 'EUR', minorUnits: amount }, provenance: source })
}

describe('CF6 budget and forecasting', () => {
  it('A: reports favorable expense variance as budget minus actual', () => {
    const budget = approvedBudget()
    const line = expenseLine(budget.id)
    const actual = createExpenseRecognition({ id: 'expense:cf6:actual', organizationId, amount: { currencyCode: 'EUR', minorUnits: 4_000_000 }, recognizedOn: '2032-04-01', category: 'OPERATIONS', provenance: source })
    const row = getBudgetComparison(budgetWorld({ budgets: [budget], lines: [line], recognitions: [actual] }), budget.id)[0]!
    expect(row).toMatchObject({ budgetMinorUnits: 10_000_000, actualMinorUnits: 4_000_000, varianceMinorUnits: 6_000_000 })
  })

  it('B: uses known commitments independently from actual recognition', () => {
    const budget = approvedBudget('budget:cf6:payroll', 12_000_000)
    const line = expenseLine(budget.id, 12_000_000, 'PLAYER_SALARY')
    const commitment = createFinancialCommitment({ id: 'commitment:cf6:payroll', organizationId, amount: { currencyCode: 'EUR', minorUnits: 10_000_000 }, startsOn: '2032-01-01', dueOn: '2032-10-01', category: 'PLAYER_SALARY', provenance: source })
    const row = getBudgetComparison(budgetWorld({ budgets: [budget], lines: [line], commitments: [commitment] }), budget.id)[0]!
    expect(row).toMatchObject({ budgetMinorUnits: 12_000_000, committedMinorUnits: 10_000_000, commitmentVarianceMinorUnits: 2_000_000 })
  })

  it('B/CF5: reads guaranteed payroll commitments from the contract schedule', () => {
    const budget = approvedBudget('budget:cf6:cf5-payroll', 12_000_000)
    const line = expenseLine(budget.id, 12_000_000, 'PLAYER_SALARY')
    const team = input.teams![0]!
    const player = input.players![0]!
    const contract = createPlayerContract({ id: contractIdFromString('contract:cf6:payroll'), playerId: player.id, teamId: team.id, kind: 'standard', term: { startsOn: '2032-01-01' as never, expiresOn: '2033-01-01' as never }, compensation: { annualSalary: 10_000_000, years: [{ cashSalary: 10_000_000, capHit: 9_000_000, guaranteedAmount: 10_000_000 }] } })
    const row = getBudgetComparison(createGameWorld({ ...input, contracts: [contract], financialBudgets: [budget], budgetLines: [line] }), budget.id)[0]!
    expect(row).toMatchObject({ committedMinorUnits: 10_000_000, commitmentVarianceMinorUnits: 2_000_000 })
  })

  it('C: reports projected over-budget without changing cash', () => {
    const budget = approvedBudget('budget:cf6:over', 10_000_000)
    const line = expenseLine(budget.id)
    const commitment = createFinancialCommitment({ id: 'commitment:cf6:over', organizationId, amount: { currencyCode: 'EUR', minorUnits: 12_000_000 }, startsOn: '2032-01-01', dueOn: '2032-10-01', category: 'OPERATIONS', provenance: source })
    const world = budgetWorld({ budgets: [budget], lines: [line], commitments: [commitment] })
    expect(getBudgetComparison(world, budget.id)[0]).toMatchObject({ projectedVarianceMinorUnits: -2_000_000, projectedOverBudget: true })
    expect(getProjectedLiquidity(world, { organizationId, throughDate: '2032-12-31' })).toEqual([])
  })

  it('D/E: keeps budget and Salary Cap separate from cash and cap calculations', () => {
    const budget = approvedBudget('budget:cf6:separation', 20_000_000)
    const line = expenseLine(budget.id)
    const world = createGameWorld({ ...input, financialBudgets: [budget], budgetLines: [line], financialAccounts: [createFinancialAccount({ id: 'account:cf6:cash', organizationId, accountType: 'CASH', currencyCode: 'EUR' }), createFinancialAccount({ id: 'account:cf6:equity', organizationId, accountType: 'EQUITY', currencyCode: 'EUR' })], financialTransactions: [createFinancialTransaction({ id: 'transaction:cf6:opening', organizationId, effectiveOn: '2032-01-01', transactionType: 'OPENING_CASH', amount: { currencyCode: 'EUR', minorUnits: 2_000_000 }, postings: [{ accountId: 'account:cf6:cash', direction: 'DEBIT', amount: { currencyCode: 'EUR', minorUnits: 2_000_000 } }, { accountId: 'account:cf6:equity', direction: 'CREDIT', amount: { currencyCode: 'EUR', minorUnits: 2_000_000 } }], provenance: source })] })
    expect(getProjectedLiquidity(world, { organizationId, throughDate: '2032-12-31' })[0]).toMatchObject({ cashNowMinorUnits: 2_000_000, projectedClosingCashMinorUnits: 2_000_000 })
    expect(Object.values(world.teamFinancesByTeamId)[0]?.playerSalaryBudget).not.toBe(20_000_000)
  })

  it('F: preserves approved revision history and exposes the latest version', () => {
    const v1 = approvedBudget('budget:cf6:v1-history', 10_000_000)
    const v2 = createFinancialBudget({ ...approvedBudget('budget:cf6:v2-history', 12_000_000), revisionOfId: v1.id })
    const revision = createBudgetRevision({ id: 'revision:cf6:v2', organizationId, budgetId: v2.id, supersedesBudgetId: v1.id, revisionNumber: 2, createdOn: '2032-02-01', reason: 'Approved update', provenance: source })
    const world = budgetWorld({ budgets: [v1, v2], revisions: [revision] })
    expect(getBudgetRevisionHistory(world, v2.id).map((item) => item.id)).toEqual([v1.id, v2.id])
    expect(getBudgetLifecycleStatus(world, v1.id)).toBe('SUPERSEDED')
    expect(getBudgetLifecycleStatus(world, v2.id)).toBe('APPROVED')
  })

  it('G: forecasts actuals plus known commitments plus explicit assumptions only', () => {
    const commitment = createFinancialCommitment({ id: 'commitment:cf6:forecast', organizationId, amount: { currencyCode: 'EUR', minorUnits: 3_000_000 }, startsOn: '2032-01-01', dueOn: '2032-11-01', category: 'OPERATIONS', provenance: source })
    const actual = createExpenseRecognition({ id: 'expense:cf6:forecast', organizationId, amount: { currencyCode: 'EUR', minorUnits: 5_000_000 }, recognizedOn: '2032-04-01', category: 'OPERATIONS', provenance: source })
    const assumption = createForecastAssumption({ id: 'assumption:cf6:forecast', organizationId, kind: 'EXPENSE', amount: { currencyCode: 'EUR', minorUnits: 2_000_000 }, period, category: 'OPERATIONS', explanation: 'Explicit maintenance plan', provenance: source })
    const forecast = createFinancialForecast(budgetWorld({ commitments: [commitment], recognitions: [actual], assumptions: [assumption] }), { organizationId, asOfDate: '2032-06-01', period, currencyCode: 'EUR' })
    expect(forecast.lines).toEqual([expect.objectContaining({ category: 'OPERATIONS', amount: { currencyCode: 'EUR', minorUnits: 10_000_000 }, actualMinorUnits: 5_000_000, committedMinorUnits: 3_000_000, assumptionMinorUnits: 2_000_000 })])
    expect(Object.values(budgetWorld({ commitments: [commitment], recognitions: [actual], assumptions: [assumption] }).expenseRecognitionsById)).toHaveLength(1)
  })

  it('H: keeps EUR and USD as separate planning currencies', () => {
    const budget = approvedBudget('budget:cf6:eur', 10_000)
    const line = expenseLine(budget.id, 10_000)
    const usd = createExpenseRecognition({ id: 'expense:cf6:usd', organizationId, amount: { currencyCode: 'USD', minorUnits: 10_000 }, recognizedOn: '2032-04-01', category: 'OPERATIONS', provenance: source })
    expect(getBudgetComparison(budgetWorld({ budgets: [budget], lines: [line], recognitions: [usd] }), budget.id)[0]?.actualMinorUnits).toBe(0)
  })

  it('I: detects recognized expense categories with no budget line', () => {
    const budget = approvedBudget('budget:cf6:unbudgeted', 10_000_000)
    const line = expenseLine(budget.id, 10_000_000, 'PLAYER_SALARY')
    const actual = createExpenseRecognition({ id: 'expense:cf6:unbudgeted', organizationId, amount: { currencyCode: 'EUR', minorUnits: 100_000 }, recognizedOn: '2032-04-01', category: 'TRAVEL', provenance: source })
    expect(getUnbudgetedRecognizedExpenses(budgetWorld({ budgets: [budget], lines: [line], recognitions: [actual] }), organizationId, period, 'EUR')).toHaveLength(1)
  })

  it('J: validates allocations and explicit approval lifecycle', () => {
    const budget = approvedBudget('budget:cf6:allocation')
    const line = expenseLine(budget.id)
    const allocation = createBudgetAllocation({ id: 'allocation:cf6', budgetId: budget.id, budgetLineId: line.id, organizationId, amount: { currencyCode: 'EUR', minorUnits: 1_000_000 }, provenance: source })
    expect(budgetWorld({ budgets: [budget], lines: [line], allocations: [allocation] }).budgetAllocationsById[allocation.id]).toEqual(allocation)
    expect(() => createFinancialBudget({ id: 'budget:cf6:invalid', organizationId, currencyCode: 'EUR', period, status: 'APPROVED', label: 'invalid', createdOn: '2032-01-01', provenance: source })).toThrow()
  })
})
