import { addDays, type GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import {
  consolidateForReporting, createFinancialForecast, createFinancialPlanningPeriod, getActiveApprovedBudget, getBudgetComparison,
  getCashAccountBalances, getCashFlowProjection, getCashFlowTotalsBetween, getCashMovementsBetween, getContractFinancialSchedule,
  getCompetitionFees, getCompetitionRevenue, getDebtSchedule, getFinancialHealthSnapshot, getFinanceProposals, getOrganizationPayables,
  getOrganizationReceivables, getOutstandingPrincipal, getProjectedLiquidity, getRevenueRecognitionsBetween,
  getExpenseRecognitionsBetween, valueOrganization, type ValuationAssumptions,
} from '@/domain/finance'

export const FINANCE_TABS = [
  ['overview', 'Overview'], ['cash', 'Cash flow'], ['budget', 'Budget'], ['revenue', 'Revenue'],
  ['costs', 'Costs'], ['payroll', 'Payroll'], ['debt', 'Debt & capital'], ['competition', 'Competition'],
  ['regulation', 'Regulation'], ['forecast', 'Forecast'], ['health', 'Health'],
  ['valuation', 'Valuation'], ['ai', 'Finance AI'], ['cap', 'Salary cap'],
] as const
export type FinanceTab = typeof FINANCE_TABS[number][0]
export interface FinanceMetric { readonly label: string; readonly value: string; readonly detail?: string }
export interface FinanceRow { readonly id: string; readonly cells: readonly string[]; readonly provenance?: string; readonly references?: readonly string[] }
export interface FinanceTable { readonly title: string; readonly columns: readonly string[]; readonly rows: readonly FinanceRow[]; readonly empty: string }
export interface FinanceSection { readonly title: string; readonly metrics: readonly FinanceMetric[]; readonly tables: readonly FinanceTable[]; readonly notes: readonly string[] }
export interface FinanceModelOptions { readonly reportingCurrency?: string; readonly valuationAssumptions?: ValuationAssumptions; readonly scenario?: 'BASELINE' | 'UPSIDE' | 'DOWNSIDE' | 'CUSTOM' }

export function financeMoney(minorUnits: number, currencyCode: string): string {
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, currencyDisplay: 'code' })
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  return formatter.format(minorUnits / 10 ** digits)
}
const amount = (minorUnits: number, currencyCode: string) => financeMoney(minorUnits, currencyCode)
const source = (value: { readonly kind: string; readonly id?: string }) => `${value.kind}${value.id ? ` · ${value.id}` : ''}`
const table = (title: string, columns: readonly string[], rows: readonly FinanceRow[], empty: string): FinanceTable => ({ title, columns, rows, empty })
const row = (id: string, cells: readonly string[], provenance?: string, references?: readonly string[]): FinanceRow => ({ id, cells, provenance, references })
const refs = (...ids: readonly (string | null | undefined)[]): string[] => ids.filter((id): id is string => id != null).map(String)

