import { describe, expect, it } from 'vitest'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld } from '@/domain/world'
import { createRevenueSource } from '@/domain/finance'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

describe('CF7 revenue persistence', () => {
  it('round-trips RevenueSource and accepts older V4 saves without the optional collection', () => {
    const input = createValidGameWorldInput()
    const organizationId = input.teams![0]!.organizationId
    const source = createRevenueSource({ id: 'revenue-source:save', organizationId, category: 'SPONSORSHIP', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 100_000 }, startsOn: '2032-10-01', endsOn: '2032-12-31', sourceAuthority: 'COMMERCIAL_CONTRACT', generationPolicy: 'ONE_OFF', provenance: { kind: 'CF7_TEST', id: 'save' } })
    const saved = serializeGameWorldV4(createGameWorld({ ...input, revenueSources: [source] }), '2032-10-01T00:00:00.000Z')
    const restored = deserializeGameWorldV4(saved)
    expect(restored.revenueSourcesById[source.id]).toEqual(source)

    const legacyPayload = { ...saved.payload } as Record<string, unknown>
    delete legacyPayload.revenueSources
    const legacy = { ...saved, payload: legacyPayload }
    expect(Object.values(deserializeGameWorldV4(legacy).revenueSourcesById)).toHaveLength(0)
  })
})
