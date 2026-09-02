import type { GameDate } from '@/domain/date'

export type RelationshipPersonId = string
export type RelationshipBand = 'hostile' | 'poor' | 'neutral' | 'positive' | 'strong'
export type RelationshipEventSource = 'careerEvent' | 'teamDecision' | 'playingTime' | 'developmentEvent' | 'professionalInteraction'

/**
 * Wave 5B — 8 canonical professional/human relationship facets, additive to the legacy scalar
 * `RelationshipProfile.value`. PERSON↔PERSON, transversal — never Staff-specific at the domain
 * level (Staff-specific mapping lives in the engine bridge, not here). -100..100, 0 = neutral/unknown.
 */
export const RELATIONSHIP_DIMENSION_KEYS = ['trust', 'professionalRespect', 'communicationQuality', 'collaboration', 'personalCloseness', 'perceivedSupport', 'reliability', 'professionalAlignment'] as const
export type RelationshipDimensionKey = typeof RELATIONSHIP_DIMENSION_KEYS[number]
export type RelationshipDimensions = Readonly<Record<RelationshipDimensionKey, number>>

export const NEUTRAL_RELATIONSHIP_DIMENSIONS: RelationshipDimensions = Object.freeze({
  trust: 0, professionalRespect: 0, communicationQuality: 0, collaboration: 0,
  personalCloseness: 0, perceivedSupport: 0, reliability: 0, professionalAlignment: 0,
})

export interface RelationshipEvent {
  readonly id: string
  readonly gameDate: GameDate
  readonly source: RelationshipEventSource
  readonly delta: number
  readonly context: Readonly<Record<string, string | number | boolean>>
  /** Wave 5B — optional per-facet deltas. Legacy events (undefined) behave exactly as before: only `delta`/`value` move. */
  readonly dimensionDeltas?: Readonly<Partial<Record<RelationshipDimensionKey, number>>>
}

export interface RelationshipProfile {
  readonly sourceId: RelationshipPersonId
  readonly targetId: RelationshipPersonId
  readonly value: number
  readonly events: readonly RelationshipEvent[]
  /** Wave 5B — additive, optional. Absent on every legacy profile; `getRelationshipDimensions` is the sole authority for reading facets with neutral defaults. */
  readonly dimensions?: RelationshipDimensions
}

export function relationshipKey(sourceId: RelationshipPersonId, targetId: RelationshipPersonId): string { return `${sourceId}->${targetId}` }

export function createRelationshipProfile(sourceId: RelationshipPersonId, targetId: RelationshipPersonId): RelationshipProfile {
  validatePeople(sourceId, targetId)
  return { sourceId, targetId, value: 0, events: [] }
}

/** Sole authority for reading the 8 facets off any profile — legacy profiles (no `dimensions`) read as all-neutral, never `undefined`/error. */
export function getRelationshipDimensions(profile: RelationshipProfile | undefined): RelationshipDimensions {
  if (profile?.dimensions === undefined) return NEUTRAL_RELATIONSHIP_DIMENSIONS
  return { ...NEUTRAL_RELATIONSHIP_DIMENSIONS, ...profile.dimensions }
}

/** §17 — soft saturation near ±100, mirroring the Human State saturation rule so a facet near the extreme resists trivial further movement. */
function applyFacetSaturation(currentValue: number, delta: number): number {
  if (delta === 0) return 0
  const headroom = delta > 0 ? 100 - currentValue : 100 + currentValue
  const saturationFactor = Math.max(0.15, Math.min(1, headroom / 25))
  return delta * saturationFactor
}

