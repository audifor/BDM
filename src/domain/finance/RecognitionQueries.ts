import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { OrganizationId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'
import { getPayableRemaining, getReceivableRemaining } from './Treasury'
import type { CurrencyCode, FinancialDimensions, Money } from './FinancialLedger'
import type { ExpenseRecognition, FinancialCommitment, FinancialEntitlement, RevenueRecognition } from './Recognition'

export interface RecognitionTotal {
  readonly currencyCode: CurrencyCode
  readonly minorUnits: number
}

export interface OperatingResult {
  readonly currencyCode: CurrencyCode
  readonly revenueMinorUnits: number
  readonly expenseMinorUnits: number
  readonly netMinorUnits: number
}

export interface RecognitionBreakdown {
  readonly key: string
  readonly currencyCode: CurrencyCode
  readonly minorUnits: number
}

export interface CommitmentOutstanding {
  readonly commitment: FinancialCommitment
  readonly recognized: Money
  readonly remaining: Money
}

export interface EntitlementOutstanding {
  readonly entitlement: FinancialEntitlement
  readonly recognized: Money
  readonly remaining: Money
}

export function getRevenueRecognitionsAsOfDate(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RevenueRecognition[] {
  const date = parseGameDate(asOfDate)
  return Object.freeze(Object.values(world.revenueRecognitionsById).filter((item) => item.organizationId === organizationId && compareGameDates(item.recognizedOn, date) <= 0).sort(sortRecognitions))
}

export function getExpenseRecognitionsAsOfDate(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly ExpenseRecognition[] {
  const date = parseGameDate(asOfDate)
  return Object.freeze(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && compareGameDates(item.recognizedOn, date) <= 0).sort(sortRecognitions))
}

export function getRecognizedRevenue(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RecognitionTotal[] {
  return totals(getRevenueRecognitionsAsOfDate(world, organizationId, asOfDate))
}

export function getRecognizedExpense(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RecognitionTotal[] {
  return totals(getExpenseRecognitionsAsOfDate(world, organizationId, asOfDate))
}

export function getNetOperatingResult(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly OperatingResult[] {
  const revenue = new Map(getRecognizedRevenue(world, organizationId, asOfDate).map((item) => [item.currencyCode, item.minorUnits]))
  const expense = new Map(getRecognizedExpense(world, organizationId, asOfDate).map((item) => [item.currencyCode, item.minorUnits]))
  return Object.freeze([...new Set([...revenue.keys(), ...expense.keys()])].sort().map((currencyCode) => ({ currencyCode, revenueMinorUnits: revenue.get(currencyCode) ?? 0, expenseMinorUnits: expense.get(currencyCode) ?? 0, netMinorUnits: (revenue.get(currencyCode) ?? 0) - (expense.get(currencyCode) ?? 0) })))
}

export function getRevenueRecognitionsBetween(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly RevenueRecognition[] {
  return between(getRevenueRecognitionsAsOfDate(world, organizationId, to), from, to)
}

export function getExpenseRecognitionsBetween(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly ExpenseRecognition[] {
  return between(getExpenseRecognitionsAsOfDate(world, organizationId, to), from, to)
}

export function getRevenueByCategory(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RecognitionBreakdown[] {
  return breakdown(getRevenueRecognitionsAsOfDate(world, organizationId, asOfDate), (item) => item.category)
}

export function getExpenseByCategory(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RecognitionBreakdown[] {
  return breakdown(getExpenseRecognitionsAsOfDate(world, organizationId, asOfDate), (item) => item.category)
}

export function getRevenueBySource(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RecognitionBreakdown[] {
  return breakdown(getRevenueRecognitionsAsOfDate(world, organizationId, asOfDate), (item) => item.provenance.kind)
}

export function getExpenseBySource(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RecognitionBreakdown[] {
  return breakdown(getExpenseRecognitionsAsOfDate(world, organizationId, asOfDate), (item) => item.provenance.kind)
}

export function getRevenueByTeam(world: GameWorld, organizationId: OrganizationId | string, teamId: string, asOfDate: GameDate | string = world.currentDate): readonly RecognitionTotal[] {
  return totals(getRevenueRecognitionsAsOfDate(world, organizationId, asOfDate).filter((item) => item.dimensions?.teamId === teamId))
}

export function getExpenseByTeam(world: GameWorld, organizationId: OrganizationId | string, teamId: string, asOfDate: GameDate | string = world.currentDate): readonly RecognitionTotal[] {
  return totals(getExpenseRecognitionsAsOfDate(world, organizationId, asOfDate).filter((item) => item.dimensions?.teamId === teamId))
}

export function getRevenueBySection(world: GameWorld, organizationId: OrganizationId | string, sectionId: string, asOfDate: GameDate | string = world.currentDate): readonly RecognitionTotal[] {
  return totals(getRevenueRecognitionsAsOfDate(world, organizationId, asOfDate).filter((item) => item.dimensions?.organizationSectionId === sectionId))
}

export function getExpenseBySection(world: GameWorld, organizationId: OrganizationId | string, sectionId: string, asOfDate: GameDate | string = world.currentDate): readonly RecognitionTotal[] {
  return totals(getExpenseRecognitionsAsOfDate(world, organizationId, asOfDate).filter((item) => item.dimensions?.organizationSectionId === sectionId))
}

export function getOutstandingCommitments(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly CommitmentOutstanding[] {
  const date = parseGameDate(asOfDate)
  return Object.values(world.financialCommitmentsById).filter((commitment) => commitment.organizationId === organizationId && (commitment.cancelledOn === null || compareGameDates(commitment.cancelledOn, date) > 0)).map((commitment) => {
    const recognized = totals(Object.values(world.expenseRecognitionsById).filter((item) => item.commitmentId === commitment.id && compareGameDates(item.recognizedOn, date) <= 0)).find((item) => item.currencyCode === commitment.amount.currencyCode)?.minorUnits ?? 0
    return { commitment, recognized: money(commitment.amount.currencyCode, recognized), remaining: money(commitment.amount.currencyCode, commitment.amount.minorUnits - recognized) }
  }).filter((item) => item.remaining.minorUnits > 0).sort((left, right) => String(left.commitment.id).localeCompare(String(right.commitment.id)))
}

export function getOutstandingEntitlements(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly EntitlementOutstanding[] {
  const date = parseGameDate(asOfDate)
  return Object.values(world.financialEntitlementsById).filter((entitlement) => entitlement.organizationId === organizationId && (entitlement.cancelledOn === null || compareGameDates(entitlement.cancelledOn, date) > 0)).map((entitlement) => {
    const recognized = totals(Object.values(world.revenueRecognitionsById).filter((item) => item.entitlementId === entitlement.id && compareGameDates(item.recognizedOn, date) <= 0)).find((item) => item.currencyCode === entitlement.amount.currencyCode)?.minorUnits ?? 0
    return { entitlement, recognized: money(entitlement.amount.currencyCode, recognized), remaining: money(entitlement.amount.currencyCode, entitlement.amount.minorUnits - recognized) }
  }).filter((item) => item.remaining.minorUnits > 0).sort((left, right) => String(left.entitlement.id).localeCompare(String(right.entitlement.id)))
}

export function getRecognizedButUncollectedRevenue(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RevenueRecognition[] {
  return getRevenueRecognitionsAsOfDate(world, organizationId, asOfDate).filter((item) => item.receivableId !== null && getReceivableRemaining(world, item.receivableId, asOfDate).minorUnits > 0)
}

export function getRecognizedButUnpaidExpense(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly ExpenseRecognition[] {
  return getExpenseRecognitionsAsOfDate(world, organizationId, asOfDate).filter((item) => item.payableId !== null && getPayableRemaining(world, item.payableId, asOfDate).minorUnits > 0)
}

function between<T extends { readonly recognizedOn: GameDate }>(items: readonly T[], from: GameDate | string, to: GameDate | string): readonly T[] {
  const fromDate = parseGameDate(from)
  const toDate = parseGameDate(to)
  if (compareGameDates(toDate, fromDate) < 0) throw new RangeError('Recognition range to cannot precede from')
  return Object.freeze(items.filter((item) => compareGameDates(item.recognizedOn, fromDate) >= 0))
}

function totals(items: readonly { readonly amount: Money }[]): readonly RecognitionTotal[] {
  const totals = new Map<CurrencyCode, number>()
  for (const item of items) totals.set(item.amount.currencyCode, (totals.get(item.amount.currencyCode) ?? 0) + item.amount.minorUnits)
  return Object.freeze([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, minorUnits]) => ({ currencyCode, minorUnits })))
}

function breakdown(items: readonly { readonly amount: Money; readonly category: string; readonly provenance: { readonly kind: string }; readonly dimensions: FinancialDimensions | null }[], keyFor: (item: { readonly category: string; readonly provenance: { readonly kind: string }; readonly dimensions: FinancialDimensions | null }) => string): readonly RecognitionBreakdown[] {
  const totals = new Map<string, number>()
  for (const item of items) {
    const key = keyFor(item)
    const mapKey = `${key}\u0000${item.amount.currencyCode}`
    totals.set(mapKey, (totals.get(mapKey) ?? 0) + item.amount.minorUnits)
  }
  return Object.freeze([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([mapKey, minorUnits]) => {
    const [key, currencyCode] = mapKey.split('\u0000')
    return { key, currencyCode: currencyCode as CurrencyCode, minorUnits }
  }))
}

function money(currencyCode: CurrencyCode, minorUnits: number): Money {
  return Object.freeze({ currencyCode, minorUnits })
}

function sortRecognitions(left: { readonly recognizedOn: GameDate; readonly id: string }, right: { readonly recognizedOn: GameDate; readonly id: string }): number {
  return compareGameDates(left.recognizedOn, right.recognizedOn) || left.id.localeCompare(right.id)
}
