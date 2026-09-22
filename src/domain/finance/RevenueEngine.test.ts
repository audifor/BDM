import { describe, expect, it } from 'vitest'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createFinancialAccount } from './FinancialLedger'
import { createRevenueSource, createTicketRevenueFact, getCollectedRevenue, getContractedRevenue, getFutureScheduledRevenue, getRecognizedRevenueByCategory, getRecognizedRevenueByCounterparty, getRevenueSchedule, getUncollectedRecognizedRevenue, materializeRevenueForDate } from './RevenueEngine'
import { createBudgetLine, createFinancialBudget, createFinancialPlanningPeriod, createFinancialForecast, getBudgetComparison } from './BudgetForecasting'
import { settleReceivable } from './Treasury'
import { getCashBalancesByCurrency } from './CashFlowQueries'

const source = { kind: 'CF7_TEST', id: 'cf7' }
const input = createValidGameWorldInput()
const organizationId = input.teams![0]!.organizationId

function world() {
  return createGameWorld({
    ...input,
    financialAccounts: [
      createFinancialAccount({ id: 'cash:cf7', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-10-01' }),
      createFinancialAccount({ id: 'receivable:cf7', organizationId, accountType: 'RECEIVABLE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
      createFinancialAccount({ id: 'revenue:cf7', organizationId, accountType: 'REVENUE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    ],
  })
}

function sponsor(overrides: Partial<Parameters<typeof createRevenueSource>[0]> = {}) {
  return createRevenueSource({ id: 'revenue-source:sponsor', organizationId, category: 'SPONSORSHIP', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 500_000 }, startsOn: '2032-10-01', endsOn: '2032-12-31', sourceAuthority: 'COMMERCIAL_CONTRACT', generationPolicy: 'ONE_OFF', dueDatePolicy: 'ON_RECOGNITION', counterparty: { kind: 'EXTERNAL', label: 'Sponsor' }, provenance: source, ...overrides })
}

describe('CF7 revenue engine', () => {
  it('validates Money and creates a deterministic contractual schedule without recognizing it', () => {
    expect(() => createRevenueSource({ ...sponsor(), amount: { currencyCode: 'EUR', minorUnits: 0 } })).toThrow('positive')
    const scheduled = getRevenueSchedule(createGameWorld({ ...input, revenueSources: [sponsor()] }), { organizationId })
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0]).toMatchObject({ amount: { currencyCode: 'EUR', minorUnits: 500_000 }, category: 'SPONSORSHIP', recognitionOn: '2032-10-01', dueOn: '2032-10-01' })
  })

  it('materializes sponsorship through recognition and receivable exactly once', () => {
    const base = world()
    const withSource = updateGameWorld(base, { revenueSources: [sponsor()] })
    const first = materializeRevenueForDate(withSource, '2032-10-01', { organizationId, ledger: { offsetAccountId: 'receivable:cf7', resultAccountId: 'revenue:cf7' } })
    expect(first.status).toBe('accepted')
    expect(Object.values(first.world.revenueRecognitionsById)).toHaveLength(1)
    expect(Object.values(first.world.receivablesById)).toHaveLength(1)
    const retry = materializeRevenueForDate(first.world, '2032-10-01', { organizationId, ledger: { offsetAccountId: 'receivable:cf7', resultAccountId: 'revenue:cf7' } })
    expect(retry.status).toBe('alreadyProcessed')
    expect(Object.values(retry.world.revenueRecognitionsById)).toHaveLength(1)
    expect(getUncollectedRecognizedRevenue(first.world, organizationId)).toHaveLength(1)
  })

  it('separates recognition from settlement and cash', () => {
    const base = updateGameWorld(world(), { revenueSources: [sponsor()] })
    const materialized = materializeRevenueForDate(base, '2032-10-01', { organizationId, ledger: { offsetAccountId: 'receivable:cf7', resultAccountId: 'revenue:cf7' } })
    const receivable = Object.values(materialized.world.receivablesById)[0]!
    const collection = settleReceivable(materialized.world, receivable.id, { settlementId: 'settlement:cf7', transactionId: 'transaction:settlement:cf7', amount: receivable.amount, settledOn: '2032-10-02', cashAccountId: 'cash:cf7', offsetAccountId: 'receivable:cf7' })
    const settled = updateGameWorld(materialized.world, { financialTransactions: [...Object.values(materialized.world.financialTransactionsById), collection.transaction], treasuryApplications: [collection.settlement] })
    expect(getCollectedRevenue(settled, organizationId, '2032-10-02')).toEqual([{ currencyCode: 'EUR', minorUnits: 500_000 }])
    expect(getCashBalancesByCurrency(settled, organizationId, '2032-10-02')).toEqual([expect.objectContaining({ currencyCode: 'EUR', totalCashMinorUnits: 500_000 })])
    expect(Object.values(settled.revenueRecognitionsById)).toHaveLength(1)
  })

  it('supports temporal, category, counterparty and currency-isolated queries', () => {
    const future = sponsor({ id: 'revenue-source:future', startsOn: '2033-01-01', endsOn: '2033-12-31', amount: { currencyCode: 'USD', minorUnits: 700_000 }, currencyCode: 'USD', dueDatePolicy: 'NO_DUE_DATE' })
    const scheduled = getRevenueSchedule(createGameWorld({ ...input, revenueSources: [sponsor(), future] }), { organizationId, from: '2033-01-01', to: '2033-12-31' })
    expect(getFutureScheduledRevenue(createGameWorld({ ...input, revenueSources: [sponsor(), future] }), organizationId, '2032-12-31')).toHaveLength(1)
    expect(scheduled[0]?.amount.currencyCode).toBe('USD')
    expect(getContractedRevenue(createGameWorld({ ...input, revenueSources: [sponsor(), future] }), organizationId)).toEqual([{ currencyCode: 'EUR', minorUnits: 500_000 }, { currencyCode: 'USD', minorUnits: 700_000 }])
  })

  it('does not invent ticket revenue when only an input fact interface exists', () => {
    const fact = createTicketRevenueFact({ matchId: 'game-a', organizationId, ticketsSold: 100, grossRevenue: { currencyCode: 'EUR', minorUnits: 25_000 }, provenance: source })
    expect(fact.grossRevenue.minorUnits).toBe(25_000)
    expect(Object.values(world().revenueRecognitionsById)).toHaveLength(0)
  })

  it('keeps inactive sources out of materialization', () => {
    const inactive = sponsor({ id: 'revenue-source:inactive', status: 'INACTIVE' })
    const result = materializeRevenueForDate(updateGameWorld(world(), { revenueSources: [inactive] }), '2032-10-01', { organizationId, ledger: { offsetAccountId: 'receivable:cf7', resultAccountId: 'revenue:cf7' } })
    expect(result.entries).toHaveLength(0)
    expect(result.world.revenueRecognitionsById).toEqual({})
  })

  it('exposes recognized revenue dimensions and keeps active state explicit', () => {
    const sourceWithTeam = sponsor({ teamId: input.teams![0]!.id })
    const base = updateGameWorld(world(), { revenueSources: [sourceWithTeam] })
    const result = materializeRevenueForDate(base, '2032-10-01', { organizationId, ledger: { offsetAccountId: 'receivable:cf7', resultAccountId: 'revenue:cf7' } })
    expect(getRecognizedRevenueByCategory(result.world, organizationId, '2032-10-01', '2032-10-31')).toEqual([{ category: 'SPONSORSHIP', currencyCode: 'EUR', minorUnits: 500_000 }])
    expect(getRecognizedRevenueByCounterparty(result.world, organizationId, '2032-10-01', '2032-10-31')).toEqual([{ counterparty: 'Sponsor', currencyCode: 'EUR', minorUnits: 500_000 }])
  })

  it('requires an explicit due-date policy before recognition', () => {
    const noDue = sponsor({ id: 'revenue-source:no-due', dueDatePolicy: 'NO_DUE_DATE' })
    const result = materializeRevenueForDate(updateGameWorld(world(), { revenueSources: [noDue] }), '2032-10-01', { organizationId, ledger: { offsetAccountId: 'receivable:cf7', resultAccountId: 'revenue:cf7' } })
    expect(result.status).toBe('rejected')
    expect(result.world.revenueRecognitionsById).toEqual({})
  })

  it('feeds known contractual revenue into budget and forecast without treating assumptions as recognition', () => {
    const period = createFinancialPlanningPeriod({ kind: 'DATE_RANGE', startsOn: '2032-01-01', endsOn: '2032-12-31' })
    const budget = createFinancialBudget({ id: 'budget:cf7:revenue', organizationId, currencyCode: 'EUR', period, status: 'APPROVED', label: 'Revenue', createdOn: '2032-01-01', approval: { authorityKind: 'GOVERNANCE', authorityId: 'governance:budget', approvedOn: '2032-01-01', provenance: source }, provenance: source })
    const line = createBudgetLine({ id: 'line:cf7:revenue', budgetId: budget.id, organizationId, category: 'SPONSORSHIP', direction: 'INCOME', amount: { currencyCode: 'EUR', minorUnits: 1_000_000 }, provenance: source })
    const budgetWorld = createGameWorld({ ...input, financialBudgets: [budget], budgetLines: [line], revenueSources: [sponsor()] })
    expect(getBudgetComparison(budgetWorld, budget.id)[0]).toMatchObject({ committedMinorUnits: 500_000, forecastMinorUnits: 500_000 })
    const forecast = createFinancialForecast(budgetWorld, { organizationId, asOfDate: '2032-06-01', period, currencyCode: 'EUR' })
    expect(forecast.lines).toEqual([expect.objectContaining({ category: 'SPONSORSHIP', amount: { currencyCode: 'EUR', minorUnits: 500_000 }, actualMinorUnits: 0, committedMinorUnits: 500_000 })])
    expect(budgetWorld.revenueRecognitionsById).toEqual({})
  })
})
