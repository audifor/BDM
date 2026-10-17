import { applyRelationshipEventToWorld, type GameWorld } from '@/domain/world'
import type { RelationshipEvent, RelationshipPersonId } from '@/domain/relationships'

/** Read-only pair prognosis produced by WorldDB PERSON-23D.
 * This is NOT a lived relationship and MUST NOT initialize RelationshipProfile.value.
 */
export interface PairPredisposition {
  readonly personA: RelationshipPersonId
  readonly personB: RelationshipPersonId
  readonly initialCompatibility: number
  readonly frictionRisk: number
}

function requireScore(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new RangeError(`Invalid ${label}: expected integer 0..100`)
  }
}

/** Applies an actual event through BDM's sole canonical relationship writer.
 * High affinity slightly amplifies positive interactions; high friction amplifies
 * negative ones. A pair of strangers remains neutral until a real event occurs.
 * Optional and explicit: existing callers never change their behavior.
 */
export function applyCompatibilityModulatedInteraction(
  world: GameWorld,
  sourceId: RelationshipPersonId,
  targetId: RelationshipPersonId,
  event: RelationshipEvent,
  pair: PairPredisposition,
): GameWorld {
  if (!sourceId || !targetId || sourceId === targetId) {
    throw new RangeError('Interaction requires two distinct people')
  }
  const match = (pair.personA === sourceId && pair.personB === targetId)
    || (pair.personB === sourceId && pair.personA === targetId)
  if (!match) throw new RangeError('Predisposition does not belong to the interacting pair')
  requireScore(pair.initialCompatibility, 'initialCompatibility')
  requireScore(pair.frictionRisk, 'frictionRisk')
  if (!Number.isInteger(event.delta) || event.delta === 0) {
    throw new RangeError('Interaction requires a nonzero integral relationship delta')
  }

  // 0.75x..1.25x, preserving sign and preventing extremes from overruling events.
  const baseline = event.delta > 0 ? pair.initialCompatibility : pair.frictionRisk
  const factor = 0.75 + baseline / 200
  const scale = (value: number): number =>
    value === 0 ? 0 : Math.sign(value) * Math.max(1, Math.round(Math.abs(value) * factor))
  const delta = scale(event.delta)
  const facets = event.dimensionDeltas === undefined ? undefined : Object.fromEntries(
    Object.entries(event.dimensionDeltas).map(([key, value]) => [key, scale(value)]),
  )
  const shaped: RelationshipEvent = {
    ...event,
    delta,
    context: {
      ...event.context,
      compatibilityModel: 'PERSON-23D-PAIR-READONLY-V1',
      compatibilityInitial: pair.initialCompatibility,
      compatibilityFriction: pair.frictionRisk,
      compatibilityMultiplier: factor,
    },
    ...(facets === undefined ? {} : { dimensionDeltas: facets }),
  }
  return applyRelationshipEventToWorld(world, sourceId, targetId, shaped)
}
