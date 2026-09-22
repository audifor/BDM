import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { organizationIdFromString, type OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getCashBalancesByCurrency, getOrganizationPayables } from './CashFlowQueries'
import { getPayrollRecognizedByPeriod } from './ContractFinancialSchedule'
import { createAuthorizedEconomicEvent, processAuthorizedFinancialFine, type EconomicEventAdapterOptions } from './EconomicEventAdapters'
import { createCurrencyCode, createFinancialSource, createMoney, type CurrencyCode, type FinancialSource, type Money } from './FinancialLedger'
import { getExpenseRecognitionsBetween, getRevenueRecognitionsBetween } from './RecognitionQueries'
import { getPayableRemaining } from './Treasury'
import { getOutstandingPrincipal } from './DebtEngine'

export type FinancialRegulationMetric = 'MINIMUM_CASH' | 'OPERATING_LOSS' | 'OVERDUE_PAYABLES' | 'PAYROLL_REVENUE_RATIO' | 'DEBT_LEVEL'
export type FinancialConsequence = 'WARNING' | 'REMEDIATION_REQUIREMENT' | 'FINE' | 'COMPETITION_RESTRICTION' | 'REGISTRATION_RESTRICTION' | 'BUDGET_RESTRICTION' | 'LICENSING_ISSUE' | 'SPORTING_SANCTION_REFERENCE'
export interface FinancialRegulationRule {
  readonly id: string
  readonly version: string
  readonly authorityOrganizationId: OrganizationId
  readonly competitionId: string | null
  readonly applicableOrganizationIds: readonly OrganizationId[]
  readonly effectiveFrom: GameDate
  readonly effectiveTo: GameDate | null
  readonly windowDays: number
  readonly metric: FinancialRegulationMetric
  readonly comparison: 'MINIMUM' | 'MAXIMUM'
  readonly threshold: number
  readonly currencyCode: CurrencyCode
  readonly consequence: FinancialConsequence
  readonly provenance: FinancialSource
}
export interface FinancialRegulationAssessment {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly ruleId: string
  readonly ruleVersion: string
  readonly authorityOrganizationId: OrganizationId
  readonly competitionId: string | null
  readonly asOfDate: GameDate
  readonly periodStartsOn: GameDate
  readonly metric: FinancialRegulationMetric
  readonly comparison: 'MINIMUM' | 'MAXIMUM'
  readonly currencyCode: CurrencyCode
  readonly measuredValue: number | null
  readonly threshold: number
  readonly state: 'PASS' | 'BREACH' | 'INSUFFICIENT_DATA'
  readonly supportingFactIds: readonly string[]
  readonly provenance: FinancialSource
  readonly consequence: FinancialConsequence
}
export function createFinancialRegulationAssessment(value: FinancialRegulationAssessment): FinancialRegulationAssessment {
  if (!value.id?.trim() || !value.ruleId?.trim() || !value.ruleVersion?.trim() || !['PASS', 'BREACH', 'INSUFFICIENT_DATA'].includes(value.state) || !Number.isSafeInteger(value.threshold) || (value.measuredValue !== null && !Number.isSafeInteger(value.measuredValue))) throw new TypeError('Financial assessment is invalid')
  if (!['MINIMUM_CASH', 'OPERATING_LOSS', 'OVERDUE_PAYABLES', 'PAYROLL_REVENUE_RATIO', 'DEBT_LEVEL'].includes(value.metric) || !['MINIMUM', 'MAXIMUM'].includes(value.comparison) || !['WARNING', 'REMEDIATION_REQUIREMENT', 'FINE', 'COMPETITION_RESTRICTION', 'REGISTRATION_RESTRICTION', 'BUDGET_RESTRICTION', 'LICENSING_ISSUE', 'SPORTING_SANCTION_REFERENCE'].includes(value.consequence)) throw new TypeError('Financial assessment rule snapshot is invalid')
  const asOfDate = parseGameDate(value.asOfDate); const periodStartsOn = parseGameDate(value.periodStartsOn)
  if (periodStartsOn > asOfDate) throw new RangeError('Assessment period starts after assessment date')
  return Object.freeze({ ...value, organizationId: organizationIdFromString(value.organizationId), authorityOrganizationId: organizationIdFromString(value.authorityOrganizationId), asOfDate, periodStartsOn, currencyCode: createCurrencyCode(value.currencyCode), supportingFactIds: Object.freeze([...value.supportingFactIds]), provenance: createFinancialSource(value.provenance) })
}
export function createFinancialRegulationRule(input: FinancialRegulationRule): FinancialRegulationRule {
  if (!input.id?.trim() || !input.version?.trim() || !Number.isSafeInteger(input.windowDays) || input.windowDays < 0 || !Number.isSafeInteger(input.threshold) || input.threshold < 0) throw new TypeError('Financial rule is invalid')
  if (!['MINIMUM_CASH', 'OPERATING_LOSS', 'OVERDUE_PAYABLES', 'PAYROLL_REVENUE_RATIO', 'DEBT_LEVEL'].includes(input.metric) || !['MINIMUM', 'MAXIMUM'].includes(input.comparison)) throw new TypeError('Financial rule metric or comparison is invalid')
  if (!['WARNING', 'REMEDIATION_REQUIREMENT', 'FINE', 'COMPETITION_RESTRICTION', 'REGISTRATION_RESTRICTION', 'BUDGET_RESTRICTION', 'LICENSING_ISSUE', 'SPORTING_SANCTION_REFERENCE'].includes(input.consequence)) throw new TypeError('Financial consequence is invalid')
  const effectiveFrom = parseGameDate(input.effectiveFrom); const effectiveTo = input.effectiveTo === null ? null : parseGameDate(input.effectiveTo)
  if (effectiveTo !== null && compareGameDates(effectiveTo, effectiveFrom) < 0) throw new RangeError('Financial rule effective period is invalid')
  return Object.freeze({ ...input, authorityOrganizationId: organizationIdFromString(input.authorityOrganizationId), applicableOrganizationIds: Object.freeze(input.applicableOrganizationIds.map(organizationIdFromString)), effectiveFrom, effectiveTo, currencyCode: createCurrencyCode(input.currencyCode), provenance: createFinancialSource(input.provenance) })
}
export function getActiveFinancialRules(rules: readonly FinancialRegulationRule[], organizationId: string, asOfDate: GameDate | string): readonly FinancialRegulationRule[] {
  const date = parseGameDate(asOfDate)
  return Object.freeze(rules.filter((rule) => rule.applicableOrganizationIds.includes(organizationIdFromString(organizationId)) && rule.effectiveFrom <= date && (rule.effectiveTo === null || date <= rule.effectiveTo)).sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version)))
}
export function assessFinancialRegulation(world: GameWorld, ruleInput: FinancialRegulationRule, organizationId: string, asOfDateInput: GameDate | string): FinancialRegulationAssessment {
  const rule = createFinancialRegulationRule(ruleInput); const asOfDate = parseGameDate(asOfDateInput); const organization = organizationIdFromString(organizationId)
  if (!world.organizationsById[organization] || !world.organizationsById[rule.authorityOrganizationId] || !getActiveFinancialRules([rule], organization, asOfDate).length) throw new RangeError('Rule is not applicable on assessment date')
  if (rule.competitionId !== null && !world.competitions[rule.competitionId as keyof typeof world.competitions]) throw new RangeError('Rule competition is unknown')
  const start = new Date(`${asOfDate}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - rule.windowDays)
  const periodStartsOn = parseGameDate(start.toISOString().slice(0, 10))
  const facts: string[] = []; let measuredValue: number | null = null
  const currency = rule.currencyCode
  if (rule.metric === 'MINIMUM_CASH') {
    measuredValue = getCashBalancesByCurrency(world, organization, asOfDate).find((item) => item.currencyCode === currency)?.unrestrictedCashMinorUnits ?? null
    facts.push(...Object.values(world.financialTransactionsById).filter((item) => item.organizationId === organization && item.amount.currencyCode === currency && item.effectiveOn <= asOfDate).map((item) => item.id))
  } else if (rule.metric === 'OVERDUE_PAYABLES') {
    const overdue = Object.values(world.payablesById).filter((item) => item.organizationId === organization && item.amount.currencyCode === currency && item.dueOn < asOfDate && item.recognizedOn <= asOfDate)
    measuredValue = overdue.reduce((sum, item) => sum + getPayableRemaining(world, item.id, asOfDate).minorUnits, 0); facts.push(...overdue.map((item) => item.id))
  } else if (rule.metric === 'DEBT_LEVEL') {
    const debts = Object.values(world.debtInstrumentsById).filter((item) => item.organizationId === organization && item.currencyCode === currency && item.startsOn <= asOfDate)
    measuredValue = debts.reduce((sum, item) => sum + getOutstandingPrincipal(world, item.id, asOfDate).minorUnits, 0); facts.push(...debts.map((item) => item.id))
  } else {
    const revenue = getRevenueRecognitionsBetween(world, organization, periodStartsOn, asOfDate).filter((item) => item.amount.currencyCode === currency)
    if (rule.metric === 'OPERATING_LOSS') {
      const expense = getExpenseRecognitionsBetween(world, organization, periodStartsOn, asOfDate).filter((item) => item.amount.currencyCode === currency)
      measuredValue = Math.max(0, expense.reduce((sum, item) => sum + item.amount.minorUnits, 0) - revenue.reduce((sum, item) => sum + item.amount.minorUnits, 0))
      facts.push(...revenue.map((item) => item.id), ...expense.map((item) => item.id))
    } else {
      const payroll = getPayrollRecognizedByPeriod(world, organization, periodStartsOn, asOfDate).filter((item) => item.amount.currencyCode === currency)
      const denominator = revenue.reduce((sum, item) => sum + item.amount.minorUnits, 0)
      measuredValue = denominator === 0 ? null : Number(BigInt(payroll.reduce((sum, item) => sum + item.amount.minorUnits, 0)) * 10_000n / BigInt(denominator))
      facts.push(...revenue.map((item) => item.id), ...payroll.map((item) => item.id))
    }
  }
  if (measuredValue !== null && !Number.isSafeInteger(measuredValue)) throw new RangeError('Assessment exceeds safe integer range')
  return createFinancialRegulationAssessment({ id: `assessment:${rule.id}:${rule.version}:${organization}:${asOfDate}`, organizationId: organization, ruleId: rule.id, ruleVersion: rule.version, authorityOrganizationId: rule.authorityOrganizationId, competitionId: rule.competitionId, asOfDate, periodStartsOn, metric: rule.metric, comparison: rule.comparison, currencyCode: rule.currencyCode, measuredValue, threshold: rule.threshold, state: measuredValue === null ? 'INSUFFICIENT_DATA' : (rule.comparison === 'MINIMUM' ? measuredValue >= rule.threshold : measuredValue <= rule.threshold) ? 'PASS' : 'BREACH', supportingFactIds: Object.freeze(facts.sort()), provenance: rule.provenance, consequence: rule.consequence })
}
export function recordFinancialAssessment(world: GameWorld, assessment: FinancialRegulationAssessment): GameWorld {
  const existing = world.financialRegulationAssessmentsById[assessment.id]
  if (existing) { if (JSON.stringify(existing) !== JSON.stringify(assessment)) throw new RangeError('Assessment ID conflict'); return world }
  return updateGameWorld(world, { financialRegulationAssessments: [...Object.values(world.financialRegulationAssessmentsById), assessment] })
}
export function getFinancialAssessments(world: GameWorld, organizationId: string): readonly FinancialRegulationAssessment[] {
  return Object.freeze(Object.values(world.financialRegulationAssessmentsById).filter((item) => item.organizationId === organizationId).sort((a, b) => a.asOfDate.localeCompare(b.asOfDate) || a.id.localeCompare(b.id)))
}
export function getCurrentFinancialAssessments(world: GameWorld, organizationId: string, asOfDate: GameDate | string = world.currentDate): readonly FinancialRegulationAssessment[] {
  const latest = new Map<string, FinancialRegulationAssessment>()
  for (const item of getFinancialAssessments(world, organizationId)) if (item.asOfDate <= asOfDate) latest.set(item.ruleId, item)
  return Object.freeze([...latest.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId)))
}
export function getFinancialBreaches(world: GameWorld, organizationId: string, asOfDate: GameDate | string = world.currentDate): readonly FinancialRegulationAssessment[] {
  return Object.freeze(getCurrentFinancialAssessments(world, organizationId, asOfDate).filter((item) => item.state === 'BREACH'))
}
export function getAuthorityFinancialAssessments(world: GameWorld, authorityOrganizationId: string, asOfDate: GameDate | string = world.currentDate): readonly FinancialRegulationAssessment[] {
  return Object.freeze(Object.values(world.organizationsById).flatMap((organization) => getCurrentFinancialAssessments(world, organization.id, asOfDate)).filter((item) => item.authorityOrganizationId === authorityOrganizationId).sort((a, b) => a.organizationId.localeCompare(b.organizationId) || a.ruleId.localeCompare(b.ruleId)))
}
export function getOrganizationFinancialRegulationStatus(world: GameWorld, organizationId: string, asOfDate: GameDate | string = world.currentDate) {
  const current = getCurrentFinancialAssessments(world, organizationId, asOfDate)
  const assessmentIds = new Set(getFinancialAssessments(world, organizationId).map((item) => item.id))
  const orders = Object.values(world.regulatoryOrdersById).filter((item) => item.targetOrganizationId === organizationId && item.sourceAssessmentId !== null && assessmentIds.has(item.sourceAssessmentId))
  const orderIds = new Set(orders.map((item) => item.id))
  return Object.freeze({
    current, historical: getFinancialAssessments(world, organizationId),
    breaches: Object.freeze(current.filter((item) => item.state === 'BREACH')),
    warnings: Object.freeze(current.filter((item) => item.state === 'BREACH' && item.consequence === 'WARNING')),
    outstandingRemediation: Object.freeze(Object.values(world.regulatoryRemediationPlansById).filter((item) => orderIds.has(item.regulatoryOrderId) && (item.status === 'PROPOSED' || item.status === 'ACTIVE'))),
    overduePayables: Object.freeze(getOrganizationPayables(world, organizationId, asOfDate).filter((item) => item.obligation.dueOn < asOfDate && item.remainingMinorUnits > 0)),
    financialPenalties: Object.freeze(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && item.category === 'FINANCIAL_FINE' && item.recognizedOn <= asOfDate).sort((a, b) => a.id.localeCompare(b.id))),
  })
}
export function recordAuthorizedFinancialFine(world: GameWorld, sanction: { readonly id: string; readonly authorityOrganizationId: string; readonly organizationId: string; readonly amount: Money; readonly effectiveOn: GameDate; readonly dueOn: GameDate; readonly provenance: FinancialSource }, ledger: NonNullable<EconomicEventAdapterOptions['ledger']>) {
  if (!world.organizationsById[organizationIdFromString(sanction.authorityOrganizationId)]) throw new RangeError('Fine authority is unknown')
  const event = createAuthorizedEconomicEvent({ id: `fine:${sanction.id}`, eventType: 'AUTHORIZED_FINANCIAL_FINE', sourceAuthority: 'GOVERNANCE', sourceEntityId: sanction.id, organizationId: sanction.organizationId, effectiveOn: sanction.effectiveOn, dueOn: sanction.dueOn, amount: createMoney(sanction.amount), provenance: sanction.provenance, idempotencyKey: sanction.id, expenseCategory: 'FINANCIAL_FINE' })
  return processAuthorizedFinancialFine(world, event, { ledger })
}
