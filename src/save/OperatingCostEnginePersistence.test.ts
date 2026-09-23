import { describe, expect, it } from 'vitest'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld } from '@/domain/world'
import { createFinancialAccount } from '@/domain/finance/FinancialLedger'
import { createAuthorizedOperatingCostFact, createOperatingCostSource } from '@/domain/finance/OperatingCostEngine'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

function worldWithOperatingCosts() {
  const input = createValidGameWorldInput()
  const accounts = [
    createFinancialAccount({ id: 'cash:eur', organizationId: 'team-home', accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-01-01' }),
    createFinancialAccount({ id: 'payable:eur', organizationId: 'team-home', accountType: 'PAYABLE', currencyCode: 'EUR', openedOn: '2032-01-01' }),
    createFinancialAccount({ id: 'expense:eur', organizationId: 'team-home', accountType: 'EXPENSE', currencyCode: 'EUR', openedOn: '2032-01-01' }),
  ]
  const source = createOperatingCostSource({ id: 'facility:save', organizationId: 'team-home', category: 'FACILITY', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 600_000 }, startsOn: '2032-10-01', endsOn: '2033-09-30', sourceAuthority: 'FACILITY', generationPolicy: 'ANNUAL', dueDatePolicy: 'ON_RECOGNITION', facilityId: 'arena-1', provenance: { kind: 'CF8_TEST', id: 'save-source' } })
  const fact = createAuthorizedOperatingCostFact({ id: 'travel:save', authority: 'TRAVEL', sourceEntityId: 'trip-save', organizationId: 'team-home', category: 'TRAVEL', amount: { currencyCode: 'EUR', minorUnits: 25_000 }, incurredOn: '2032-10-02', dueOn: '2032-10-02', provenance: { kind: 'CF8_TEST', id: 'save-fact' } })
  return createGameWorld({ ...input, financialAccounts: accounts, operatingCostSources: [source], operatingCostFacts: [fact] })
}

describe('CF8 Save V4 persistence', () => {
  it('round-trips operating cost sources and authorized facts', () => {
    const restored = deserializeGameWorldV4(serializeGameWorldV4(worldWithOperatingCosts(), '2032-10-01T00:00:00.000Z'))
    expect(Object.values(restored.operatingCostSourcesById)).toHaveLength(1)
    expect(Object.values(restored.operatingCostSourcesById)[0]).toMatchObject({ id: 'facility:save', category: 'FACILITY', amount: { currencyCode: 'EUR', minorUnits: 600_000 } })
    expect(Object.values(restored.operatingCostFactsById)).toHaveLength(1)
    expect(Object.values(restored.operatingCostFactsById)[0]).toMatchObject({ id: 'travel:save', category: 'TRAVEL', amount: { currencyCode: 'EUR', minorUnits: 25_000 } })
  })

  it('accepts old V4 payloads with empty optional finance collections', () => {
    const saved = serializeGameWorldV4(worldWithOperatingCosts(), '2032-10-01T00:00:00.000Z')
    const payload = { ...saved.payload } as Record<string, unknown>
    delete payload.operatingCostSources
    delete payload.operatingCostFacts
    const restored = deserializeGameWorldV4({ ...saved, payload })
    expect(Object.keys(restored.operatingCostSourcesById)).toHaveLength(0)
    expect(Object.keys(restored.operatingCostFactsById)).toHaveLength(0)
  })
})
