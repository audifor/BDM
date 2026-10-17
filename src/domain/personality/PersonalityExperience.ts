import { OBSERVED_PERSON_EVENT_DIMENSIONS } from './ObservedPersonalityEventCatalog'
import { createPersonality, hasFullSemanticPersonality, type Personality } from './Personality'
import { SEMANTIC_PERSONALITY_DIMENSIONS, type SemanticPersonalityDimension } from './SemanticPersonality'

/** One verified gameplay occurrence. No RNG and no fabricated historical events. */
export interface PersonalityExperience {
  readonly id: string
  readonly personId: string
  readonly kind: string
  readonly occurredOn: string
  readonly dimension: string
  readonly valence: -1 | 1
  readonly intensity: number
}
export interface PersonalityChange {
  readonly id: string
  readonly personId: string
  readonly kind: string
  readonly occurredOn: string
  readonly dimension: string
  readonly before: number
  readonly after: number
}
export function validatePersonalityChanges(
  entries: readonly PersonalityChange[],
  profiles: Readonly<Record<string, Personality>>,
): readonly PersonalityChange[] {
  const unique = new Set<string>()
  const prior = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.id || !entry.personId || !entry.kind || !/^\d{4}-\d{2}-\d{2}$/.test(entry.occurredOn)
      || !SEMANTIC_PERSONALITY_DIMENSIONS.some((dim) => dim === entry.dimension)
      || !Number.isInteger(entry.before) || !Number.isInteger(entry.after)
      || entry.before < 0 || entry.before > 100 || entry.after < 0 || entry.after > 100
      || Math.abs(entry.after - entry.before) > 3
      || profiles[entry.personId] === undefined || !hasFullSemanticPersonality(profiles[entry.personId]!)
    ) throw new RangeError('Invalid PERSON experience history entry')
    const key = `${entry.personId}:\u0000${entry.id}`
    if (unique.has(key)) throw new RangeError('Duplicate PERSON experience ID')
    unique.add(key)
    const earlier = prior.get(entry.personId)
    if (earlier !== undefined && earlier > entry.occurredOn) throw new RangeError('PERSON experiences are not chronological')
    prior.set(entry.personId, entry.occurredOn)
  }
  return entries
}
/** 1..3 points after a documented occurrence, idempotent on person/event ID.
 * Mirrors PERSON-23I magnitude: ceil(intensity / 40). */
export function applyPersonalityExperience(
  personality: Personality,
  history: readonly PersonalityChange[],
  experience: PersonalityExperience,
): { readonly personality: Personality; readonly history: readonly PersonalityChange[] } {
  if (!hasFullSemanticPersonality(personality)) throw new Error('Full 50-dimensional PERSON personality required')
  if (!experience.id.trim() || !experience.personId.trim() || !experience.kind.trim()
    || !/^\d{4}-\d{2}-\d{2}$/.test(experience.occurredOn)
    || !SEMANTIC_PERSONALITY_DIMENSIONS.some((dim) => dim === experience.dimension)
    || !Number.isInteger(experience.intensity) || experience.intensity < 1 || experience.intensity > 100
    || (experience.valence !== 1 && experience.valence !== -1)) throw new RangeError('Invalid observed PERSON experience')
  const actualDimension = (OBSERVED_PERSON_EVENT_DIMENSIONS as Readonly<Record<string, string>>)[experience.kind]
  if (actualDimension === undefined || actualDimension !== experience.dimension) {
    throw new RangeError('Observed PERSON event kind and dimension do not match canonical catalog')
  }
  if (history.some((entry) => entry.id === experience.id && entry.personId === experience.personId)) {
    return { personality, history }
  }
  const last = [...history].reverse().find((entry) => entry.personId === experience.personId)
  if (last !== undefined && last.occurredOn > experience.occurredOn) throw new RangeError('Observed PERSON experience is out of order')
  const previous = personality.values[experience.dimension as SemanticPersonalityDimension]!
  const next = Math.max(0, Math.min(100, previous + experience.valence * Math.ceil(experience.intensity / 40)))
  const entry: PersonalityChange = {
    id: experience.id, personId: experience.personId, kind: experience.kind,
    occurredOn: experience.occurredOn, dimension: experience.dimension,
    before: previous, after: next,
  }
  return {
    personality: createPersonality({ values: { ...personality.values, [experience.dimension]: next } }),
    history: [...history, entry],
  }
}
