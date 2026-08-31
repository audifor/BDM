import type { DecisionQualityContext, DecisionQualityFn } from '@/domain/responsibility'
import { calculateStaffRoleProficiencyByRoleId } from '@/domain/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { calculateOverloadPenalty } from '../overloadPenalty'

/**
 * Recruiting-domain `DecisionQualityFn` (see `@/domain/responsibility`). Pure, deterministic:
 * same context + same seed always produces the same 0-100 integer. Never mutates `world`, never
 * uses unseeded randomness, and never reads Recruit/Player truth (ratings, potential) at all — it
 * only ever receives the canonical `DecisionQualityContext` (Staff/personality/workload), exactly
 * like `scoutingQuality`/`tacticsQuality`.
 *
 * `seed` is expected to already be the canonical decision-quality seed
 * (`staff-decision-quality-v1:${responsibilityId}:${gameDate}`), built by the caller.
 *
 * Formula (bounded, centralized, prototype tuning constants — same discipline as `scoutingQuality`):
 *
 *   base        = canonical role proficiency for the holder's actual assigned role
 *                 (reuses `calculateStaffRoleProficiencyByRoleId` — no duplicate weight table)
 *   personality = bounded ±PERSONALITY_SWING adjustment from `professionalism` and `adaptability`,
 *                 both centered on 50
 *   jitter      = bounded ±JITTER_SWING seeded noise, keyed off `seed`
 *   overload    = shared Wave 3 workload-overload penalty (`calculateOverloadPenalty`) —
 *                 `utilization <= 1` always yields `0`
 *
 *   quality = clamp(round(base + personality + jitter - overload), 0, 100)
 *
 * This score bounds ONLY the size/stability of the candidate band and recommendation confidence in
 * `@/engine/recruiting/RecruitingAdvisory.ts` — it never reveals hidden Recruit/Player truth; every
 * recommendation is still derived exclusively from `OrganizationKnowledge`/existing valuation and
 * the existing bounded recruiting-target ranking (`rankAiRecruitingTargets`).
 */
const PERSONALITY_SWING = 6
const JITTER_SWING = 5

export const recruitingQuality: DecisionQualityFn = (context: DecisionQualityContext, seed: string): number => {
  const base = calculateStaffRoleProficiencyByRoleId(context.staff, context.roleId)
  const personality = personalityAdjustment(context)
  const jitter = seededJitter(seed)
  const overloadPenalty = calculateOverloadPenalty(context.workload)
  return clampToInteger(base + personality + jitter - overloadPenalty, 0, 100)
}

function personalityAdjustment(context: DecisionQualityContext): number {
  const { professionalism, adaptability } = context.personality.values
  const professionalismDelta = ((professionalism - 50) / 50) * (PERSONALITY_SWING / 2)
  const adaptabilityDelta = ((adaptability - 50) / 50) * (PERSONALITY_SWING / 2)
  return professionalismDelta + adaptabilityDelta
}

function seededJitter(seed: string): number {
  const random = new SeededRandomSource(hashStringToSeed(seed))
  return random.nextFloat(-JITTER_SWING, JITTER_SWING)
}

function clampToInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}
