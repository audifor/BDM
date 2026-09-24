import { describe, expect, it } from 'vitest'

import { countryIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { createCourtGeometry, courtRulesetForEcosystem } from '@/domain/court'
import { createPlayer, PLAYER_TRUTH_RATING_KEYS, PLAYER_TRUTH_TENDENCY_KEYS, type PlayerTruthRatings, type PlayerTruthTendencies } from '@/domain/player'

import { advancePlayerTowardTarget, BASELINE_PLAYER_KINEMATIC_PROFILE, createMatchPlayerProfile, PLAYER_KINEMATIC_BOUNDS, type MatchPlayerProfile, type SpatialState } from './index'

const BASE_RATINGS = Object.fromEntries(PLAYER_TRUTH_RATING_KEYS.map((key) => [key, 50])) as unknown as PlayerTruthRatings
const BASE_TENDENCIES = Object.fromEntries(PLAYER_TRUTH_TENDENCY_KEYS.map((key) => [key, 50])) as unknown as PlayerTruthTendencies
const HOME_TEAM_ID = teamIdFromString('kinematics-home')

describe('MG6B player-specific kinematics', () => {
  it('derives bounded speed, acceleration and agility from their matching Player Truth ratings', () => {
    const low = profileFor('kinematics-low', { SPEED: 1, ACCELERATION: 1, AGILITY: 1 })
    const neutral = profileFor('kinematics-neutral', {})
    const high = profileFor('kinematics-high', { SPEED: 100, ACCELERATION: 100, AGILITY: 100 })

    expect(neutral.kinematics).toEqual(BASELINE_PLAYER_KINEMATIC_PROFILE)
    expect(low.kinematics.maxSpeedMps).toBe(PLAYER_KINEMATIC_BOUNDS.maxSpeedMps.min)
    expect(high.kinematics.maxSpeedMps).toBe(PLAYER_KINEMATIC_BOUNDS.maxSpeedMps.max)
    expect(low.kinematics.accelerationMps2).toBe(PLAYER_KINEMATIC_BOUNDS.accelerationMps2.min)
    expect(high.kinematics.accelerationMps2).toBe(PLAYER_KINEMATIC_BOUNDS.accelerationMps2.max)
    expect(low.kinematics.brakingMps2).toBe(PLAYER_KINEMATIC_BOUNDS.brakingMps2.min)
    expect(high.kinematics.brakingMps2).toBe(PLAYER_KINEMATIC_BOUNDS.brakingMps2.max)
    expect(low.physical).toEqual(high.physical)
  })

  it('moves the same spatial state differently when only the speed rating changes', () => {
    const slower = profileFor('kinematics-slower', { SPEED: 1 })
    const faster = profileFor('kinematics-faster', { SPEED: 100 })
    const initial = spatialFor([slower, faster])
    const target = { x: 24, y: 7 }
    const slowNext = advancePlayerTowardTarget(initial, slower.playerId, target, 4, slower.kinematics)
    const fastNext = advancePlayerTowardTarget(initial, faster.playerId, target, 4, faster.kinematics)
    const slowPosition = slowNext.players.find((player) => player.playerId === slower.playerId)!.position
    const fastPosition = fastNext.players.find((player) => player.playerId === faster.playerId)!.position

    expect(fastPosition.x).toBeGreaterThan(slowPosition.x)
    expect(Math.hypot(fastNext.players.find((player) => player.playerId === faster.playerId)!.velocity.x, fastNext.players.find((player) => player.playerId === faster.playerId)!.velocity.y)).toBeLessThanOrEqual(faster.kinematics.maxSpeedMps)
  })

  it('accelerates and redirects faster for higher acceleration and agility', () => {
    const lessExplosive = profileFor('kinematics-less-explosive', { ACCELERATION: 1 })
    const explosive = profileFor('kinematics-explosive', { ACCELERATION: 100 })
    const initial = spatialFor([lessExplosive, explosive])
    const target = { x: 24, y: 7 }
    const slowStart = advancePlayerTowardTarget(initial, lessExplosive.playerId, target, 0.5, lessExplosive.kinematics)
    const fastStart = advancePlayerTowardTarget(initial, explosive.playerId, target, 0.5, explosive.kinematics)
    const slowSpeed = speedOf(slowStart, lessExplosive.playerId)
    const fastSpeed = speedOf(fastStart, explosive.playerId)

    expect(fastSpeed).toBeGreaterThan(slowSpeed)
    expect(fastSpeed).toBeLessThanOrEqual(explosive.kinematics.maxSpeedMps)

    const lessAgile = profileFor('kinematics-less-agile', { AGILITY: 1 })
    const agile = profileFor('kinematics-agile', { AGILITY: 100 })
    const moving = spatialFor([lessAgile, agile], { x: 2, y: 0 })
    const reverseTarget = { x: 0, y: 7 }
    const lessAgileNext = advancePlayerTowardTarget(moving, lessAgile.playerId, reverseTarget, 0.25, lessAgile.kinematics)
    const agileNext = advancePlayerTowardTarget(moving, agile.playerId, reverseTarget, 0.25, agile.kinematics)

    expect(agileNext.players.find((player) => player.playerId === agile.playerId)!.velocity.x).toBeLessThan(lessAgileNext.players.find((player) => player.playerId === lessAgile.playerId)!.velocity.x)
  })
})

function profileFor(id: string, overrides: Partial<PlayerTruthRatings>): MatchPlayerProfile {
  const player = createPlayer({
    id: playerIdFromString(id),
    firstName: 'Test',
    lastName: 'Athlete',
    gender: 'male',
    nationalityId: countryIdFromString('country'),
    basketball: { primaryPosition: 'SF', ratings: { ...BASE_RATINGS, ...overrides }, tendencies: BASE_TENDENCIES },
    bio: { dateOfBirth: '2008-06-14', heightCm: 198, weightKg: 90, wingspanCm: 207, standingReachCm: 258 },
  })
  return createMatchPlayerProfile(player)
}

function spatialFor(profiles: readonly MatchPlayerProfile[], initialVelocity = { x: 0, y: 0 }): SpatialState {
  return {
    court: createCourtGeometry(courtRulesetForEcosystem('fibaLike', 'men')),
    players: profiles.map((profile) => ({
      playerId: profile.playerId,
      teamId: HOME_TEAM_ID,
      position: { x: 10, y: 7 },
      velocity: initialVelocity,
    })),
    ball: { kind: 'unassigned', position: { x: 14, y: 7 } },
  }
}

function speedOf(spatial: SpatialState, playerId: MatchPlayerProfile['playerId']): number {
  const velocity = spatial.players.find((player) => player.playerId === playerId)!.velocity
  return Math.hypot(velocity.x, velocity.y)
}
