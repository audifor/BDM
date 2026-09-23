import { describe, expect, it } from 'vitest'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld } from '@/domain/world'
import { createFinancialAccount } from '@/domain/finance/FinancialLedger'
import { createExpenseRecognitionFromCommitment, createFinancialCommitment, createFinancialEntitlement, createRevenueRecognitionFromEntitlement } from '@/domain/finance/Recognition'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const organizationId = 'team-home'

function worldWithRecognition() {
  const accounts = [
    createFinancialAccount({ id: 'cash:eur', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-10-01' }),
    createFinancialAccount({ id: 'equity:eur', organizationId, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-10-01' }),
  ]
  const entitlement = createFinancialEntitlement({ id: 'entitlement:save', organizationId, amount: { currencyCode: 'EUR', minorUnits: 500_000 }, availableOn: '2032-10-01', dueOn: '2032-10-31', category: 'COMPETITION_PRIZE', provenance: { kind: 'COMPETITION_AUTHORIZED_EVENT', id: 'save-entitlement' }, counterparty: { kind: 'EXTERNAL', label: 'League' }, dimensions: { competitionId: 'competition-a' } })
  const commitment = createFinancialCommitment({ id: 'commitment:save', organizationId, amount: { currencyCode: 'EUR', minorUnits: 100_000 }, startsOn: '2032-10-01', dueOn: '2032-10-20', category: 'OPERATING', provenance: { kind: 'OPERATING_AUTHORIZED_EVENT', id: 'save-commitment' }, counterparty: { kind: 'EXTERNAL', label: 'Vendor' }, dimensions: { teamId: 'team-home' } })
  return createGameWorld({ ...createValidGameWorldInput(), financialAccounts: accounts, financialEntitlements: [entitlement], financialCommitments: [commitment], revenueRecognitions: [createRevenueRecognitionFromEntitlement(entitlement, { id: 'revenue:save', amount: entitlement.amount, recognizedOn: '2032-10-01', category: entitlement.category, provenance: { kind: 'COMPETITION_AUTHORIZED_EVENT', id: 'save-revenue' } })], expenseRecognitions: [createExpenseRecognitionFromCommitment(commitment, { id: 'expense:save', amount: { currencyCode: 'EUR', minorUnits: 25_000 }, recognizedOn: '2032-10-01', category: commitment.category, provenance: { kind: 'OPERATING_AUTHORIZED_EVENT', id: 'save-expense' } })] })
}

describe('CF3 recognition persistence', () => {
  it('round-trips recognitions, commitments and entitlements through Save V4', () => {
    const world = worldWithRecognition()
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, '2032-10-01T00:00:00.000Z'))
    expect(restored.revenueRecognitionsById).toEqual(world.revenueRecognitionsById)
    expect(restored.expenseRecognitionsById).toEqual(world.expenseRecognitionsById)
    expect(restored.financialCommitmentsById).toEqual(world.financialCommitmentsById)
    expect(restored.financialEntitlementsById).toEqual(world.financialEntitlementsById)
  })

  it('loads CF1/CF2-era V4 payloads with empty CF3 collections', () => {
    const current = serializeGameWorldV4(worldWithRecognition(), '2032-10-01T00:00:00.000Z')
    const { revenueRecognitions: _revenue, expenseRecognitions: _expense, financialCommitments: _commitments, financialEntitlements: _entitlements, ...oldPayload } = current.payload
    const restored = deserializeGameWorldV4({ ...current, payload: oldPayload })
    expect(restored.revenueRecognitionsById).toEqual({})
    expect(restored.expenseRecognitionsById).toEqual({})
    expect(restored.financialCommitmentsById).toEqual({})
    expect(restored.financialEntitlementsById).toEqual({})
  })
})
