import { addDays, compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { FinancialAccountId, OrganizationId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'
import { getAccountBalanceAsOfDate, getFinancialTransactionsBetween, type FinancialAccountBalance } from './FinancialQueries'
import { cashRestrictionForAccount, getPayableRemaining, getPayableStatus, getReceivableRemaining, getReceivableStatus, isCashAccount, type CashRestriction, type Payable, type Receivable, type TreasuryObligationStatus } from './Treasury'
import type { CurrencyCode, FinancialDimensions, FinancialSource, Money } from './FinancialLedger'

export interface CashAccountBalance extends FinancialAccountBalance {
  readonly organizationId: OrganizationId
  readonly accountType: string
  readonly restriction: CashRestriction
}

export interface CashBalanceByCurrency {
  readonly currencyCode: CurrencyCode
  readonly totalCashMinorUnits: number
  readonly unrestrictedCashMinorUnits: number
  readonly restrictedCashMinorUnits: number
  readonly accounts: readonly CashAccountBalance[]
}

export interface TreasuryObligationView<T> {
  readonly obligation: T
  readonly status: TreasuryObligationStatus
  readonly settledMinorUnits: number
  readonly remainingMinorUnits: number
}

export interface CashMovement {
  readonly transactionId: string
  readonly effectiveOn: GameDate
  readonly accountId: FinancialAccountId
  readonly direction: 'INFLOW' | 'OUTFLOW'
  readonly amount: Money
  readonly transactionType: string
  readonly provenance: FinancialSource
  readonly dimensions: FinancialDimensions | null
}

export interface CashFlowTotals {
  readonly currencyCode: CurrencyCode
  readonly inflowMinorUnits: number
  readonly outflowMinorUnits: number
  readonly netMinorUnits: number
}

export interface CashFlowProjectionRow {
  readonly currencyCode: CurrencyCode
  readonly openingCashMinorUnits: number
  readonly receivablesDueMinorUnits: number
  readonly payablesDueMinorUnits: number
  readonly netCommittedCashFlowMinorUnits: number
  readonly projectedClosingCashMinorUnits: number
  readonly minimumProjectedCashMinorUnits: number
}

export interface CashFlowProjection {
  readonly asOfDate: GameDate
  readonly throughDate: GameDate
  readonly byCurrency: readonly CashFlowProjectionRow[]
}

export interface LiquiditySnapshot {
  readonly asOfDate: GameDate
  readonly throughDate: GameDate
  readonly byCurrency: readonly {
    readonly currencyCode: CurrencyCode
    readonly cashNowMinorUnits: number
    readonly unrestrictedCashMinorUnits: number
    readonly restrictedCashMinorUnits: number
    readonly receivablesDueMinorUnits: number
    readonly payablesDueMinorUnits: number
    readonly projectedClosingCashMinorUnits: number
    readonly minimumProjectedCashMinorUnits: number
  }[]
}

export function getCashAccountBalances(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly CashAccountBalance[] {
  const organization = String(organizationId)
  return Object.values(world.financialAccountsById)
    .filter((account) => String(account.organizationId) === organization && isCashAccount(account))
    .map((account) => Object.freeze({ ...getAccountBalanceAsOfDate(world, account.id, asOfDate), organizationId: account.organizationId, accountType: account.accountType, restriction: cashRestrictionForAccount(account) }))
    .sort((left, right) => String(left.accountId).localeCompare(String(right.accountId)))
}

export function getCashBalancesByCurrency(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly CashBalanceByCurrency[] {
  const grouped = new Map<string, CashAccountBalance[]>()
  for (const account of getCashAccountBalances(world, organizationId, asOfDate)) {
    const key = String(account.currencyCode)
    const accounts = grouped.get(key) ?? []
    accounts.push(account)
    grouped.set(key, accounts)
  }
  return Object.freeze([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, accounts]) => Object.freeze({ currencyCode: currencyCode as CurrencyCode, totalCashMinorUnits: accounts.reduce((sum, account) => sum + account.balanceMinorUnits, 0), unrestrictedCashMinorUnits: accounts.filter((account) => account.restriction === 'UNRESTRICTED').reduce((sum, account) => sum + account.balanceMinorUnits, 0), restrictedCashMinorUnits: accounts.filter((account) => account.restriction === 'RESTRICTED').reduce((sum, account) => sum + account.balanceMinorUnits, 0), accounts: Object.freeze(accounts) })))
}

export function getOrganizationReceivables(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly TreasuryObligationView<Receivable>[] {
  return Object.values(world.receivablesById).filter((item) => String(item.organizationId) === String(organizationId)).map((obligation) => {
    const remaining = getReceivableRemaining(world, obligation.id, asOfDate)
    return Object.freeze({ obligation, status: getReceivableStatus(world, obligation.id, asOfDate), settledMinorUnits: obligation.amount.minorUnits - remaining.minorUnits, remainingMinorUnits: remaining.minorUnits })
  }).sort((left, right) => compareGameDates(left.obligation.dueOn, right.obligation.dueOn) || String(left.obligation.id).localeCompare(String(right.obligation.id)))
}

export function getOrganizationPayables(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly TreasuryObligationView<Payable>[] {
  return Object.values(world.payablesById).filter((item) => String(item.organizationId) === String(organizationId)).map((obligation) => {
    const remaining = getPayableRemaining(world, obligation.id, asOfDate)
    return Object.freeze({ obligation, status: getPayableStatus(world, obligation.id, asOfDate), settledMinorUnits: obligation.amount.minorUnits - remaining.minorUnits, remainingMinorUnits: remaining.minorUnits })
  }).sort((left, right) => compareGameDates(left.obligation.dueOn, right.obligation.dueOn) || String(left.obligation.id).localeCompare(String(right.obligation.id)))
}

export function getOpenReceivables(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly TreasuryObligationView<Receivable>[] {
  return getOrganizationReceivables(world, organizationId, asOfDate).filter((item) => item.status === 'OPEN' || item.status === 'PARTIALLY_SETTLED')
}

export function getOpenPayables(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly TreasuryObligationView<Payable>[] {
  return getOrganizationPayables(world, organizationId, asOfDate).filter((item) => item.status === 'OPEN' || item.status === 'PARTIALLY_SETTLED')
}

export function getDueReceivables(world: GameWorld, organizationId: OrganizationId | string, throughDate: GameDate | string, asOfDate: GameDate | string = world.currentDate): readonly TreasuryObligationView<Receivable>[] {
  const through = parseGameDate(throughDate)
  return getOpenReceivables(world, organizationId, asOfDate).filter((item) => compareGameDates(item.obligation.dueOn, through) <= 0)
}

export function getDuePayables(world: GameWorld, organizationId: OrganizationId | string, throughDate: GameDate | string, asOfDate: GameDate | string = world.currentDate): readonly TreasuryObligationView<Payable>[] {
  const through = parseGameDate(throughDate)
  return getOpenPayables(world, organizationId, asOfDate).filter((item) => compareGameDates(item.obligation.dueOn, through) <= 0)
}

export function getCashMovementsBetween(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly CashMovement[] {
  const movements: CashMovement[] = []
  for (const transaction of getFinancialTransactionsBetween(world, from, to).filter((item) => String(item.organizationId) === String(organizationId))) {
    for (const posting of transaction.postings) {
      const account = world.financialAccountsById[posting.accountId]
      if (account === undefined || !isCashAccount(account)) continue
      movements.push(Object.freeze({ transactionId: String(transaction.id), effectiveOn: transaction.effectiveOn, accountId: account.id, direction: posting.direction === 'DEBIT' ? 'INFLOW' : 'OUTFLOW', amount: posting.amount, transactionType: transaction.transactionType, provenance: transaction.provenance, dimensions: transaction.dimensions }))
    }
  }
  return Object.freeze(movements.sort((left, right) => compareGameDates(left.effectiveOn, right.effectiveOn) || left.transactionId.localeCompare(right.transactionId) || String(left.accountId).localeCompare(String(right.accountId))))
}

export function getCashInflowsBetween(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly CashMovement[] {
  return getCashMovementsBetween(world, organizationId, from, to).filter((movement) => movement.direction === 'INFLOW')
}

export function getCashOutflowsBetween(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly CashMovement[] {
  return getCashMovementsBetween(world, organizationId, from, to).filter((movement) => movement.direction === 'OUTFLOW')
}

export function getCashFlowTotalsBetween(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly CashFlowTotals[] {
  const grouped = new Map<string, { inflow: number; outflow: number }>()
  for (const movement of getCashMovementsBetween(world, organizationId, from, to)) {
    const totals = grouped.get(String(movement.amount.currencyCode)) ?? { inflow: 0, outflow: 0 }
    if (movement.direction === 'INFLOW') totals.inflow += movement.amount.minorUnits
    else totals.outflow += movement.amount.minorUnits
    grouped.set(String(movement.amount.currencyCode), totals)
  }
  return Object.freeze([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, totals]) => Object.freeze({ currencyCode: currencyCode as CurrencyCode, inflowMinorUnits: totals.inflow, outflowMinorUnits: totals.outflow, netMinorUnits: totals.inflow - totals.outflow })))
}

export function getOpeningCash(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string): readonly CashBalanceByCurrency[] {
  return getCashBalancesByCurrency(world, organizationId, addDays(parseGameDate(from), -1))
}

export function getClosingCash(world: GameWorld, organizationId: OrganizationId | string, to: GameDate | string): readonly CashBalanceByCurrency[] {
  return getCashBalancesByCurrency(world, organizationId, to)
}

export function getCashFlowProjection(world: GameWorld, organizationId: OrganizationId | string, options: { readonly asOfDate?: GameDate | string; readonly throughDate?: GameDate | string; readonly horizonDays?: number } = {}): CashFlowProjection {
  const asOfDate = parseGameDate(options.asOfDate ?? world.currentDate)
  const throughDate = options.throughDate === undefined ? addDays(asOfDate, options.horizonDays ?? 30) : parseGameDate(options.throughDate)
  if (compareGameDates(throughDate, asOfDate) < 0) throw new RangeError('Cash-flow projection throughDate cannot precede asOfDate')
  const opening = getCashBalancesByCurrency(world, organizationId, asOfDate)
  const receivables = getDueReceivables(world, organizationId, throughDate, asOfDate)
  const payables = getDuePayables(world, organizationId, throughDate, asOfDate)
  const currencies = new Set<string>(opening.map((row) => String(row.currencyCode)))
  for (const item of receivables) currencies.add(String(item.obligation.amount.currencyCode))
  for (const item of payables) currencies.add(String(item.obligation.amount.currencyCode))
  const byCurrency = [...currencies].sort().map((currencyCode) => {
    const cash = opening.find((row) => String(row.currencyCode) === currencyCode)?.totalCashMinorUnits ?? 0
    const receivablesDue = receivables.filter((item) => String(item.obligation.amount.currencyCode) === currencyCode).reduce((sum, item) => sum + item.remainingMinorUnits, 0)
    const payablesDue = payables.filter((item) => String(item.obligation.amount.currencyCode) === currencyCode).reduce((sum, item) => sum + item.remainingMinorUnits, 0)
    const events = [...receivables.filter((item) => String(item.obligation.amount.currencyCode) === currencyCode).map((item) => ({ date: item.obligation.dueOn, amount: item.remainingMinorUnits })), ...payables.filter((item) => String(item.obligation.amount.currencyCode) === currencyCode).map((item) => ({ date: item.obligation.dueOn, amount: -item.remainingMinorUnits }))].sort((left, right) => compareGameDates(left.date, right.date))
    let minimum = cash
    let running = cash
    for (const event of events) { running += event.amount; minimum = Math.min(minimum, running) }
    return Object.freeze({ currencyCode: currencyCode as CurrencyCode, openingCashMinorUnits: cash, receivablesDueMinorUnits: receivablesDue, payablesDueMinorUnits: payablesDue, netCommittedCashFlowMinorUnits: receivablesDue - payablesDue, projectedClosingCashMinorUnits: cash + receivablesDue - payablesDue, minimumProjectedCashMinorUnits: minimum })
  })
  return Object.freeze({ asOfDate, throughDate, byCurrency: Object.freeze(byCurrency) })
}

export function getLiquiditySnapshot(world: GameWorld, organizationId: OrganizationId | string, options: { readonly asOfDate?: GameDate | string; readonly throughDate?: GameDate | string; readonly horizonDays?: number } = {}): LiquiditySnapshot {
  const projection = getCashFlowProjection(world, organizationId, options)
  const cash = getCashBalancesByCurrency(world, organizationId, projection.asOfDate)
  return Object.freeze({ asOfDate: projection.asOfDate, throughDate: projection.throughDate, byCurrency: Object.freeze(projection.byCurrency.map((row) => { const current = cash.find((item) => item.currencyCode === row.currencyCode); return Object.freeze({ currencyCode: row.currencyCode, cashNowMinorUnits: row.openingCashMinorUnits, unrestrictedCashMinorUnits: current?.unrestrictedCashMinorUnits ?? 0, restrictedCashMinorUnits: current?.restrictedCashMinorUnits ?? 0, receivablesDueMinorUnits: row.receivablesDueMinorUnits, payablesDueMinorUnits: row.payablesDueMinorUnits, projectedClosingCashMinorUnits: row.projectedClosingCashMinorUnits, minimumProjectedCashMinorUnits: row.minimumProjectedCashMinorUnits }) })) })
}
