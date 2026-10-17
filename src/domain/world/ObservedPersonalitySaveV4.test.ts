import { describe, expect, it } from 'vitest'
import { createGameDate } from '@/domain/date'
import { createPersonality, generatePersonality, type Personality } from '@/domain/personality'
import { SEMANTIC_PERSONALITY_DIMENSIONS } from '@/domain/personality/SemanticPersonality'
import { OBSERVED_PERSONALITY_EVENTS } from '@/domain/personality/ObservedPersonalityEvents'
import { evolvePersonalityForObservedMoraleEvent } from '@/domain/personality/ObservedPersonalityEvolution'
import { createGameWorld, updateGameWorld } from './GameWorld'
import { applyMoraleEventToWorld } from './MoraleEvents'
import { createValidGameWorldInput } from './testFixtures'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'

const all50 = (): Personality => createPersonality({
  values: Object.fromEntries(SEMANTIC_PERSONALITY_DIMENSIONS.map((key) => [key, 50])) as unknown as Personality['values'],
})
const bootstrap = (full50: boolean) => {
  const basic = createGameWorld(createValidGameWorldInput())
  const player = Object.values(basic.players)[0]!
  const world = updateGameWorld(basic, {
    personalitiesByPersonId: {
      ...basic.personalitiesByPersonId,
      [player.id]: full50 ? all50() : generatePersonality(player.id),
    },
  })
  return { world, player }
}
const observed = (personId: string, id: string, year = 2032, kind = 'COACH_PRAISE') => ({
  id,
  personId,
  gameDate: createGameDate(year, 10, 1),
  source: 'professionalInteraction' as const,
  delta: 8,
  context: {
    observedEventKind: kind,
    personalityValence: 1,
    personalityIntensity: 81,
    evidenceSystem: 'staffReaction',
  },
})

describe('PERSON 50 real-event career evolution + Save V4', () => {
  it('shares all 75 documented life kinds and changes only when an event exists', () => {
    expect(OBSERVED_PERSONALITY_EVENTS).toHaveLength(75)
    expect(new Set(OBSERVED_PERSONALITY_EVENTS.map((x) => x.kind)).size).toBe(75)
    const { world, player } = bootstrap(true)
    expect(world.personalitiesByPersonId[player.id]!.values.recognitionNeed).toBe(50)
    const e = observed(player.id, 'staff:evidence:1')
    const after = applyMoraleEventToWorld(world, e)
    expect(world.personalitiesByPersonId[player.id]!.values.recognitionNeed).toBe(50)
    expect(after.personalitiesByPersonId[player.id]!.values.recognitionNeed).toBe(53)
    const journal = after.moraleByPersonId[player.id]!.events
    expect(journal).toHaveLength(1)
    expect(journal[0]!.context).toMatchObject({
      personalityEvolutionEventId: e.id,
      personalityEvolutionDimension: 'recognitionNeed',
      personalityEvolutionBefore: 50,
      personalityEvolutionAfter: 53,
      personalityEvolutionDelta: 3,
    })
    expect(applyMoraleEventToWorld(after, e)).toBe(after)
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(after, '2032-10-01T00:00:00.000Z'))
    expect(loaded.personalitiesByPersonId[player.id]!.values).toEqual(after.personalitiesByPersonId[player.id]!.values)
    expect(loaded.moraleByPersonId[player.id]!.events).toEqual(journal)
    expect(applyMoraleEventToWorld(loaded, e)).toBe(loaded)
  })

  it('does not change legacy saves, undocumented events or people without age evidence', () => {
    const { world, player } = bootstrap(false)
    const input = observed(player.id, 'staff:evidence:legacy')
    const updated = applyMoraleEventToWorld(world, input)
    expect(updated.personalitiesByPersonId[player.id]).toEqual(world.personalitiesByPersonId[player.id])
    expect(updated.moraleByPersonId[player.id]!.events).toHaveLength(1)
    expect(updated.moraleByPersonId[player.id]!.events[0]!.context.personalityEvolutionDimension).toBeUndefined()
    const unknown = { ...observed(player.id, 'invalid:event'), context: {
      observedEventKind: 'HALLUCINATED_TRANSFER',
      personalityValence: 1,
      personalityIntensity: 50,
    } }
    const real = bootstrap(true)
    expect(() => applyMoraleEventToWorld(real.world, unknown)).toThrow('Unknown observed PERSON event kind')
    expect(real.world.personalitiesByPersonId[player.id]!.values.recognitionNeed).toBe(50)
  })

  it('keeps impacts bounded over 30 actual annual experiences and exact replay', () => {
    let personality = all50()
    const birth = createGameDate(1990, 1, 1)
    for (let year = 2026; year < 2056; year += 1) {
      const event = observed('player:history', `source:event:${year}`, year)
      const result = evolvePersonalityForObservedMoraleEvent(personality, event, birth)
      const score = result.personality.values.recognitionNeed!
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
      expect(score - personality.values.recognitionNeed!).toBeGreaterThanOrEqual(0)
      expect(score - personality.values.recognitionNeed!).toBeLessThanOrEqual(3)
      personality = result.personality
    }
    expect(personality.values.recognitionNeed).toBe(100)
    expect(Object.keys(personality.values)).toHaveLength(50)
  })

  it('rejects incomplete source evidence and respects DOB / maturity', () => {
    const full = all50()
    const invalid = {
      ...observed('player:one', 'bad:missing'),
      context: { observedEventKind: 'COACH_PRAISE' },
    }
    expect(() => evolvePersonalityForObservedMoraleEvent(full, invalid, createGameDate(1990, 1, 1)))
      .toThrow('requires event kind')
    const minor = observed('player:young', 'career:minor', 2026, 'NEW_CONTRACT_SIGNED')
    const normalizedMinor = { ...minor, source: 'careerEvent' as const }
    expect(evolvePersonalityForObservedMoraleEvent(full, normalizedMinor, createGameDate(2011, 9, 1)).personality)
      .toBe(full)
    const predates = observed('player:young', 'bad:born', 2026)
    expect(() => evolvePersonalityForObservedMoraleEvent(full, predates, createGameDate(2027, 1, 1)))
      .toThrow('precedes birth')
  })
})
