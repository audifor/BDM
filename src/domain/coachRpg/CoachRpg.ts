import {
  coachPerkIdFromString,
  coachProfessionalTraitIdFromString,
  coachSkillIdFromString,
  type CoachPerkId,
  type CoachProfessionalTraitId,
  type CoachSkillId,
} from '@/domain/ids'
import {
  createStaffProfessionalProfile,
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS,
  type StaffProfessionalAttributeKey,
  type StaffProfessionalProfile,
} from '@/domain/staff'
import { requireNonEmptyString } from '@/domain/validation'

export type CoachRpgCategory = 'tactical' | 'development' | 'leadership' | 'analysis' | 'management'
export type CoachRpgPreset = 'blank' | 'balanced' | 'tactician' | 'developer' | 'motivator' | 'analyst'

export interface CoachProfessionalExperienceLedger { readonly byAttribute: Readonly<Record<StaffProfessionalAttributeKey, number>> }
export interface CoachDevelopmentState { readonly globalProgress: number; readonly developmentPoints: number }
export interface CoachSkillDefinition { readonly id: CoachSkillId; readonly name: string; readonly description: string; readonly category: CoachRpgCategory; readonly maxRank: number }
export interface CoachSkillState { readonly skillId: CoachSkillId; readonly rank: number }
export interface CoachProfessionalTraitDefinition { readonly id: CoachProfessionalTraitId; readonly name: string; readonly description: string }
export interface CoachPerkDefinition { readonly id: CoachPerkId; readonly name: string; readonly description: string; readonly category: CoachRpgCategory; readonly maxRank: number; readonly developmentPointCostByRank: readonly number[] }
export interface CoachPerkState { readonly perkId: CoachPerkId; readonly rank: number }
export interface CoachRpgProfile { readonly professionalExperience: CoachProfessionalExperienceLedger; readonly development: CoachDevelopmentState; readonly skills: Readonly<Record<CoachSkillId, CoachSkillState>>; readonly professionalTraits: readonly CoachProfessionalTraitId[]; readonly perks: Readonly<Record<CoachPerkId, CoachPerkState>> }
export type CoachRpgRequirement =
  | { readonly kind: 'professionalAttribute'; readonly attribute: StaffProfessionalAttributeKey; readonly minimum: number }
  | { readonly kind: 'skillRank'; readonly skillId: CoachSkillId; readonly minimumRank: number }
  | { readonly kind: 'perkRank'; readonly perkId: CoachPerkId; readonly minimumRank: number }
export interface CoachRpgPresetDefinition { readonly id: CoachRpgPreset; readonly professionalAttributeModifiers: Readonly<Partial<Record<StaffProfessionalAttributeKey, number>>> }

export const COACH_RPG_PRESET_DEFINITIONS: Readonly<Record<CoachRpgPreset, CoachRpgPresetDefinition>> = {
  blank: createCoachRpgPresetDefinition({ id: 'blank', professionalAttributeModifiers: {} }),
  balanced: createCoachRpgPresetDefinition({ id: 'balanced', professionalAttributeModifiers: { coaching: 2, tacticalKnowledge: 2, playerDevelopment: 2, leadership: 2, communication: 2 } }),
  tactician: createCoachRpgPresetDefinition({ id: 'tactician', professionalAttributeModifiers: { tacticalKnowledge: 6, analysis: 4, adaptability: 3, coaching: 2 } }),
  developer: createCoachRpgPresetDefinition({ id: 'developer', professionalAttributeModifiers: { playerDevelopment: 6, coaching: 4, communication: 3, potentialEvaluation: 3 } }),
  motivator: createCoachRpgPresetDefinition({ id: 'motivator', professionalAttributeModifiers: { motivation: 6, leadership: 5, communication: 4, discipline: 3 } }),
  analyst: createCoachRpgPresetDefinition({ id: 'analyst', professionalAttributeModifiers: { analysis: 6, tacticalKnowledge: 5, talentEvaluation: 4, potentialEvaluation: 3 } }),
}

