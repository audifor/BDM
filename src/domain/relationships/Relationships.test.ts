import { createGameDate } from '@/domain/date'
import { applyRelationshipEvent, createRelationshipProfile, getRelationshipBand } from './Relationships'
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
})
