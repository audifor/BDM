import { describe, expect, it } from 'vitest'
import { createPersonality, generatePersonality, type Personality } from './Personality'
import { SEMANTIC_PERSONALITY_DIMENSIONS } from './SemanticPersonality'
import { SEMANTIC_MORALE_RULES, semanticMoraleSensitivity } from './SemanticPersonalityEffects'
import { calculateMoraleEventImpact, type MoraleEventSource } from '@/domain/morale'
import { createGameDate } from '@/domain/date'

const base = () => createPersonality({
  values: Object.fromEntries(SEMANTIC_PERSONALITY_DIMENSIONS.map((key) => [key, 50])) as unknown as Personality['values'],
})
const events: readonly MoraleEventSource[] = [
  'matchResult', 'playingTime', 'careerEvent', 'developmentEvent', 'teamEvent', 'professionalInteraction',
]
describe('50-dimensional semantic personality game effects', () => {
  it('contains exactly 42 additional real-event rules, each with an active triggering source', () => {
    expect(SEMANTIC_PERSONALITY_DIMENSIONS).toHaveLength(50)
    expect(SEMANTIC_MORALE_RULES).toHaveLength(42)
    expect(new Set(SEMANTIC_MORALE_RULES.map((rule) => rule.code)).size).toBe(42)
    for (const rule of SEMANTIC_MORALE_RULES) {
      expect(rule.sources.length).toBeGreaterThan(0)
      expect(rule.sources.every((source) => events.includes(source))).toBe(true)
      const standard = base()
      const modified = createPersonality({ values: { ...standard.values, [rule.code]: 100 } })
      expect(semanticMoraleSensitivity(modified, rule.sources[0]!))
        .not.toBe(semanticMoraleSensitivity(standard, rule.sources[0]!))
    }
  })
  it('preserves legacy eight-attribute morale math exactly', () => {
    const legacy = generatePersonality('person:legacy')
    for (const source of events) {
      const event = { id: `e:${source}`, personId: 'person:legacy', gameDate: createGameDate(2026, 7, 1), source, delta: -40, context: {} }
      const dimension = source === 'matchResult' ? 'resilience' : source === 'professionalInteraction' ? 'temperament' : 'professionalism'
      const resistance = (legacy.values[dimension] - 50) / 50
      expect(calculateMoraleEventImpact(legacy, event))
        .toBe(Math.round(-40 * (1 - resistance * 0.35)))
      expect(semanticMoraleSensitivity(legacy, source)).toBe(1)
    }
  })
  it('semantic sensitivity changes actual event impact, without changing event sign', () => {
    const initial = base()
    const changed = createPersonality({ values: { ...initial.values, statusSeeking: 100 } })
    const event = { id: 'career', personId: 'person:semantic', gameDate: createGameDate(2026, 7, 1), source: 'careerEvent' as const, delta: -200, context: {} }
    const before = calculateMoraleEventImpact(initial, event)
    const after = calculateMoraleEventImpact(changed, event)
    expect(after).toBeLessThan(before)
    expect(after).toBeLessThan(0)
  })
  it('rejects incomplete semantic data instead of accepting 9 to 49 values', () => {
    const initial = base()
    const incomplete = { ...initial.values } as Record<string, number>
    delete incomplete.humor
    expect(() => createPersonality({ values: incomplete as unknown as Personality['values'] })).toThrow('exactly 50')
  })
})
