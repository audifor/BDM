import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import {
  createFinancialDimensions,
  createFinancialSource,
  createMoney,
  type CurrencyCode,
  type FinancialDimensions,
  type FinancialSource,
  type Money,
} from './FinancialLedger'
import { getCashFlowProjection } from './CashFlowQueries'
import { getContractFinancialSchedule } from './ContractFinancialSchedule'
import type { ExpenseRecognition } from './Recognition'
import { getOutstandingCommitments } from './RecognitionQueries'
import { getRevenueSchedule } from './RevenueEngine'

export const BUDGET_STATUSES = ['DRAFT', 'PROPOSED', 'APPROVED', 'SUPERSEDED', 'CLOSED'] as const
export type BudgetStatus = typeof BUDGET_STATUSES[number]
export type BudgetDirection = 'INCOME' | 'EXPENSE'
export type PlanningPeriodKind = 'SEASON' | 'FISCAL_YEAR' | 'DATE_RANGE'
export type ForecastScenario = 'BASELINE' | 'UPSIDE' | 'DOWNSIDE' | 'CUSTOM'
export type ForecastAssumptionKind = 'INCOME' | 'EXPENSE' | 'CASH_INFLOW' | 'CASH_OUTFLOW'

export interface FinancialPlanningPeriod {
  readonly kind: PlanningPeriodKind
  readonly startsOn: GameDate
  readonly endsOn: GameDate
  readonly seasonId?: string
}

export interface BudgetApproval {
  readonly authorityKind: 'GOVERNANCE' | 'OWNERSHIP' | 'MANUAL_SYSTEM_ACTION'
  readonly authorityId: string
  readonly approvedOn: GameDate
  readonly provenance: FinancialSource
}

export interface FinancialBudget {
  readonly id: string
  readonly organizationId: string
  readonly currencyCode: CurrencyCode
  readonly period: FinancialPlanningPeriod
  readonly status: BudgetStatus
  readonly label: string
  readonly createdOn: GameDate
  readonly revisionOfId: string | null
  readonly approval: BudgetApproval | null
  readonly provenance: FinancialSource
}

export interface BudgetLine {
  readonly id: string
  readonly budgetId: string
  readonly organizationId: string
  readonly category: string
  readonly direction: BudgetDirection
  readonly amount: Money
  readonly teamId?: string
  readonly organizationSectionId?: string
  readonly purpose?: string
  readonly provenance: FinancialSource
}

export interface BudgetRevision {
  readonly id: string
  readonly organizationId: string
  readonly budgetId: string
  readonly supersedesBudgetId: string
  readonly revisionNumber: number
  readonly createdOn: GameDate
  readonly reason: string
  readonly provenance: FinancialSource
}

export interface BudgetAllocation {
  readonly id: string
  readonly budgetId: string
  readonly budgetLineId: string
  readonly organizationId: string
  readonly amount: Money
  readonly teamId?: string
  readonly organizationSectionId?: string
  readonly purpose?: string
  readonly provenance: FinancialSource
}

export interface ForecastAssumption {
  readonly id: string
  readonly organizationId: string
  readonly scenario: ForecastScenario
  readonly kind: ForecastAssumptionKind
  readonly amount: Money
  readonly period: FinancialPlanningPeriod
  readonly category?: string
  readonly teamId?: string
  readonly organizationSectionId?: string
  readonly explanation: string
  readonly provenance: FinancialSource
}

export interface BudgetComparisonRow {
  readonly lineId: string
  readonly category: string
  readonly direction: BudgetDirection
  readonly budgetMinorUnits: number
  readonly actualMinorUnits: number
  readonly committedMinorUnits: number
  readonly forecastMinorUnits: number
  /** Favorable convention: expense budget minus actual; income actual minus budget. */
  readonly varianceMinorUnits: number
  readonly commitmentVarianceMinorUnits: number
  readonly projectedVarianceMinorUnits: number
  readonly overBudget: boolean
  readonly projectedOverBudget: boolean
}

export interface FinancialForecastLine {
  readonly category: string
  readonly direction: BudgetDirection
  readonly amount: Money
  readonly actualMinorUnits: number
  readonly committedMinorUnits: number
  readonly assumptionMinorUnits: number
}

