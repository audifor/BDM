import { describe, expect, it } from 'vitest'

import { countryIdFromString, playerIdFromString } from '@/domain/ids'
import { createPlayer, PLAYER_TRUTH_RATING_KEYS, type PlayerTruthRatings } from '@/domain/player'
import { PLAYER_TRUTH_TENDENCY_KEYS, type PlayerTruthTendencies } from '@/domain/player/PlayerTruthCatalog'
import type { RandomSource } from '@/engine/random'

import { createMatchPlayerProfile } from './MatchPlayerProfile'
import { createCourtGeometry } from '@/domain/court'
import { calculateShotLocation, calculateShotMakeProbability, calculateShotZoneWeights, pointsForShotZone } from './ShotResolution'
import { chooseWeighted } from './WeightedChoice'

const neutralTendencies = Object.fromEntries(PLAYER_TRUTH_TENDENCY_KEYS.map((key) => [key, 50])) as unknown as PlayerTruthTendencies
const neutralRatings = Object.fromEntries(PLAYER_TRUTH_RATING_KEYS.map((key) => [key, 50])) as unknown as PlayerTruthRatings
const profile = createMatchPlayerProfile(createPlayer({ id: playerIdFromString('offense-player'), firstName: 'Test', lastName: 'Shooter', gender: 'male', nationalityId: countryIdFromString('country'), basketball: { primaryPosition: 'SG', ratings: { finishing: 80, shooting: 70, playmaking: 50, perimeterDefense: 50, interiorDefense: 50, rebounding: 50, athleticism: 40 }, tendencies: neutralTendencies }, bio: { dateOfBirth: '2008-06-14', heightCm: 188, weightKg: 86 } }))
const defender = createMatchPlayerProfile(createPlayer({ id: playerIdFromString('defense-player'), firstName: 'Test', lastName: 'Defender', gender: 'male', nationalityId: countryIdFromString('country'), basketball: { primaryPosition: 'SG', ratings: { finishing: 50, shooting: 50, playmaking: 50, perimeterDefense: 50, interiorDefense: 50, rebounding: 50, athleticism: 50 }, tendencies: neutralTendencies }, bio: { dateOfBirth: '2008-06-14', heightCm: 188, weightKg: 86 } }))

describe('player-driven offense primitives', () => {
  it('adapts the bootstrap ratings into exact bounded match signals', () => {
    expect(profile.offense).toEqual({ usage: 52.75, rimAttack: 75.25, shooting: 65.83333333333333, creation: 46.5, ballSecurity: 48.25 })
    expect(Object.values(profile.offense).every((value) => value >= 0 && value <= 100)).toBe(true)
    expect(Object.values(profile.defense).every((value) => value >= 0 && value <= 100)).toBe(true)
  })

  it('selects weighted items deterministically and falls back uniformly for zero weights', () => {
    expect(chooseWeighted([{ item: 'a', weight: 10 }, { item: 'b', weight: 20 }, { item: 'c', weight: 70 }], new FixedRandom(0.15))).toBe('b')
    expect(chooseWeighted([{ item: 'a', weight: 0 }, { item: 'b', weight: 0 }], new FixedRandom(0.9))).toBe('b')
  })

  it('derives shot-zone weights, points, and make probability from player offense, defense, and fatigue', () => {
    expect(calculateShotZoneWeights(profile)).toEqual({ rim: 79.64999999999999, midRange: 46.6, threePoint: 65.73333333333333 })
    expect(pointsForShotZone('rim')).toBe(2)
    expect(pointsForShotZone('midRange')).toBe(2)
    expect(pointsForShotZone('threePoint')).toBe(3)
    expect(calculateShotMakeProbability({ shotZone: 'rim', shooterProfile: profile, shooterFatigue: 0, defenderProfile: defender, defenderFatigue: 0 })).toBeCloseTo(0.6685)
    expect(calculateShotMakeProbability({ shotZone: 'rim', shooterProfile: profile, shooterFatigue: 80, defenderProfile: defender, defenderFatigue: 0 })).toBeCloseTo(0.6045)
  })

  it('uses shot tendencies to change zone selection weights without changing shot execution skill', () => {
    const shooter = (id: string, threePointTendency: number) => createMatchPlayerProfile(createPlayer({
      id: playerIdFromString(id), firstName: 'Test', lastName: 'Shooter', gender: 'male', nationalityId: countryIdFromString('country'),
      basketball: { primaryPosition: 'SG', ratings: neutralRatings, tendencies: { ...neutralTendencies, THREE_POINT_FREQUENCY: threePointTendency } },
      bio: { dateOfBirth: '2008-06-14', heightCm: 188, weightKg: 86 },
    }))
    const low = shooter('low-three-tendency', 10)
    const high = shooter('high-three-tendency', 90)
    const lowWeights = calculateShotZoneWeights(low)
    const highWeights = calculateShotZoneWeights(high)

    expect(high.offense).toEqual(low.offense)
    expect(highWeights.threePoint).toBeGreaterThan(lowWeights.threePoint)
    expect(highWeights.rim).toBe(lowWeights.rim)
    expect(highWeights.midRange).toBe(lowWeights.midRange)
    expect(calculateShotMakeProbability({ shotZone: 'threePoint', shooterProfile: high, shooterFatigue: 0, defenderProfile: defender, defenderFatigue: 0 }))
      .toBe(calculateShotMakeProbability({ shotZone: 'threePoint', shooterProfile: low, shooterFatigue: 0, defenderProfile: defender, defenderFatigue: 0 }))
  })

  it('derives canonical shot zone and distance from mirrored spatial positions', () => {
    const court = createCourtGeometry('FIBA')
    const right = court.baskets.right
    const left = court.baskets.left
    const mirrored = (position: { x: number; y: number }) => ({ x: court.lengthMeters - position.x, y: position.y })
    const rightLocations = [
      calculateShotLocation({ x: right.x - 1, y: right.y }, right, court),
      calculateShotLocation({ x: right.x - 4.5, y: right.y }, right, court),
      calculateShotLocation({ x: right.x - 7, y: right.y }, right, court),
    ]
    const leftLocations = [
      calculateShotLocation(mirrored({ x: right.x - 1, y: right.y }), left, court),
      calculateShotLocation(mirrored({ x: right.x - 4.5, y: right.y }), left, court),
      calculateShotLocation(mirrored({ x: right.x - 7, y: right.y }), left, court),
    ]

    expect(rightLocations.map((location) => location.shotZone)).toEqual(['rim', 'midRange', 'threePoint'])
    expect(leftLocations.map((location) => location.shotZone)).toEqual(['rim', 'midRange', 'threePoint'])
    leftLocations.forEach((location, index) => expect(location.distanceMeters).toBeCloseTo(rightLocations[index]!.distanceMeters))
  })

  it('applies a bounded continuous distance adjustment after zone and skill resolution', () => {
    const makeProbability = (shotDistanceMeters: number) => calculateShotMakeProbability({ shotZone: 'threePoint', shotDistanceMeters, shooterProfile: profile, shooterFatigue: 0, defenderProfile: defender, defenderFatigue: 0 })
    const reference = makeProbability(7.5)
    expect(makeProbability(12.5)).toBeLessThan(reference)
    expect(makeProbability(100)).toBeCloseTo(reference - 0.04)
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
