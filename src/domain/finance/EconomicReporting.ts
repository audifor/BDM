import type { GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { getCashBalancesByCurrency } from './CashFlowQueries'
import { createFinancialForecast, type FinancialPlanningPeriod, type ForecastScenario } from './BudgetForecasting'
import { getOutstandingPrincipal } from './DebtEngine'
import { convertForReporting, createExchangeRate, type EconomicObservation, type ExchangeRate } from './EconomicEnvironment'
import { createCurrencyCode, createMoney, type CurrencyCode } from './FinancialLedger'
import { getRecognizedExpense, getRecognizedRevenue } from './RecognitionQueries'

export type ReportingMeasure = 'CASH' | 'DEBT' | 'REVENUE' | 'EXPENSE'
export interface ReportingTotal {
  readonly currencyCode: CurrencyCode
  readonly minorUnits: number
  readonly complete: boolean
  readonly missingCurrencies: readonly CurrencyCode[]
  readonly sourceCurrencies: readonly CurrencyCode[]
}
/** Reporting only. Each source amount and currency remains canonical and unchanged. */
export function getFinancialReportingTotal(world: GameWorld, organizationId: string, measure: ReportingMeasure, currencyCode: string, asOfDate: GameDate | string): ReportingTotal {
  const items = measure === 'CASH' ? getCashBalancesByCurrency(world, organizationId, asOfDate).map((item) => ({ currencyCode: item.currencyCode, minorUnits: item.totalCashMinorUnits }))
    : measure === 'DEBT' ? Object.values(world.debtInstrumentsById).filter((item) => item.organizationId === organizationId && item.startsOn <= asOfDate).map((item) => ({ currencyCode: item.currencyCode, minorUnits: getOutstandingPrincipal(world, item.id, asOfDate).minorUnits }))
    : measure === 'REVENUE' ? getRecognizedRevenue(world, organizationId, asOfDate) : getRecognizedExpense(world, organizationId, asOfDate)
  return convertSignedTotals(world, items, currencyCode, asOfDate)
}
export function getForecastReportingTotal(world: GameWorld, input: { readonly organizationId: string; readonly asOfDate: GameDate | string; readonly period: FinancialPlanningPeriod; readonly reportingCurrencyCode: string; readonly reportingDate?: GameDate | string; readonly scenario?: ForecastScenario; readonly direction: 'INCOME' | 'EXPENSE'; readonly economicObservations?: readonly EconomicObservation[]; readonly exchangeRates?: readonly ExchangeRate[] }): ReportingTotal {
  const currencies = new Set<string>([
    ...Object.values(world.revenueRecognitionsById).filter((item) => item.organizationId === input.organizationId).map((item) => item.amount.currencyCode),
    ...Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === input.organizationId).map((item) => item.amount.currencyCode),
    ...Object.values(world.revenueSourcesById).filter((item) => item.organizationId === input.organizationId).map((item) => item.currencyCode),
    ...Object.values(world.operatingCostSourcesById).filter((item) => item.organizationId === input.organizationId).map((item) => item.currencyCode),
    ...Object.values(world.debtInstrumentsById).filter((item) => item.organizationId === input.organizationId).map((item) => item.currencyCode),
    ...Object.values(world.forecastAssumptionsById).filter((item) => item.organizationId === input.organizationId).map((item) => item.amount.currencyCode),
  ])
  const totals = [...currencies].sort().map((currencyCode) => ({ currencyCode: createCurrencyCode(currencyCode), minorUnits: createFinancialForecast(world, { organizationId: input.organizationId, asOfDate: input.asOfDate, period: input.period, currencyCode, scenario: input.scenario, economicObservations: input.economicObservations }).lines.filter((line) => line.direction === input.direction).reduce((sum, line) => sum + line.amount.minorUnits, 0) }))
  const rates = (input.exchangeRates ?? []).map(createExchangeRate)
  const scenarioWorld = rates.length === 0 ? world : { ...world, exchangeRatesById: { ...world.exchangeRatesById, ...Object.fromEntries(rates.map((rate) => [rate.id, rate])) } }
  return convertSignedTotals(scenarioWorld, totals, input.reportingCurrencyCode, input.reportingDate ?? input.asOfDate)
}
function convertSignedTotals(world: GameWorld, items: readonly { readonly currencyCode: CurrencyCode; readonly minorUnits: number }[], quote: string, date: GameDate | string): ReportingTotal {
  const target = createCurrencyCode(quote); let total = 0; const missing = new Set<CurrencyCode>()
  for (const item of items) {
    if (item.minorUnits === 0) continue
    const conversion = convertForReporting(world, createMoney({ currencyCode: item.currencyCode, minorUnits: Math.abs(item.minorUnits) }), target, date)
    if ('missingRate' in conversion) missing.add(item.currencyCode)
    else total += Math.sign(item.minorUnits) * conversion.amount.minorUnits
  }
  if (!Number.isSafeInteger(total)) throw new RangeError('Reporting total exceeds safe integer range')
  return Object.freeze({ currencyCode: target, minorUnits: total, complete: missing.size === 0, missingCurrencies: Object.freeze([...missing].sort()), sourceCurrencies: Object.freeze([...new Set(items.map((item) => item.currencyCode))].sort()) })
}