export interface FinancialForecast {
  readonly organizationId: string
  readonly asOfDate: GameDate
  readonly period: FinancialPlanningPeriod
  readonly scenario: ForecastScenario
  readonly currencyCode: CurrencyCode
  readonly linkedBudgetId: string | null
  readonly lines: readonly FinancialForecastLine[]
  readonly assumptionIds: readonly string[]
}

export interface ProjectedLiquidityRow {
  readonly currencyCode: CurrencyCode
  readonly cashNowMinorUnits: number
  readonly receivablesDueMinorUnits: number
  readonly payablesDueMinorUnits: number
  readonly explicitCashAssumptionsMinorUnits: number
  readonly projectedClosingCashMinorUnits: number
}

export function createFinancialPlanningPeriod(input: { readonly kind: PlanningPeriodKind; readonly startsOn: GameDate | string; readonly endsOn: GameDate | string; readonly seasonId?: string }): FinancialPlanningPeriod {
  const startsOn = parseGameDate(input.startsOn)
  const endsOn = parseGameDate(input.endsOn)
  if (compareGameDates(endsOn, startsOn) < 0) throw new RangeError('Financial planning period endsOn cannot precede startsOn')
  if (!['SEASON', 'FISCAL_YEAR', 'DATE_RANGE'].includes(input.kind)) throw new TypeError('Financial planning period kind is invalid')
  if (input.kind === 'SEASON' && !input.seasonId) throw new TypeError('Season planning period requires seasonId')
  return Object.freeze({ kind: input.kind, startsOn, endsOn, ...(input.seasonId === undefined ? {} : { seasonId: nonEmpty(input.seasonId, 'Planning period seasonId') }) })
}

export function createFinancialBudget(input: {
  readonly id: string; readonly organizationId: string; readonly currencyCode: string; readonly period: FinancialPlanningPeriod | { readonly kind: PlanningPeriodKind; readonly startsOn: GameDate | string; readonly endsOn: GameDate | string; readonly seasonId?: string }
  readonly status?: BudgetStatus; readonly label: string; readonly createdOn: GameDate | string; readonly revisionOfId?: string | null; readonly approval?: { readonly authorityKind: BudgetApproval['authorityKind']; readonly authorityId: string; readonly approvedOn: GameDate | string; readonly provenance: FinancialSource } | null; readonly provenance: FinancialSource
}): FinancialBudget {
  const status = input.status ?? 'DRAFT'
  if (!BUDGET_STATUSES.includes(status)) throw new TypeError('Budget status is invalid')
  const approval = input.approval === undefined || input.approval === null ? null : createBudgetApproval(input.approval)
  if (status === 'APPROVED' && approval === null) throw new TypeError('An approved budget requires Governance or Ownership approval provenance')
  if (status !== 'APPROVED' && approval !== null) throw new TypeError('Only an approved budget may carry approval metadata')
  return Object.freeze({ id: nonEmpty(input.id, 'Budget id'), organizationId: nonEmpty(input.organizationId, 'Budget organizationId'), currencyCode: createMoney({ currencyCode: input.currencyCode, minorUnits: 0 }).currencyCode, period: createFinancialPlanningPeriod(input.period), status, label: nonEmpty(input.label, 'Budget label'), createdOn: parseGameDate(input.createdOn), revisionOfId: input.revisionOfId === undefined || input.revisionOfId === null ? null : nonEmpty(input.revisionOfId, 'Budget revisionOfId'), approval, provenance: createFinancialSource(input.provenance) })
}

export function createBudgetLine(input: { readonly id: string; readonly budgetId: string; readonly organizationId: string; readonly category: string; readonly direction: BudgetDirection; readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }; readonly teamId?: string; readonly organizationSectionId?: string; readonly purpose?: string; readonly provenance: FinancialSource }): BudgetLine {
  if (input.direction !== 'INCOME' && input.direction !== 'EXPENSE') throw new TypeError('Budget line direction is invalid')
  return Object.freeze({ id: nonEmpty(input.id, 'Budget line id'), budgetId: nonEmpty(input.budgetId, 'Budget line budgetId'), organizationId: nonEmpty(input.organizationId, 'Budget line organizationId'), category: nonEmpty(input.category, 'Budget line category'), direction: input.direction, amount: createMoney(input.amount), ...(input.teamId === undefined ? {} : { teamId: nonEmpty(input.teamId, 'Budget line teamId') }), ...(input.organizationSectionId === undefined ? {} : { organizationSectionId: nonEmpty(input.organizationSectionId, 'Budget line organizationSectionId') }), ...(input.purpose === undefined ? {} : { purpose: nonEmpty(input.purpose, 'Budget line purpose') }), provenance: createFinancialSource(input.provenance) })
}

