import { describe, expect, it } from 'vitest'

import { playerIdFromString } from '@/domain/ids'
import type { BasketballPosition } from '@/domain/primitives'

import { calculateDefensiveAssignments } from './Matchups'
import type { MatchPlayerProfile } from './MatchPlayerProfile'
import { calculateDefenseExecution, calculateEffectiveDefense, calculateShotMakeProbability } from './ShotResolution'

const positions: readonly BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']
const offense = positions.map((position, index) => profile(`offense-${index}`, position))
const defense = positions.map((position, index) => profile(`defense-${index}`, position))

describe('individual defensive matchups', () => {
  it('assigns natural lineups one-to-one by position', () => {
    const assignments = calculateDefensiveAssignments(ids(offense), ids(defense), [...offense, ...defense])
    expect(assignments).toHaveLength(5)
    expect(assignments).toEqual(offense.map((attacker, index) => ({ offensivePlayerId: attacker.playerId, defensivePlayerId: defense[index]!.playerId })))
    expect(new Set(assignments.map((assignment) => assignment.defensivePlayerId)).size).toBe(5)
  })

  it('handles duplicate positions and deterministic positional fallbacks', () => {
    const duplicateOffense = [profile('off-pg-a', 'PG'), profile('off-pg-b', 'PG'), profile('off-sf', 'SF'), profile('off-pf', 'PF'), profile('off-c', 'C')]
    const fallbackDefense = [profile('def-sg', 'SG'), profile('def-pg', 'PG'), profile('def-sf', 'SF'), profile('def-pf', 'PF'), profile('def-c', 'C')]
    const assignments = calculateDefensiveAssignments(ids(duplicateOffense), ids(fallbackDefense), [...duplicateOffense, ...fallbackDefense])
    expect(assignments.map((assignment) => assignment.defensivePlayerId)).toEqual([fallbackDefense[1]!.playerId, fallbackDefense[0]!.playerId, fallbackDefense[2]!.playerId, fallbackDefense[3]!.playerId, fallbackDefense[4]!.playerId])
    expect(calculateDefensiveAssignments(ids(duplicateOffense), ids(fallbackDefense), [...duplicateOffense, ...fallbackDefense])).toEqual(assignments)
  })

  it('breaks equal positional distances by mobility, then PlayerId', () => {
    const attackers = [profile('attacker-pg', 'PG'), profile('attacker', 'SG'), profile('attacker-sf', 'SF'), profile('attacker-pf', 'PF'), profile('attacker-c', 'C')]
    const mobileDefenders = [profile('z-low', 'PG', 20), profile('a-high', 'SF', 80), profile('def-pf-a', 'PF'), profile('def-pf-b', 'PF'), profile('def-c', 'C')]
    expect(calculateDefensiveAssignments(ids(attackers), ids(mobileDefenders), [...attackers, ...mobileDefenders]).find((assignment) => assignment.offensivePlayerId === attackers[1]!.playerId)).toEqual({ offensivePlayerId: attackers[1]!.playerId, defensivePlayerId: mobileDefenders[1]!.playerId })

    const equalMobility = [profile('z-pg', 'PG', 50), profile('a-sf', 'SF', 50), profile('def-pf-a', 'PF'), profile('def-pf-b', 'PF'), profile('def-c', 'C')]
    expect(calculateDefensiveAssignments(ids(attackers), ids(equalMobility), [...attackers, ...equalMobility]).find((assignment) => assignment.offensivePlayerId === attackers[1]!.playerId)).toEqual({ offensivePlayerId: attackers[1]!.playerId, defensivePlayerId: equalMobility[1]!.playerId })
  })

  it('uses zone-specific defense, clamps fatigue effect, and reduces shot probability for better defenders', () => {
    const defender = profile('defender', 'PF', 60, 80, 40)
    expect(calculateDefenseExecution('rim', defender)).toBe(72)
    expect(calculateDefenseExecution('midRange', defender)).toBe(53)
    expect(calculateDefenseExecution('threePoint', defender)).toBe(55)
    expect(calculateEffectiveDefense('rim', defender, 80)).toBe(62.4)
    expect(calculateEffectiveDefense('rim', profile('low', 'PF', 0, 0, 0), 100)).toBe(0)

    const shooter = profile('shooter', 'SG')
    const weak = profile('weak', 'SG', 20, 20, 20)
    const strong = profile('strong', 'SG', 90, 90, 90)
    const fresh = calculateShotMakeProbability({ shotZone: 'threePoint', shooterProfile: shooter, shooterFatigue: 0, defenderProfile: strong, defenderFatigue: 0 })
    expect(fresh).toBeLessThan(calculateShotMakeProbability({ shotZone: 'threePoint', shooterProfile: shooter, shooterFatigue: 0, defenderProfile: weak, defenderFatigue: 0 }))
    expect(calculateShotMakeProbability({ shotZone: 'threePoint', shooterProfile: shooter, shooterFatigue: 0, defenderProfile: strong, defenderFatigue: 80 })).toBeGreaterThan(fresh)
    expect(calculateShotMakeProbability({ shotZone: 'threePoint', shooterProfile: shooter, shooterFatigue: 80, defenderProfile: strong, defenderFatigue: 0 })).toBeLessThan(fresh)
  })
})

function profile(id: string, primaryPosition: BasketballPosition, pointOfAttack = 50, interior = 50, mobility = 50): MatchPlayerProfile {
  return { playerId: playerIdFromString(id), primaryPosition, offense: { usage: 50, rimAttack: 50, shooting: 50, creation: 50, ballSecurity: 50 }, defense: { pointOfAttack, interior, mobility } }
}

function ids(profiles: readonly MatchPlayerProfile[]) { return profiles.map((profile) => profile.playerId) }
