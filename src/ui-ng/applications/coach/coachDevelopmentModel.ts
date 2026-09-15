import type { CoachPerkId, CoachSkillId } from '@/domain/ids'
import type { CoachRpgProfile } from '@/domain/coachRpg'
import {
  COACH_CAREER_FOCUS_PERK_LIMIT,
  COACH_PERK_CATALOG,
  COACH_SKILL_CATALOG,
  COACH_SKILL_MAX_RANK,
  COACH_SKILL_RANK_COSTS,
  type CoachPerkCatalogEntry,
  type CoachPerkType,
} from '@/engine/coach'
import { STAFF_PROFESSIONAL_ATTRIBUTE_LABELS, formatCamelCaseLabel } from '@/ui/staffPresentation'

/**
 * Presentation-only projection of the canonical Coach RPG state. It never mutates the world, never
 * re-derives an engine rule and never persists: every field is either read straight from
 * `CoachRpgProfile` or from the canonical `COACH_SKILL_CATALOG` / `COACH_PERK_CATALOG`.
 */

export type CoachPerkRarity = 'common' | 'rare' | 'epic' | 'legendary'

export const COACH_PERK_RARITY_LABELS: Readonly<Record<CoachPerkRarity, string>> = {
  common: 'COMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
}

export const COACH_PERK_TYPE_LABELS: Readonly<Record<CoachPerkType, string>> = {
  specialization: 'SPECIALIZATION',
  careerFocus: 'CAREER FOCUS',
}

/**
 * Rarity tiers are a UI classification, not product state — canonical perks carry no rarity field.
 * The tier pair comes from the canonical `type` (specializations are the entry tier, career focus
 * the capstone tier); inside each type the catalog's declaration order splits the group in half,
 * so later entries read as the more prestigious variant. Deterministic for a given catalog.
 */
const PERK_RARITY_TIERS: Readonly<Record<CoachPerkType, readonly [CoachPerkRarity, CoachPerkRarity]>> = {
  specialization: ['common', 'rare'],
  careerFocus: ['epic', 'legendary'],
}

export function coachPerkRarity(perkId: CoachPerkId): CoachPerkRarity {
  const entry = COACH_PERK_CATALOG.find((item) => item.id === perkId)
  if (entry === undefined) return 'common'
  const group = COACH_PERK_CATALOG.filter((item) => item.type === entry.type)
  const index = group.findIndex((item) => item.id === perkId)
  const [lower, upper] = PERK_RARITY_TIERS[entry.type]
  return index >= Math.ceil(group.length / 2) ? upper : lower
}

/** camelCase canonical id -> display name. Card casing is applied in CSS, never stored. */
export function coachSkillName(skillId: CoachSkillId): string {
  return formatCamelCaseLabel(skillId)
}

export function coachPerkName(perkId: CoachPerkId): string {
  return formatCamelCaseLabel(perkId)
}

export interface CoachSkillRow {
  readonly id: CoachSkillId
  readonly name: string
  readonly category: string
  readonly attribute: string
  readonly rank: number
  readonly maxRank: number
  readonly nextRankCost: number | undefined
  readonly maxed: boolean
  readonly progress: number
}

export function buildCoachSkillRows(rpg: CoachRpgProfile): readonly CoachSkillRow[] {
  return COACH_SKILL_CATALOG.map((entry) => {
    const rank = rpg.skills[entry.id]?.rank ?? 0
    const maxRank = entry.maxRank
    const nextRank = rank + 1
    return {
      id: entry.id,
      name: coachSkillName(entry.id),
      category: entry.category.toUpperCase(),
      attribute: STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[entry.primaryAttribute],
      rank,
      maxRank,
      nextRankCost: rank >= maxRank ? undefined : COACH_SKILL_RANK_COSTS[nextRank] ?? 0,
      maxed: rank >= maxRank,
      progress: rank / maxRank,
    }
  })
}

