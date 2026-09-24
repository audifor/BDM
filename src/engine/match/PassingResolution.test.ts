import { describe, expect, it } from 'vitest'

import { playerIdFromString } from '@/domain/ids'

import { BASELINE_PLAYER_KINEMATIC_PROFILE, type MatchPlayerProfile } from './MatchPlayerProfile'
import { calculatePassActionProbability, calculatePassCompletionProbability, calculatePassingLaneContext, distanceFromPointToSegment, PASS_RESOLUTION_V1 } from './PassingResolution'

describe('canonical spatial passing resolution', () => {
  it('distinguishes a blocked segment from an open lane and scales with steal skill', () => {
    const passer = position(0, 0)
    const receiver = position(10, 0)
    const weakLaneDefender = { playerId: playerIdFromString('weak-lane-defender'), position: position(5, 0.25), stealAbility: 25 }
    const strongLaneDefender = { ...weakLaneDefender, playerId: playerIdFromString('strong-lane-defender'), stealAbility: 90 }
    const blocked = calculatePassingLaneContext(passer, receiver, [strongLaneDefender])
    const weakBlocked = calculatePassingLaneContext(passer, receiver, [weakLaneDefender])
    const open = calculatePassingLaneContext(passer, receiver, [{ ...strongLaneDefender, position: position(5, 4) }])
    const passerProfile = profile(50)

    expect(blocked.passLengthMeters).toBe(10)
    expect(blocked.lanePressure).toBeGreaterThan(weakBlocked.lanePressure)
    expect(calculatePassCompletionProbability({ passer: passerProfile, passLengthMeters: 10, lanePressure: blocked.lanePressure }))
      .toBeLessThan(calculatePassCompletionProbability({ passer: passerProfile, passLengthMeters: 10, lanePressure: open.lanePressure }))
    expect(open.lanePressure).toBe(0)
    expect(blocked.mostDangerousDefenderId).toBe(strongLaneDefender.playerId)
  })

  it('ignores defenders projected behind the passer or beyond the receiver', () => {
    expect(distanceFromPointToSegment(position(-0.1, 0), position(0, 0), position(10, 0))).toBeUndefined()
    expect(distanceFromPointToSegment(position(10.1, 0), position(0, 0), position(10, 0))).toBeUndefined()
    expect(calculatePassingLaneContext(position(0, 0), position(10, 0), [
      { playerId: playerIdFromString('behind-passer'), position: position(-0.1, 0), stealAbility: 100 },
      { playerId: playerIdFromString('beyond-receiver'), position: position(10.1, 0), stealAbility: 100 },
    ]).lanePressure).toBe(0)
  })

  it('keeps passing skill, pass length, and pass-chain selection bounded', () => {
    const low = profile(20)
    const high = profile(90)
    const probability = (passer: MatchPlayerProfile, passLengthMeters: number) => calculatePassCompletionProbability({ passer, passLengthMeters, lanePressure: 0 })

    expect(probability(high, 5)).toBeGreaterThan(probability(low, 5))
    expect(probability(high, 25)).toBeLessThan(probability(high, 5))
    expect(probability(profile(100), 100)).toBeGreaterThanOrEqual(PASS_RESOLUTION_V1.minimumCompletionProbability)
    expect(calculatePassActionProbability(0, 0)).toBe(0.05)
    expect(calculatePassActionProbability(100, 0)).toBe(0.25)
    expect(calculatePassActionProbability(100, PASS_RESOLUTION_V1.maximumPassesPerPossession)).toBe(0)
  })
})

function position(x: number, y: number) { return { x, y } }

function profile(passing: number): MatchPlayerProfile {
  return {
    playerId: playerIdFromString(`passer-${passing}`),
    primaryPosition: 'PG',
    tendencies: {} as MatchPlayerProfile['tendencies'],
    physical: { heightCm: 190, weightKg: 85, wingspanCm: 195, standingReachCm: 245 },
    kinematics: BASELINE_PLAYER_KINEMATIC_PROFILE,
    offense: { usage: 50, rimAttack: 50, shooting: 50, creation: 50, ballSecurity: 50 },
    passing: { accuracy: passing, vision: passing, timing: passing },
    defense: { pointOfAttack: 50, interior: 50, mobility: 50, steal: 50 },
    rebounding: { impact: 50 },
  }
}
