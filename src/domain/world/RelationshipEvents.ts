import { applyRelationshipEvent, createRelationshipProfile, relationshipKey, type RelationshipEvent, type RelationshipPersonId } from '@/domain/relationships'

import { updateGameWorld, type GameWorld } from './GameWorld'

export interface DirectedRelationshipEvent { readonly sourceId: RelationshipPersonId; readonly targetId: RelationshipPersonId; readonly event: RelationshipEvent }
export function applyRelationshipEventsToWorld(world: GameWorld, events: readonly DirectedRelationshipEvent[]): GameWorld {
  const relationships = { ...world.relationshipsByKey }; let changed = false
  for (const item of [...events].sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.targetId.localeCompare(b.targetId) || a.event.id.localeCompare(b.event.id))) { const key = relationshipKey(item.sourceId, item.targetId); const profile = relationships[key] ?? createRelationshipProfile(item.sourceId, item.targetId); const updated = applyRelationshipEvent(profile, item.event); if (updated !== profile) { relationships[key] = updated; changed = true } }
  return changed ? updateGameWorld(world, { relationshipsByKey: relationships }) : world
}

/** Applies a deterministic event to one directed relationship without mutating the world. */
export function applyRelationshipEventToWorld(world: GameWorld, sourceId: RelationshipPersonId, targetId: RelationshipPersonId, event: RelationshipEvent): GameWorld { return applyRelationshipEventsToWorld(world, [{ sourceId, targetId, event }]) }
