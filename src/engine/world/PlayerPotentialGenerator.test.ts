import { describe, expect, it } from 'vitest'
import { calculateBootstrapAbilityProxy } from '@/domain/player'
import { generatePlayerPotential, potentialHeadroomRangeForAge } from './PlayerPotentialGenerator'

const ratings = { finishing: 60, shooting: 60, playmaking: 60, perimeterDefense: 60, interiorDefense: 60, rebounding: 60, athleticism: 60 }

describe('PlayerPotentialGenerator', () => {
  it.each([[19, 8, 28], [22, 6, 24], [25, 4, 18], [28, 2, 12], [30, 0, 8], [32, 0, 6], [33, 0, 4]])('uses the specified headroom range for age %i', (age, minimum, maximum) => {
    expect(potentialHeadroomRangeForAge(age)).toEqual([minimum, maximum])
  })

  it('is deterministic, bounded, and based on the current ability proxy', () => {
    const first = generatePlayerPotential('player-a', ratings, 19)
    expect(generatePlayerPotential('player-a', ratings, 19)).toEqual(first)
    expect(first.ceiling).toBeGreaterThanOrEqual(Math.round(calculateBootstrapAbilityProxy(ratings)))
    expect(first.ceiling).toBeLessThanOrEqual(100)
    expect(Number.isInteger(first.ceiling)).toBe(true)
  })
})
