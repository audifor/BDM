import { describe, expect, it } from 'vitest'

import { playerIdFromString, teamIdFromString } from '@/domain/ids'
import { PLAYER_TRUTH_TENDENCY_KEYS, type PlayerTruthTendencies } from '@/domain/player/PlayerTruthCatalog'
import type { BasketballPosition } from '@/domain/primitives'

import { applyTemporaryDefenderOverrides, createDefensiveAuthority, getEffectiveDefender, getEffectiveMatchups, getPrimaryDefender } from './DefensiveAuthority'
import { calculateDefensiveAssignments } from './Matchups'
import { BASELINE_PLAYER_KINEMATIC_PROFILE, type MatchPlayerProfile } from './MatchPlayerProfile'
import { calculateDefenseExecution, calculateEffectiveDefense, calculateShotMakeProbability, calculateSpatialContestBonus } from './ShotResolution'
import { createInitialSpatialState } from './SpatialState'

const positions: readonly BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']
const neutralTendencies = Object.fromEntries(PLAYER_TRUTH_TENDENCY_KEYS.map((key) => [key, 50])) as unknown as PlayerTruthTendencies
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

  it('uses a legal explicit defensive assignment and falls back when it is off court', () => {
    const overridden=calculateDefensiveAssignments(ids(offense),ids(defense),[...offense,...defense],[{ourPlayerId:defense[4]!.playerId,opponentPlayerId:offense[0]!.playerId}])
    expect(overridden.find(item=>item.offensivePlayerId===offense[0]!.playerId)?.defensivePlayerId).toBe(defense[4]!.playerId)
    const offCourt=playerIdFromString('off-court')
    const fallback=calculateDefensiveAssignments(ids(offense),ids(defense),[...offense,...defense],[{ourPlayerId:offCourt,opponentPlayerId:offense[0]!.playerId}])
    expect(fallback.find(item=>item.offensivePlayerId===offense[0]!.playerId)?.defensivePlayerId).not.toBe(offCourt)
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

  it('makes a closer spatial contest stronger while retaining defensive skill and tactics', () => {
    const shooter = profile('spatial-shooter', 'SG')
    const strong = profile('spatial-strong', 'SG', 90, 90, 90)
    const weak = profile('spatial-weak', 'SG', 20, 20, 20)
    const probability = (defenderProfile: MatchPlayerProfile, defenderDistanceMeters: number, tacticalDefenseModifier = 0) => calculateShotMakeProbability({
      shotZone: 'threePoint',
      shooterProfile: shooter,
      shooterFatigue: 0,
      defenderProfile,
      defenderFatigue: 0,
      defenderDistanceMeters,
      tacticalDefenseModifier,
    })
    const strongFar = probability(strong, 4)
    const strongClose = probability(strong, 0.5)
    const weakFar = probability(weak, 4)
    const weakClose = probability(weak, 0.5)

    expect(strongClose).toBeLessThan(strongFar)
    expect(strongFar - strongClose).toBeGreaterThan(weakFar - weakClose)
    expect(probability(strong, 100)).toBe(strongFar)
    expect(probability(weak, 0.5, 10)).toBeLessThan(weakClose)
    expect(calculateSpatialContestBonus(100, 0)).toBe(12)
  })
})

