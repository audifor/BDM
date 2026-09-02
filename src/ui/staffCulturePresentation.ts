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
  innovationOrientation: 'Innovation',
  disciplineOrientation: 'Discipline',
  collaborationOrientation: 'Collaboration',
  hierarchyOrientation: 'Hierarchy',
  riskTolerance: 'Risk tolerance',
  communicationOpenness: 'Communication openness',
  accountabilityStandard: 'Accountability',
  developmentFocus: 'Development focus',
  stabilityOrientation: 'Stability',
  competitiveIntensity: 'Competitive intensity',
  professionalismStandard: 'Professionalism',
  inclusivity: 'Inclusivity',
  transparencyStandard: 'Transparency',
  resultsOrientation: 'Results focus',
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
}

const ALIGNED_GAP = 12
const FRICTION_GAP = 30

/** Pure. Resolves the Staff person's employing Team's Culture; no state, no persistence, no numbers surfaced. */
export function explainStaffCultureFit(world: GameWorld, staffId: StaffPersonId): StaffCultureFitExplanation {
  const employment = world.staffEmploymentByStaffId[staffId]
  const scopeKey = employment?.status === 'employed' ? employment.teamId as string | undefined : undefined
  const state = scopeKey === undefined ? undefined : world.staffCultureStatesByScopeKey[scopeKey]
  if (state === undefined) {
    return { staffId, established: false, band: 'MIXED_FIT', label: 'NOT YET ESTABLISHED', alignedWith: [], frictionWith: [] }
  }

  const fit = calculateStaffCultureFit(world, staffId, state)
  const band = getStaffCultureFitBand(fit.fitScore)
  const alignedWith = STAFF_CULTURE_DIMENSIONS.filter((key) => fit.perDimension[key] <= ALIGNED_GAP).map((key) => STAFF_CULTURE_DIMENSION_LABELS[key])
  const frictionWith = STAFF_CULTURE_DIMENSIONS.filter((key) => fit.perDimension[key] >= FRICTION_GAP).map((key) => STAFF_CULTURE_DIMENSION_LABELS[key])

  return { staffId, established: true, band, label: STAFF_CULTURE_FIT_LABELS[band], alignedWith, frictionWith }
}
