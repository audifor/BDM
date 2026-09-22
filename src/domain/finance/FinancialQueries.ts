import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { FinancialAccountId, OrganizationId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'
import type { CurrencyCode, FinancialDimensions, FinancialDimensionsInput, FinancialTransaction, Money } from './FinancialLedger'

export interface FinancialAccountBalance {
  readonly accountId: FinancialAccountId
  readonly currencyCode: CurrencyCode
  readonly debitMinorUnits: number
  readonly creditMinorUnits: number
  /** Debit minus credit; liability/equity/revenue accounts therefore report a negative normal balance. */
  readonly balanceMinorUnits: number
}

export interface TrialBalanceRow extends FinancialAccountBalance {
  readonly organizationId: OrganizationId
}

export function getFinancialTransactionsAsOfDate(world: GameWorld, asOfDate: GameDate | string = world.currentDate): readonly FinancialTransaction[] {
  const date = parseGameDate(asOfDate)
  return sortTransactions(Object.values(world.financialTransactionsById).filter((transaction) => compareGameDates(transaction.effectiveOn, date) <= 0))
}

export function getFinancialTransactionsBetween(world: GameWorld, from: GameDate | string, to: GameDate | string): readonly FinancialTransaction[] {
  const fromDate = parseGameDate(from)
  const toDate = parseGameDate(to)
  if (compareGameDates(toDate, fromDate) < 0) throw new RangeError('Financial transaction range to cannot precede from')
  return sortTransactions(Object.values(world.financialTransactionsById).filter((transaction) => compareGameDates(transaction.effectiveOn, fromDate) >= 0 && compareGameDates(transaction.effectiveOn, toDate) <= 0))
}

export function getOrganizationFinancialTransactions(world: GameWorld, organizationId: OrganizationId | string, from?: GameDate | string, to?: GameDate | string): readonly FinancialTransaction[] {
  const transactions = from === undefined || to === undefined
    ? Object.values(world.financialTransactionsById)
    : getFinancialTransactionsBetween(world, from, to)
  return sortTransactions(transactions.filter((transaction) => transaction.organizationId === organizationId))
}

export function getFinancialTransactionsByAccount(world: GameWorld, accountId: FinancialAccountId | string, asOfDate?: GameDate | string): readonly FinancialTransaction[] {
  const transactions = asOfDate === undefined ? Object.values(world.financialTransactionsById) : getFinancialTransactionsAsOfDate(world, asOfDate)
  return sortTransactions(transactions.filter((transaction) => transaction.postings.some((posting) => posting.accountId === accountId)))
}

export function getFinancialTransactionsBySource(world: GameWorld, source: { readonly kind: string; readonly id?: string }, asOfDate?: GameDate | string): readonly FinancialTransaction[] {
  const transactions = asOfDate === undefined ? Object.values(world.financialTransactionsById) : getFinancialTransactionsAsOfDate(world, asOfDate)
  return sortTransactions(transactions.filter((transaction) => transaction.provenance.kind === source.kind && (source.id === undefined || transaction.provenance.id === source.id)))
}

export function getFinancialTransactionsByDimensions(world: GameWorld, dimensions: FinancialDimensionsInput, asOfDate?: GameDate | string): readonly FinancialTransaction[] {
  const transactions = asOfDate === undefined ? Object.values(world.financialTransactionsById) : getFinancialTransactionsAsOfDate(world, asOfDate)
  return sortTransactions(transactions.filter((transaction) => matchesDimensions(transaction.dimensions, dimensions)))
}

export function getAccountBalanceAsOfDate(world: GameWorld, accountId: FinancialAccountId | string, asOfDate: GameDate | string = world.currentDate): FinancialAccountBalance {
  const account = world.financialAccountsById[accountId as FinancialAccountId]
  if (account === undefined) throw new Error(`Unknown financial account ${accountId}`)
  let debitMinorUnits = 0
  let creditMinorUnits = 0
  for (const transaction of getFinancialTransactionsAsOfDate(world, asOfDate)) {
    for (const posting of transaction.postings.filter((item) => item.accountId === accountId)) {
      if (posting.direction === 'DEBIT') debitMinorUnits += posting.amount.minorUnits
      else creditMinorUnits += posting.amount.minorUnits
    }
  }
  return Object.freeze({ accountId: account.id, currencyCode: account.currencyCode, debitMinorUnits, creditMinorUnits, balanceMinorUnits: debitMinorUnits - creditMinorUnits })
}

export const getAccountBalance = getAccountBalanceAsOfDate

export function getTrialBalanceAsOfDate(world: GameWorld, asOfDate: GameDate | string = world.currentDate): readonly TrialBalanceRow[] {
  return Object.values(world.financialAccountsById)
    .map((account) => ({ ...getAccountBalanceAsOfDate(world, account.id, asOfDate), organizationId: account.organizationId }))
    .sort((left, right) => String(left.accountId).localeCompare(String(right.accountId)))
}

export function moneyFromBalance(balance: FinancialAccountBalance): Money {
  if (balance.balanceMinorUnits < 0) throw new RangeError('A signed credit balance cannot be represented as non-negative Money')
  return Object.freeze({ currencyCode: balance.currencyCode, minorUnits: balance.balanceMinorUnits })
}

function matchesDimensions(actual: FinancialDimensions | null, expected: FinancialDimensionsInput): boolean {
  if (actual === null) return false
  return (expected.teamId === undefined || actual.teamId === expected.teamId)
    && (expected.organizationSectionId === undefined || actual.organizationSectionId === expected.organizationSectionId)
    && (expected.competitionId === undefined || actual.competitionId === expected.competitionId)
    && (expected.contractId === undefined || actual.contractId === expected.contractId)
    && (expected.reference === undefined || (actual.reference?.kind === expected.reference.kind && actual.reference.id === expected.reference.id))
}

function sortTransactions(transactions: readonly FinancialTransaction[]): readonly FinancialTransaction[] {
  return Object.freeze([...transactions].sort((left, right) => compareGameDates(left.effectiveOn, right.effectiveOn) || String(left.id).localeCompare(String(right.id))))
}