export function createBudgetRevision(input: { readonly id: string; readonly organizationId: string; readonly budgetId: string; readonly supersedesBudgetId: string; readonly revisionNumber: number; readonly createdOn: GameDate | string; readonly reason: string; readonly provenance: FinancialSource }): BudgetRevision {
  if (!Number.isSafeInteger(input.revisionNumber) || input.revisionNumber < 1) throw new RangeError('Budget revisionNumber must be a positive integer')
  if (input.budgetId === input.supersedesBudgetId) throw new RangeError('Budget revision cannot supersede itself')
  return Object.freeze({ id: nonEmpty(input.id, 'Budget revision id'), organizationId: nonEmpty(input.organizationId, 'Budget revision organizationId'), budgetId: nonEmpty(input.budgetId, 'Budget revision budgetId'), supersedesBudgetId: nonEmpty(input.supersedesBudgetId, 'Budget revision supersedesBudgetId'), revisionNumber: input.revisionNumber, createdOn: parseGameDate(input.createdOn), reason: nonEmpty(input.reason, 'Budget revision reason'), provenance: createFinancialSource(input.provenance) })
}

export function createBudgetAllocation(input: { readonly id: string; readonly budgetId: string; readonly budgetLineId: string; readonly organizationId: string; readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }; readonly teamId?: string; readonly organizationSectionId?: string; readonly purpose?: string; readonly provenance: FinancialSource }): BudgetAllocation {
  return Object.freeze({ id: nonEmpty(input.id, 'Budget allocation id'), budgetId: nonEmpty(input.budgetId, 'Budget allocation budgetId'), budgetLineId: nonEmpty(input.budgetLineId, 'Budget allocation budgetLineId'), organizationId: nonEmpty(input.organizationId, 'Budget allocation organizationId'), amount: createMoney(input.amount), ...(input.teamId === undefined ? {} : { teamId: nonEmpty(input.teamId, 'Budget allocation teamId') }), ...(input.organizationSectionId === undefined ? {} : { organizationSectionId: nonEmpty(input.organizationSectionId, 'Budget allocation organizationSectionId') }), ...(input.purpose === undefined ? {} : { purpose: nonEmpty(input.purpose, 'Budget allocation purpose') }), provenance: createFinancialSource(input.provenance) })
}

export function createForecastAssumption(input: { readonly id: string; readonly organizationId: string; readonly scenario?: ForecastScenario; readonly kind: ForecastAssumptionKind; readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }; readonly period: FinancialPlanningPeriod | { readonly kind: PlanningPeriodKind; readonly startsOn: GameDate | string; readonly endsOn: GameDate | string; readonly seasonId?: string }; readonly category?: string; readonly teamId?: string; readonly organizationSectionId?: string; readonly explanation: string; readonly provenance: FinancialSource }): ForecastAssumption {
  if (!['INCOME', 'EXPENSE', 'CASH_INFLOW', 'CASH_OUTFLOW'].includes(input.kind)) throw new TypeError('Forecast assumption kind is invalid')
  if (input.scenario !== undefined && !['BASELINE', 'UPSIDE', 'DOWNSIDE', 'CUSTOM'].includes(input.scenario)) throw new TypeError('Forecast assumption scenario is invalid')
  return Object.freeze({ id: nonEmpty(input.id, 'Forecast assumption id'), organizationId: nonEmpty(input.organizationId, 'Forecast assumption organizationId'), scenario: input.scenario ?? 'BASELINE', kind: input.kind, amount: createMoney(input.amount), period: createFinancialPlanningPeriod(input.period), ...(input.category === undefined ? {} : { category: nonEmpty(input.category, 'Forecast assumption category') }), ...(input.teamId === undefined ? {} : { teamId: nonEmpty(input.teamId, 'Forecast assumption teamId') }), ...(input.organizationSectionId === undefined ? {} : { organizationSectionId: nonEmpty(input.organizationSectionId, 'Forecast assumption organizationSectionId') }), explanation: nonEmpty(input.explanation, 'Forecast assumption explanation'), provenance: createFinancialSource(input.provenance) })
}

