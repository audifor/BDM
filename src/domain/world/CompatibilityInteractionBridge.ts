import { applyRelationshipEventToWorld } from './RelationshipEvents'
import type { GameWorld } from './GameWorld'
import type { RelationshipEvent, RelationshipPersonId } from '@/domain/relationships'
import { shapeRelationshipEventWithPredisposition, type PairPredisposition } from '@/domain/relationships/CompatibilityInteraction'
export type { PairPredisposition } from '@/domain/relationships/CompatibilityInteraction'

/** Explicit legacy entry point. New 50-dimension worlds can also trigger
 * equivalent modulation automatically through RelationshipEvents. */
export function applyCompatibilityModulatedInteraction(
  world: GameWorld,
  sourceId: RelationshipPersonId,
  targetId: RelationshipPersonId,
  event: RelationshipEvent,
  pair: PairPredisposition,
): GameWorld {
  const shaped = shapeRelationshipEventWithPredisposition(sourceId, targetId, event, pair)
  return applyRelationshipEventToWorld(world, sourceId, targetId, shaped)
}
