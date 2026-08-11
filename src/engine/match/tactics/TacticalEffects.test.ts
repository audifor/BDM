import { describe, expect, it } from 'vitest'
import { playerIdFromString } from '@/domain/ids'
import { createDefaultTacticalPlan, validateTacticalPlan } from './MatchTacticalPlan'
import { applyPaceToPossessionDuration, applyShotProfile, calculateTacticalDefenseModifier, tacticalShotFactor, tacticalUsageWeight } from './TacticalEffects'

describe('pre-match tactical plan', () => {
  it('defaults to neutral balanced values and validates only Alpha defense presets', () => {
    const plan = createDefaultTacticalPlan()
    expect(plan).toEqual({ pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } })
    expect(() => validateTacticalPlan({ ...plan, pace: 3 as 2 }, [])).toThrow()
    expect(() => validateTacticalPlan({ ...plan, pace: 0.5 as 0 }, [])).toThrow()
    expect(() => validateTacticalPlan({ ...plan, defense: { interior: 2, perimeter: 2 } }, [])).toThrow()
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
})
