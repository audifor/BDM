import { createNewGame } from '@/app/game'
import { applyRelationshipEventToWorld } from '@/domain/world'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'
import { describe, expect, it } from 'vitest'

describe('relationship save persistence', () => {
  it('round-trips materialized relationships and preserves legacy saves without them', () => {
    const original = createNewGame()
    const player = Object.values(original.players)[0]!
    const updated = applyRelationshipEventToWorld(original, original.userCoachId, player.id, { id: 'relationship:save', gameDate: original.currentDate, source: 'professionalInteraction', delta: -15, context: { kind: 'review' } })
    const saved = serializeGameWorldV1(updated, '2032-10-01T00:00:00.000Z')
    expect(deserializeGameWorldV1(JSON.parse(JSON.stringify(saved))).relationshipsByKey).toEqual(updated.relationshipsByKey)

    const legacyPayload = { ...saved.payload }
    delete (legacyPayload as { relationships?: unknown }).relationships
    expect(deserializeGameWorldV1({ ...saved, payload: legacyPayload }).relationshipsByKey).toEqual({})
  })

  it('Wave 5B: a legacy relationship (no dimensions) round-trips and reads all 8 facets as neutral', async () => {
    const { getRelationshipDimensions } = await import('@/domain/relationships')
    const original = createNewGame()
    const player = Object.values(original.players)[0]!
    const updated = applyRelationshipEventToWorld(original, original.userCoachId, player.id, { id: 'relationship:legacy-5b', gameDate: original.currentDate, source: 'professionalInteraction', delta: 10, context: { kind: 'review' } })
    const saved = serializeGameWorldV1(updated, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)))
    const key = `${original.userCoachId}->${player.id}`
    expect(loaded.relationshipsByKey[key]!.dimensions).toBeUndefined()
    for (const facetValue of Object.values(getRelationshipDimensions(loaded.relationshipsByKey[key]))) expect(facetValue).toBe(0)
  })

  it('Wave 5B: a V2 relationship event with dimensionDeltas round-trips exact facet values through Save V3', async () => {
    const { serializeGameWorldV3, deserializeGameWorldV3 } = await import('./GameWorldSaveV3')
    const original = createNewGame()
    const player = Object.values(original.players)[0]!
    const updated = applyRelationshipEventToWorld(original, original.userCoachId, player.id, {
      id: 'relationship:v2-5b', gameDate: original.currentDate, source: 'professionalInteraction', delta: 4,
      context: { kind: 'review' }, dimensionDeltas: { trust: 6, professionalRespect: -3, collaboration: 2 },
    })
    const saved = serializeGameWorldV3(updated, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV3(JSON.parse(JSON.stringify(saved)))
    const key = `${original.userCoachId}->${player.id}`
    expect(loaded.relationshipsByKey[key]!.dimensions?.trust).toBe(6)
    expect(loaded.relationshipsByKey[key]!.dimensions?.professionalRespect).toBe(-3)
    expect(loaded.relationshipsByKey[key]!.dimensions?.collaboration).toBe(2)
    expect(loaded.relationshipsByKey[key]!.value).toBe(4)
  })

  it('Wave 5B: reprocessing the same source event/relationship id after save/load produces no duplicate RelationshipEvent', () => {
    const original = createNewGame()
    const player = Object.values(original.players)[0]!
    const withEvent = applyRelationshipEventToWorld(original, original.userCoachId, player.id, { id: 'relationship:idempotent-5b', gameDate: original.currentDate, source: 'professionalInteraction', delta: 5, context: {}, dimensionDeltas: { trust: 3 } })
    const saved = serializeGameWorldV1(withEvent, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)))
    const reprocessed = applyRelationshipEventToWorld(loaded, original.userCoachId, player.id, { id: 'relationship:idempotent-5b', gameDate: original.currentDate, source: 'professionalInteraction', delta: 5, context: {}, dimensionDeltas: { trust: 3 } })
    const key = `${original.userCoachId}->${player.id}`
    expect(reprocessed.relationshipsByKey[key]!.events).toHaveLength(1)
    expect(reprocessed.relationshipsByKey[key]).toEqual(loaded.relationshipsByKey[key])
  })
})
