import type { DecisionQualityContext, DecisionQualityFn } from '@/domain/responsibility'
import { calculateStaffRoleProficiencyByRoleId } from '@/domain/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

/**
 * Training-domain `DecisionQualityFn` (see `@/domain/responsibility`). Pure, deterministic:
 * same context + same seed always produces the same 0-100 integer. Never mutates `world`, never
 * uses unseeded randomness.
 *
 * `seed` is expected to already be the canonical decision-quality seed
 * (`staff-decision-quality-v1:${responsibilityId}:${gameDate}`, built by the execution caller —
 * see `ScheduledTrainingEngine.ts`); this module does not add its own prefix.
 *
 * Formula (bounded, centralized, prototype tuning constants — same discipline as MatchEngine's
 * documented "prototype" formulas):
 *
 *   base        = canonical role proficiency for the holder's actual assigned role
 *                 (reuses `calculateStaffRoleProficiencyByRoleId` — no duplicate weight table)
 *   personality = bounded ±PERSONALITY_SWING adjustment from `professionalism` (executes the
 *                 job as trained) and `adaptability` (handles context well), both centered on
 *                 50 so an average personality contributes zero
 *   jitter      = bounded ±JITTER_SWING seeded noise, keyed off `seed` — models day-to-day
 *                 variance in execution without being unbounded or unseeded
 *
 *   quality = clamp(round(base + personality + jitter), 0, 100)
 *
 * Workload is present in `DecisionQualityContext` for future domains, but no overload penalty is
 * applied here: the canon reserves that for Wave 3+ (see docs/STAFF_SYSTEM_V2.md §11.2).
 */
const PERSONALITY_SWING = 6
const JITTER_SWING = 5

export const trainingQuality: DecisionQualityFn = (context: DecisionQualityContext, seed: string): number => {
  const base = calculateStaffRoleProficiencyByRoleId(context.staff, context.roleId)
  const personality = personalityAdjustment(context)
  const jitter = seededJitter(seed)
  return clampToInteger(base + personality + jitter, 0, 100)
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
