// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { createGameWorld } from '@/domain/world'
import { createFinancialAccount, createFinancialTransaction, createRevenueRecognition, createFinancialBudget, createBudgetLine, createFinancialPlanningPeriod, createFinanceDecisionProposal } from '@/domain/finance'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { FinancesWorkspace } from './FinancesWorkspace'
import { buildFinanceWorkspaceSection, FINANCE_TABS } from './financeWorkspaceModel'

afterEach(cleanup)

const world = createGameWorld(createValidGameWorldInput())
const organizationId = 'team-home'

describe('Finance V2 workspace', () => {
  it('derives each section from an empty canonical world with honest missing-data states', () => {
    for (const [tab] of FINANCE_TABS) {
      if (tab === 'cap') continue
      const section = buildFinanceWorkspaceSection(world, organizationId, tab)
      expect(section.title).not.toBe('')
      for (const item of section.tables) expect(item.rows).toHaveLength(0)
    }
    expect(buildFinanceWorkspaceSection(world, organizationId, 'valuation').notes).toContain('No reporting currency configured. Choose a currency to view consolidated figures.')
  })

  it('shows canonical empty states and keeps salary cap separate', () => {
    render(<FinancesWorkspace world={world} />)
    expect(screen.getByRole('heading', { name: 'Finance overview' })).toBeInTheDocument()
    expect(screen.getByText('No Organization finance facts available.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cash flow' }))
    expect(screen.getByText('No cash accounts recorded.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salary cap' }))
    expect(screen.getByRole('heading', { name: 'Salary cap' })).toBeInTheDocument()
    expect(screen.getByText(/separate from Organization cash/)).toBeInTheDocument()
  })

  it('requires explicit valuation inputs and distinguishes a missing operating metric', () => {
    render(<FinancesWorkspace world={world} />)
    fireEvent.click(screen.getByRole('button', { name: 'Valuation' }))
    expect(screen.getByText(/No reporting currency configured/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Reporting currency'), { target: { value: 'EUR' } })
    expect(screen.getByText(/No valuation assumptions configured/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Multiple numerator'), { target: { value: '3' } })
    expect(screen.getByText(/no positive operating metric/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Multiple numerator'), { target: { value: '0' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid valuation multiple')
  })

  it('keeps currencies separate and exposes source references for a recorded cash fact', () => {
    const cash = createFinancialAccount({ id: 'cf12:cash', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-01-01' })
    const equity = createFinancialAccount({ id: 'cf12:equity', organizationId, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-01-01' })
    const funded = createGameWorld({ ...createValidGameWorldInput(), financialAccounts: [cash, equity], financialTransactions: [createFinancialTransaction({ id: 'cf12:funding', organizationId, effectiveOn: '2032-01-01', transactionType: 'OWNER_FUNDING_RECEIPT', amount: { currencyCode: 'EUR', minorUnits: 100_000 }, postings: [{ accountId: cash.id, direction: 'DEBIT', amount: { currencyCode: 'EUR', minorUnits: 100_000 } }, { accountId: equity.id, direction: 'CREDIT', amount: { currencyCode: 'EUR', minorUnits: 100_000 } }], provenance: { kind: 'CF12_TEST', id: 'funding' } })], revenueRecognitions: [createRevenueRecognition({ id: 'cf12:usd-revenue', organizationId, amount: { currencyCode: 'USD', minorUnits: 50_000 }, recognizedOn: '2032-09-01', category: 'MEDIA', provenance: { kind: 'CF12_TEST', id: 'media' } })] })
    const rows = buildFinanceWorkspaceSection(funded, organizationId, 'overview').tables[0]!.rows
    expect(rows.map((row) => row.cells[0])).toEqual(['EUR', 'USD'])
    expect(rows[0]!.cells[1]).toContain('EUR')
    expect(rows[1]!.cells[1]).toBe('No cash facts')
    expect(buildFinanceWorkspaceSection(funded, organizationId, 'overview').tables[1]!.rows[1]!.cells[1]).toContain('USD')
    expect(buildFinanceWorkspaceSection(funded, organizationId, 'cash').tables[0]!.rows[0]!.references).toContain(cash.id)
    expect(buildFinanceWorkspaceSection(funded, organizationId, 'revenue').tables[1]!.rows[0]!.references).toContain('cf12:usd-revenue')
    const valuation = buildFinanceWorkspaceSection(funded, organizationId, 'valuation', { reportingCurrency: 'EUR', valuationAssumptions: { id: 'cf12:multiple', method: 'REVENUE_MULTIPLE', multipleNumerator: 3, multipleDenominator: 1, provenance: { kind: 'CF12_TEST', id: 'multiple' } } })
    expect(valuation.notes.join(' ')).toContain('Missing FX for: USD')
    expect(valuation.tables[0]!.rows.some((row) => row.cells.includes('Missing FX'))).toBe(true)
    expect(valuation.metrics[0]!.value).toBe('Incomplete FX')
  })

  it('keeps budget, actual, committed, forecast and variance as distinct columns', () => {
    const period = createFinancialPlanningPeriod({ kind: 'DATE_RANGE', startsOn: '2032-01-01', endsOn: '2032-12-31' })
    const budget = createFinancialBudget({ id: 'cf12:budget', organizationId, currencyCode: 'EUR', period, status: 'APPROVED', label: 'Approved season plan', createdOn: '2032-01-01', approval: { authorityKind: 'GOVERNANCE', authorityId: 'board', approvedOn: '2032-01-01', provenance: { kind: 'CF12_TEST' } }, provenance: { kind: 'CF12_TEST' } })
    const line = createBudgetLine({ id: 'cf12:line', budgetId: budget.id, organizationId, category: 'FACILITY', direction: 'EXPENSE', amount: { currencyCode: 'EUR', minorUnits: 200_000 }, provenance: { kind: 'CF12_TEST' } })
    const planned = createGameWorld({ ...createValidGameWorldInput(), financialBudgets: [budget], budgetLines: [line] })
    const view = buildFinanceWorkspaceSection(planned, organizationId, 'budget')
    expect(view.tables[0]!.columns).toEqual(['Category', 'Direction', 'Budget', 'Actual', 'Committed', 'Forecast', 'Projected variance'])
    expect(view.tables[0]!.rows[0]!.references).toEqual([budget.id, line.id])
    expect(buildFinanceWorkspaceSection(planned, organizationId, 'revenue').tables[2]!.columns).toContain('Forecast')
    expect(buildFinanceWorkspaceSection(planned, organizationId, 'costs').tables[3]!.columns).toContain('Committed')
  })

  it('exposes settlement and source distinctions in revenue, costs, payroll and competition', () => {
    expect(buildFinanceWorkspaceSection(world, organizationId, 'revenue').tables[1]!.columns).toContain('Uncollected')
    expect(buildFinanceWorkspaceSection(world, organizationId, 'costs').tables[1]!.columns).toContain('Unpaid')
    expect(buildFinanceWorkspaceSection(world, organizationId, 'payroll', { reportingCurrency: 'EUR' }).tables[0]!.columns).toEqual(['Source', 'Season', 'Guarantee', 'Amount'])
    expect(buildFinanceWorkspaceSection(world, organizationId, 'competition').tables[2]!.columns).toContain('Net recognized')
  })

  it('shows recorded AI advice and approval boundary without executing it', () => {
    const proposal = createFinanceDecisionProposal({ id: 'cf12:advice', organizationId, asOfDate: world.currentDate, actionType: 'RECOMMEND_FINANCING', evidence: [{ kind: 'LIQUIDITY_SHORTFALL', currencyCode: 'EUR', amountMinorUnits: 100_000, referenceId: 'cf12:fact' }], expectedFinancialImpact: null, risks: ['Interest cost'], authorityRequired: 'DEBT', responsibleActor: null, governanceDecisionId: null, status: 'RECOMMENDED', provenance: { kind: 'CF12_TEST' } })
    const advised = createGameWorld({ ...createValidGameWorldInput(), financeDecisionProposals: [proposal] })
    const view = buildFinanceWorkspaceSection(advised, organizationId, 'ai')
    expect(view.tables[0]!.rows[0]!.cells).toContain('RECOMMENDED')
    expect(view.tables[0]!.rows[0]!.cells).toContain('Interest cost')
    expect(view.tables[0]!.rows[0]!.references).toContain('cf12:fact')
    expect(advised.debtInstrumentsById).toEqual({})
  })
})
