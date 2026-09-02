import { createGameDate } from '@/domain/date'
import { applyRelationshipEvent, createRelationshipProfile, getRelationshipBand, getRelationshipDimensions, RELATIONSHIP_DIMENSION_KEYS, validateRelationshipProfile } from './Relationships'
import { describe, expect, it } from 'vitest'

const event = (id: string, delta: number) => ({ id, gameDate: createGameDate(2032, 10, 1), source: 'professionalInteraction' as const, delta, context: { subject: 'practice' } })

describe('Relationships', () => {
  it('defaults to neutral and uses the canonical bands', () => {
    expect(createRelationshipProfile('coach-a', 'player-a').value).toBe(0)
    expect([-100, -61].map(getRelationshipBand)).toEqual(['hostile', 'hostile'])
    expect([-60, -21].map(getRelationshipBand)).toEqual(['poor', 'poor'])
    expect([-20, 20].map(getRelationshipBand)).toEqual(['neutral', 'neutral'])
    expect([21, 60].map(getRelationshipBand)).toEqual(['positive', 'positive'])
    expect([61, 100].map(getRelationshipBand)).toEqual(['strong', 'strong'])
  })

  it('applies immutable signed events, clamps values and ignores a repeated event ID', () => {
    const neutral = createRelationshipProfile('coach-a', 'player-a')
    const positive = applyRelationshipEvent(neutral, event('positive', 80))
    const clamped = applyRelationshipEvent(positive, event('more-positive', 80))
    const negative = applyRelationshipEvent(clamped, event('negative', -250))

    expect(neutral).toEqual(createRelationshipProfile('coach-a', 'player-a'))
    expect(positive.value).toBe(80)
    expect(clamped.value).toBe(100)
    expect(negative.value).toBe(-100)
    expect(applyRelationshipEvent(positive, event('positive', 80))).toBe(positive)
  })

  it('exactly 8 canonical facets', () => {
    expect(RELATIONSHIP_DIMENSION_KEYS).toHaveLength(8)
    expect([...RELATIONSHIP_DIMENSION_KEYS].sort()).toEqual(['collaboration', 'communicationQuality', 'personalCloseness', 'perceivedSupport', 'professionalAlignment', 'professionalRespect', 'reliability', 'trust'].sort())
  })

  it('a legacy profile with no dimensions reads all 8 facets as neutral 0, never undefined/error', () => {
    const legacy = createRelationshipProfile('coach-a', 'player-a')
    const dims = getRelationshipDimensions(legacy)
    for (const key of RELATIONSHIP_DIMENSION_KEYS) expect(dims[key]).toBe(0)
  })

  it('a legacy event with only `delta` (no dimensionDeltas) behaves exactly as before — value moves, facets stay neutral', () => {
    const profile = createRelationshipProfile('coach-a', 'staff-a')
    const updated = applyRelationshipEvent(profile, event('legacy-1', 12))
    expect(updated.value).toBe(12)
    expect(updated.dimensions).toBeUndefined()
    for (const key of RELATIONSHIP_DIMENSION_KEYS) expect(getRelationshipDimensions(updated)[key]).toBe(0)
  })

  it('a V2 event applies both `value` and facet deltas', () => {
    const profile = createRelationshipProfile('staff-a', 'coach-a')
    const updated = applyRelationshipEvent(profile, { ...event('v2-1', 6), dimensionDeltas: { trust: 5, professionalRespect: 8 } })
    expect(updated.value).toBe(6)
    expect(getRelationshipDimensions(updated).trust).toBe(5)
    expect(getRelationshipDimensions(updated).professionalRespect).toBe(8)
    expect(getRelationshipDimensions(updated).collaboration).toBe(0)
  })

  it('facet deltas clamp to -100..100', () => {
    const profile = createRelationshipProfile('staff-a', 'coach-a')
    const highDelta = applyRelationshipEvent(profile, { ...event('v2-high', 1), dimensionDeltas: { trust: 100 } })
    const overClamped = applyRelationshipEvent(highDelta, { ...event('v2-high-2', 1), dimensionDeltas: { trust: 100 } })
    expect(getRelationshipDimensions(overClamped).trust).toBeLessThanOrEqual(100)
    const lowDelta = applyRelationshipEvent(profile, { ...event('v2-low', -1), dimensionDeltas: { trust: -100 } })
    const overClampedLow = applyRelationshipEvent(lowDelta, { ...event('v2-low-2', -1), dimensionDeltas: { trust: -100 } })
    expect(getRelationshipDimensions(overClampedLow).trust).toBeGreaterThanOrEqual(-100)
  })

  it('an invalid/non-finite facet delta is rejected, and an unknown facet key is rejected', () => {
    const profile = createRelationshipProfile('staff-a', 'coach-a')
    expect(() => applyRelationshipEvent(profile, { ...event('bad-1', 1), dimensionDeltas: { trust: NaN } })).toThrow()
    expect(() => applyRelationshipEvent(profile, { ...event('bad-2', 1), dimensionDeltas: { trust: 1.5 } })).toThrow()
    expect(() => applyRelationshipEvent(profile, { ...event('bad-3', 1), dimensionDeltas: { notARealFacet: 1 } as never })).toThrow()
  })

  it('idempotent by event.id even with dimensionDeltas — reapplying the same id is a no-op', () => {
    const profile = createRelationshipProfile('staff-a', 'coach-a')
    const once = applyRelationshipEvent(profile, { ...event('dup-1', 4), dimensionDeltas: { trust: 3 } })
    const twice = applyRelationshipEvent(once, { ...event('dup-1', 4), dimensionDeltas: { trust: 3 } })
    expect(twice).toBe(once)
  })

  it('relationships are directional: A→B is independent from B→A', () => {
    const aToB = applyRelationshipEvent(createRelationshipProfile('staff-a', 'coach-a'), { ...event('dir-1', 10), dimensionDeltas: { trust: 20 } })
    const bToA = createRelationshipProfile('coach-a', 'staff-a')
    expect(getRelationshipDimensions(aToB).trust).toBe(20)
    expect(getRelationshipDimensions(bToA).trust).toBe(0)
  })

  it('soft saturation: a facet near the extreme resists a large jump from one more event in the same direction', () => {
    const profile = createRelationshipProfile('staff-a', 'coach-a')
    const nearMax = { ...profile, dimensions: { trust: 94, professionalRespect: 0, communicationQuality: 0, collaboration: 0, personalCloseness: 0, perceivedSupport: 0, reliability: 0, professionalAlignment: 0 } }
    const updated = applyRelationshipEvent(nearMax, { ...event('sat-1', 1), dimensionDeltas: { trust: 20 } })
    expect(getRelationshipDimensions(updated).trust).toBeLessThan(100)
    expect(getRelationshipDimensions(updated).trust - 94).toBeLessThan(10)
  })

  it('routine professional events (no personalCloseness in dimensionDeltas) never move personalCloseness', () => {
    const profile = createRelationshipProfile('staff-a', 'coach-a')
    const updated = applyRelationshipEvent(profile, { ...event('prof-1', 5), dimensionDeltas: { trust: 5, professionalRespect: 5 } })
    expect(getRelationshipDimensions(updated).personalCloseness).toBe(0)
  })

  it('validateRelationshipProfile accepts a profile with materialized dimensions and rejects one with an out-of-range facet', () => {
    const profile = createRelationshipProfile('staff-a', 'coach-a')
    const valid = { ...profile, dimensions: { trust: 10, professionalRespect: -10, communicationQuality: 0, collaboration: 0, personalCloseness: 0, perceivedSupport: 0, reliability: 0, professionalAlignment: 0 } }
    expect(() => validateRelationshipProfile(valid)).not.toThrow()
    const invalid = { ...profile, dimensions: { ...valid.dimensions, trust: 500 } }
    expect(() => validateRelationshipProfile(invalid)).toThrow()
  })
})
