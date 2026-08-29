export const PERSONALITY_DIMENSIONS = ['ambition', 'professionalism', 'loyalty', 'resilience', 'temperament', 'teamOrientation', 'adaptability', 'competitiveness'] as const
export type PersonalityDimension = typeof PERSONALITY_DIMENSIONS[number]
export interface Personality { readonly values: Readonly<Record<PersonalityDimension, number>> }

export function createPersonality(input: Personality): Personality {
  for (const dimension of PERSONALITY_DIMENSIONS) { const value = input.values[dimension]; if (!Number.isInteger(value) || value < 0 || value > 100) throw new RangeError(`Personality ${dimension} must be an integer from 0 to 100`) }
  return { values: { ...input.values } }
}
/** Identity-isolated and deliberately middle-weighted; it never consumes world generation RNG. */
export function generatePersonality(personId: string): Personality {
  let state = hash(`personality-v1:${personId}`)
  const value = () => { state = (state * 1664525 + 1013904223) >>> 0; const first = state % 37 - 18; state = (state * 1664525 + 1013904223) >>> 0; return Math.max(0, Math.min(100, 50 + first + state % 25 - 12)) }
  return createPersonality({ values: { ambition: value(), professionalism: value(), loyalty: value(), resilience: value(), temperament: value(), teamOrientation: value(), adaptability: value(), competitiveness: value() } })
}
function hash(value: string): number { let result = 2166136261; for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619); return result >>> 0 }