export function getBudgetLines(world: GameWorld, budgetId: string): readonly BudgetLine[] {
  return Object.values(world.budgetLinesById).filter((line) => line.budgetId === budgetId)
}

export function getBudgetAllocations(world: GameWorld, budgetId: string): readonly BudgetAllocation[] {
  return Object.values(world.budgetAllocationsById).filter((allocation) => allocation.budgetId === budgetId)
}

export function getBudgetRevisionHistory(world: GameWorld, budgetId: string): readonly FinancialBudget[] {
  const root = findRootBudget(world, budgetId)
  return Object.values(world.financialBudgetsById).filter((budget) => findRootBudget(world, budget.id) === root).sort((a, b) => compareGameDates(a.createdOn, b.createdOn) || a.id.localeCompare(b.id))
}

export function getBudgetLifecycleStatus(world: GameWorld, budgetId: string): BudgetStatus {
  const budget = world.financialBudgetsById[budgetId]
  if (budget === undefined) throw new Error(`Unknown budget ${budgetId}`)
  if (budget.status === 'APPROVED' && Object.values(world.financialBudgetsById).some((candidate) => candidate.revisionOfId === budget.id && candidate.status === 'APPROVED')) return 'SUPERSEDED'
  return budget.status
}

export function getActiveApprovedBudget(world: GameWorld, organizationId: string, period: FinancialPlanningPeriod, asOfDate: GameDate | string = world.currentDate): FinancialBudget | undefined {
  const asOf = parseGameDate(asOfDate)
  return Object.values(world.financialBudgetsById).filter((budget) => budget.organizationId === organizationId && budget.status === 'APPROVED' && getBudgetLifecycleStatus(world, budget.id) === 'APPROVED' && overlaps(budget.period, period) && compareGameDates(budget.createdOn, asOf) <= 0).sort((a, b) => compareGameDates(b.createdOn, a.createdOn) || b.id.localeCompare(a.id))[0]
}

export function getBudgetComparison(world: GameWorld, budgetId: string, asOfDate: GameDate | string = world.currentDate): readonly BudgetComparisonRow[] {
  const budget = requireBudget(world, budgetId)
  const asOf = parseGameDate(asOfDate)
  return Object.freeze(getBudgetLines(world, budgetId).map((line) => {
    const actual = recognizedForLine(world, budget, line, asOf)
    const committed = committedForLine(world, budget, line, asOf)
    const assumptions = assumptionForLine(world, budget, line, 'BASELINE')
    const forecast = (line.direction === 'INCOME' ? Math.max(actual, committed.total) : actual + committed.total) + assumptions
    const favorableVariance = line.direction === 'EXPENSE' ? line.amount.minorUnits - actual : actual - line.amount.minorUnits
    const commitmentVariance = line.direction === 'EXPENSE' ? line.amount.minorUnits - committed.total : committed.total - line.amount.minorUnits
    const projectedVariance = line.direction === 'EXPENSE' ? line.amount.minorUnits - forecast : forecast - line.amount.minorUnits
    return Object.freeze({ lineId: line.id, category: line.category, direction: line.direction, budgetMinorUnits: line.amount.minorUnits, actualMinorUnits: actual, committedMinorUnits: committed.total, forecastMinorUnits: forecast, varianceMinorUnits: favorableVariance, commitmentVarianceMinorUnits: commitmentVariance, projectedVarianceMinorUnits: projectedVariance, overBudget: line.direction === 'EXPENSE' ? actual > line.amount.minorUnits : actual < line.amount.minorUnits, projectedOverBudget: line.direction === 'EXPENSE' ? forecast > line.amount.minorUnits : forecast < line.amount.minorUnits })
  }))
}

export function getUnbudgetedRecognizedExpenses(world: GameWorld, organizationId: string, period: FinancialPlanningPeriod, currencyCode: string): readonly ExpenseRecognition[] {
  const budgeted = new Set(Object.values(world.budgetLinesById).filter((line) => line.organizationId === organizationId && line.direction === 'EXPENSE' && line.amount.currencyCode === currencyCode && overlaps(world.financialBudgetsById[line.budgetId]?.period, period)).map((line) => line.category))
  return Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && item.amount.currencyCode === currencyCode && within(item.recognizedOn, period) && !budgeted.has(normalizeCategory(item.category)))
}

