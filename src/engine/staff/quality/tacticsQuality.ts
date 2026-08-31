import type { DecisionQualityContext, DecisionQualityFn } from '@/domain/responsibility'
import { calculateStaffRoleProficiencyByRoleId } from '@/domain/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { calculateOverloadPenalty } from '../overloadPenalty'

/**
 * Tactics-domain `DecisionQualityFn` (see `@/domain/responsibility`). Pure, deterministic:
 * same context + same seed always produces the same 0-100 integer. Never mutates `world`, never
 * uses unseeded randomness, never reads hidden opponent truth (it only ever receives the
 * canonical `DecisionQualityContext` — Staff/personality/workload — no Player data at all).
 *
 * `seed` is expected to already be the canonical decision-quality seed
 * (`staff-decision-quality-v1:${responsibilityId}:${gameDate}`), built by the caller.
 *
 * Formula (bounded, centralized, prototype tuning constants — same discipline as `trainingQuality`):
 *
 *   base        = canonical role proficiency for the holder's actual assigned role
 *                 (reuses `calculateStaffRoleProficiencyByRoleId` — no duplicate weight table)
 *   personality = bounded ±PERSONALITY_SWING adjustment from `professionalism` and `adaptability`
 *                 (reading and adjusting to an upcoming opponent), both centered on 50
 *   jitter      = bounded ±JITTER_SWING seeded noise, keyed off `seed`
 *   overload    = shared Wave 3 workload-overload penalty (`calculateOverloadPenalty`) —
 *                 `utilization <= 1` always yields `0`
 *
 *   quality = clamp(round(base + personality + jitter - overload), 0, 100)
 *
 * This score bounds the stability/selection of `OppositionScoutingReport` recommendations — it
 * never grants access to opponent private truth; recommendations are always derived separately
 * from `OrganizationKnowledge`/public evidence.
 */
const PERSONALITY_SWING = 6
const JITTER_SWING = 5

export const tacticsQuality: DecisionQualityFn = (context: DecisionQualityContext, seed: string): number => {
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
