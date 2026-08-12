import { describe, expect, it } from 'vitest'

import { countryIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { createPlayer } from '@/domain/player'
import type { RandomSource } from '@/engine/random'

import { createMatchPlayerProfile } from './MatchPlayerProfile'
import { calculateShotMakeProbability, calculateShotZoneWeights, pointsForShotZone } from './ShotResolution'
import { chooseWeighted } from './WeightedChoice'

const profile = createMatchPlayerProfile(createPlayer({ id: playerIdFromString('offense-player'), firstName: 'Test', lastName: 'Shooter', gender: 'male', nationalityId: countryIdFromString('country'), basketball: { primaryPosition: 'SG', ratings: { finishing: 80, shooting: 70, playmaking: 50, perimeterDefense: 50, interiorDefense: 50, rebounding: 50, athleticism: 40 } }, bio: { dateOfBirth: '2008-06-14', heightCm: 188, weightKg: 86 } }))
const defender = createMatchPlayerProfile(createPlayer({ id: playerIdFromString('defense-player'), firstName: 'Test', lastName: 'Defender', gender: 'male', nationalityId: countryIdFromString('country'), basketball: { primaryPosition: 'SG', ratings: { finishing: 50, shooting: 50, playmaking: 50, perimeterDefense: 50, interiorDefense: 50, rebounding: 50, athleticism: 50 } }, bio: { dateOfBirth: '2008-06-14', heightCm: 188, weightKg: 86 } }))

describe('player-driven offense primitives', () => {
  it('adapts the bootstrap ratings into exact bounded match signals', () => {
    expect(profile.offense).toEqual({ usage: 69, rimAttack: 70, shooting: 70, creation: 47.5, ballSecurity: 48 })
    expect(profile.defense).toEqual({ pointOfAttack: 47.5, interior: 48, mobility: 43.5 })
    expect(Object.values(profile.offense).every((value) => value >= 0 && value <= 100)).toBe(true)
    expect(Object.values(profile.defense).every((value) => value >= 0 && value <= 100)).toBe(true)
  })

  it('selects weighted items deterministically and falls back uniformly for zero weights', () => {
    expect(chooseWeighted([{ item: 'a', weight: 10 }, { item: 'b', weight: 20 }, { item: 'c', weight: 70 }], new FixedRandom(0.15))).toBe('b')
    expect(chooseWeighted([{ item: 'a', weight: 0 }, { item: 'b', weight: 0 }], new FixedRandom(0.9))).toBe('b')
  })

  it('derives shot-zone weights, points, and make probability from player offense, defense, and fatigue', () => {
    expect(calculateShotZoneWeights(profile)).toEqual({ rim: 76.125, midRange: 48.625, threePoint: 68.75 })
    expect(pointsForShotZone('rim')).toBe(2)
    expect(pointsForShotZone('midRange')).toBe(2)
    expect(pointsForShotZone('threePoint')).toBe(3)
    expect(calculateShotMakeProbability({ shotZone: 'rim', shooterProfile: profile, shooterFatigue: 0, defenderProfile: defender, defenderFatigue: 0 })).toBeCloseTo(0.6465)
    expect(calculateShotMakeProbability({ shotZone: 'rim', shooterProfile: profile, shooterFatigue: 80, defenderProfile: defender, defenderFatigue: 0 })).toBeCloseTo(0.5825)
  })
})

class FixedRandom implements RandomSource {
  public constructor(private readonly value: number) {}
  next(): number { return this.value }
  nextInt(minInclusive: number, maxInclusive: number): number { return minInclusive + Math.floor(this.value * (maxInclusive - minInclusive + 1)) }
  nextFloat(minInclusive: number, maxExclusive: number): number { return minInclusive + this.value * (maxExclusive - minInclusive) }
  chance(probability: number): boolean { return this.value < probability }
  pick<Item>(items: readonly Item[]): Item { return items[this.nextInt(0, items.length - 1)]! }
}
