import type { GameDate } from '@/domain/date'
import type { MoraleEvent } from '@/domain/morale'
import { createPersonality, hasFullSemanticPersonality, type Personality } from './Personality'
import { OBSERVED_PERSONALITY_EVENTS, OBSERVED_PERSONALITY_EVOLUTION_VERSION } from './ObservedPersonalityEvents'

export interface PersonalityExperienceResult {
  readonly personality: Personality
  /** Stored on the canonical MoraleEvent.context, not in a second event log. */
  readonly provenance?: Readonly<Record<string, string | number>>
}

function yearsBetween(birthDate: GameDate, date: GameDate): number {
  const age = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4))
  return age - (date.slice(5) < birthDate.slice(5) ? 1 : 0)
}

/**
 * PERSON-23I projection of an *already observed*, uniquely identified morale event.
 * No source evidence -> no change. Does not manufacture a match, injury,
 * contract negotiation or news item. Full 50-only; all legacy saves are inert.
 *
 * The authoritative journal is MoraleProfile.events. Its existing event ID
 * deduplication must run BEFORE this calculation. When applied, the resulting
 * metadata is copied into that very MoraleEvent and persisted by Save V4.
 */
export function evolvePersonalityForObservedMoraleEvent(
  current: Personality,
  event: MoraleEvent,
  dateOfBirth: GameDate | undefined,
): PersonalityExperienceResult {
  if (!hasFullSemanticPersonality(current)) return { personality: current }
  const kind = event.context.observedEventKind
  const valence = event.context.personalityValence
  const intensity = event.context.personalityIntensity
  if (kind === undefined && valence === undefined && intensity === undefined) {
    return { personality: current }
  }
  if (typeof kind !== 'string' || (valence !== -1 && valence !== 1)
      || typeof intensity !== 'number' || !Number.isInteger(intensity)
      || intensity < 1 || intensity > 100) {
    throw new RangeError('Observed personality evidence requires event kind, valence ±1 and intensity 1..100')
  }
  const rule = OBSERVED_PERSONALITY_EVENTS.find((candidate) => candidate.kind === kind)
  if (rule === undefined) throw new RangeError(`Unknown observed PERSON event kind: ${kind}`)
  if (!(rule.sources as readonly string[]).includes(event.source)) {
    throw new RangeError(`Observed PERSON event kind ${kind} is not valid for morale source ${event.source}`)
  }
  // An unknown DOB must not be guessed. Morale is still applied as before.
  if (dateOfBirth === undefined) return { personality: current }
  if (event.gameDate <= dateOfBirth) throw new RangeError('Observed PERSON event precedes birth date')
  if (yearsBetween(dateOfBirth, event.gameDate) < rule.minOnsetAge) return { personality: current }

  const previous = current.values[rule.dimension]
  if (previous === undefined) throw new RangeError(`Missing canonical dimension ${rule.dimension}`)
  const magnitude = Math.ceil(intensity / 40)
  const next = Math.max(0, Math.min(100, previous + valence * magnitude))
  if (next === previous) return { personality: current }
  const personality = createPersonality({
    values: { ...current.values, [rule.dimension]: next },
  })
  return {
    personality,
    provenance: {
      personalityEvolutionModel: OBSERVED_PERSONALITY_EVOLUTION_VERSION,
      personalityEvolutionEventId: event.id,
      personalityEvolutionKind: kind,
      personalityEvolutionDimension: rule.dimension,
      personalityEvolutionBefore: previous,
      personalityEvolutionAfter: next,
      personalityEvolutionDelta: next - previous,
    },
  }
}
