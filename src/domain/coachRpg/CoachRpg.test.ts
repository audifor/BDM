import { describe, expect, it } from 'vitest'

import { coachPerkIdFromString, coachProfessionalTraitIdFromString, coachSkillIdFromString } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, type StaffProfessionalProfile } from '@/domain/staff'

import {
  applyCoachRpgPreset,
  COACH_RPG_PRESET_DEFINITIONS,
  createCoachDevelopmentState,
  createCoachPerkDefinition,
  createCoachPerkState,
  createCoachProfessionalExperienceLedger,
  createCoachProfessionalTraitDefinition,
  createCoachRpgProfile,
  createCoachRpgPresetDefinition,
  createCoachRpgRequirement,
  createCoachSkillDefinition,
  createCoachSkillState,
  createInitialCoachRpgProfile,
} from './CoachRpg'

const profile: StaffProfessionalProfile = { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as StaffProfessionalProfile['attributes'] }
const skill = createCoachSkillDefinition({ id: coachSkillIdFromString('in-game-adjustments'), name: 'In-Game Adjustments', description: 'Fixture skill', category: 'tactical', maxRank: 2 })
const perk = createCoachPerkDefinition({ id: coachPerkIdFromString('extra-context'), name: 'Extra Context', description: 'Fixture perk', category: 'analysis', maxRank: 2, developmentPointCostByRank: [1, 2] })

describe('Coach RPG domain foundation', () => {
  it('validates an exact, decimal and non-negative experience ledger', () => {
    expect(createCoachProfessionalExperienceLedger({ byAttribute: { ...profile.attributes, coaching: 124.8 } }).byAttribute.coaching).toBe(124.8)
    expect(createCoachProfessionalExperienceLedger({ byAttribute: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 0])) as StaffProfessionalProfile['attributes'] })).toBeDefined()
    expect(() => createCoachProfessionalExperienceLedger({ byAttribute: { ...profile.attributes, coaching: -1 } })).toThrow(RangeError)
    expect(() => createCoachProfessionalExperienceLedger({ byAttribute: { ...profile.attributes, coaching: Number.NaN } })).toThrow(RangeError)
    expect(() => createCoachProfessionalExperienceLedger({ byAttribute: { ...profile.attributes, coaching: Number.POSITIVE_INFINITY } })).toThrow(RangeError)
    const { coaching: _coaching, ...missing } = profile.attributes
    expect(() => createCoachProfessionalExperienceLedger({ byAttribute: missing as typeof profile.attributes })).toThrow(RangeError)
  })

  it('creates zeroed initial state and validates development state', () => {
    const initial = createInitialCoachRpgProfile()
    expect(initial.development).toEqual({ globalProgress: 0, developmentPoints: 0 })
    expect(Object.values(initial.professionalExperience.byAttribute)).toEqual(Array(13).fill(0))
    expect(() => createCoachDevelopmentState({ globalProgress: -1, developmentPoints: 0 })).toThrow(RangeError)
    expect(() => createCoachDevelopmentState({ globalProgress: 0, developmentPoints: 1.5 })).toThrow(RangeError)
  })

  it('validates skill, trait and perk foundations separately', () => {
    expect(createCoachSkillState({ skillId: skill.id, rank: 2 }, skill)).toEqual({ skillId: skill.id, rank: 2 })
    expect(() => createCoachSkillState({ skillId: skill.id, rank: 3 }, skill)).toThrow(RangeError)
    expect(() => createCoachSkillState({ skillId: skill.id, rank: -1 }, skill)).toThrow(RangeError)
    expect(createCoachProfessionalTraitDefinition({ id: coachProfessionalTraitIdFromString('youth-developer'), name: 'Youth Developer', description: 'Fixture trait' }).id).toBe('youth-developer')
    expect(createCoachPerkState({ perkId: perk.id, rank: 2 }, perk)).toEqual({ perkId: perk.id, rank: 2 })
    expect(() => createCoachPerkDefinition({ ...perk, developmentPointCostByRank: [1] })).toThrow(RangeError)
    expect(() => createCoachPerkState({ perkId: perk.id, rank: 3 }, perk)).toThrow(RangeError)
  })

  it('validates small requirement kinds and rejects duplicate professional traits', () => {
    expect(createCoachRpgRequirement({ kind: 'professionalAttribute', attribute: 'coaching', minimum: 50 })).toEqual({ kind: 'professionalAttribute', attribute: 'coaching', minimum: 50 })
    expect(createCoachRpgRequirement({ kind: 'skillRank', skillId: skill.id, minimumRank: 1 })).toEqual({ kind: 'skillRank', skillId: skill.id, minimumRank: 1 })
    expect(createCoachRpgRequirement({ kind: 'perkRank', perkId: perk.id, minimumRank: 1 })).toEqual({ kind: 'perkRank', perkId: perk.id, minimumRank: 1 })
    expect(() => createCoachRpgRequirement({ kind: 'unknown' } as unknown as Parameters<typeof createCoachRpgRequirement>[0])).toThrow(RangeError)
    const trait = coachProfessionalTraitIdFromString('youth-developer')
    expect(() => createCoachRpgProfile({ ...createInitialCoachRpgProfile(), professionalTraits: [trait, trait] })).toThrow('Duplicate Coach professional trait')
  })

  it('applies modest presets only to the shared professional framework', () => {
    expect(applyCoachRpgPreset(profile, 'blank')).toEqual(profile)
    for (const preset of ['balanced', 'tactician', 'developer', 'motivator', 'analyst'] as const) {
      const applied = applyCoachRpgPreset(profile, preset)
      expect(applied).not.toBe(profile)
      for (const [attribute, modifier] of Object.entries(COACH_RPG_PRESET_DEFINITIONS[preset].professionalAttributeModifiers)) expect(applied.attributes[attribute as keyof typeof applied.attributes]).toBe(50 + modifier)
    }
    expect(applyCoachRpgPreset({ attributes: { ...profile.attributes, tacticalKnowledge: 99 } }, 'tactician').attributes.tacticalKnowledge).toBe(100)
    expect(createInitialCoachRpgProfile()).toEqual(createInitialCoachRpgProfile())
    expect(() => createCoachRpgPresetDefinition({ id: 'tactician', professionalAttributeModifiers: { coaching: 9 } })).toThrow(RangeError)
  })

  it('keeps presets separate from experience, skills, traits and perks', () => {
    const initial = createInitialCoachRpgProfile()
    applyCoachRpgPreset(profile, 'analyst')
    expect(initial.professionalExperience.byAttribute.analysis).toBe(0)
    expect(initial.skills).toEqual({})
    expect(initial.professionalTraits).toEqual([])
    expect(initial.perks).toEqual({})
  })

  it('uses the Staff professional profile directly for Head Coach compatibility', () => {
    const headCoachProfessionalProfile: StaffProfessionalProfile = applyCoachRpgPreset(profile, 'developer')
    expect(headCoachProfessionalProfile.attributes.playerDevelopment).toBeGreaterThan(profile.attributes.playerDevelopment)
  })
})
