import { createFinancialAccount, type FinancialAccount } from './FinancialLedger'
import type { OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/** Canonical Finance chart entries for an Organization's accrual expense category. */
export function ensureExpenseAccountMapping(world: GameWorld, organizationId: OrganizationId, currencyCode: string, category: string): { readonly world: GameWorld; readonly payableAccount: FinancialAccount; readonly expenseAccount: FinancialAccount } {
  const payableId = `finance:payable:${organizationId}:${currencyCode}`
  const expenseId = `finance:expense:${organizationId}:${currencyCode}:${category}`
  const payableAccount = world.financialAccountsById[payableId as never] ?? createFinancialAccount({ id: payableId, organizationId, currencyCode, accountType: 'PAYABLE', openedOn: world.currentDate })
  const expenseAccount = world.financialAccountsById[expenseId as never] ?? createFinancialAccount({ id: expenseId, organizationId, currencyCode, accountType: 'EXPENSE', openedOn: world.currentDate })
  if (payableAccount.organizationId !== organizationId || payableAccount.currencyCode !== currencyCode || payableAccount.accountType !== 'PAYABLE' || expenseAccount.organizationId !== organizationId || expenseAccount.currencyCode !== currencyCode || expenseAccount.accountType !== 'EXPENSE') throw new TypeError('Finance expense account mapping conflicts with existing accounts')
  const additions = [payableAccount, expenseAccount].filter((account) => world.financialAccountsById[account.id] === undefined)
  return { world: additions.length === 0 ? world : updateGameWorld(world, { financialAccounts: [...Object.values(world.financialAccountsById), ...additions] }), payableAccount, expenseAccount }
}
