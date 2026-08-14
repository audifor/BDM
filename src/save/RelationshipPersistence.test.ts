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
})