export function createFinancialForecast(world: GameWorld, input: { readonly organizationId: string; readonly asOfDate: GameDate | string; readonly period: FinancialPlanningPeriod; readonly currencyCode: string; readonly scenario?: ForecastScenario; readonly linkedBudgetId?: string | null }): FinancialForecast {
  const asOfDate = parseGameDate(input.asOfDate)
  const currencyCode = createMoney({ currencyCode: input.currencyCode, minorUnits: 0 }).currencyCode
  const scenario = input.scenario ?? 'BASELINE'
  const assumptions = Object.values(world.forecastAssumptionsById).filter((item) => item.organizationId === input.organizationId && item.scenario === scenario && item.amount.currencyCode === currencyCode && overlaps(item.period, input.period))
  const categories = new Map<string, { direction: BudgetDirection; actual: number; committed: number; assumption: number }>()
  const add = (category: string, direction: BudgetDirection, field: 'actual' | 'committed' | 'assumption', amount: number) => { const row = categories.get(category) ?? { direction, actual: 0, committed: 0, assumption: 0 }; row[field] += amount; categories.set(category, row) }
  for (const item of Object.values(world.revenueRecognitionsById)) if (item.organizationId === input.organizationId && item.amount.currencyCode === currencyCode && within(item.recognizedOn, input.period) && compareGameDates(item.recognizedOn, asOfDate) <= 0) add(item.category, 'INCOME', 'actual', item.amount.minorUnits)
  for (const item of Object.values(world.expenseRecognitionsById)) if (item.organizationId === input.organizationId && item.amount.currencyCode === currencyCode && within(item.recognizedOn, input.period) && compareGameDates(item.recognizedOn, asOfDate) <= 0) add(normalizeCategory(item.category), 'EXPENSE', 'actual', item.amount.minorUnits)
  for (const item of knownCommitments(world, input.organizationId, input.period, asOfDate, currencyCode)) add(item.category, 'EXPENSE', 'committed', item.amount)
  for (const item of getRevenueSchedule(world, { organizationId: input.organizationId, from: input.period.startsOn, to: input.period.endsOn, currencyCode })) add(item.category, 'INCOME', 'committed', item.amount.minorUnits)
  for (const item of assumptions) if (item.kind === 'INCOME' || item.kind === 'EXPENSE') add(item.category ?? 'UNSPECIFIED', item.kind, 'assumption', item.amount.minorUnits)
  const lines = [...categories.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([category, row]) => { const baseline = row.direction === 'INCOME' ? Math.max(row.actual, row.committed) : row.actual + row.committed; return Object.freeze({ category, direction: row.direction, amount: createMoney({ currencyCode, minorUnits: baseline + row.assumption }), actualMinorUnits: row.actual, committedMinorUnits: row.committed, assumptionMinorUnits: row.assumption }) })
  return Object.freeze({ organizationId: input.organizationId, asOfDate, period: input.period, scenario, currencyCode, linkedBudgetId: input.linkedBudgetId ?? null, lines: Object.freeze(lines), assumptionIds: Object.freeze(assumptions.map((item) => item.id)) })
}

export function getProjectedLiquidity(world: GameWorld, input: { readonly organizationId: string; readonly asOfDate?: GameDate | string; readonly throughDate: GameDate | string; readonly scenario?: ForecastScenario }): readonly ProjectedLiquidityRow[] {
  const asOfDate = input.asOfDate ?? world.currentDate
  const base = getCashFlowProjection(world, input.organizationId, { asOfDate, throughDate: input.throughDate })
  const assumptions = Object.values(world.forecastAssumptionsById).filter((item) => item.organizationId === input.organizationId && item.scenario === (input.scenario ?? 'BASELINE') && (item.kind === 'CASH_INFLOW' || item.kind === 'CASH_OUTFLOW') && compareGameDates(item.period.endsOn, parseGameDate(asOfDate)) >= 0 && compareGameDates(item.period.startsOn, parseGameDate(input.throughDate)) <= 0)
  return Object.freeze(base.byCurrency.map((row) => { const explicit = assumptions.filter((item) => item.amount.currencyCode === row.currencyCode).reduce((sum, item) => sum + (item.kind === 'CASH_INFLOW' ? item.amount.minorUnits : -item.amount.minorUnits), 0); return Object.freeze({ currencyCode: row.currencyCode, cashNowMinorUnits: row.openingCashMinorUnits, receivablesDueMinorUnits: row.receivablesDueMinorUnits, payablesDueMinorUnits: row.payablesDueMinorUnits, explicitCashAssumptionsMinorUnits: explicit, projectedClosingCashMinorUnits: row.projectedClosingCashMinorUnits + explicit }) }))
}

