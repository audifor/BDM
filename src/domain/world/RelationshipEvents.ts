import { applyRelationshipEvent, createRelationshipProfile, relationshipKey, type RelationshipEvent, type RelationshipPersonId } from '@/domain/relationships'

import { updateGameWorld, type GameWorld } from './GameWorld'

/** Applies a deterministic event to one directed relationship without mutating the world. */
export function applyRelationshipEventToWorld(world: GameWorld, sourceId: RelationshipPersonId, targetId: RelationshipPersonId, event: RelationshipEvent): GameWorld {
  const key = relationshipKey(sourceId, targetId)
  const profile = world.relationshipsByKey[key] ?? createRelationshipProfile(sourceId, targetId)
  const updated = applyRelationshipEvent(profile, event)
  if (updated === profile) return world
  return updateGameWorld(world, { relationshipsByKey: { ...world.relationshipsByKey, [key]: updated } })
}
