import type { StaffPersonId } from '@/domain/ids'
import { STAFF_CULTURE_DIMENSIONS, type StaffCultureDimension } from '@/domain/staffCulture'
import { calculateStaffCultureFit } from '@/engine/staff/StaffCultureEngine'
import type { GameWorld } from '@/domain/world'

/**
 * Wave 5C — pure, read-only, qualitative-only projection over the persisted `StaffCultureState`.
 * Never surfaces a raw 0-100 number: the UI only ever receives band labels and phrases, mirroring
 * `staffWorkingRelationshipPresentation`'s style. Nothing here is persisted or mutates the world.
 */

export type StaffCultureBand = 'VERY_LOW' | 'LOW' | 'BALANCED' | 'HIGH' | 'VERY_HIGH'

/** 5 bands, mirroring the `RelationshipFacetBand` 5-band vocabulary shape without reusing its names. */
export function getStaffCultureBand(value: number): StaffCultureBand {
  if (!Number.isFinite(value)) return 'BALANCED'
  if (value < 25) return 'VERY_LOW'
  if (value < 42) return 'LOW'
  if (value <= 58) return 'BALANCED'
  if (value <= 75) return 'HIGH'
  return 'VERY_HIGH'
}

export const STAFF_CULTURE_BAND_LABELS: Readonly<Record<StaffCultureBand, string>> = {
  VERY_LOW: 'VERY LOW', LOW: 'LOW', BALANCED: 'BALANCED', HIGH: 'HIGH', VERY_HIGH: 'VERY HIGH',
}

export const STAFF_CULTURE_DIMENSION_LABELS: Readonly<Record<StaffCultureDimension, string>> = {
  autonomy: 'Autonomy',
  hierarchy: 'Hierarchy',
  collaboration: 'Collaboration',
  accountability: 'Accountability',
  communicationOpenness: 'Communication openness',
  innovation: 'Innovation',
  adaptability: 'Adaptability',
  developmentOrientation: 'Development orientation',
  analyticsOrientation: 'Analytics orientation',
  performanceIntensity: 'Performance intensity',
  stability: 'Stability',
  longTermOrientation: 'Long-term orientation',
  discipline: 'Discipline',
  competitiveness: 'Competitiveness',
}

export interface StaffCultureDimensionDisplay {
  readonly key: StaffCultureDimension
  readonly label: string
  readonly band: StaffCultureBand
}

export interface StaffCultureExplanation {
  readonly scopeKey: string
  readonly established: boolean
  readonly dimensions: readonly StaffCultureDimensionDisplay[]
  readonly defining: readonly string[]
}

/** Degrades gracefully: a scope the pipeline has not initialized yet reports NOT YET ESTABLISHED rather than throwing. */
export function explainStaffCulture(world: GameWorld, scopeKey: string): StaffCultureExplanation {
  const state = world.staffCultureStatesByScopeKey[scopeKey]
  if (state === undefined) return { scopeKey, established: false, dimensions: [], defining: [] }

  const dimensions = STAFF_CULTURE_DIMENSIONS.map((key) => ({ key, label: STAFF_CULTURE_DIMENSION_LABELS[key], band: getStaffCultureBand(state.current[key]) }))
  const defining = dimensions
    .filter((item) => item.band === 'VERY_HIGH' || item.band === 'VERY_LOW')
    .map((item) => item.band === 'VERY_HIGH' ? `Strongly defined by ${item.label.toLowerCase()}.` : `Notably little ${item.label.toLowerCase()}.`)

  return { scopeKey, established: true, dimensions, defining }
}

// ---------------------------------------------------------------------------
// Culture Fit — qualitative band only, never a raw fit score
// ---------------------------------------------------------------------------

export type StaffCultureFitBand = 'STRONG_FIT' | 'GOOD_FIT' | 'MIXED_FIT' | 'MISMATCH' | 'SEVERE_MISMATCH'

export const STAFF_CULTURE_FIT_LABELS: Readonly<Record<StaffCultureFitBand, string>> = {
  STRONG_FIT: 'STRONG FIT', GOOD_FIT: 'GOOD FIT', MIXED_FIT: 'MIXED FIT', MISMATCH: 'MISMATCH', SEVERE_MISMATCH: 'SEVERE MISMATCH',
}

export function getStaffCultureFitBand(fitScore: number): StaffCultureFitBand {
  if (!Number.isFinite(fitScore)) return 'MIXED_FIT'
  if (fitScore >= 82) return 'STRONG_FIT'
  if (fitScore >= 68) return 'GOOD_FIT'
  if (fitScore >= 52) return 'MIXED_FIT'
  if (fitScore >= 38) return 'MISMATCH'
  return 'SEVERE_MISMATCH'
}

export interface StaffCultureFitExplanation {
  readonly staffId: StaffPersonId
  readonly established: boolean
  readonly band: StaffCultureFitBand
  readonly label: string
  readonly alignedWith: readonly string[]
  readonly frictionWith: readonly string[]
  /** Human-readable CAUSES, not just dimension names — e.g. "Prefers more professional autonomy than the current environment provides." */
  readonly causes: readonly string[]
}

