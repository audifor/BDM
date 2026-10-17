import type { RelationshipEvent, RelationshipPersonId } from './Relationships'

/** Forecast is not friendship. The canonical relationship still starts neutral. */
export interface PairPredisposition {
  readonly personA: RelationshipPersonId
  readonly personB: RelationshipPersonId
  readonly initialCompatibility: number
  readonly frictionRisk: number
}

/** Pure transformation. The sole relationship writer remains RelationshipEvents. */
export function shapeRelationshipEventWithPredisposition(
  sourceId: RelationshipPersonId,
  targetId: RelationshipPersonId,
  event: RelationshipEvent,
  pair: PairPredisposition,
): RelationshipEvent {
  if (!sourceId || !targetId || sourceId === targetId) throw new RangeError('Interaction requires two distinct people')
  const match = (pair.personA === sourceId && pair.personB === targetId)
    || (pair.personB === sourceId && pair.personA === targetId)
  if (!match) throw new RangeError('Predisposition does not belong to the interacting pair')
  for (const [label, value] of [['initialCompatibility', pair.initialCompatibility], ['frictionRisk', pair.frictionRisk]] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 100) throw new RangeError(`Invalid ${label}: expected integer 0..100`)
  }
  if (!Number.isInteger(event.delta) || event.delta === 0) throw new RangeError('Interaction requires a nonzero integral relationship delta')
  // Avoid double modulation when legacy explicit bridge calls the same writer.
  if (event.context.compatibilityModel !== undefined) return event
  const baseline = event.delta > 0 ? pair.initialCompatibility : pair.frictionRisk
  const factor = 0.75 + baseline / 200
  const scale = (value: number): number =>
    value === 0 ? 0 : Math.sign(value) * Math.max(1, Math.round(Math.abs(value) * factor))
  const facets = event.dimensionDeltas === undefined ? undefined : Object.fromEntries(
    Object.entries(event.dimensionDeltas).map(([key, value]) => [key, scale(value)]),
  )
  return {
    ...event,
    delta: scale(event.delta),
    context: {
      ...event.context,
      compatibilityModel: 'PERSON-23F-FULL50-READONLY-V1',
      compatibilityInitial: pair.initialCompatibility,
      compatibilityFriction: pair.frictionRisk,
      compatibilityMultiplier: factor,
    },
    ...(facets === undefined ? {} : { dimensionDeltas: facets }),
  }
}
