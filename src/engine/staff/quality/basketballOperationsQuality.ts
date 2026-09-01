import type { DecisionQualityContext, DecisionQualityFn } from '@/domain/responsibility'
import { calculateStaffRoleProficiencyByRoleId } from '@/domain/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { calculateOverloadPenalty } from '../overloadPenalty'

/** Canonical, deterministic quality for Basketball Operations advisory work. */
export const basketballOperationsQuality: DecisionQualityFn = (context: DecisionQualityContext, seed: string) => {
  const base = calculateStaffRoleProficiencyByRoleId(context.staff, context.roleId)
  const personality = ((context.personality.values.professionalism - 50) + (context.personality.values.adaptability - 50)) * .06
  const jitter = new SeededRandomSource(hashStringToSeed(seed)).nextFloat(-5, 5)
  return Math.max(0, Math.min(100, Math.round(base + personality + jitter - calculateOverloadPenalty(context.workload))))
}
