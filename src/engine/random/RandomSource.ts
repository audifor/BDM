/** Deterministic randomness boundary for future simulation systems. */
export interface RandomSource {
  next(): number
  nextInt(minInclusive: number, maxInclusive: number): number
  nextFloat(minInclusive: number, maxExclusive: number): number
  chance(probability: number): boolean
  pick<Item>(items: readonly Item[]): Item
}

/**
 * A small, fast Mulberry32 pseudo-random number generator.
 * It is deterministic, not cryptographically secure.
 */
export class SeededRandomSource implements RandomSource {
  private state: number

  public constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new RangeError('Random seed must be an unsigned 32-bit integer')
    }

    this.state = seed
  }

  public next(): number {
    let value = (this.state = (this.state + 0x6d2b_79f5) >>> 0)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }

  public nextInt(minInclusive: number, maxInclusive: number): number {
    validateIntegerRange(minInclusive, maxInclusive)
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1))
  }

  public nextFloat(minInclusive: number, maxExclusive: number): number {
    if (!Number.isFinite(minInclusive) || !Number.isFinite(maxExclusive) || minInclusive >= maxExclusive) {
      throw new RangeError('Random float range must be finite and have min < max')
    }

    return minInclusive + this.next() * (maxExclusive - minInclusive)
  }

  public chance(probability: number): boolean {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new RangeError('Chance probability must be between 0 and 1')
    }

    return this.next() < probability
  }

  public pick<Item>(items: readonly Item[]): Item {
    if (items.length === 0) {
      throw new RangeError('Cannot pick from an empty collection')
    }

    return items[this.nextInt(0, items.length - 1)]!
  }
}

export function createSeededRandomSource(seed: number): RandomSource {
  return new SeededRandomSource(seed)
}

function validateIntegerRange(minInclusive: number, maxInclusive: number): void {
  if (!Number.isSafeInteger(minInclusive) || !Number.isSafeInteger(maxInclusive) || minInclusive > maxInclusive) {
    throw new RangeError('Random integer range must use safe integers with min <= max')
  }

  if (!Number.isSafeInteger(maxInclusive - minInclusive + 1)) {
    throw new RangeError('Random integer range is too large')
  }
}
