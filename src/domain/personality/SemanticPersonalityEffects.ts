import type { Personality } from './Personality'
import { PERSONALITY_DIMENSIONS } from './Personality'
import { SEMANTIC_PERSONALITY_DEFINITIONS } from './SemanticPersonality'
import type { MoraleEventSource } from '@/domain/morale'

/** Each new semantic dimension has a gameplay trigger in at least one
 * EXISTING morale-event source. These are provisional balance rules,
 * not psychometric or clinically derived coefficients.
 */
const SOURCES_BY_FAMILY: Readonly<Record<string, readonly MoraleEventSource[]>> = {
  MOTIVATION: ['playingTime', 'careerEvent'],
  PROFESSIONAL: ['developmentEvent', 'professionalInteraction'],
  ETHICS: ['teamEvent', 'careerEvent'],
  EMOTIONAL: ['matchResult', 'playingTime'],
  SOCIAL: ['teamEvent', 'professionalInteraction'],
  ADAPTATION: ['developmentEvent', 'careerEvent'],
  DECISIONS: ['matchResult', 'careerEvent'],
  PUBLIC: ['professionalInteraction', 'teamEvent'],
}
const REDUCED_REACTIVITY = new Set([
  'persistence', 'goalFocus', 'discipline', 'preparation', 'conscientiousness',
  'accountability', 'integrity', 'contractualCommitment',
  'stressTolerance', 'impulseControl', 'emotionalStability', 'frustrationTolerance', 'composure',
  'empathy', 'trust', 'conflictResolution', 'flexibility', 'uncertaintyTolerance',
  'decisionPatience', 'selfReflection', 'publicResponsibility',
])
const LEGACY_KEYS = new Set<string>(PERSONALITY_DIMENSIONS)
export const SEMANTIC_MORALE_RULES = SEMANTIC_PERSONALITY_DEFINITIONS
  .filter((dimension) => !LEGACY_KEYS.has(dimension.code))
  .map((dimension) => ({
    code: dimension.code,
    family: dimension.family,
    sources: SOURCES_BY_FAMILY[dimension.family]!,
    /** Negative sign: high score reduces intensity, positive amplifies it. */
    direction: REDUCED_REACTIVITY.has(dimension.code) ? -1 : 1,
  }))
/** Multiplicative sensitivity only. Never creates an event or alters its sign.
 * Pure, deterministic; 8-dimension legacy profiles keep exact old behavior.
 * This first slice activates all 42 added dimensions in existing morale
 * sources; specific negotiation/press/locker-room decisions are later phases.
 */
export function semanticMoraleSensitivity(
  personality: Personality,
  source: MoraleEventSource,
): number {
  const scores = personality.values
  const applicable = SEMANTIC_MORALE_RULES.filter((r) => r.sources.includes(source))
  if (applicable.some((r) => scores[r.code] === undefined)) return 1
  const variation = applicable.reduce((sum, rule) =>
    sum + rule.direction * ((scores[rule.code]! - 50) / 50), 0) / applicable.length
  return Math.max(0.85, Math.min(1.15, 1 + variation * 0.15))
}