export function createCoachProfessionalExperienceLedger(input: CoachProfessionalExperienceLedger): CoachProfessionalExperienceLedger {
  const values = input.byAttribute as Record<string, number>
  requireExactAttributeKeys(values, 'Coach professional experience')
  for (const key of STAFF_PROFESSIONAL_ATTRIBUTE_KEYS) requireFiniteNonNegative(values[key], `Coach professional experience ${key}`)
  return { byAttribute: input.byAttribute }
}

export function createCoachDevelopmentState(input: CoachDevelopmentState): CoachDevelopmentState {
  requireFiniteNonNegative(input.globalProgress, 'Coach global progress')
  requireNonNegativeInteger(input.developmentPoints, 'Coach development points')
  return { globalProgress: input.globalProgress, developmentPoints: input.developmentPoints }
}

export function createCoachSkillDefinition(input: CoachSkillDefinition): CoachSkillDefinition {
  return { id: coachSkillIdFromString(input.id), name: requireNonEmptyString(input.name, 'Coach skill name'), description: requireNonEmptyString(input.description, 'Coach skill description'), category: requireCategory(input.category), maxRank: requirePositiveInteger(input.maxRank, 'Coach skill max rank') }
}

export function createCoachSkillState(input: CoachSkillState, definition: CoachSkillDefinition): CoachSkillState {
  if (input.skillId !== definition.id) throw new RangeError('Coach skill state does not match definition')
  requireNonNegativeInteger(input.rank, 'Coach skill rank')
  if (input.rank > definition.maxRank) throw new RangeError('Coach skill rank exceeds max rank')
  return { skillId: coachSkillIdFromString(input.skillId), rank: input.rank }
}

export function createCoachProfessionalTraitDefinition(input: CoachProfessionalTraitDefinition): CoachProfessionalTraitDefinition {
  return { id: coachProfessionalTraitIdFromString(input.id), name: requireNonEmptyString(input.name, 'Coach professional trait name'), description: requireNonEmptyString(input.description, 'Coach professional trait description') }
}

export function createCoachPerkDefinition(input: CoachPerkDefinition): CoachPerkDefinition {
  const maxRank = requirePositiveInteger(input.maxRank, 'Coach perk max rank')
  if (input.developmentPointCostByRank.length !== maxRank) throw new RangeError('Coach perk cost table must match max rank')
  for (const cost of input.developmentPointCostByRank) requirePositiveInteger(cost, 'Coach perk development point cost')
  return { id: coachPerkIdFromString(input.id), name: requireNonEmptyString(input.name, 'Coach perk name'), description: requireNonEmptyString(input.description, 'Coach perk description'), category: requireCategory(input.category), maxRank, developmentPointCostByRank: [...input.developmentPointCostByRank] }
}

export function createCoachPerkState(input: CoachPerkState, definition: CoachPerkDefinition): CoachPerkState {
  if (input.perkId !== definition.id) throw new RangeError('Coach perk state does not match definition')
  requireNonNegativeInteger(input.rank, 'Coach perk rank')
  if (input.rank > definition.maxRank) throw new RangeError('Coach perk rank exceeds max rank')
  return { perkId: coachPerkIdFromString(input.perkId), rank: input.rank }
}

export function createCoachRpgRequirement(input: CoachRpgRequirement): CoachRpgRequirement {
  if (input.kind === 'professionalAttribute') { if (!STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.includes(input.attribute)) throw new RangeError('Invalid Coach RPG professional attribute requirement'); requireFiniteNonNegative(input.minimum, 'Coach RPG professional attribute minimum'); return { ...input } }
  if (input.kind === 'skillRank') { requireNonNegativeInteger(input.minimumRank, 'Coach RPG skill minimum rank'); return { ...input, skillId: coachSkillIdFromString(input.skillId) } }
  if (input.kind === 'perkRank') { requireNonNegativeInteger(input.minimumRank, 'Coach RPG perk minimum rank'); return { ...input, perkId: coachPerkIdFromString(input.perkId) } }
  throw new RangeError('Invalid Coach RPG requirement')
}

