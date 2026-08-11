import { describe, expect, it } from 'vitest'

import { hashStringToSeed, SeededRandomSource } from './index'

describe('SeededRandomSource', () => {
  it('reproduces the same sequence for the same seed', () => {
    const first = new SeededRandomSource(12345)
    const second = new SeededRandomSource(12345)

    expect(Array.from({ length: 10 }, () => first.next())).toEqual(
      Array.from({ length: 10 }, () => second.next()),
    )
  })

  it('produces a different sequence for a different seed', () => {
    const first = new SeededRandomSource(1)
    const second = new SeededRandomSource(2)

    expect(Array.from({ length: 10 }, () => first.next())).not.toEqual(
      Array.from({ length: 10 }, () => second.next()),
    )
  })

  it('returns next values in the [0, 1) interval', () => {
    const random = new SeededRandomSource(99)

    for (let index = 0; index < 1000; index += 1) {
      const value = random.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('respects integer and float bounds', () => {
    const random = new SeededRandomSource(100)

    for (let index = 0; index < 1000; index += 1) {
      const integer = random.nextInt(-5, 5)
      const float = random.nextFloat(-2.5, 3.5)

      expect(integer).toBeGreaterThanOrEqual(-5)
      expect(integer).toBeLessThanOrEqual(5)
      expect(float).toBeGreaterThanOrEqual(-2.5)
      expect(float).toBeLessThan(3.5)
    }
  })

  it('handles chance boundaries and picks valid items', () => {
    const random = new SeededRandomSource(20)

    expect(random.chance(0)).toBe(false)
    expect(random.chance(1)).toBe(true)
    expect(['one', 'two', 'three']).toContain(random.pick(['one', 'two', 'three']))
  })

  it('rejects invalid arguments', () => {
    const random = new SeededRandomSource(0)

    expect(() => new SeededRandomSource(-1)).toThrow(RangeError)
    expect(() => random.nextInt(2, 1)).toThrow(RangeError)
    expect(() => random.nextInt(0.1, 1)).toThrow(RangeError)
    expect(() => random.nextFloat(1, 1)).toThrow(RangeError)
    expect(() => random.chance(-0.1)).toThrow(RangeError)
    expect(() => random.chance(1.1)).toThrow(RangeError)
    expect(() => random.pick([])).toThrow(RangeError)
  })

  it('hashes stable strings into valid deterministic seeds', () => {
    expect(hashStringToSeed('schedule-generated-season-0001-game-0001')).toBe(2199234665)
    expect(hashStringToSeed('player-ratings-v1:12345:generated-player-0001')).toBe(hashStringToSeed('player-ratings-v1:12345:generated-player-0001'))
    expect(hashStringToSeed('one')).not.toBe(hashStringToSeed('two'))
    expect(() => new SeededRandomSource(hashStringToSeed('game'))).not.toThrow()
  })
})