describe('defensive authority', () => {
  const homeTeamId = teamIdFromString('authority-home')
  const awayTeamId = teamIdFromString('authority-away')
  const homeProfiles = positions.map((position, index) => profile(`authority-home-${index}`, position))
  const awayProfiles = positions.map((position, index) => profile(`authority-away-${index}`, position))
  const homeLineup = ids(homeProfiles)
  const awayLineup = ids(awayProfiles)

  function authority(attackingTeamId = awayTeamId, home = homeLineup, away = awayLineup, extraHomeProfiles: readonly MatchPlayerProfile[] = []) {
    const playerProfiles = { home: [...homeProfiles, ...extraHomeProfiles], away: awayProfiles }
    const activeLineups = { home, away }
    const spatial = createInitialSpatialState({ homeTeamId, awayTeamId, lineups: activeLineups, playerProfiles, ecosystemKind: 'fibaLike', category: 'men' })
    return createDefensiveAuthority({ homeTeamId, awayTeamId, attackingTeamId, activeLineups, playerProfiles, spatial })
  }

  it('creates one opposing primary assignment for every active offensive player', () => {
    const result = authority()
    expect(result.baseAssignments).toHaveLength(5)
    expect(result.baseAssignments.every((entry) => entry.attackingTeamId === awayTeamId && entry.defendingTeamId === homeTeamId && entry.intent === 'GUARD')).toBe(true)
    expect(new Set(result.baseAssignments.map((entry) => entry.defenderId)).size).toBe(5)
    expect(result.baseAssignments.every((entry) => awayLineup.includes(entry.offensivePlayerId) && homeLineup.includes(entry.defenderId))).toBe(true)
  })

  it('derives the defending team from the current possession when possession flips', () => {
    const awayAttacks = authority(awayTeamId)
    const homeAttacks = authority(homeTeamId)
    expect(awayAttacks.defendingTeamId).toBe(homeTeamId)
    expect(homeAttacks.defendingTeamId).toBe(awayTeamId)
    expect(homeAttacks.baseAssignments.every((entry) => entry.attackingTeamId === homeTeamId && entry.defendingTeamId === awayTeamId)).toBe(true)
  })

  it('repairs primary assignments to active players after a substitution', () => {
    const bench = profile('authority-home-bench', 'PG')
    const nextHomeLineup = [bench.playerId, ...homeLineup.slice(1)]
    const result = authority(awayTeamId, nextHomeLineup, awayLineup, [bench])
    expect(result.baseAssignments.some((entry) => entry.defenderId === homeLineup[0])).toBe(false)
    expect(result.baseAssignments.some((entry) => entry.defenderId === bench.playerId)).toBe(true)
    expect(result.baseAssignments.every((entry) => nextHomeLineup.includes(entry.defenderId))).toBe(true)
  })

  it('resolves a valid temporary switch before the base assignment and restores base when removed', () => {
    const base = authority()
    const first = awayLineup[0]!
    const second = awayLineup[1]!
    const firstDefender = getPrimaryDefender(base, first)!
    const secondDefender = getPrimaryDefender(base, second)!
    const effective = getEffectiveMatchups(base).map((matchup) => matchup.offensivePlayerId === first
      ? { ...matchup, defensivePlayerId: secondDefender }
      : matchup.offensivePlayerId === second
        ? { ...matchup, defensivePlayerId: firstDefender }
        : matchup)
    const switched = applyTemporaryDefenderOverrides(base, effective)
    expect(getEffectiveDefender(switched, first)).toBe(secondDefender)
    expect(getEffectiveDefender(switched, second)).toBe(firstDefender)
    expect(getEffectiveDefender(base, first)).toBe(firstDefender)
    expect(switched.temporaryAssignments.every((entry) => entry.kind === 'TEMPORARY_OVERRIDE')).toBe(true)
  })

  it('rejects temporary assignments that leave a defender with two primary targets', () => {
    const base = authority()
    const first = awayLineup[0]!
    const secondDefender = getPrimaryDefender(base, awayLineup[1]!)!
    const conflicting = getEffectiveMatchups(base).map((matchup) => matchup.offensivePlayerId === first
      ? { ...matchup, defensivePlayerId: secondDefender }
      : matchup)
    expect(() => applyTemporaryDefenderOverrides(base, conflicting)).toThrow('remain one-to-one')
  })

  it('produces identical assignment ordering for the same active state', () => {
    expect(authority()).toEqual(authority())
  })

  it('rejects temporary defenders from the attacking lineup', () => {
    const base = authority()
    const invalid = getEffectiveMatchups(base).map((matchup, index) => index === 0
      ? { ...matchup, defensivePlayerId: awayLineup[1]! }
      : matchup)
    expect(() => applyTemporaryDefenderOverrides(base, invalid)).toThrow('invalid team')
  })

  it('rejects an active lineup player missing from SpatialState', () => {
    const bench = profile('authority-home-missing', 'PG')
    const activeLineups = { home: [bench.playerId, ...homeLineup.slice(1)], away: awayLineup }
    const playerProfiles = { home: [...homeProfiles, bench], away: awayProfiles }
    const spatial = createInitialSpatialState({ homeTeamId, awayTeamId, lineups: { home: homeLineup, away: awayLineup }, playerProfiles, ecosystemKind: 'fibaLike', category: 'men' })
    expect(() => createDefensiveAuthority({ homeTeamId, awayTeamId, attackingTeamId: awayTeamId, activeLineups, playerProfiles, spatial })).toThrow('missing from SpatialState')
  })
})

function profile(id: string, primaryPosition: BasketballPosition, pointOfAttack = 50, interior = 50, mobility = 50): MatchPlayerProfile {
  return { playerId: playerIdFromString(id), primaryPosition, tendencies: neutralTendencies as unknown as MatchPlayerProfile['tendencies'], physical: { heightCm: 200, weightKg: 100, wingspanCm: 205, standingReachCm: 250 }, kinematics: BASELINE_PLAYER_KINEMATIC_PROFILE, offense: { usage: 50, rimAttack: 50, shooting: 50, creation: 50, ballSecurity: 50 }, defense: { pointOfAttack, interior, mobility }, rebounding: { impact: 50 } }
}

function ids(profiles: readonly MatchPlayerProfile[]) { return profiles.map((profile) => profile.playerId) }