export function createCoachRpgPresetDefinition(input: CoachRpgPresetDefinition): CoachRpgPresetDefinition {
  if (!['blank', 'balanced', 'tactician', 'developer', 'motivator', 'analyst'].includes(input.id)) throw new RangeError('Invalid Coach RPG preset')
  const modifiers = input.professionalAttributeModifiers as Record<string, number>
  for (const [attribute, modifier] of Object.entries(modifiers)) {
    if (!STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.includes(attribute as StaffProfessionalAttributeKey)) throw new RangeError('Invalid Coach RPG preset attribute')
    if (!Number.isInteger(modifier) || modifier < 0 || modifier > 8) throw new RangeError('Coach RPG preset modifier must be an integer from 0 to 8')
  }
  return { id: input.id, professionalAttributeModifiers: { ...input.professionalAttributeModifiers } }
}

export function createCoachRpgProfile(input: CoachRpgProfile): CoachRpgProfile {
  const professionalExperience = createCoachProfessionalExperienceLedger(input.professionalExperience)
  const development = createCoachDevelopmentState(input.development)
  const skills = createSkillStateRecord(input.skills)
  const perks = createPerkStateRecord(input.perks)
  const traits = input.professionalTraits.map((id) => coachProfessionalTraitIdFromString(id))
  if (new Set(traits).size !== traits.length) throw new RangeError('Duplicate Coach professional trait')
  return { professionalExperience, development, skills, professionalTraits: traits, perks }
}

export function createInitialCoachRpgProfile(): CoachRpgProfile {
  return createCoachRpgProfile({ professionalExperience: { byAttribute: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 0])) as Record<StaffProfessionalAttributeKey, number> }, development: { globalProgress: 0, developmentPoints: 0 }, skills: {}, professionalTraits: [], perks: {} })
}

/** Applies a modest starting distribution only; it never changes RPG state. */
export function applyCoachRpgPreset(professional: StaffProfessionalProfile, preset: CoachRpgPreset): StaffProfessionalProfile {
  const validated = createStaffProfessionalProfile(professional)
  const definition = COACH_RPG_PRESET_DEFINITIONS[preset]
  if (definition === undefined) throw new RangeError('Invalid Coach RPG preset')
  return createStaffProfessionalProfile({ attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, clamp(validated.attributes[key] + (definition.professionalAttributeModifiers[key] ?? 0), 0, 100)])) as Record<StaffProfessionalAttributeKey, number> })
}

function createSkillStateRecord(input: Readonly<Record<CoachSkillId, CoachSkillState>>): Readonly<Record<CoachSkillId, CoachSkillState>> { const result = Object.create(null) as Record<CoachSkillId, CoachSkillState>; for (const [id, state] of Object.entries(input) as [CoachSkillId, CoachSkillState][]) { if (id !== state.skillId) throw new RangeError('Coach skill record key does not match state'); result[id] = { skillId: coachSkillIdFromString(state.skillId), rank: nonNegativeIntegerValue(state.rank, 'Coach skill rank') } } return result }
function createPerkStateRecord(input: Readonly<Record<CoachPerkId, CoachPerkState>>): Readonly<Record<CoachPerkId, CoachPerkState>> { const result = Object.create(null) as Record<CoachPerkId, CoachPerkState>; for (const [id, state] of Object.entries(input) as [CoachPerkId, CoachPerkState][]) { if (id !== state.perkId) throw new RangeError('Coach perk record key does not match state'); result[id] = { perkId: coachPerkIdFromString(state.perkId), rank: nonNegativeIntegerValue(state.rank, 'Coach perk rank') } } return result }
function requireExactAttributeKeys(values: Record<string, number>, name: string): void { if (Object.keys(values).length !== STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.length || STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.some((key) => !Object.hasOwn(values, key))) throw new RangeError(`${name} must contain exactly every professional attribute`) }
function requireFiniteNonNegative(value: number, name: string): void { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`) }
function requireNonNegativeInteger(value: number, name: string): void { requireFiniteNonNegative(value, name); if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`) }
function nonNegativeIntegerValue(value: number, name: string): number { requireNonNegativeInteger(value, name); return value }
function requirePositiveInteger(value: number, name: string): number { if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`); return value }
function requireCategory(value: CoachRpgCategory): CoachRpgCategory { if (!['tactical', 'development', 'leadership', 'analysis', 'management'].includes(value)) throw new RangeError('Invalid Coach RPG category'); return value }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)) }
