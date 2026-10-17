import { describe, expect, it } from 'vitest'
import { createGameDate } from '@/domain/date'
import { createPersonality, generatePersonality, type Personality } from '@/domain/personality'
import { SEMANTIC_PERSONALITY_DIMENSIONS } from '@/domain/personality/SemanticPersonality'
import { evaluateFull50PairCompatibility } from '@/domain/personality/SemanticPairCompatibility'
import { applyRelationshipEventToWorld } from './RelationshipEvents'
import { createGameWorld, updateGameWorld } from './GameWorld'
import { createValidGameWorldInput } from './testFixtures'
import { getRelationshipValue } from './queries'

const scores = (): Personality => createPersonality({
  values: Object.fromEntries(SEMANTIC_PERSONALITY_DIMENSIONS.map((key) => [key, 50])) as unknown as Personality['values'],
})
const setup = (semantic: boolean) => {
  const legacy = createGameWorld(createValidGameWorldInput())
  const source = legacy.userCoachId
  const target = Object.keys(legacy.players)[0]!
  const world = semantic ? updateGameWorld(legacy, {
    personalitiesByPersonId: {
      ...legacy.personalitiesByPersonId,
      [source]: scores(),
      [target]: scores(),
    },
  }) : legacy
  return { world, source, target }
}
const event = (id: string, delta: number, sameRoleCompetition = false) => ({
  id, gameDate: createGameDate(2026, 7, 1), source: 'professionalInteraction' as const,
  delta, context: { action: 'meeting', sameRoleCompetition },
  dimensionDeltas: { trust: Math.sign(delta) * 10 },
})
describe('Live PERSON 50 relationship compatibility', () => {
  it('matches BDM-DB 23F all-50 golden fixture and is symmetric', () => {
    const a = scores()
    const expected = { personalAffinity: 100, professionalFit: 100, frictionRisk: 10, initialCompatibility: 98 }
    expect(evaluateFull50PairCompatibility(a, a)).toEqual(expected)
    const changed = createPersonality({ values: { ...a.values, humor: 0 } })
    expect(evaluateFull50PairCompatibility(changed, a)).toEqual({
      personalAffinity: 95, professionalFit: 100, frictionRisk: 10, initialCompatibility: 96,
    })
    expect(evaluateFull50PairCompatibility(a, changed)).toEqual(evaluateFull50PairCompatibility(changed, a))
    expect(evaluateFull50PairCompatibility(generatePersonality('legacy'), a)).toBeUndefined()
  })
  it('auto-modulates real events but does not invent prior friendships', () => {
    const { world, source, target } = setup(true)
    expect(getRelationshipValue(world, source, target)).toBe(0)
    expect(Object.keys(world.relationshipsByKey)).toHaveLength(0)
    const result = applyRelationshipEventToWorld(world, source, target, event('positive:1', 20))
    expect(getRelationshipValue(result, source, target)).toBe(25)
    expect(getRelationshipValue(result, target, source)).toBe(0)
    expect(result.relationshipsByKey[`${source}->${target}`]!.events[0]!.context.compatibilityModel)
      .toBe('PERSON-23F-FULL50-READONLY-V1')
    expect(applyRelationshipEventToWorld(result, source, target, event('positive:1', 20))).toBe(result)
    const bad = applyRelationshipEventToWorld(world, source, target, event('negative:1', -20))
    expect(getRelationshipValue(bad, source, target)).toBe(-16)
  })
  it('legacy eight-dimensional GameWorld remains bit-for-bit unchanged', () => {
    const { world, source, target } = setup(false)
    const updated = applyRelationshipEventToWorld(world, source, target, event('legacy:1', 20))
    expect(getRelationshipValue(updated, source, target)).toBe(20)
    expect(updated.relationshipsByKey[`${source}->${target}`]!.events[0]!.context.compatibilityModel).toBeUndefined()
  })
  it('every one of fifty semantic values changes the numerical prognosis when varied alone', () => {
    const baseline = scores()
    const reference = evaluateFull50PairCompatibility(baseline, baseline)!
    for (const key of SEMANTIC_PERSONALITY_DIMENSIONS) {
      const candidate = createPersonality({ values: { ...baseline.values, [key]: 0 } })
      const revised = evaluateFull50PairCompatibility(candidate, baseline)!
      expect(
        revised.personalAffinity !== reference.personalAffinity
        || revised.professionalFit !== reference.professionalFit,
        `Dimension ${key} had no pair impact`,
      ).toBe(true)
    }
  })
})
