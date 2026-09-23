import { parseGameDate, type GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world/GameWorld'
import { convertForReporting } from './EconomicEnvironment'
import { createCurrencyCode, createFinancialSource, createMoney, type CurrencyCode, type FinancialSource, type Money } from './FinancialLedger'
import { getFinancialHealthSnapshot } from './FinancialHealth'

export type ValuationMethod = 'REVENUE_MULTIPLE' | 'OPERATING_RESULT_MULTIPLE'
export interface ValuationAssumptions {
  readonly id: string
  readonly method: ValuationMethod
  readonly multipleNumerator: number
  readonly multipleDenominator: number
  readonly provenance: FinancialSource
}
export interface ValuationComponent {
  readonly kind: 'OPERATING_METRIC' | 'ENTERPRISE_VALUE' | 'NET_DEBT'
  readonly original: ValuationSignedAmount
  readonly reporting: ValuationSignedAmount | null
  readonly exchangeRateId: string | null
}
export interface ValuationSignedAmount { readonly currencyCode: CurrencyCode; readonly minorUnits: number }
export interface OrganizationValuation {
  readonly organizationId: string
  readonly asOfDate: GameDate
  readonly periodStartsOn: GameDate
  readonly method: ValuationMethod
  readonly reportingCurrencyCode: CurrencyCode
  readonly assumptions: ValuationAssumptions
  readonly components: readonly ValuationComponent[]
  readonly enterpriseValue: Money | null
  readonly indicativeEquityValue: ValuationSignedAmount | null
  readonly estimatedValue: ValuationSignedAmount | null
  readonly complete: boolean
  readonly missingCurrencies: readonly CurrencyCode[]
  readonly provenance: FinancialSource
}

/** A reproducible indication, never a balance-sheet fact or transaction price. */
export function valueOrganization(world: GameWorld, input: { readonly organizationId: string; readonly asOfDate: GameDate | string; readonly periodStartsOn: GameDate | string; readonly reportingCurrencyCode: string; readonly assumptions?: ValuationAssumptions }): OrganizationValuation | null {
  if (!input.assumptions) return null
  const assumptions = input.assumptions
  if (!assumptions.id.trim() || !['REVENUE_MULTIPLE', 'OPERATING_RESULT_MULTIPLE'].includes(assumptions.method) || !Number.isSafeInteger(assumptions.multipleNumerator) || assumptions.multipleNumerator <= 0 || !Number.isSafeInteger(assumptions.multipleDenominator) || assumptions.multipleDenominator <= 0) throw new TypeError('Invalid explicit valuation assumptions')
  const asOfDate = parseGameDate(input.asOfDate)
  const periodStartsOn = parseGameDate(input.periodStartsOn)
  const reportingCurrencyCode = createCurrencyCode(input.reportingCurrencyCode)
  const health = getFinancialHealthSnapshot(world, input.organizationId, asOfDate, periodStartsOn)
  const components: ValuationComponent[] = []
  const missing = new Set<CurrencyCode>()
  let enterprise = 0
  let netDebt = 0
  let validMetric = false
  const convert = (kind: ValuationComponent['kind'], original: ValuationSignedAmount): void => {
    const result = convertForReporting(world, createMoney({ currencyCode: original.currencyCode, minorUnits: Math.abs(original.minorUnits) }), reportingCurrencyCode, asOfDate)
    if ('missingRate' in result) { missing.add(original.currencyCode); components.push(Object.freeze({ kind, original, reporting: null, exchangeRateId: null })); return }
    const reporting = Object.freeze({ currencyCode: reportingCurrencyCode, minorUnits: Math.sign(original.minorUnits) * result.amount.minorUnits })
    components.push(Object.freeze({ kind, original, reporting, exchangeRateId: result.rateId }))
    if (kind === 'ENTERPRISE_VALUE') enterprise += reporting.minorUnits
    if (kind === 'NET_DEBT') netDebt += reporting.minorUnits
  }
  for (const row of health.byCurrency) {
    const metric = assumptions.method === 'REVENUE_MULTIPLE' ? row.operatingRevenueMinorUnits : row.operatingResultMinorUnits
    if (metric > 0) {
      validMetric = true
      const originalMetric = createMoney({ currencyCode: row.currencyCode, minorUnits: metric })
      convert('OPERATING_METRIC', originalMetric)
      const denominator = BigInt(assumptions.multipleDenominator)
      const value = Number((BigInt(metric) * BigInt(assumptions.multipleNumerator) + denominator / 2n) / denominator)
      if (!Number.isSafeInteger(value)) throw new RangeError('Valuation exceeds safe integer range')
      convert('ENTERPRISE_VALUE', createMoney({ currencyCode: row.currencyCode, minorUnits: value }))
    }
    if (row.netDebtMinorUnits !== 0) convert('NET_DEBT', { currencyCode: row.currencyCode, minorUnits: row.netDebtMinorUnits })
  }
  if (!validMetric) return null
  if (!Number.isSafeInteger(enterprise) || !Number.isSafeInteger(netDebt)) throw new RangeError('Valuation exceeds safe integer range')
  if (!Number.isSafeInteger(enterprise - netDebt)) throw new RangeError('Equity value exceeds safe integer range')
  const complete = missing.size === 0
  const enterpriseValue = complete ? { currencyCode: reportingCurrencyCode, minorUnits: enterprise } : null
  const indicativeEquityValue = complete ? { currencyCode: reportingCurrencyCode, minorUnits: enterprise - netDebt } : null
  return Object.freeze({ organizationId: input.organizationId, asOfDate, periodStartsOn, method: assumptions.method, reportingCurrencyCode, assumptions: Object.freeze({ ...assumptions, provenance: createFinancialSource(assumptions.provenance) }), components: Object.freeze(components), enterpriseValue, indicativeEquityValue, estimatedValue: indicativeEquityValue, complete, missingCurrencies: Object.freeze([...missing].sort()), provenance: createFinancialSource({ kind: 'VALUATION_ASSUMPTIONS', id: assumptions.id }) })
}
