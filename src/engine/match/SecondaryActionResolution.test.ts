import { describe, expect, it } from 'vitest'

import { countryIdFromString, playerIdFromString } from '@/domain/ids'
import { createPlayer } from '@/domain/player'
import { PLAYER_TRUTH_TENDENCY_KEYS, type PlayerTruthTendencies } from '@/domain/player/PlayerTruthCatalog'
import type { BasketballPosition } from '@/domain/primitives'
import type { RandomSource } from '@/engine/random'

import { calculateAssistProbability, selectAssister } from './AssistResolution'
import { createMatchPlayerProfile, type MatchPlayerProfile } from './MatchPlayerProfile'
import { calculateOffensiveReboundProbability, selectRebounder } from './ReboundResolution'
import { calculateDefensivePressure, calculateTurnoverProbability, TURNOVER_RESOLUTION_V1 } from './TurnoverResolution'

const neutralTendencies = Object.fromEntries(PLAYER_TRUTH_TENDENCY_KEYS.map((key) => [key, 50])) as unknown as PlayerTruthTendencies

describe('player-driven secondary action resolution', () => {
  it('uses standing reach as a bounded contextual modifier to offensive rebound probability', () => {
    const neutral = ['PG', 'SG', 'SF', 'PF', 'C'].map((position, index) => profile(`reach-${index}`, position as BasketballPosition))
    const highReach = neutral.map((candidate) => ({ ...candidate, physical: { ...candidate.physical, standingReachCm: candidate.physical.standingReachCm + 20 } }))
    const highAgainstNeutral = calculateOffensiveReboundProbability({ offensiveProfiles: highReach, defensiveProfiles: neutral })
    const neutralAgainstHigh = calculateOffensiveReboundProbability({ offensiveProfiles: neutral, defensiveProfiles: highReach })
    const maximumReach = neutral.map((candidate) => ({ ...candidate, physical: { ...candidate.physical, standingReachCm: 310 } }))
    const minimumReach = neutral.map((candidate) => ({ ...candidate, physical: { ...candidate.physical, standingReachCm: 150 } }))

    expect(highAgainstNeutral).toBeCloseTo(0.2575)
    expect(neutralAgainstHigh).toBeCloseTo(0.2425)
    expect(calculateOffensiveReboundProbability({ offensiveProfiles: maximumReach, defensiveProfiles: minimumReach })).toBeCloseTo(0.26125)
  })

  it('adapts a known rebounding vector and keeps its signal bounded', () => {
    const profile = createMatchPlayerProfile(createPlayer({ id: playerIdFromString('rebound-profile'), firstName: 'Test', lastName: 'Rebounder', gender: 'male', nationalityId: countryIdFromString('country'), basketball: { primaryPosition: 'PF', ratings: { finishing: 0, shooting: 0, playmaking: 0, perimeterDefense: 0, interiorDefense: 0, rebounding: 80, athleticism: 60 } }, bio: { dateOfBirth: '2008-06-14', heightCm: 188, weightKg: 86 } }))
    expect(profile.rebounding.impact).toBe(69.75)
    expect(profile.rebounding.impact).toBeGreaterThanOrEqual(0)
    expect(profile.rebounding.impact).toBeLessThanOrEqual(100)
  })

  it('resolves turnover probability from ball security, pressure, and fatigue', () => {
    const handler = profile('handler', 'PG', 50, 50, 50, 50)
    const defender = profile('defender', 'PG', 50, 50, 50, 50)
    expect(calculateTurnoverProbability({ ballHandlerProfile: handler, ballHandlerFatigue: 0, defenderProfile: defender, defenderFatigue: 0 })).toBe(TURNOVER_RESOLUTION_V1.baseProbability)
    expect(calculateTurnoverProbability({ ballHandlerProfile: profile('secure', 'PG', 80, 50, 50, 50), ballHandlerFatigue: 0, defenderProfile: defender, defenderFatigue: 0 })).toBeLessThan(TURNOVER_RESOLUTION_V1.baseProbability)
    expect(calculateTurnoverProbability({ ballHandlerProfile: handler, ballHandlerFatigue: 0, defenderProfile: profile('pressure', 'PG', 50, 90, 90, 50), defenderFatigue: 0 })).toBeGreaterThan(TURNOVER_RESOLUTION_V1.baseProbability)
    expect(calculateTurnoverProbability({ ballHandlerProfile: handler, ballHandlerFatigue: 80, defenderProfile: defender, defenderFatigue: 0 })).toBeGreaterThan(TURNOVER_RESOLUTION_V1.baseProbability)
    expect(calculateTurnoverProbability({ ballHandlerProfile: handler, ballHandlerFatigue: 0, defenderProfile: defender, defenderFatigue: 80 })).toBeLessThan(TURNOVER_RESOLUTION_V1.baseProbability)
    expect(calculateDefensivePressure(defender)).toBe(50)
    expect(calculateTurnoverProbability({ ballHandlerProfile: profile('minimum', 'PG', 100, 0, 0, 0), ballHandlerFatigue: 0, defenderProfile: profile('minimum-defender', 'PG', 50, 0, 0, 0), defenderFatigue: 100 })).toBe(TURNOVER_RESOLUTION_V1.minimumProbability)
    expect(calculateTurnoverProbability({ ballHandlerProfile: profile('maximum', 'PG', 0, 50, 50, 0), ballHandlerFatigue: 100, defenderProfile: profile('maximum-defender', 'PG', 50, 100, 100, 0), defenderFatigue: 0 })).toBe(TURNOVER_RESOLUTION_V1.maximumProbability)
  })

  it('uses zone and teammate creation for assists, then weights the eligible assister', () => {
    const lowCreation = [profile('low-1', 'PG', 50, 50, 50, 0), profile('low-2', 'SG', 50, 50, 50, 0), profile('low-3', 'SF', 50, 50, 50, 0), profile('low-4', 'PF', 50, 50, 50, 0)]
    const highCreation = lowCreation.map((candidate, index) => ({ ...candidate, playerId: playerIdFromString(`high-${index}`), offense: { ...candidate.offense, creation: 100 } }))
    expect(calculateAssistProbability({ shotZone: 'rim', teammateProfiles: lowCreation })).toBeCloseTo(0.43)
    expect(calculateAssistProbability({ shotZone: 'midRange', teammateProfiles: lowCreation })).toBeCloseTo(0.30)
    expect(calculateAssistProbability({ shotZone: 'threePoint', teammateProfiles: lowCreation })).toBeCloseTo(0.53)
    expect(calculateAssistProbability({ shotZone: 'threePoint', teammateProfiles: highCreation })).toBeGreaterThan(calculateAssistProbability({ shotZone: 'threePoint', teammateProfiles: lowCreation }))
    expect(selectAssister([profile('a', 'PG', 50, 50, 50, 10), profile('b', 'SG', 50, 50, 50, 20), profile('c', 'SF', 50, 50, 50, 70)], new FixedRandom(0.35)).playerId).toBe(playerIdFromString('c'))
    expect(selectAssister(lowCreation, new FixedRandom(0.9)).playerId).toBe(lowCreation[3]!.playerId)
  })

  it('uses active rebound impact for ownership and weighted attribution', () => {
    const neutral = [profile('neutral-a', 'PG'), profile('neutral-b', 'SG'), profile('neutral-c', 'SF'), profile('neutral-d', 'PF'), profile('neutral-e', 'C')]
    expect(calculateOffensiveReboundProbability({ offensiveProfiles: neutral, defensiveProfiles: neutral })).toBe(0.25)
    expect(calculateOffensiveReboundProbability({ offensiveProfiles: neutral.map((candidate) => ({ ...candidate, rebounding: { impact: 100 } })), defensiveProfiles: neutral })).toBeGreaterThan(0.25)
    expect(calculateOffensiveReboundProbability({ offensiveProfiles: neutral, defensiveProfiles: neutral.map((candidate) => ({ ...candidate, rebounding: { impact: 100 } })) })).toBeLessThan(0.25)
    expect(calculateOffensiveReboundProbability({ offensiveProfiles: neutral.map((candidate) => ({ ...candidate, rebounding: { impact: 0 } })), defensiveProfiles: neutral.map((candidate) => ({ ...candidate, rebounding: { impact: 100 } })) })).toBe(0.12)
    expect(calculateOffensiveReboundProbability({ offensiveProfiles: neutral.map((candidate) => ({ ...candidate, rebounding: { impact: 100 } })), defensiveProfiles: neutral.map((candidate) => ({ ...candidate, rebounding: { impact: 0 } })) })).toBe(0.40)
    expect(selectRebounder([profile('rebound-a', 'PG', 50, 50, 50, 50, 10), profile('rebound-b', 'SG', 50, 50, 50, 50, 20), profile('rebound-c', 'SF', 50, 50, 50, 50, 70)], new FixedRandom(0.35)).playerId).toBe(playerIdFromString('rebound-c'))
    expect(selectRebounder(neutral.map((candidate) => ({ ...candidate, rebounding: { impact: 0 } })), new FixedRandom(0.9)).playerId).toBe(neutral[4]!.playerId)
  })

  it('uses distance to the attacked basket for bounded rebound chances and rebounder selection', () => {
    const offense = ['PG', 'SG', 'SF', 'PF', 'C'].map((position, index) => profile(`spatial-offense-${index}`, position as BasketballPosition))
    const defense = ['PG', 'SG', 'SF', 'PF', 'C'].map((position, index) => profile(`spatial-defense-${index}`, position as BasketballPosition))
    const closeDistances = Object.fromEntries([...offense.map(({ playerId }) => [playerId, 0.5] as const), ...defense.map(({ playerId }) => [playerId, 4] as const)])
    const farDistances = Object.fromEntries([...offense.map(({ playerId }) => [playerId, 7] as const), ...defense.map(({ playerId }) => [playerId, 4] as const)])
    const closeProbability = calculateOffensiveReboundProbability({ offensiveProfiles: offense, defensiveProfiles: defense, distanceToBasketMetersByPlayerId: closeDistances })
    const farProbability = calculateOffensiveReboundProbability({ offensiveProfiles: offense, defensiveProfiles: defense, distanceToBasketMetersByPlayerId: farDistances })
    const candidates = [profile('near-rebounder', 'PG'), profile('far-rebounder', 'C')]
    const rebounderDistances = { [candidates[0]!.playerId]: 0.5, [candidates[1]!.playerId]: 7 }
    const equivalentPositionRandom = new FixedRandom(0.5)

    expect(closeProbability).toBeGreaterThan(farProbability)
    expect(closeProbability).toBeLessThanOrEqual(0.40)
    expect(farProbability).toBeGreaterThanOrEqual(0.12)
    expect(selectRebounder(candidates, equivalentPositionRandom, { distanceToBasketMetersByPlayerId: rebounderDistances }).playerId).toBe(candidates[0]!.playerId)
    expect(selectRebounder(candidates.map((candidate, index) => ({ ...candidate, rebounding: { impact: index === 0 ? 10 : 90 } })), equivalentPositionRandom, { distanceToBasketMetersByPlayerId: { [candidates[0]!.playerId]: 1, [candidates[1]!.playerId]: 1 } }).playerId).toBe(candidates[1]!.playerId)
  })
})

function profile(id: string, primaryPosition: BasketballPosition, ballSecurity = 50, pointOfAttack = 50, mobility = 50, creation = 50, reboundImpact = 50): MatchPlayerProfile {
  return { playerId: playerIdFromString(id), primaryPosition, tendencies: neutralTendencies as unknown as MatchPlayerProfile['tendencies'], physical: { heightCm: 200, weightKg: 100, wingspanCm: 205, standingReachCm: 250 }, offense: { usage: 50, rimAttack: 50, shooting: 50, creation, ballSecurity }, defense: { pointOfAttack, interior: 50, mobility }, rebounding: { impact: reboundImpact } }
}

class FixedRandom implements RandomSource {
  public constructor(private readonly value: number) {}
  next(): number { return this.value }
  nextInt(minInclusive: number, maxInclusive: number): number { return minInclusive + Math.floor(this.value * (maxInclusive - minInclusive + 1)) }
  nextFloat(minInclusive: number, maxExclusive: number): number { return minInclusive + this.value * (maxExclusive - minInclusive) }
  chance(probability: number): boolean { return this.value < probability }
  pick<Item>(items: readonly Item[]): Item { return items[this.nextInt(0, items.length - 1)]! }
}
