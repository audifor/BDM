import { addDays, parseGameDate, type GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world/GameWorld'
import { getCashBalancesByCurrency, getOpenPayables, getOpenReceivables } from './CashFlowQueries'
import { getOutstandingPrincipal, getDebtSchedule } from './DebtEngine'
import { getFinancialBreaches } from './FinancialRegulation'
import { getExpenseRecognitionsBetween, getRevenueRecognitionsBetween, getOutstandingCommitments } from './RecognitionQueries'
import { getContractFinancialSchedule, getPayrollRecognizedByPeriod } from './ContractFinancialSchedule'
import { getFutureOperatingCostCommitments } from './OperatingCostEngine'
import { getFinancingTransactions } from './DebtEngine'
import { createFinancialForecast, createFinancialPlanningPeriod, getActiveApprovedBudget, getBudgetComparison } from './BudgetForecasting'
import { createCurrencyCode, type CurrencyCode } from './FinancialLedger'

export interface FinancialHealthCurrencyRow {
  readonly currencyCode: CurrencyCode
  readonly cashMinorUnits: number
  readonly unrestrictedCashMinorUnits: number
  readonly shortTermReceivablesMinorUnits: number
  readonly shortTermPayablesMinorUnits: number
  readonly overduePayablesMinorUnits: number
  readonly projectedUnrestrictedCashMinorUnits: number
  readonly liquidityShortfallMinorUnits: number
  readonly outstandingDebtMinorUnits: number
  readonly ownerLoanOutstandingMinorUnits: number
  readonly netDebtMinorUnits: number
  readonly debtMaturityBurdenMinorUnits: number
  readonly debtInterestBurdenMinorUnits: number
  readonly operatingRevenueMinorUnits: number
  readonly operatingExpenseMinorUnits: number
  readonly operatingResultMinorUnits: number
  readonly payrollMinorUnits: number
  readonly payrollRevenueRatio: number | null
  readonly debtRevenueRatio: number | null
  readonly liquidityCoverageRatio: number | null
  readonly committedFuturePayrollMinorUnits: number
  readonly committedOperatingCostsMinorUnits: number
  readonly ownerFundingMinorUnits: number
  readonly ownerFundingDependenceMinorUnits: number
  readonly budgetProjectedVarianceMinorUnits: number | null
  readonly forecastResultMinorUnits: number
}

export interface FinancialHealthSnapshot {
  readonly organizationId: string
  readonly asOfDate: GameDate
  readonly periodStartsOn: GameDate
  readonly horizonThrough: GameDate
  readonly byCurrency: readonly FinancialHealthCurrencyRow[]
  readonly regulatoryBreachIds: readonly string[]
  readonly distressIndicators: readonly { readonly currencyCode: CurrencyCode; readonly kind: 'LIQUIDITY_SHORTFALL' | 'OVERDUE_PAYABLES' | 'UNFUNDED_DEBT_MATURITY' | 'OPERATING_LOSS' | 'REGULATORY_BREACH'; readonly amountMinorUnits: number }[]
}

/** Facts and objective shortfalls only. No distress status or bankruptcy decision is inferred. */
export function getFinancialHealthSnapshot(world: GameWorld, organizationId: string, asOfInput: GameDate | string, periodStartsInput: GameDate | string, horizonDays = 30): FinancialHealthSnapshot {
  const asOfDate = parseGameDate(asOfInput)
  const periodStartsOn = parseGameDate(periodStartsInput)
  if (!world.organizationsById[organizationId as keyof typeof world.organizationsById] || periodStartsOn > asOfDate || !Number.isSafeInteger(horizonDays) || horizonDays < 0) throw new RangeError('Invalid financial health query')
  const horizonThrough = addDays(asOfDate, horizonDays)
  const planningPeriod = createFinancialPlanningPeriod({ kind: 'DATE_RANGE', startsOn: periodStartsOn, endsOn: horizonThrough })
  const approvedBudget = getActiveApprovedBudget(world, organizationId, planningPeriod, asOfDate)
  const cash = getCashBalancesByCurrency(world, organizationId, asOfDate)
  const receivables = getOpenReceivables(world, organizationId, asOfDate).filter((row) => row.obligation.recognizedOn <= asOfDate)
  const payables = getOpenPayables(world, organizationId, asOfDate).filter((row) => row.obligation.recognizedOn <= asOfDate)
  const revenue = getRevenueRecognitionsBetween(world, organizationId, periodStartsOn, asOfDate)
  const expense = getExpenseRecognitionsBetween(world, organizationId, periodStartsOn, asOfDate)
  const debts = Object.values(world.debtInstrumentsById).filter((debt) => debt.organizationId === organizationId && debt.startsOn <= asOfDate)
  const commitments = getOutstandingCommitments(world, organizationId, asOfDate).filter((row) => row.commitment.startsOn <= asOfDate && row.commitment.dueOn > asOfDate)
  const payrollSchedule = world.organizationFinancialProfilesById[organizationId as keyof typeof world.organizationFinancialProfilesById] ? getContractFinancialSchedule(world, { organizationId, includeConditional: false }).filter((row) => row.effectiveOn > asOfDate && row.compensationStatus === 'GUARANTEED') : []
  const recognizedPayroll = getPayrollRecognizedByPeriod(world, organizationId, periodStartsOn, asOfDate)
  const operatingSchedule = getFutureOperatingCostCommitments(world, organizationId, asOfDate)
  const funding = getFinancingTransactions(world, organizationId, periodStartsOn, asOfDate).filter((item) => item.transactionType === 'OWNER_FUNDING_RECEIPT')
  const currencies = new Set<string>([...cash.map((row) => row.currencyCode), ...receivables.map((row) => row.obligation.amount.currencyCode), ...payables.map((row) => row.obligation.amount.currencyCode), ...revenue.map((row) => row.amount.currencyCode), ...expense.map((row) => row.amount.currencyCode), ...debts.map((row) => row.currencyCode), ...commitments.map((row) => row.remaining.currencyCode), ...payrollSchedule.map((row) => row.amount.currencyCode), ...operatingSchedule.map((row) => row.amount.currencyCode), ...funding.map((row) => row.amount.currencyCode), ...Object.values(world.revenueSourcesById).filter((row) => row.organizationId === organizationId && row.startsOn <= horizonThrough).map((row) => row.currencyCode), ...Object.values(world.forecastAssumptionsById).filter((row) => row.organizationId === organizationId && row.period.startsOn <= horizonThrough && row.period.endsOn >= asOfDate).map((row) => row.amount.currencyCode), ...(approvedBudget ? [approvedBudget.currencyCode] : [])])
  const sum = <T>(items: readonly T[], currency: string, value: (item: T) => { currencyCode: CurrencyCode; minorUnits: number }) => items.reduce((total, item) => { const amount = value(item); return total + (amount.currencyCode === currency ? amount.minorUnits : 0) }, 0)
  const byCurrency = [...currencies].sort().map((code): FinancialHealthCurrencyRow => {
    const currencyCode = createCurrencyCode(code)
    const cashRow = cash.find((row) => row.currencyCode === currencyCode)
    const available = cashRow?.unrestrictedCashMinorUnits ?? 0
    const dueReceivables = sum(receivables.filter((row) => row.obligation.dueOn <= horizonThrough), code, (row) => ({ currencyCode: row.obligation.amount.currencyCode, minorUnits: row.remainingMinorUnits }))
    const duePayables = sum(payables.filter((row) => row.obligation.dueOn <= horizonThrough), code, (row) => ({ currencyCode: row.obligation.amount.currencyCode, minorUnits: row.remainingMinorUnits }))
    const overdue = sum(payables.filter((row) => row.obligation.dueOn < asOfDate), code, (row) => ({ currencyCode: row.obligation.amount.currencyCode, minorUnits: row.remainingMinorUnits }))
    const outstanding = debts.filter((debt) => debt.currencyCode === currencyCode).reduce((total, debt) => total + getOutstandingPrincipal(world, debt.id, asOfDate).minorUnits, 0)
    const ownerLoans = debts.filter((debt) => debt.currencyCode === currencyCode && debt.debtType === 'OWNER_LOAN').reduce((total, debt) => total + getOutstandingPrincipal(world, debt.id, asOfDate).minorUnits, 0)
    const debtDue = debts.filter((debt) => debt.currencyCode === currencyCode).flatMap((debt) => getDebtSchedule(world, debt.id)).filter((entry) => entry.dueOn > asOfDate && entry.dueOn <= horizonThrough)
    const maturity = debtDue.filter((entry) => entry.kind === 'PRINCIPAL_REPAYMENT').reduce((total, entry) => total + entry.amount.minorUnits, 0)
    const interest = debtDue.filter((entry) => entry.kind === 'INTEREST').reduce((total, entry) => total + entry.amount.minorUnits, 0)
    const income = sum(revenue, code, (row) => row.amount)
    const cost = sum(expense, code, (row) => row.amount)
    const payroll = sum(recognizedPayroll, code, (row) => row.amount)
    const ownerFunding = sum(funding, code, (row) => row.amount)
    const committedPayroll = sum(payrollSchedule, code, (row) => row.amount)
    const committedOperating = sum(operatingSchedule, code, (row) => row.amount) + sum(commitments.filter((row) => row.commitment.category !== 'PLAYER_SALARY' && row.commitment.category !== 'STAFF_SALARY'), code, (row) => row.remaining)
    const forecast = createFinancialForecast(world, { organizationId, asOfDate, period: planningPeriod, currencyCode })
    const forecastResult = forecast.lines.reduce((total, line) => total + (line.direction === 'INCOME' ? line.amount.minorUnits : -line.amount.minorUnits), 0)
    const budgetVariance = approvedBudget?.currencyCode === currencyCode ? getBudgetComparison(world, approvedBudget.id, asOfDate).reduce((total, line) => total + line.projectedVarianceMinorUnits, 0) : null
    const projected = available + dueReceivables - duePayables
    const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : null
    return Object.freeze({ currencyCode, cashMinorUnits: cashRow?.totalCashMinorUnits ?? 0, unrestrictedCashMinorUnits: available, shortTermReceivablesMinorUnits: dueReceivables, shortTermPayablesMinorUnits: duePayables, overduePayablesMinorUnits: overdue, projectedUnrestrictedCashMinorUnits: projected, liquidityShortfallMinorUnits: Math.max(0, -projected), outstandingDebtMinorUnits: outstanding, ownerLoanOutstandingMinorUnits: ownerLoans, netDebtMinorUnits: outstanding - available, debtMaturityBurdenMinorUnits: maturity, debtInterestBurdenMinorUnits: interest, operatingRevenueMinorUnits: income, operatingExpenseMinorUnits: cost, operatingResultMinorUnits: income - cost, payrollMinorUnits: payroll, payrollRevenueRatio: ratio(payroll, income), debtRevenueRatio: ratio(outstanding, income), liquidityCoverageRatio: ratio(available + dueReceivables, duePayables), committedFuturePayrollMinorUnits: committedPayroll, committedOperatingCostsMinorUnits: committedOperating, ownerFundingMinorUnits: ownerFunding, ownerFundingDependenceMinorUnits: Math.min(ownerFunding, Math.max(0, cost - income)), budgetProjectedVarianceMinorUnits: budgetVariance, forecastResultMinorUnits: forecastResult })
  })
  const breaches = getFinancialBreaches(world, organizationId, asOfDate).map((item) => item.id)
  const distressIndicators: FinancialHealthSnapshot['distressIndicators'][number][] = []
  for (const row of byCurrency) {
    if (row.liquidityShortfallMinorUnits > 0) distressIndicators.push({ currencyCode: row.currencyCode, kind: 'LIQUIDITY_SHORTFALL', amountMinorUnits: row.liquidityShortfallMinorUnits })
    if (row.overduePayablesMinorUnits > 0) distressIndicators.push({ currencyCode: row.currencyCode, kind: 'OVERDUE_PAYABLES', amountMinorUnits: row.overduePayablesMinorUnits })
    if (row.debtMaturityBurdenMinorUnits > Math.max(0, row.projectedUnrestrictedCashMinorUnits)) distressIndicators.push({ currencyCode: row.currencyCode, kind: 'UNFUNDED_DEBT_MATURITY', amountMinorUnits: row.debtMaturityBurdenMinorUnits - Math.max(0, row.projectedUnrestrictedCashMinorUnits) })
    if (row.operatingResultMinorUnits < 0) distressIndicators.push({ currencyCode: row.currencyCode, kind: 'OPERATING_LOSS', amountMinorUnits: -row.operatingResultMinorUnits })
  }
  if (breaches.length) for (const row of byCurrency) distressIndicators.push({ currencyCode: row.currencyCode, kind: 'REGULATORY_BREACH', amountMinorUnits: 0 })
  return Object.freeze({ organizationId, asOfDate, periodStartsOn, horizonThrough, byCurrency: Object.freeze(byCurrency), regulatoryBreachIds: Object.freeze(breaches), distressIndicators: Object.freeze(distressIndicators) })
}

export interface FinancialHealthPolicy { readonly id: string; readonly version: string; readonly minimumLiquidityCoverageRatio?: number; readonly maximumDebtRevenueRatio?: number; readonly maximumPayrollRevenueRatio?: number }
export function assessFinancialHealth(snapshot: FinancialHealthSnapshot, policy: FinancialHealthPolicy): { readonly policyId: string; readonly policyVersion: string; readonly state: 'HEALTHY' | 'WATCH' | 'STRESSED' | 'DISTRESSED'; readonly reasons: readonly string[] } {
  if (!policy.id.trim() || !policy.version.trim() || [policy.minimumLiquidityCoverageRatio, policy.maximumDebtRevenueRatio, policy.maximumPayrollRevenueRatio].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) throw new TypeError('Invalid financial health policy')
  const reasons = snapshot.byCurrency.flatMap((row) => [policy.minimumLiquidityCoverageRatio !== undefined && row.liquidityCoverageRatio !== null && row.liquidityCoverageRatio < policy.minimumLiquidityCoverageRatio ? `${row.currencyCode}:LIQUIDITY_COVERAGE` : null, policy.maximumDebtRevenueRatio !== undefined && row.debtRevenueRatio !== null && row.debtRevenueRatio > policy.maximumDebtRevenueRatio ? `${row.currencyCode}:DEBT_REVENUE` : null, policy.maximumPayrollRevenueRatio !== undefined && row.payrollRevenueRatio !== null && row.payrollRevenueRatio > policy.maximumPayrollRevenueRatio ? `${row.currencyCode}:PAYROLL_REVENUE` : null].filter((value): value is string => value !== null))
  const severe = snapshot.distressIndicators.some((item) => item.kind === 'LIQUIDITY_SHORTFALL' || item.kind === 'UNFUNDED_DEBT_MATURITY')
  return Object.freeze({ policyId: policy.id, policyVersion: policy.version, state: severe ? 'DISTRESSED' : snapshot.distressIndicators.length > 0 ? 'STRESSED' : reasons.length > 0 ? 'WATCH' : 'HEALTHY', reasons: Object.freeze(reasons) })
}