const ALIGNED_GAP = 12
const FRICTION_GAP = 30

/** One-line cause phrase per dimension, direction-aware (positive signedGap = lived culture reads HIGHER than this person prefers). */
const FRICTION_CAUSE_PHRASES: Readonly<Record<StaffCultureDimension, { readonly tooHigh: string; readonly tooLow: string }>> = {
  autonomy: { tooLow: 'Prefers more professional autonomy than the current environment provides.', tooHigh: 'Has more decision authority than they are comfortable with.' },
  hierarchy: { tooHigh: 'Finds the organization more centralized/top-down than preferred.', tooLow: 'Would prefer clearer lines of authority than the current flat structure.' },
  collaboration: { tooLow: 'Wants more cross-team collaboration than the organization currently practices.', tooHigh: 'Prefers more independent working than the current collaborative culture.' },
  accountability: { tooLow: 'Expects a higher standard of ownership over decisions and outcomes.', tooHigh: 'Finds accountability standards more demanding than preferred.' },
  communicationOpenness: { tooLow: 'Wants more open feedback and professional disagreement than the culture currently allows.', tooHigh: 'Finds the current level of open debate more than they are comfortable with.' },
  innovation: { tooLow: 'Prefers more openness to new methods than the organization currently shows.', tooHigh: 'Finds the pace of new methods faster than preferred.' },
  adaptability: { tooLow: 'Wants a more adaptable working environment than currently exists.', tooHigh: 'Finds the organization changes approach more often than preferred.' },
  developmentOrientation: { tooLow: "Strong fit with the organization's development orientation is missing here.", tooHigh: 'Finds the development focus heavier than their own priorities.' },
  analyticsOrientation: { tooLow: 'Would prefer a stronger analytical/data-driven approach than currently practiced.', tooHigh: 'Finds the analytical emphasis heavier than preferred.' },
  performanceIntensity: { tooHigh: 'Current performance intensity is above preferred level.', tooLow: 'Wants a higher-intensity, more immediate-results environment than currently exists.' },
  stability: { tooLow: 'Prefers more organizational continuity than currently exists.', tooHigh: 'Finds the organization more change-resistant than preferred.' },
  longTermOrientation: { tooLow: 'Wants a stronger focus on the long-term project than the organization currently shows.', tooHigh: 'Prefers more focus on immediate results than the current long-term orientation.' },
  discipline: { tooLow: 'Expects more rigor/structure in how work is done than currently practiced.', tooHigh: 'Finds the current standards more rigid than preferred.' },
  competitiveness: { tooLow: 'Wants a more competitive environment than currently exists.', tooHigh: 'Finds the competitive intensity higher than preferred.' },
}

/** One-line phrase for a dimension that is a genuine, meaningful ALIGNMENT — not just "close enough". */
function alignedCausePhrase(key: StaffCultureDimension): string {
  return `Strong fit with the organization's ${STAFF_CULTURE_DIMENSION_LABELS[key].toLowerCase()}.`
}

/** Pure. Resolves the Staff person's employing Team's Culture; no state, no persistence, no numbers surfaced. */
export function explainStaffCultureFit(world: GameWorld, staffId: StaffPersonId): StaffCultureFitExplanation {
  const employment = world.staffEmploymentByStaffId[staffId]
  const scopeKey = employment?.status === 'employed' ? employment.teamId as string | undefined : undefined
  const state = scopeKey === undefined ? undefined : world.staffCultureStatesByScopeKey[scopeKey]
  if (state === undefined) {
    return { staffId, established: false, band: 'MIXED_FIT', label: 'NOT YET ESTABLISHED', alignedWith: [], frictionWith: [], causes: [] }
  }

  const fit = calculateStaffCultureFit(world, staffId, state)
  const band = getStaffCultureFitBand(fit.fitScore)
  const alignedWith = STAFF_CULTURE_DIMENSIONS.filter((key) => fit.perDimension[key] <= ALIGNED_GAP).map((key) => STAFF_CULTURE_DIMENSION_LABELS[key])
  const frictionKeys = STAFF_CULTURE_DIMENSIONS.filter((key) => fit.perDimension[key] >= FRICTION_GAP)
  const frictionWith = frictionKeys.map((key) => STAFF_CULTURE_DIMENSION_LABELS[key])

  const frictionCauses = frictionKeys.map((key) => {
    const phrases = FRICTION_CAUSE_PHRASES[key]
    return fit.signedGap[key] > 0 ? phrases.tooHigh : phrases.tooLow
  })
  const alignedCauses = frictionKeys.length === 0
    ? STAFF_CULTURE_DIMENSIONS.filter((key) => fit.perDimension[key] <= ALIGNED_GAP).slice(0, 2).map(alignedCausePhrase)
    : []
  const causes = [...frictionCauses, ...alignedCauses]

  return { staffId, established: true, band, label: STAFF_CULTURE_FIT_LABELS[band], alignedWith, frictionWith, causes }
}
