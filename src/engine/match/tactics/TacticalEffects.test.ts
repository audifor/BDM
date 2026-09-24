import { describe, expect, it } from 'vitest'
import { playerIdFromString } from '@/domain/ids'
import { createDefaultTacticalPlan, TACTICAL_DEFENSE_OPTIONS, validateTacticalPlan } from './MatchTacticalPlan'
import { applyPaceToPossessionDuration, applyShotProfile, calculateTacticalDefenseModifier, spatialShotAttemptWeight, tacticalShotFactor, tacticalUsageWeight } from './TacticalEffects'
import { choosePossessionOutcome } from '../MatchEngine'
import { createCourtGeometry } from '@/domain/court'
import { calculateShotLocation } from '../ShotResolution'

describe('pre-match tactical plan', () => {
  it('defaults to neutral balanced values and validates only Alpha defense presets', () => {
    const plan = createDefaultTacticalPlan()
    expect(plan).toEqual({ pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } })
    expect(() => validateTacticalPlan({ ...plan, pace: 3 as 2 }, [])).toThrow()
    expect(() => validateTacticalPlan({ ...plan, pace: 0.5 as 0 }, [])).toThrow()
    expect(() => validateTacticalPlan({ ...plan, defense: { interior: 2, perimeter: 2 } }, [])).toThrow()
    for (const { interior, perimeter } of TACTICAL_DEFENSE_OPTIONS) expect(() => validateTacticalPlan({ ...plan, defense: { interior, perimeter } }, [])).not.toThrow()
  })
  it('applies pace, shot profile, featured usage, and defensive trade-offs without randomness', () => {
    expect([-2, -1, 0, 1, 2].map((level) => applyPaceToPossessionDuration(18, level as -2))).toEqual([22, 20, 18, 16, 14])
    expect(applyPaceToPossessionDuration(2, 2)).toBe(6)
    expect(applyPaceToPossessionDuration(40, -2)).toBe(30)
    expect([-2, -1, 0, 1, 2].map((level) => tacticalShotFactor(level as -2))).toEqual([0.6, 0.8, 1, 1.2, 1.4])
    const plan = { ...createDefaultTacticalPlan(), shotProfile: { rim: 2 as const, midRange: 0 as const, threePoint: -2 as const } }
    expect(applyShotProfile({ rim: 10, midRange: 10, threePoint: 10 }, plan)).toEqual({ rim: 14, midRange: 10, threePoint: 6 })
    const featured = playerIdFromString('featured')
    expect(tacticalUsageWeight(featured, 40, [featured], { ...createDefaultTacticalPlan(), featuredPlayerId: featured })).toBe(50)
    expect(tacticalUsageWeight(featured, 40, [], { ...createDefaultTacticalPlan(), featuredPlayerId: featured })).toBe(40)
    expect(['rim', 'midRange', 'threePoint'].map((zone) => calculateTacticalDefenseModifier({ ...createDefaultTacticalPlan(), defense: { interior: 2, perimeter: -1 } }, zone as 'rim'))).toEqual([6, -3, -3])
    expect(['rim', 'midRange', 'threePoint'].map((zone) => calculateTacticalDefenseModifier({ ...createDefaultTacticalPlan(), defense: { interior: -1, perimeter: 2 } }, zone as 'rim'))).toEqual([-3, 4, 6])
  })

  it('uses tendencies and shot profile for the available spatial zone without changing that zone', () => {
    const plan = { ...createDefaultTacticalPlan(), shotProfile: { rim: 2 as const, midRange: 0 as const, threePoint: -2 as const } }
    const weights = { rim: 80, midRange: 40, threePoint: 60 }
    const court = createCourtGeometry('FIBA')
    const basket = court.baskets.right
    const location = calculateShotLocation({ x: basket.x - 1, y: basket.y }, basket, court)
    const weight = spatialShotAttemptWeight(weights, plan, location.shotZone)
    const random = { next: () => 0.4 } as never

    expect(location.shotZone).toBe('rim')
    expect(weight).toBeGreaterThan(spatialShotAttemptWeight(weights, createDefaultTacticalPlan(), location.shotZone))
    expect(choosePossessionOutcome(0.1, 0.2, weight, random)).toBe('fieldGoalAttempt')
    expect(choosePossessionOutcome(0.1, 0.2, 0.25, random)).toBe('passAttempt')
    expect(calculateShotLocation({ x: basket.x - 1, y: basket.y }, basket, court).shotZone).toBe('rim')
  })
})