export function validateFinancialPlanningCollections(budgets: readonly FinancialBudget[], lines: readonly BudgetLine[], revisions: readonly BudgetRevision[], allocations: readonly BudgetAllocation[], assumptions: readonly ForecastAssumption[]): void {
  const budgetIds = new Set(budgets.map((item) => item.id)); const lineIds = new Set(lines.map((item) => item.id)); const lineById = new Map(lines.map((item) => [item.id, item]));
  for (const line of lines) { const budget = budgets.find((item) => item.id === line.budgetId); if (!budget || budget.organizationId !== line.organizationId || budget.currencyCode !== line.amount.currencyCode) throw new Error(`Budget line ${line.id} is not owned by its budget`) }
  for (const revision of revisions) if (!budgetIds.has(revision.budgetId) || !budgetIds.has(revision.supersedesBudgetId)) throw new Error(`Budget revision ${revision.id} references an unknown budget`)
  for (const allocation of allocations) { const line = lineById.get(allocation.budgetLineId); if (!budgetIds.has(allocation.budgetId) || !line || line.budgetId !== allocation.budgetId || line.organizationId !== allocation.organizationId || allocation.amount.currencyCode !== line.amount.currencyCode) throw new Error(`Budget allocation ${allocation.id} is not owned by its budget line`) }
  for (const assumption of assumptions) if (!['BASELINE', 'UPSIDE', 'DOWNSIDE', 'CUSTOM'].includes(assumption.scenario)) throw new Error(`Forecast assumption ${assumption.id} has an invalid scenario`)
}

