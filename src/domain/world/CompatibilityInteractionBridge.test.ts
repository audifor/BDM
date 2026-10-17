import { createGameDate } from '@/domain/date'
import { getRelationshipDimensions } from '@/domain/relationships'
import { getRelationshipValue } from './queries'
import { createGameWorld } from './GameWorld'
import { createValidGameWorldInput } from './testFixtures'
import { applyCompatibilityModulatedInteraction } from './CompatibilityInteractionBridge'
import { describe, expect, it } from 'vitest'

describe('WorldDB predisposition to real BDM relationship event bridge', () => {
  const date = createGameDate(2032, 10, 1)
  const event = (id: string, delta: number) => ({
    id, gameDate: date, source: 'professionalInteraction' as const, delta,
    context: { kind: delta > 0 ? 'support' : 'disagreement' },
    dimensionDeltas: { trust: delta / 2 },
  })
  const setup = () => {
    const world = createGameWorld(createValidGameWorldInput())
    const source = world.userCoachId
    const target = Object.values(world.players)[0]!.id
    return { world, source, target }
  }

  it('does not create friendship just because personalities fit', () => {
    const { world, source, target } = setup()
    const pair = { personA: source, personB: target, initialCompatibility: 95, frictionRisk: 5 }
    expect(getRelationshipValue(world, source, target)).toBe(0)
    expect(getRelationshipValue(world, target, source)).toBe(0)
    expect(Object.keys(world.relationshipsByKey)).toHaveLength(0)
    const after = applyCompatibilityModulatedInteraction(world, source, target, event('good:1', 20), pair)
    expect(getRelationshipValue(after, source, target)).toBe(25)
    expect(getRelationshipValue(after, target, source)).toBe(0)
    expect(getRelationshipValue(world, source, target)).toBe(0)
    expect(getRelationshipDimensions(after.relationshipsByKey[`${source}->${target}`]).trust).toBe(12)
    expect(applyCompatibilityModulatedInteraction(after, source, target, event('good:1', 20), pair)).toBe(after)
  })

  it('modulates positive and negative lived events differently', () => {
    const { world, source, target } = setup()
    const aligned = { personA: source, personB: target, initialCompatibility: 95, frictionRisk: 5 }
    const opposed = { personA: target, personB: source, initialCompatibility: 5, frictionRisk: 95 }
    const positiveAligned = applyCompatibilityModulatedInteraction(world, source, target, event('good:a', 20), aligned)
    const positiveOpposed = applyCompatibilityModulatedInteraction(world, source, target, event('good:b', 20), opposed)
    expect(getRelationshipValue(positiveAligned, source, target))
      .toBeGreaterThan(getRelationshipValue(positiveOpposed, source, target))

    const negativeAligned = applyCompatibilityModulatedInteraction(world, source, target, event('bad:a', -20), aligned)
    const negativeOpposed = applyCompatibilityModulatedInteraction(world, source, target, event('bad:b', -20), opposed)
    expect(getRelationshipValue(negativeOpposed, source, target))
      .toBeLessThan(getRelationshipValue(negativeAligned, source, target))
  })

  it('rejects a forecast for another pair and out-of-range numbers', () => {
    const { world, source, target } = setup()
    const valid = { personA: source, personB: target, initialCompatibility: 50, frictionRisk: 50 }
    expect(() => applyCompatibilityModulatedInteraction(world, source, target, event('e', 10), {
      ...valid, personB: 'unrelated-person',
    })).toThrow('does not belong')
    expect(() => applyCompatibilityModulatedInteraction(world, source, target, event('e', 10), {
      ...valid, initialCompatibility: 101,
    })).toThrow('0..100')
    expect(() => applyCompatibilityModulatedInteraction(world, source, target, event('e', 10), {
      ...valid, frictionRisk: Number.NaN,
    })).toThrow('0..100')
    expect(() => applyCompatibilityModulatedInteraction(world, source, target, event('e', 0), valid))
      .toThrow('nonzero')
  })
})