export function applyRelationshipEvent(profile: RelationshipProfile, event: RelationshipEvent): RelationshipProfile {
  validateRelationshipProfile(profile)
  validateRelationshipEvent(event)
  if (profile.events.some((item) => item.id === event.id)) return profile
  const snapshot = { ...event, context: { ...event.context }, ...(event.dimensionDeltas === undefined ? {} : { dimensionDeltas: { ...event.dimensionDeltas } }) }
  const nextValue = clampRelationshipValue(profile.value + event.delta)

  if (event.dimensionDeltas === undefined) {
    return { ...profile, value: nextValue, events: [...profile.events, snapshot] }
  }

  const currentDimensions = getRelationshipDimensions(profile)
  const nextDimensions: Record<RelationshipDimensionKey, number> = { ...currentDimensions }
  for (const key of RELATIONSHIP_DIMENSION_KEYS) {
    const rawDelta = event.dimensionDeltas[key]
    if (rawDelta === undefined || rawDelta === 0) continue
    nextDimensions[key] = clampRelationshipValue(Math.round(currentDimensions[key] + applyFacetSaturation(currentDimensions[key], rawDelta)))
  }
  return { ...profile, value: nextValue, dimensions: nextDimensions, events: [...profile.events, snapshot] }
}

export function validateRelationshipProfile(profile: RelationshipProfile): void {
  validatePeople(profile.sourceId, profile.targetId)
  if (!Number.isInteger(profile.value) || profile.value < -100 || profile.value > 100) throw new RangeError('Relationship value must be an integer from -100 to 100')
  if (profile.dimensions !== undefined) {
    for (const key of RELATIONSHIP_DIMENSION_KEYS) {
      const value = profile.dimensions[key]
      if (!Number.isInteger(value) || value < -100 || value > 100) throw new RangeError(`Relationship dimension ${key} must be an integer from -100 to 100`)
    }
  }
  const eventIds = new Set<string>()
  for (const event of profile.events) {
    validateRelationshipEvent(event)
    if (eventIds.has(event.id)) throw new RangeError('Relationship event IDs must be unique')
    eventIds.add(event.id)
  }
}

export function getRelationshipBand(value: number): RelationshipBand { if (!Number.isFinite(value)) throw new RangeError('Relationship value must be finite'); if (value < -60) return 'hostile'; if (value < -20) return 'poor'; if (value <= 20) return 'neutral'; if (value <= 60) return 'positive'; return 'strong' }

/** Wave 5B §18 — qualitative band for a single facet value, reusing the same 5-band vocabulary shape as `RelationshipBand` (kept as a distinct name since a facet is not the legacy summary `value`). */
export type RelationshipFacetBand = 'VERY_NEGATIVE' | 'NEGATIVE' | 'MIXED' | 'POSITIVE' | 'VERY_POSITIVE'
export function getRelationshipFacetBand(value: number): RelationshipFacetBand {
  if (!Number.isFinite(value)) throw new RangeError('Relationship facet value must be finite')
  if (value < -60) return 'VERY_NEGATIVE'
  if (value < -20) return 'NEGATIVE'
  if (value <= 20) return 'MIXED'
  if (value <= 60) return 'POSITIVE'
  return 'VERY_POSITIVE'
}

function validatePeople(sourceId: RelationshipPersonId, targetId: RelationshipPersonId): void { if (!sourceId.trim() || !targetId.trim() || sourceId === targetId) throw new RangeError('Relationship requires two distinct people') }
function validateRelationshipEvent(event: RelationshipEvent): void {
  if (!event.id.trim() || !['careerEvent','teamDecision','playingTime','developmentEvent','professionalInteraction'].includes(event.source) || !Number.isInteger(event.delta) || event.delta === 0 || !event.gameDate) throw new RangeError('Relationship event is invalid')
  for (const value of Object.values(event.context)) if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new RangeError('Relationship event context is invalid')
  if (event.dimensionDeltas !== undefined) {
    for (const [key, value] of Object.entries(event.dimensionDeltas)) {
      if (!(RELATIONSHIP_DIMENSION_KEYS as readonly string[]).includes(key)) throw new RangeError(`Relationship event dimensionDeltas has unknown facet: ${key}`)
      if (!Number.isInteger(value) || !Number.isFinite(value)) throw new RangeError(`Relationship event dimensionDeltas.${key} must be a finite integer`)
    }
  }
}
function clampRelationshipValue(value: number): number { return Math.max(-100, Math.min(100, value)) }