function createBudgetApproval(input: { readonly authorityKind: BudgetApproval['authorityKind']; readonly authorityId: string; readonly approvedOn: GameDate | string; readonly provenance: FinancialSource }): BudgetApproval { if (!['GOVERNANCE', 'OWNERSHIP', 'MANUAL_SYSTEM_ACTION'].includes(input.authorityKind)) throw new TypeError('Budget approval authorityKind is invalid'); return Object.freeze({ authorityKind: input.authorityKind, authorityId: nonEmpty(input.authorityId, 'Budget approval authorityId'), approvedOn: parseGameDate(input.approvedOn), provenance: createFinancialSource(input.provenance) }) }
function requireBudget(world: GameWorld, id: string): FinancialBudget { const budget = world.financialBudgetsById[id]; if (!budget) throw new Error(`Unknown budget ${id}`); return budget }
function findRootBudget(world: GameWorld, id: string): string { let budget = requireBudget(world, id); const seen = new Set<string>(); while (budget.revisionOfId !== null) { if (seen.has(budget.id)) throw new Error('Budget revision lineage contains a cycle'); seen.add(budget.id); budget = requireBudget(world, budget.revisionOfId) } return budget.id }
function within(date: GameDate, period: FinancialPlanningPeriod | undefined): boolean { return period !== undefined && compareGameDates(date, period.startsOn) >= 0 && compareGameDates(date, period.endsOn) <= 0 }
function overlaps(left: FinancialPlanningPeriod | undefined, right: FinancialPlanningPeriod): boolean { return left !== undefined && compareGameDates(left.startsOn, right.endsOn) <= 0 && compareGameDates(right.startsOn, left.endsOn) <= 0 }
function matchesDimensions(item: { readonly dimensions: FinancialDimensions | null }, line: BudgetLine): boolean { return (line.teamId === undefined || item.dimensions?.teamId === line.teamId) && (line.organizationSectionId === undefined || item.dimensions?.organizationSectionId === line.organizationSectionId) }
function normalizeCategory(category: string): string { return category === 'CONTRACT_PLAYER_SALARY_DUE' ? 'PLAYER_SALARY' : category === 'STAFF_CONTRACT_EXPENSE_DUE' ? 'STAFF_SALARY' : category }
function recognizedForLine(world: GameWorld, budget: FinancialBudget, line: BudgetLine, asOf: GameDate): number { const values = line.direction === 'INCOME' ? Object.values(world.revenueRecognitionsById) : Object.values(world.expenseRecognitionsById); return values.filter((item) => item.organizationId === budget.organizationId && item.amount.currencyCode === budget.currencyCode && normalizeCategory(item.category) === line.category && within(item.recognizedOn, budget.period) && compareGameDates(item.recognizedOn, asOf) <= 0 && matchesDimensions(item, line)).reduce((sum, item) => sum + item.amount.minorUnits, 0) }
function committedForLine(world: GameWorld, budget: FinancialBudget, line: BudgetLine, asOf: GameDate): { total: number; future: number } { if (line.direction === 'INCOME') { const entries = getRevenueSchedule(world, { organizationId: budget.organizationId, from: budget.period.startsOn, to: budget.period.endsOn, currencyCode: budget.currencyCode }).filter((item) => item.category === line.category && (line.teamId === undefined || item.teamId === line.teamId) && (line.organizationSectionId === undefined || item.organizationSectionId === line.organizationSectionId)); return { total: entries.reduce((sum, item) => sum + item.amount.minorUnits, 0), future: entries.reduce((sum, item) => sum + (compareGameDates(item.recognitionOn, asOf) > 0 ? item.amount.minorUnits : 0), 0) } } const entries = knownCommitments(world, budget.organizationId, budget.period, asOf, budget.currencyCode).filter((item) => item.category === line.category && (line.teamId === undefined || item.teamId === line.teamId) && (line.organizationSectionId === undefined || item.organizationSectionId === line.organizationSectionId)); return { total: entries.reduce((sum, item) => sum + item.amount, 0), future: entries.reduce((sum, item) => sum + (item.future ? item.amount : 0), 0) } }
function knownCommitments(world: GameWorld, organizationId: string, period: FinancialPlanningPeriod, asOf: GameDate, currencyCode: CurrencyCode): readonly { category: string; amount: number; future: boolean; teamId?: string; organizationSectionId?: string }[] { const direct = getOutstandingCommitments(world, organizationId, asOf).filter((item) => item.remaining.currencyCode === currencyCode && item.commitment.dueOn >= period.startsOn && item.commitment.startsOn <= period.endsOn).map((item) => ({ category: normalizeCategory(item.commitment.category), amount: item.remaining.minorUnits, future: compareGameDates(item.commitment.dueOn, asOf) > 0, teamId: item.commitment.dimensions?.teamId, organizationSectionId: item.commitment.dimensions?.organizationSectionId })); const payroll = getContractFinancialSchedule(world, { organizationId, currencyCode, includeConditional: false }).filter((item) => item.compensationStatus === 'GUARANTEED' && item.period.startsOn <= period.endsOn && item.period.endsOn > period.startsOn).map((item) => ({ category: item.category, amount: item.amount.minorUnits, future: compareGameDates(item.effectiveOn, asOf) > 0, teamId: String(item.teamId), organizationSectionId: String(item.organizationSectionId) })); const directNonPayroll = direct.filter((item) => item.category !== 'PLAYER_SALARY' && item.category !== 'STAFF_SALARY'); const directPayroll = direct.filter((item) => item.category === 'PLAYER_SALARY' || item.category === 'STAFF_SALARY'); return Object.freeze([...directNonPayroll, ...(payroll.length > 0 ? payroll : directPayroll)]) }
function assumptionForLine(world: GameWorld, budget: FinancialBudget, line: BudgetLine, scenario: ForecastScenario): number { return Object.values(world.forecastAssumptionsById).filter((item) => item.organizationId === budget.organizationId && item.scenario === scenario && item.kind === line.direction && item.amount.currencyCode === budget.currencyCode && item.category === line.category && overlaps(item.period, budget.period)).reduce((sum, item) => sum + item.amount.minorUnits, 0) }
function nonEmpty(value: string, label: string): string { if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be non-empty`); return value }
