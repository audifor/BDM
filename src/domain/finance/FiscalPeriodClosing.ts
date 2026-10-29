import type { FiscalPeriodId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createFinancialTransaction, createFiscalPeriod, createMoney, type FinancialPosting } from './FinancialLedger'
import { organizationFinanceAccountId } from './FinanceFoundation'

/** Close only recorded results. No accrual, tax, distribution, funding or payment policy is inferred. */
export function closeFiscalPeriod(world: GameWorld, periodId: FiscalPeriodId): GameWorld {
  const period = world.fiscalPeriodsById[periodId]
  if (period === undefined) throw new RangeError(`Unknown fiscal period: ${periodId}`)
  if (period.status === 'CLOSED') return world
  if (world.currentDate <= period.endsOn) throw new RangeError('The fiscal period must have ended before closing')
  const balances = new Map<string, number>()
  for (const transaction of Object.values(world.financialTransactionsById)) {
    if (transaction.organizationId !== period.organizationId || transaction.effectiveOn < period.startsOn || transaction.effectiveOn > period.endsOn) continue
    for (const posting of transaction.postings) {
      const account = world.financialAccountsById[posting.accountId]!
      if (account.accountType !== 'REVENUE' && account.accountType !== 'EXPENSE') continue
      const balance = (balances.get(account.id) ?? 0) + (posting.direction === 'DEBIT' ? posting.amount.minorUnits : -posting.amount.minorUnits)
      if (!Number.isSafeInteger(balance)) throw new RangeError('Fiscal closing exceeds safe integer range')
      balances.set(account.id, balance)
    }
  }
  const byCurrency = new Map<string, FinancialPosting[]>()
  for (const [accountId, balance] of [...balances].sort(([a], [b]) => a.localeCompare(b))) {
    if (balance === 0) continue
    const account = world.financialAccountsById[accountId as keyof typeof world.financialAccountsById]!
    const postings = byCurrency.get(account.currencyCode) ?? []
    postings.push({ accountId: account.id, direction: balance > 0 ? 'CREDIT' : 'DEBIT', amount: createMoney({ currencyCode: account.currencyCode, minorUnits: Math.abs(balance) }) })
    byCurrency.set(account.currencyCode, postings)
  }
  const transactions = [...byCurrency].sort(([a], [b]) => a.localeCompare(b)).map(([currencyCode, postings]) => {
    const imbalance = postings.reduce((sum, posting) => sum + (posting.direction === 'DEBIT' ? posting.amount.minorUnits : -posting.amount.minorUnits), 0)
    if (imbalance !== 0) {
      const equityId = organizationFinanceAccountId(period.organizationId, currencyCode, 'EQUITY_CONTROL')
      if (world.financialAccountsById[equityId]?.accountType !== 'EQUITY') throw new RangeError(`Closing requires the canonical equity account: ${equityId}`)
      postings.push({ accountId: equityId, direction: imbalance > 0 ? 'CREDIT' : 'DEBIT', amount: createMoney({ currencyCode, minorUnits: Math.abs(imbalance) }) })
    }
    return createFinancialTransaction({
      id: `finance:closing:${period.id}:${currencyCode}`, organizationId: period.organizationId,
      effectiveOn: period.endsOn, transactionType: 'FISCAL_PERIOD_CLOSING',
      amount: { currencyCode, minorUnits: postings.filter(p => p.direction === 'DEBIT').reduce((sum, p) => sum + p.amount.minorUnits, 0) },
      postings, provenance: { kind: 'FISCAL_PERIOD', id: period.id }, description: `Close recorded result: ${period.label}`,
    })
  })
  return updateGameWorld(world, {
    fiscalPeriods: Object.values(world.fiscalPeriodsById).map(p => p.id === period.id ? createFiscalPeriod({ ...p, status: 'CLOSED' }) : p),
    ...(transactions.length === 0 ? {} : { financialTransactions: [...Object.values(world.financialTransactionsById), ...transactions] }),
  })
}
