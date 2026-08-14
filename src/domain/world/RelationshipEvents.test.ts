import { createGameDate } from '@/domain/date'
import { getRelationshipValue } from './queries'
import { applyRelationshipEventToWorld } from './RelationshipEvents'
import { createGameWorld } from './GameWorld'
import { createValidGameWorldInput } from './testFixtures'
import { advanceDay } from '@/engine/calendar'
import { describe, expect, it } from 'vitest'

describe('GameWorld relationship events', () => {
  it('keeps relationships directional, sparse and immutable', () => {
    const input = createValidGameWorldInput()
    const world = createGameWorld(input)
    const playerId = Object.values(world.players)[0]!.id
    const updated = applyRelationshipEventToWorld(world, world.userCoachId, playerId, { id: 'relationship:1', gameDate: createGameDate(2032, 10, 1), source: 'professionalInteraction', delta: 12, context: { kind: 'meeting' } })

    expect(getRelationshipValue(world, world.userCoachId, playerId)).toBe(0)
    expect(getRelationshipValue(updated, world.userCoachId, playerId)).toBe(12)
    expect(getRelationshipValue(updated, playerId, world.userCoachId)).toBe(0)
    expect(Object.keys(world.relationshipsByKey)).toHaveLength(0)
    expect(applyRelationshipEventToWorld(updated, world.userCoachId, playerId, { id: 'relationship:1', gameDate: createGameDate(2032, 10, 1), source: 'professionalInteraction', delta: 12, context: { kind: 'meeting' } })).toBe(updated)
    expect(advanceDay(updated).relationshipsByKey).toEqual(updated.relationshipsByKey)
  })

  it('rejects relationships to people outside the canonical world', () => {
    const input = createValidGameWorldInput()
    expect(() => createGameWorld({ ...input, relationshipsByKey: { 'coach-user->missing': { sourceId: 'coach-user', targetId: 'missing', value: 10, events: [] } } })).toThrow('Relationship references missing person')
  })
})
