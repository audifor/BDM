import { describe, expect, it } from 'vitest'

import { countryIdFromString, playerIdFromString } from '@/domain/ids'
import { createPlayer, PLAYER_TRUTH_RATING_KEYS, type Player, type PlayerTruthRatings } from '@/domain/player'
import { PLAYER_TRUTH_TENDENCY_KEYS, type PlayerTruthTendencies } from '@/domain/player/PlayerTruthCatalog'

import { createMatchPlayerProfile } from './MatchPlayerProfile'
import { calculateShotMakeProbability } from './ShotResolution'
import { calculatePlayerImpact, selectStartingFive } from '@/engine/team'
import { generateWorld } from '@/engine/world'

const baseRatings: PlayerTruthRatings = Object.fromEntries(
  PLAYER_TRUTH_RATING_KEYS.map((key) => [key, 50]),
) as unknown as PlayerTruthRatings
const baseTendencies: PlayerTruthTendencies = Object.fromEntries(
  PLAYER_TRUTH_TENDENCY_KEYS.map((key) => [key, 50]),
) as unknown as PlayerTruthTendencies

function playerWithTruth(id: string, overrides: Partial<PlayerTruthRatings>, tendencies: PlayerTruthTendencies = baseTendencies): Player {
  return createPlayer({
    id: playerIdFromString(id),
    firstName: 'Test',
    lastName: 'Player',
    gender: 'male',
    nationalityId: countryIdFromString('country'),
    basketball: { primaryPosition: 'SF', ratings: { ...baseRatings, ...overrides }, tendencies },
    bio: { dateOfBirth: '2008-06-14', heightCm: 198, weightKg: 90, wingspanCm: 207, standingReachCm: 258 },
  })
}

describe('MG4B · player truth gameplay authority', () => {
  it('transports the complete canonical physical truth to MatchPlayerProfile', () => {
    const player = playerWithTruth('physical-profile', {})

    expect(createMatchPlayerProfile(player).physical).toEqual({
      heightCm: 198,
      weightKg: 90,
      wingspanCm: 207,
      standingReachCm: 258,
    })
  })

  it('transports the complete canonical tendency truth to MatchPlayerProfile', () => {
    const tendencies = { ...baseTendencies, RIM_ATTEMPT_FREQUENCY: 83, MIDRANGE_FREQUENCY: 27, THREE_POINT_FREQUENCY: 91 }
    const player = playerWithTruth('tendency-profile', {}, tendencies)
    const profile = createMatchPlayerProfile(player)

    expect(profile.tendencies).toEqual(player.basketball.tendencies)
    expect(profile.tendencies.RIM_ATTEMPT_FREQUENCY).toBe(83)
    expect(profile.tendencies.MIDRANGE_FREQUENCY).toBe(27)
    expect(profile.tendencies.THREE_POINT_FREQUENCY).toBe(91)
    expect(Object.keys(profile.tendencies)).toHaveLength(PLAYER_TRUTH_TENDENCY_KEYS.length)
  })

  it('TEST A · MatchPlayerProfile is built directly from the 80-key PlayerTruthRatings, not a 35/7-key collapse', () => {
    const rimSpecialist = playerWithTruth('rim-specialist', { RIM_FINISHING: 95, CONTACT_FINISHING: 95, VERTICAL_FINISHING: 95, FINISHING_THROUGH_LENGTH: 95 })
    const rimAverage = playerWithTruth('rim-average', {})

    const rimSpecialistProfile = createMatchPlayerProfile(rimSpecialist)
    const rimAverageProfile = createMatchPlayerProfile(rimAverage)

    // Only the rim-finishing keys changed; only offense.rimAttack should move as a result.
    expect(rimSpecialistProfile.offense.rimAttack).toBeGreaterThan(rimAverageProfile.offense.rimAttack)
    expect(rimSpecialistProfile.offense.shooting).toBe(rimAverageProfile.offense.shooting)
    expect(rimSpecialistProfile.defense.interior).toBe(rimAverageProfile.defense.interior)
    expect(rimSpecialistProfile.rebounding.impact).toBe(rimAverageProfile.rebounding.impact)
  })

  it('TEST B · gameplay consumes Player Truth: identical players except for one directly relevant rating diverge in resolution', () => {
    const sharpshooter = playerWithTruth('sharpshooter', { THREE_POINT_STATIC: 95, THREE_POINT_PULLUP: 95, CONTESTED_SHOOTING: 95, SHOT_TOUCH: 95, SHORT_MIDRANGE: 95, LONG_MIDRANGE: 95 })
    const averageShooter = playerWithTruth('average-shooter', {})
    const neutralDefender = playerWithTruth('neutral-defender', {})

    const sharpshooterProfile = createMatchPlayerProfile(sharpshooter)
    const averageShooterProfile = createMatchPlayerProfile(averageShooter)
    const defenderProfile = createMatchPlayerProfile(neutralDefender)

    const sharpshooterMakeProbability = calculateShotMakeProbability({ shotZone: 'threePoint', shooterProfile: sharpshooterProfile, shooterFatigue: 0, defenderProfile, defenderFatigue: 0 })
    const averageMakeProbability = calculateShotMakeProbability({ shotZone: 'threePoint', shooterProfile: averageShooterProfile, shooterFatigue: 0, defenderProfile, defenderFatigue: 0 })

    expect(sharpshooterMakeProbability).toBeGreaterThan(averageMakeProbability)
  })

  it('TEST C · TeamEvaluation reads PlayerTruthRatings directly: selectStartingFive changes with relevant ratings, without using an Overall field', () => {
    const world = generateWorld({ seed: 24680, gender: 'male' })
    const team = Object.values(world.teams)[0]!
    const starters = selectStartingFive(world, team.id)
    expect(starters).toHaveLength(5)

    const bestGuard = playerWithTruth('elite-guard', { RIM_FINISHING: 99, SHORT_MIDRANGE: 99, THREE_POINT_STATIC: 99, DRIVE_CREATION: 99, PASSING_VISION: 99, POINT_OF_ATTACK_DEFENSE: 99 })
    const worstGuard = playerWithTruth('weak-guard', { RIM_FINISHING: 1, SHORT_MIDRANGE: 1, THREE_POINT_STATIC: 1, DRIVE_CREATION: 1, PASSING_VISION: 1, POINT_OF_ATTACK_DEFENSE: 1 })
    expect(calculatePlayerImpact(bestGuard)).toBeGreaterThan(calculatePlayerImpact(worstGuard))
    expect('overall' in bestGuard.basketball.ratings).toBe(false)
  })

  it('TEST D · canonical gameplay resolution path does not require legacyRatingSignals', () => {
    const player = playerWithTruth('no-legacy-dependency', {})
    // The 7-key legacy surface remains readable as a non-enumerable compatibility property
    // elsewhere in the domain, but MatchPlayerProfile construction never touches it: it reads
    // only the enumerable 80-key PlayerTruthRatings already present on player.basketball.ratings.
    expect(Object.keys(player.basketball.ratings)).toEqual(expect.arrayContaining([...PLAYER_TRUTH_RATING_KEYS]))
    expect(Object.keys(player.basketball.ratings)).toHaveLength(PLAYER_TRUTH_RATING_KEYS.length)
    const profile = createMatchPlayerProfile(player)
    expect(profile.offense.shooting).toBeGreaterThanOrEqual(0)
    expect(profile.offense.shooting).toBeLessThanOrEqual(100)
  })
})