export interface CoachPerkRow {
  readonly id: CoachPerkId
  readonly name: string
  readonly type: CoachPerkType
  readonly typeLabel: string
  readonly rarity: CoachPerkRarity
  readonly rarityLabel: string
  readonly owned: boolean
  readonly cost: number
  readonly requirements: string
}

export function buildCoachPerkRows(rpg: CoachRpgProfile): readonly CoachPerkRow[] {
  return COACH_PERK_CATALOG.map((entry) => {
    const rarity = coachPerkRarity(entry.id)
    return {
      id: entry.id,
      name: coachPerkName(entry.id),
      type: entry.type,
      typeLabel: COACH_PERK_TYPE_LABELS[entry.type],
      rarity,
      rarityLabel: COACH_PERK_RARITY_LABELS[rarity],
      owned: rpg.perks[entry.id] !== undefined,
      cost: entry.cost,
      requirements: coachPerkRequirements(entry),
    }
  })
}

function coachPerkRequirements(entry: CoachPerkCatalogEntry): string {
  const parts = [
    ...entry.skills.map(([skillId, rank]) => `${formatCamelCaseLabel(skillId)} rank ${rank}`),
    ...entry.attributes.map(([attribute, value]) => `${STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[attribute]} ${value}`),
  ]
  return parts.length === 0 ? 'No prerequisites' : `Requires ${parts.join(' · ')}`
}

export interface CoachDevelopmentSummary {
  readonly skillCount: number
  readonly averageSkillRank: number
  readonly totalSkillRanks: number
  readonly skillRankCapacity: number
  readonly developmentPoints: number
  readonly globalProgress: number
  readonly perkCount: number
  readonly unlockedPerkCount: number
  readonly careerFocusUsed: number
  readonly careerFocusLimit: number
}

export function buildCoachDevelopmentSummary(rpg: CoachRpgProfile): CoachDevelopmentSummary {
  const totalSkillRanks = COACH_SKILL_CATALOG.reduce((sum, entry) => sum + (rpg.skills[entry.id]?.rank ?? 0), 0)
  const skillCount = COACH_SKILL_CATALOG.length
  const unlockedPerkCount = COACH_PERK_CATALOG.filter((entry) => rpg.perks[entry.id] !== undefined).length
  return {
    skillCount,
    averageSkillRank: Number((totalSkillRanks / skillCount).toFixed(1)),
    totalSkillRanks,
    skillRankCapacity: skillCount * COACH_SKILL_MAX_RANK,
    developmentPoints: rpg.development.developmentPoints,
    globalProgress: rpg.development.globalProgress,
    perkCount: COACH_PERK_CATALOG.length,
    unlockedPerkCount,
    careerFocusUsed: COACH_PERK_CATALOG.filter((entry) => entry.type === 'careerFocus' && rpg.perks[entry.id] !== undefined).length,
    careerFocusLimit: COACH_CAREER_FOCUS_PERK_LIMIT,
  }
}

const COACH_RPG_REASON_LABELS: Readonly<Record<string, string>> = {
  coachProfileUnavailable: 'Coach profile unavailable.',
  invalidSkill: 'Unknown skill.',
  maxRankReached: 'This skill is already at maximum rank.',
  insufficientDevelopmentPoints: 'Not enough development points.',
  attributeRequirementNotMet: 'A professional attribute requirement is not met.',
  invalidPerk: 'Unknown perk.',
  alreadyOwned: 'This perk is already owned.',
  skillRequirementNotMet: 'A prerequisite skill rank is not met.',
  careerFocusLimitReached: `Career focus limit reached (maximum ${COACH_CAREER_FOCUS_PERK_LIMIT}).`,
  invalidTraitEvidence: 'Invalid trait evidence.',
}

/** Never invents a rule: it only translates the canonical engine failure reason for display. */
export function coachRpgReasonLabel(reason: string): string {
  return COACH_RPG_REASON_LABELS[reason] ?? 'Operation not available.'
}
