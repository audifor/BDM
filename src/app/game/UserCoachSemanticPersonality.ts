import { createPersonality, type Personality } from '@/domain/personality'
import { SEMANTIC_PERSONALITY_DIMENSIONS, type SemanticPersonalityDimension } from '@/domain/personality/SemanticPersonality'
import type { UserCoachBackground, UserCoachAmbition } from '@/domain/coachRpg'
import type { UserCoachDisposition } from './UserCoachCreator'

/** A genuinely *new, fictional* Coach can start with a full canonical 50/50 profile.
 * Never call this for historical WorldDB people: their 50 values belong to the
 * sourced WorldDB personality table and must not be replaced by generated fiction.
 *
 * This is a deterministic game-generation seed, not a psychological assessment.
 * Preserves the exact 50 semantic dimensions of PERSON-23C without a parallel model.
 */
export function generateCreatedCoachPerson50(
  identitySeed: string,
  input: { readonly background: UserCoachBackground; readonly ambition?: UserCoachAmbition; readonly disposition: UserCoachDisposition },
): Personality {
  const values = Object.fromEntries(SEMANTIC_PERSONALITY_DIMENSIONS.map((key) => [
    key,
    50 + (stableHash(`bs19:person50:${identitySeed}:${key}`) % 21) - 10,
  ])) as Record<SemanticPersonalityDimension, number>

  const raise = (key: SemanticPersonalityDimension, minimum: number) => { values[key] = Math.max(minimum, values[key]) }
  const lower = (key: SemanticPersonalityDimension, maximum: number) => { values[key] = Math.min(maximum, values[key]) }

  if (input.disposition === 'ambitious') {
    raise('ambition', 76)
    raise('achievementDrive', 68)
    lower('loyalty', 55)
  } else if (input.disposition === 'loyal') {
    raise('loyalty', 76)
    raise('reciprocity', 67)
    lower('ambition', 55)
  }

  const backgroundDimensions: Readonly<Record<UserCoachBackground, readonly SemanticPersonalityDimension[]>> = {
    rookie: [],
    formerPlayer: ['competitiveness', 'socialConfidence'],
    inDebt: ['persistence', 'goalFocus'],
    academyCoach: ['learningOrientation', 'empathy'],
    videoAnalyst: ['preparation', 'tacticalAwareness'],
    formerAssistant: ['adaptability', 'teamOrientation'],
  }
  for (const key of backgroundDimensions[input.background]) raise(key, 62)

  const ambitionDimensions: Readonly<Record<UserCoachAmbition, SemanticPersonalityDimension>> = {
    firstTitle: 'achievementDrive',
    talentDeveloper: 'coachability',
    eliteReputation: 'statusSeeking',
    financialFreedom: 'goalFocus',
  }
  raise(ambitionDimensions[input.ambition ?? 'firstTitle'], 66)

  return createPersonality({ values })
}

function stableHash(value: string): number {
  let result = 2166136261
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0
  return result
}
