import type { Personality } from './Personality'
import { hasFullSemanticPersonality } from './Personality'
import { SEMANTIC_PERSONALITY_DEFINITIONS } from './SemanticPersonality'

export type CompatibilityRoleContext = 'DISTINCT_ROLES' | 'SAME_ROLE'
export interface Full50PairCompatibility {
  readonly personalAffinity: number
  readonly professionalFit: number
  readonly frictionRisk: number
  readonly initialCompatibility: number
}
type Scores = Readonly<Record<string, number>>
const clamp = (value: number): number => Math.max(0, Math.min(100, value))
const similarity = (a: Scores, b: Scores, key: string): number => 100 - Math.abs(a[key]! - b[key]!)
const average = (a: Scores, b: Scores, key: string): number => Math.floor((a[key]! + b[key]!) / 2)
const familySimilarity = (a: Scores, b: Scores, families: readonly string[]): number => {
  // Same integer/truncation order as BDM-DB PERSON-23F.
  const means = families.map((family) => {
    const dims = SEMANTIC_PERSONALITY_DEFINITIONS.filter((d) => d.family === family)
    if (!dims.length) throw new Error(`Missing semantic family ${family}`)
    return Math.floor(dims.reduce((sum, d) => sum + similarity(a, b, d.code), 0) * 100 / dims.length)
  })
  return Math.floor((Math.floor(means.reduce((sum, n) => sum + n, 0) / means.length) + 50) / 100)
}

/** Exact TypeScript implementation of canonical BDM-DB PERSON-23F pair rules.
 * Calculated lazily for actual interacting people, never all WORLD pairs.
 * A null result means legacy eight-dimensional personality: do not infer
 * compatibility or initialize relationships.
 */
export function evaluateFull50PairCompatibility(
  a: Personality,
  b: Personality,
  context: CompatibilityRoleContext = 'DISTINCT_ROLES',
): Full50PairCompatibility | undefined {
  if (!hasFullSemanticPersonality(a) || !hasFullSemanticPersonality(b)) return undefined
  const left = a.values as Scores
  const right = b.values as Scores
  const s = (name: string) => similarity(left, right, name)
  const avg = (name: string) => average(left, right, name)
  const personalCore = Math.floor((
    20 * s('communication') + 20 * s('empathy') + 15 * s('trust')
    + 15 * s('conflictResolution') + 15 * s('temperament') + 15 * s('humor')
  ) / 100)
  const personalFamily = familySimilarity(left, right, ['EMOTIONAL', 'SOCIAL', 'ETHICS', 'PUBLIC'])
  const personalAffinity = clamp(Math.floor((50 * personalCore + 50 * personalFamily + 50) / 100))
  const professionalCore = Math.floor((
    20 * s('workEthic') + 20 * s('professionalism') + 20 * s('teamOrientation')
    + 15 * s('accountability') + 15 * s('coachability') + 10 * s('adaptability')
  ) / 100)
  const professionalFamily = familySimilarity(left, right, ['MOTIVATION', 'PROFESSIONAL', 'ADAPTATION', 'DECISIONS'])
  let professional = Math.floor((50 * professionalCore + 50 * professionalFamily + 50) / 100)
  const leaderA = left.leadership! >= 70
  const leaderB = right.leadership! >= 70
  if ((leaderA && right.coachability! >= 70) || (leaderB && left.coachability! >= 70)) professional += 5
  const professionalFit = clamp(professional)
  let friction = Math.floor((100 - s('conflictResolution')) / 3)
    + Math.floor((100 - s('communication')) / 3)
    + Math.floor((100 - avg('frustrationTolerance')) / 5)
  if (leaderA && leaderB && avg('conflictResolution') < 55) friction += 10
  if (context === 'SAME_ROLE') {
    const pressure = Math.max(0, avg('ambition') - 60) + Math.max(0, avg('recognitionNeed') - 55)
    const buffer = Math.floor(Math.max(0, avg('teamOrientation') - 50) / 2)
    friction += Math.floor(Math.max(0, pressure - buffer) / 2)
  }
  const frictionRisk = clamp(friction)
  const initialCompatibility = clamp(
    Math.floor((45 * personalAffinity + 55 * professionalFit + 50) / 100)
    - Math.floor(frictionRisk / 4),
  )
  return { personalAffinity, professionalFit, frictionRisk, initialCompatibility }
}
