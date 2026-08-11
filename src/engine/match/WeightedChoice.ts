import type { RandomSource } from '@/engine/random'

export interface WeightedItem<Item> {
  readonly item: Item
  readonly weight: number
}

/** Deterministic weighted selection with a uniform fallback when every weight is zero. */
export function chooseWeighted<Item>(items: readonly WeightedItem<Item>[], random: RandomSource): Item {
  if (items.length === 0) throw new Error('Cannot choose from an empty weighted collection')
  if (items.some(({ weight }) => !Number.isFinite(weight) || weight < 0)) throw new Error('Weighted choice requires finite non-negative weights')
  const totalWeight = items.reduce((sum, { weight }) => sum + weight, 0)
  if (totalWeight === 0) return items[random.nextInt(0, items.length - 1)]!.item
  const target = random.next() * totalWeight
  let accumulated = 0
  for (const entry of items) {
    accumulated += entry.weight
    if (target < accumulated) return entry.item
  }
  return items.at(-1)!.item
}