/** One section is derived on demand from canonical world facts. No totals are stored in UI state. */
export function buildFinanceWorkspaceSection(world: GameWorld, organizationId: string, tab: FinanceTab, options: FinanceModelOptions = {}): FinanceSection {
  if (!world.organizationsById[organizationId as keyof typeof world.organizationsById]) throw new RangeError('Unknown finance Organization')
  const asOf = world.currentDate
  const startsOn = `${asOf.slice(0, 4)}-01-01` as GameDate
  const period = createFinancialPlanningPeriod({ kind: 'DATE_RANGE', startsOn, endsOn: `${asOf.slice(0, 4)}-12-31` })
  const currency = options.reportingCurrency ?? world.organizationFinancialProfilesById[organizationId as keyof typeof world.organizationFinancialProfilesById]?.baseCurrencyCode
  const cash = getCashAccountBalances(world, organizationId, asOf)
  const receivables = getOrganizationReceivables(world, organizationId, asOf).filter((item) => item.obligation.recognizedOn <= asOf)
  const payables = getOrganizationPayables(world, organizationId, asOf).filter((item) => item.obligation.recognizedOn <= asOf)
  const revenues = getRevenueRecognitionsBetween(world, organizationId, startsOn, asOf)
  const expenses = getExpenseRecognitionsBetween(world, organizationId, startsOn, asOf)
  const noCurrency = 'No reporting currency configured. Choose a currency to view consolidated figures.'
  const base = (title: string, metrics: FinanceMetric[], tables: FinanceTable[], notes: string[] = []): FinanceSection => ({ title, metrics, tables, notes })

  if (tab === 'overview' || tab === 'health') {
    const health = getFinancialHealthSnapshot(world, organizationId, asOf, startsOn)
    const rows = health.byCurrency.map((item) => {
      const hasCash = cash.some((account) => account.currencyCode === item.currencyCode)
      const hasReceivable = receivables.some((entry) => entry.obligation.amount.currencyCode === item.currencyCode)
      const hasPayable = payables.some((entry) => entry.obligation.amount.currencyCode === item.currencyCode)
      const hasRecognition = [...revenues, ...expenses].some((fact) => fact.amount.currencyCode === item.currencyCode)
      const hasDebt = Object.values(world.debtInstrumentsById).some((debt) => debt.organizationId === organizationId && debt.currencyCode === item.currencyCode)
      return row(item.currencyCode, [item.currencyCode, hasCash ? amount(item.cashMinorUnits, item.currencyCode) : 'No cash facts', hasCash ? amount(item.unrestrictedCashMinorUnits, item.currencyCode) : 'No cash facts', hasReceivable ? amount(item.shortTermReceivablesMinorUnits, item.currencyCode) : 'No receivables', hasPayable ? amount(item.shortTermPayablesMinorUnits, item.currencyCode) : 'No payables', hasCash ? amount(item.projectedUnrestrictedCashMinorUnits, item.currencyCode) : 'No cash facts', hasRecognition ? amount(item.operatingResultMinorUnits, item.currencyCode) : 'Insufficient data', hasDebt ? amount(item.outstandingDebtMinorUnits, item.currencyCode) : 'No debt instruments'], 'CF1 Ledger · CF2 Treasury · CF3 Recognition · CF9 Debt', cash.filter((account) => account.currencyCode === item.currencyCode).map((account) => String(account.accountId)))
    })
    const metrics = health.byCurrency.flatMap((item) => [
      { label: `${item.currencyCode} 30-day shortfall`, value: amount(item.liquidityShortfallMinorUnits, item.currencyCode) },
      { label: `${item.currencyCode} overdue payables`, value: amount(item.overduePayablesMinorUnits, item.currencyCode) },
      { label: `${item.currencyCode} owner funding dependence`, value: amount(item.ownerFundingDependenceMinorUnits, item.currencyCode) },
      { label: `${item.currencyCode} payroll / revenue`, value: item.payrollRevenueRatio === null ? 'Insufficient revenue data' : `${(item.payrollRevenueRatio * 100).toFixed(1)}%` },
    ])
    const indicators = health.distressIndicators.map((item) => row(`${item.currencyCode}:${item.kind}`, [item.kind.replaceAll('_', ' '), amount(item.amountMinorUnits, item.currencyCode), item.currencyCode], 'CF11 derived indicator'))
    const notes = ['Cash, operating result, budget and valuation are different measures.', health.regulatoryBreachIds.length ? `${health.regulatoryBreachIds.length} recorded regulatory breach(es).` : 'No recorded regulatory breaches.', 'Health classification is unavailable without an explicit versioned policy.', 'Indicative valuation requires explicit assumptions in the Valuation section.']
    const performance = health.byCurrency.map((item) => row(item.currencyCode, [item.currencyCode, revenues.some((fact) => fact.amount.currencyCode === item.currencyCode) ? amount(item.operatingRevenueMinorUnits, item.currencyCode) : 'No recognition facts', expenses.some((fact) => fact.amount.currencyCode === item.currencyCode) ? amount(item.operatingExpenseMinorUnits, item.currencyCode) : 'No recognition facts', revenues.some((fact) => fact.amount.currencyCode === item.currencyCode) || expenses.some((fact) => fact.amount.currencyCode === item.currencyCode) ? amount(item.operatingResultMinorUnits, item.currencyCode) : 'Insufficient data', item.budgetProjectedVarianceMinorUnits === null ? 'No approved budget' : amount(item.budgetProjectedVarianceMinorUnits, item.currencyCode), amount(item.committedOperatingCostsMinorUnits + item.committedFuturePayrollMinorUnits, item.currencyCode), amount(item.forecastResultMinorUnits, item.currencyCode), amount(item.debtMaturityBurdenMinorUnits + item.debtInterestBurdenMinorUnits, item.currencyCode)], 'CF3 Recognition · CF6 Budget/Forecast · CF9 Debt'))
    const cashCurrencies = health.byCurrency.filter((item) => cash.some((account) => account.currencyCode === item.currencyCode))
    const reporting = currency && cashCurrencies.length ? consolidateForReporting(world, cashCurrencies.map((item) => ({ currencyCode: item.currencyCode, minorUnits: item.cashMinorUnits })), currency, asOf) : null
    const reportingTable = reporting ? table('Converted cash for reporting', ['Reporting currency', 'Converted known cash', 'Completeness', 'Missing FX'], [row('reporting-cash', [currency!, amount(reporting.amount.minorUnits, currency!), reporting.complete ? 'Complete' : 'Partial', reporting.missingRates.map((rate) => `${rate.base} → ${rate.quote}`).join(', ') || 'None'], 'CF10 FX reporting; original amounts remain above', reporting.missingRates.map((rate) => rate.base))], 'No reporting conversion available.') : null
    return base(tab === 'overview' ? 'Finance overview' : 'Financial health', metrics, [table('Financial position by original currency', ['Currency', 'Cash', 'Unrestricted', 'Receivables due', 'Payables due', 'Projected cash', 'Operating result', 'Debt'], rows, 'No Organization finance facts available.'), table('Performance and planning', ['Currency', 'Recognized revenue', 'Recognized expense', 'Operating result', 'Budget variance', 'Commitments', 'Forecast result', 'Debt service burden'], performance, 'No performance or planning facts available.'), ...(reportingTable ? [reportingTable] : []), table('Objective distress signals', ['Signal', 'Amount', 'Currency'], indicators, 'No distress signals from available facts.')], notes)
  }

  if (tab === 'cash') {
    const movements = getCashMovementsBetween(world, organizationId, startsOn, asOf)
    const totals = getCashFlowTotalsBetween(world, organizationId, startsOn, asOf)
    const settlements = Object.values(world.treasuryApplicationsById).filter((item) => item.organizationId === organizationId && item.settledOn >= startsOn && item.settledOn <= asOf)
    const projections = [7, 30, 90].flatMap((days) => getCashFlowProjection(world, organizationId, { asOfDate: asOf, horizonDays: days }).byCurrency.map((item) => row(`${days}:${item.currencyCode}`, [`${days} days`, item.currencyCode, amount(item.openingCashMinorUnits, item.currencyCode), amount(item.receivablesDueMinorUnits, item.currencyCode), amount(item.payablesDueMinorUnits, item.currencyCode), amount(item.projectedClosingCashMinorUnits, item.currencyCode)], 'CF2 Treasury projection')))
    return base('Cash flow', [], [
      table('Cash accounts', ['Account', 'Currency', 'Restriction', 'Balance'], cash.map((item) => row(String(item.accountId), [String(item.accountId), item.currencyCode, item.restriction, amount(item.balanceMinorUnits, item.currencyCode)], 'CF1 Ledger', [String(item.accountId)])), 'No cash accounts recorded.'),
      table('Period cash flow', ['Currency', 'Opening', 'Inflows', 'Outflows', 'Closing'], totals.map((item) => { const closing = cash.filter((account) => account.currencyCode === item.currencyCode).reduce((sum, account) => sum + account.balanceMinorUnits, 0); return row(item.currencyCode, [item.currencyCode, amount(closing - item.netMinorUnits, item.currencyCode), amount(item.inflowMinorUnits, item.currencyCode), amount(item.outflowMinorUnits, item.currencyCode), amount(closing, item.currencyCode)], 'CF2 derived cash flow') }), 'No recorded cash movements in this period.'),
      table('Known liquidity', ['Horizon', 'Currency', 'Opening', 'Receivables', 'Payables', 'Projected closing'], projections, 'No dated cash obligations available.'),
      table('Receivables', ['ID', 'Due', 'Remaining', 'Status'], receivables.map((item) => row(String(item.obligation.id), [String(item.obligation.id), item.obligation.dueOn, amount(item.remainingMinorUnits, item.obligation.amount.currencyCode), item.status], source(item.obligation.provenance), refs(item.obligation.id))), 'No receivables recorded.'),
      table('Payables', ['ID', 'Due', 'Remaining', 'Status'], payables.map((item) => row(String(item.obligation.id), [String(item.obligation.id), item.obligation.dueOn, amount(item.remainingMinorUnits, item.obligation.amount.currencyCode), item.status], source(item.obligation.provenance), refs(item.obligation.id))), 'No payables recorded.'),
      table('Cash movements', ['Date', 'Direction', 'Amount', 'Transaction'], movements.map((item) => row(`${item.transactionId}:${item.accountId}`, [item.effectiveOn, item.direction, amount(item.amount.minorUnits, item.amount.currencyCode), item.transactionId], source(item.provenance), [item.transactionId, String(item.accountId)])), 'No cash movements in this period.'),
      table('Settlements', ['Date', 'Kind', 'Obligation', 'Amount', 'Transaction'], settlements.map((item) => row(String(item.id), [item.settledOn, item.obligationKind, String(item.obligationId), amount(item.amount.minorUnits, item.amount.currencyCode), String(item.transactionId)], source(item.provenance), refs(item.obligationId, item.transactionId, item.id))), 'No receivable or payable settlements in this period.'),
    ], ['Receivables are rights, payables are obligations, and neither is cash until settlement.'])
  }

  if (tab === 'budget') {
    const budget = getActiveApprovedBudget(world, organizationId, period, asOf)
    const comparisons = budget ? getBudgetComparison(world, budget.id, asOf) : []
    return base('Budget control', budget ? [{ label: 'Approved budget', value: budget.label, detail: `${budget.period.startsOn}–${budget.period.endsOn}` }] : [], [table('Budget · actual · committed · forecast', ['Category', 'Direction', 'Budget', 'Actual', 'Committed', 'Forecast', 'Projected variance'], comparisons.map((item) => row(item.lineId, [item.category, item.direction, amount(item.budgetMinorUnits, budget!.currencyCode), amount(item.actualMinorUnits, budget!.currencyCode), amount(item.committedMinorUnits, budget!.currencyCode), amount(item.forecastMinorUnits, budget!.currencyCode), amount(item.projectedVarianceMinorUnits, budget!.currencyCode)], source(budget!.provenance), [budget!.id, item.lineId])), 'No approved Organization budget for this period.')], ['Budget headroom is neither cash nor Salary Cap space.'])
  }

  if (tab === 'revenue') {
    const sources = Object.values(world.revenueSourcesById).filter((item) => item.organizationId === organizationId && item.startsOn <= asOf)
    const budget = getActiveApprovedBudget(world, organizationId, period, asOf)
    const planned = budget ? getBudgetComparison(world, budget.id, asOf).filter((item) => item.direction === 'INCOME') : []
    return base('Revenue', [], [
      table('Revenue sources', ['Source', 'Category', 'Known amount', 'Period'], sources.map((item) => row(item.id, [item.id, item.category, amount(item.amount.minorUnits, item.currencyCode), `${item.startsOn}–${item.endsOn}`], source(item.provenance), [item.id])), 'No authoritative revenue sources available.'),
      table('Recognized revenue', ['Date', 'Category', 'Amount', 'Collected', 'Uncollected'], revenues.map((item) => { const receivable = item.receivableId ? receivables.find((entry) => entry.obligation.id === item.receivableId) : undefined; return row(String(item.id), [item.recognizedOn, item.category, amount(item.amount.minorUnits, item.amount.currencyCode), receivable ? amount(receivable.settledMinorUnits, item.amount.currencyCode) : 'Not linked', receivable ? amount(receivable.remainingMinorUnits, item.amount.currencyCode) : 'Not linked'], source(item.provenance), refs(item.entitlementId, item.id, item.receivableId, item.ledgerTransactionId)) }), 'No recognized revenue in this period.'),
      table('Revenue budget and forecast', ['Category', 'Budget', 'Actual', 'Committed', 'Forecast', 'Projected variance'], planned.map((item) => row(item.lineId, [item.category, amount(item.budgetMinorUnits, budget!.currencyCode), amount(item.actualMinorUnits, budget!.currencyCode), amount(item.committedMinorUnits, budget!.currencyCode), amount(item.forecastMinorUnits, budget!.currencyCode), amount(item.projectedVarianceMinorUnits, budget!.currencyCode)], source(budget!.provenance), refs(budget!.id, item.lineId))), 'No approved revenue budget lines.'),
    ], ['No ticketing, media or sponsorship figure is inferred when its producer has supplied no fact.'])
  }

  if (tab === 'costs') {
    const sources = Object.values(world.operatingCostSourcesById).filter((item) => item.organizationId === organizationId && item.startsOn <= asOf)
    const operatingExpenses = expenses.filter((item) => !item.category.includes('SALARY') && item.category !== 'CAPITAL_EXPENDITURE')
    const commitments = Object.values(world.financialCommitmentsById).filter((item) => item.organizationId === organizationId && item.startsOn <= asOf)
    const budget = getActiveApprovedBudget(world, organizationId, period, asOf)
    const planned = budget ? getBudgetComparison(world, budget.id, asOf).filter((item) => item.direction === 'EXPENSE') : []
    return base('Operating costs', [], [
      table('Cost sources', ['Source', 'Category', 'Nature', 'Amount'], sources.map((item) => row(item.id, [item.id, item.category, item.costNature, amount(item.amount.minorUnits, item.currencyCode)], source(item.provenance), [item.id])), 'No authoritative operating cost sources available.'),
      table('Recognized expenses', ['Date', 'Category', 'Amount', 'Paid', 'Unpaid'], operatingExpenses.map((item) => { const payable = item.payableId ? payables.find((entry) => entry.obligation.id === item.payableId) : undefined; return row(String(item.id), [item.recognizedOn, item.category, amount(item.amount.minorUnits, item.amount.currencyCode), payable ? amount(payable.settledMinorUnits, item.amount.currencyCode) : 'Not linked', payable ? amount(payable.remainingMinorUnits, item.amount.currencyCode) : 'Not linked'], source(item.provenance), refs(item.commitmentId, item.id, item.payableId, item.ledgerTransactionId)) }), 'No recognized operating expenses in this period.'),
      table('Commitments', ['Category', 'Due', 'Amount'], commitments.map((item) => row(String(item.id), [item.category, item.dueOn, amount(item.amount.minorUnits, item.amount.currencyCode)], source(item.provenance), [String(item.id)])), 'No explicit commitments recorded.'),
      table('Cost budget and forecast', ['Category', 'Budget', 'Actual', 'Committed', 'Forecast', 'Projected variance'], planned.map((item) => row(item.lineId, [item.category, amount(item.budgetMinorUnits, budget!.currencyCode), amount(item.actualMinorUnits, budget!.currencyCode), amount(item.committedMinorUnits, budget!.currencyCode), amount(item.forecastMinorUnits, budget!.currencyCode), amount(item.projectedVarianceMinorUnits, budget!.currencyCode)], source(budget!.provenance), refs(budget!.id, item.lineId))), 'No approved operating cost budget lines.'),
    ], ['Payroll is shown separately. Capital expenditure is not operating expense.'])
  }

  if (tab === 'payroll') {
    if (!currency) return base('Financial payroll', [], [], [noCurrency, 'Contract terms do not contain a currency; no payroll currency is assumed.'])
    const schedule = getContractFinancialSchedule(world, { organizationId, currencyCode: currency, includeConditional: true })
    const recognized = expenses.filter((item) => item.category.includes('SALARY'))
    const grouped = new Map<string, { kind: string; season: string; guarantee: string; minorUnits: number }>()
    for (const item of schedule) {
      const season = String(item.seasonId ?? 'UNASSIGNED')
      const key = `${item.sourceContractType}|${season}|${item.compensationStatus}`
      grouped.set(key, { kind: item.sourceContractType, season, guarantee: item.compensationStatus, minorUnits: (grouped.get(key)?.minorUnits ?? 0) + item.amount.minorUnits })
    }
    return base('Financial payroll', [], [
      table('Player and staff commitments by season', ['Source', 'Season', 'Guarantee', 'Amount'], [...grouped].map(([key, value]) => row(key, [value.kind, value.season, value.guarantee, amount(value.minorUnits, currency)], 'CF5 Contract schedule')), 'No known contract commitments.'),
      table('Contract obligations', ['Source', 'Contract', 'Person', 'Team', 'Section', 'Period', 'Status', 'Amount'], schedule.map((item) => row(item.id, [item.sourceContractType, item.contractId, item.beneficiaryId, String(item.teamId), String(item.organizationSectionId), `${item.period.startsOn}–${item.period.endsOn}`, item.compensationStatus, amount(item.amount.minorUnits, item.amount.currencyCode)], source(item.provenance), [item.contractId, item.id])), 'No contract payroll schedule available.'),
      table('Recognized payroll', ['Date', 'Category', 'Amount', 'Paid', 'Unpaid', 'Contract'], recognized.map((item) => { const payable = item.payableId ? payables.find((entry) => entry.obligation.id === item.payableId) : undefined; return row(String(item.id), [item.recognizedOn, item.category, amount(item.amount.minorUnits, item.amount.currencyCode), payable ? amount(payable.settledMinorUnits, item.amount.currencyCode) : 'Not linked', payable ? amount(payable.remainingMinorUnits, item.amount.currencyCode) : 'Not linked', String(item.dimensions?.contractId ?? '—')], source(item.provenance), refs(item.id, item.dimensions?.contractId, item.payableId)) }), 'No recognized payroll in this period.'),
    ], ['Financial payroll uses cash salary and guaranteed terms. Salary Cap charge is a separate competition rule.'])
  }

  if (tab === 'debt') {
    const debts = Object.values(world.debtInstrumentsById).filter((item) => item.organizationId === organizationId && item.startsOn <= asOf)
    const capital = Object.values(world.financialTransactionsById).filter((item) => item.organizationId === organizationId && item.effectiveOn <= asOf && ['OWNER_FUNDING_RECEIPT', 'OWNER_DISTRIBUTION'].includes(item.transactionType))
    return base('Debt and capital', [], [
      table('Debt instruments', ['Instrument', 'Lender', 'Type', 'Original', 'Outstanding', 'Maturity'], debts.map((item) => row(item.id, [item.id, item.lender.label ?? item.lender.id ?? item.lender.kind, item.debtType, amount(item.originalPrincipal.minorUnits, item.currencyCode), amount(getOutstandingPrincipal(world, item.id, asOf).minorUnits, item.currencyCode), item.maturityOn], source(item.provenance), [item.id])), 'No debt instruments recorded.'),
      table('Upcoming service', ['Due', 'Kind', 'Amount', 'Instrument'], debts.flatMap((debt) => getDebtSchedule(world, debt.id).filter((entry) => entry.kind !== 'DRAWDOWN' && entry.dueOn > asOf && entry.dueOn <= addDays(asOf, 90)).map((entry) => row(entry.id, [entry.dueOn, entry.kind, amount(entry.amount.minorUnits, entry.amount.currencyCode), debt.id], source(entry.provenance), [debt.id, entry.id]))), 'No scheduled debt service in the next 90 days.'),
      table('Owner funding and distributions', ['Date', 'Type', 'Amount'], capital.map((item) => row(String(item.id), [item.effectiveOn, item.transactionType, amount(item.amount.minorUnits, item.amount.currencyCode)], source(item.provenance), [String(item.id)])), 'No recorded owner capital movements.'),
    ], ['Debt principal and owner capital are financing flows, not operating revenue.'])
  }

  if (tab === 'competition') {
    const facts = Object.values(world.competitionDistributionFactsById).filter((item) => item.recipientOrganizationId === organizationId && item.effectiveOn <= asOf)
    const entitlements = Object.values(world.financialEntitlementsById).filter((item) => item.organizationId === organizationId && item.availableOn <= asOf && item.dimensions?.reference?.kind === 'COMPETITION_DISTRIBUTION_FACT')
    const recognized = getCompetitionRevenue(world, { organizationId, from: startsOn, to: asOf })
    const fees = getCompetitionFees(world, { organizationId, from: startsOn, to: asOf })
    const competitionReceivableIds = new Set(revenues.filter((item) => item.dimensions?.reference?.kind === 'COMPETITION_DISTRIBUTION_FACT' && item.receivableId).map((item) => String(item.receivableId)))
    const currencies = [...new Set([...recognized, ...fees].map((item) => item.currencyCode))].sort()
    const summary = currencies.map((code) => {
      const income = recognized.filter((item) => item.currencyCode === code).reduce((sum, item) => sum + item.minorUnits, 0)
      const fee = fees.filter((item) => item.currencyCode === code).reduce((sum, item) => sum + item.minorUnits, 0)
      const collected = receivables.filter((item) => item.obligation.amount.currencyCode === code && competitionReceivableIds.has(String(item.obligation.id))).reduce((sum, item) => sum + item.settledMinorUnits, 0)
      return row(code, [code, amount(income, code), amount(collected, code), amount(fee, code), amount(income - fee, code)], 'CF9 Competition recognition · CF2 Treasury')
    })
    return base('Competition economy', [], [
      table('Authorized competition facts', ['Competition', 'Season', 'Category', 'Amount', 'Due'], facts.map((item) => row(item.id, [item.competitionId, item.seasonId, item.category, amount(item.amount.minorUnits, item.amount.currencyCode), item.dueOn ?? 'Not specified'], `${source(item.provenance)} · ${item.sourceRule}`, [item.competitionId, item.seasonId, item.id])), 'No authorized competition economic facts available.'),
      table('Entitlements', ['Competition fact', 'Category', 'Due', 'Amount'], entitlements.map((item) => row(String(item.id), [String(item.dimensions!.reference!.id), item.category, item.dueOn, amount(item.amount.minorUnits, item.amount.currencyCode)], source(item.provenance), refs(item.id, item.dimensions!.reference!.id))), 'No competition entitlements recorded.'),
      table('Recognized competition economics', ['Currency', 'Recognized revenue', 'Collected', 'Recognized fees', 'Net recognized'], summary, 'No recognized competition economics in this period.'),
    ], ['Competition determines awards and fees; Finance records their consequences. Net recognized is not net cash.'])
  }

  if (tab === 'regulation') {
    const assessments = Object.values(world.financialRegulationAssessmentsById).filter((item) => item.organizationId === organizationId && item.asOfDate <= asOf)
    return base('Financial regulation', [], [table('Recorded assessments', ['Date', 'Rule / version', 'Metric', 'Measured', 'Threshold', 'State', 'Consequence'], assessments.map((item) => row(item.id, [item.asOfDate, `${item.ruleId} · ${item.ruleVersion}`, item.metric, item.measuredValue === null ? 'Insufficient data' : String(item.measuredValue), String(item.threshold), item.state, item.consequence], source(item.provenance), [item.ruleId, ...item.supportingFactIds])), 'No financial regulation assessments recorded.')], ['Rules are supplied by governing authorities, not Finance UI. An assessment is not a sanction. Salary Cap is separate.'])
  }

  if (tab === 'forecast') {
    if (!currency) return base('Forecast', [], [], [noCurrency])
    const forecast = createFinancialForecast(world, { organizationId, asOfDate: asOf, period, currencyCode: currency, scenario: options.scenario ?? 'BASELINE' })
    const liquidity = getProjectedLiquidity(world, { organizationId, asOfDate: asOf, throughDate: addDays(asOf, 30), scenario: options.scenario ?? 'BASELINE' })
    return base(`${forecast.scenario} forecast`, [{ label: 'Projected result', value: amount(forecast.lines.reduce((total, item) => total + (item.direction === 'INCOME' ? item.amount.minorUnits : -item.amount.minorUnits), 0), currency) }], [
      table('Forecast lines', ['Category', 'Direction', 'Actual', 'Committed', 'Assumption', 'Forecast'], forecast.lines.map((item) => row(`${item.direction}:${item.category}`, [item.category, item.direction, amount(item.actualMinorUnits, currency), amount(item.committedMinorUnits, currency), amount(item.assumptionMinorUnits, currency), amount(item.amount.minorUnits, currency)], 'CF6 forecast · not a recognized fact')), 'No forecast lines from available facts and assumptions.'),
      table('Projected 30-day liquidity', ['Currency', 'Cash now', 'Receivables', 'Payables', 'Debt service', 'Explicit assumptions', 'Projected'], liquidity.map((item) => row(item.currencyCode, [item.currencyCode, amount(item.cashNowMinorUnits, item.currencyCode), amount(item.receivablesDueMinorUnits, item.currencyCode), amount(item.payablesDueMinorUnits, item.currencyCode), amount(item.debtServiceDueMinorUnits, item.currencyCode), amount(item.explicitCashAssumptionsMinorUnits, item.currencyCode), amount(item.projectedClosingCashMinorUnits, item.currencyCode)], 'CF2 Treasury · CF6 assumptions · CF9 debt')), 'No projected liquidity rows.'),
    ], [`Scenario: ${forecast.scenario}. Assumptions are plans, not financial facts.`, forecast.assumptionIds.length ? `Assumptions: ${forecast.assumptionIds.join(', ')}` : 'No explicit forecast assumptions configured.'])
  }

  if (tab === 'valuation') {
    if (!currency) return base('Indicative valuation', [], [], [noCurrency])
    if (!options.valuationAssumptions) return base('Indicative valuation', [], [], ['No valuation assumptions configured. Enter an explicit multiple to calculate an indication.'])
    const valuation = valueOrganization(world, { organizationId, asOfDate: asOf, periodStartsOn: startsOn, reportingCurrencyCode: currency, assumptions: options.valuationAssumptions })
    if (!valuation) return base('Indicative valuation', [], [], ['The selected method has no positive operating metric in this period. No value can be calculated.'])
    return base('Indicative valuation', [
      { label: 'Enterprise indication', value: valuation.enterpriseValue ? amount(valuation.enterpriseValue.minorUnits, currency) : 'Incomplete FX' },
      { label: 'Indicative equity', value: valuation.indicativeEquityValue ? amount(valuation.indicativeEquityValue.minorUnits, currency) : 'Incomplete FX' },
    ], [table('Valuation components', ['Kind', 'Original', 'Converted reporting value', 'FX rate'], valuation.components.map((item, index) => row(`${item.kind}:${index}`, [item.kind, amount(item.original.minorUnits, item.original.currencyCode), item.reporting ? amount(item.reporting.minorUnits, item.reporting.currencyCode) : 'Missing FX', item.exchangeRateId ?? 'Same currency'], source(valuation.provenance), item.exchangeRateId ? [item.exchangeRateId] : [])), 'No valuation components.')], [`Method: ${valuation.method} · as of ${valuation.asOfDate} · reporting currency ${currency}.`, `Explicit multiple: ${valuation.assumptions.multipleNumerator}/${valuation.assumptions.multipleDenominator}.`, valuation.complete ? 'Complete reporting conversion.' : `Partial result. Missing FX for: ${valuation.missingCurrencies.join(', ')}.`, 'This is an estimate, not an accounting balance or transaction price.'])
  }

  if (tab === 'ai') {
    const proposals = getFinanceProposals(world, organizationId)
    return base('Finance AI proposals', [], [table('Recorded recommendations', ['Date', 'Action', 'Evidence', 'Expected impact', 'Risks', 'Authority', 'Actor', 'Status'], proposals.map((item) => row(item.id, [item.asOfDate, item.actionType.replaceAll('_', ' '), item.evidence.map((evidence) => `${evidence.kind}: ${amount(evidence.amountMinorUnits, evidence.currencyCode)}`).join(' · '), item.expectedFinancialImpact ? amount(item.expectedFinancialImpact.minorUnits, item.expectedFinancialImpact.currencyCode) : 'Not quantified', item.risks.join('; ') || 'Not recorded', item.authorityRequired, item.responsibleActor ? `${item.responsibleActor.kind} ${item.responsibleActor.id}` : 'Unassigned', item.status], source(item.provenance), refs(item.governanceDecisionId, ...item.evidence.map((evidence) => evidence.referenceId)))), 'No Finance AI proposals recorded.')], ['A recommendation is not Governance approval. No action is executed from this view.'])
  }

  return base('Salary cap', [], [], ['Salary Cap is a separate competition rule, not Organization cash or financial payroll.'])
}
