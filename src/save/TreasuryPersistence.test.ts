import { describe, expect, it } from 'vitest'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createFinancialAccount, createFinancialTransaction } from '@/domain/finance/FinancialLedger'
import { createPayable, createReceivable, settleReceivable } from '@/domain/finance/Treasury'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const organizationId = 'team-home'

function worldWithTreasury() {
  const accounts = [
    createFinancialAccount({ id: 'cash:eur', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'receivable:eur', organizationId, accountType: 'RECEIVABLE', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'equity:eur', organizationId, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-10-01' }),
  ]
  const opening = createFinancialTransaction({ id: 'tx:opening', organizationId, effectiveOn: '2032-10-01', transactionType: 'OPENING', amount: { currencyCode: 'EUR', minorUnits: 1_000_000 }, postings: [{ accountId: 'cash:eur', direction: 'DEBIT', amount: { currencyCode: 'EUR', minorUnits: 1_000_000 } }, { accountId: 'equity:eur', direction: 'CREDIT', amount: { currencyCode: 'EUR', minorUnits: 1_000_000 } }], provenance: { kind: 'TEST', id: 'opening' } })
  const receivable = createReceivable({ id: 'receivable:save', organizationId, amount: { currencyCode: 'EUR', minorUnits: 500_000 }, counterparty: { kind: 'EXTERNAL', label: 'Competition' }, recognizedOn: '2032-10-01', dueOn: '2032-10-15', provenance: { kind: 'COMPETITION_ENTITLEMENT', id: 'save-prize' } })
  const payable = createPayable({ id: 'payable:save', organizationId, amount: { currencyCode: 'EUR', minorUnits: 200_000 }, counterparty: { kind: 'EXTERNAL', label: 'Vendor' }, recognizedOn: '2032-10-01', dueOn: '2032-10-20', provenance: { kind: 'EXPENSE_COMMITMENT', id: 'save-expense' } })
  const base = createGameWorld({ ...createValidGameWorldInput(), financialAccounts: accounts, financialTransactions: [opening], receivables: [receivable], payables: [payable] })
  const collection = settleReceivable(base, receivable.id, { settlementId: 'settlement:save', transactionId: 'tx:collection:save', amount: { currencyCode: 'EUR', minorUnits: 100_000 }, settledOn: '2032-10-10', cashAccountId: 'cash:eur', offsetAccountId: 'receivable:eur' })
  return updateGameWorld(base, { financialTransactions: [...Object.values(base.financialTransactionsById), collection.transaction], treasuryApplications: [collection.settlement] })
}

describe('CF2 treasury persistence', () => {
  it('round-trips receivables, payables and settlement references without persisting cash projections', () => {
    const world = worldWithTreasury()
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, '2032-10-10T00:00:00.000Z'))
    expect(restored.receivablesById).toEqual(world.receivablesById)
    expect(restored.payablesById).toEqual(world.payablesById)
    expect(restored.treasuryApplicationsById).toEqual(world.treasuryApplicationsById)
    expect(restored).not.toHaveProperty('cashByCurrency')
  })

  it('loads old V4 payloads and CF1/legacy saves with empty treasury collections', () => {
    const world = worldWithTreasury()
    const current = serializeGameWorldV4(world, '2032-10-10T00:00:00.000Z')
    const { receivables: _receivables, payables: _payables, treasuryApplications: _applications, ...oldPayload } = current.payload
    const oldV4 = { ...current, payload: oldPayload }
    const restoredOldV4 = deserializeGameWorldV4(oldV4)
    expect(restoredOldV4.receivablesById).toEqual({})
    expect(restoredOldV4.payablesById).toEqual({})
    expect(restoredOldV4.treasuryApplicationsById).toEqual({})
  })
})
