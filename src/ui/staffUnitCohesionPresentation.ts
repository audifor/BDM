import type { TeamId } from '@/domain/ids'
import { STAFF_DEPARTMENT_LABELS } from '@/ui/staffPresentation'
import {
  STAFF_UNIT_COHESION_DIMENSIONS,
  type StaffUnitCohesionDimension,
  type StaffUnitRuntimeView,
} from '@/domain/staffUnitCohesion'
import { buildStaffUnitRuntimeViews } from '@/engine/staff/StaffUnitCohesionEngine'
import { getStaffPerson, type GameWorld } from '@/domain/world'

/**
 * Wave 5C — pure, read-only, qualitative-only projection over `StaffUnitRuntimeView` +
 * the persisted `StaffUnitCohesionState`. Never surfaces a raw 0-100 number. Nothing here is
 * persisted; unit membership and leadership are always re-derived, never stored.
 */

export type StaffUnitCohesionBand = 'VERY_WEAK' | 'WEAK' | 'ADEQUATE' | 'STRONG' | 'VERY_STRONG'

export function getStaffUnitCohesionBand(value: number): StaffUnitCohesionBand {
  if (!Number.isFinite(value)) return 'ADEQUATE'
  if (value < 30) return 'VERY_WEAK'
  if (value < 45) return 'WEAK'
  if (value <= 58) return 'ADEQUATE'
  if (value <= 74) return 'STRONG'
  return 'VERY_STRONG'
}

export const STAFF_UNIT_COHESION_BAND_LABELS: Readonly<Record<StaffUnitCohesionBand, string>> = {
  VERY_WEAK: 'VERY WEAK', WEAK: 'WEAK', ADEQUATE: 'ADEQUATE', STRONG: 'STRONG', VERY_STRONG: 'VERY STRONG',
}

export const STAFF_UNIT_COHESION_DIMENSION_LABELS: Readonly<Record<StaffUnitCohesionDimension, string>> = {
  cohesionTrust: 'Trust',
  communicationFlow: 'Communication flow',
  coordinationQuality: 'Coordination',
  sharedPurpose: 'Shared purpose',
  conflictTolerance: 'Conflict tolerance',
  mutualSupport: 'Mutual support',
  moraleAlignment: 'Morale alignment',
  leadershipCohesion: 'Leadership cohesion',
}

const STRENGTH_PHRASES: Readonly<Record<StaffUnitCohesionDimension, string>> = {
  cohesionTrust: 'The unit trusts each other.',
  communicationFlow: 'Information moves freely inside the unit.',
  coordinationQuality: 'The unit coordinates its work well.',
  sharedPurpose: 'Strong shared purpose.',
  conflictTolerance: 'Disagreement is handled without damage.',
  mutualSupport: 'People look out for each other here.',
  moraleAlignment: 'Morale is aligned across the unit.',
  leadershipCohesion: 'The unit is behind its lead.',
}
const CONCERN_PHRASES: Readonly<Record<StaffUnitCohesionDimension, string>> = {
  cohesionTrust: 'Trust inside the unit is thin.',
  communicationFlow: 'Communication does not flow well.',
  coordinationQuality: 'Coordination is poor.',
  sharedPurpose: 'The unit is not pulling in one direction.',
  conflictTolerance: 'Weak conflict tolerance.',
  mutualSupport: 'Little mutual support.',
  moraleAlignment: 'Morale is uneven across the unit.',
  leadershipCohesion: 'The unit is not aligned behind its lead.',
}

const STRENGTH_THRESHOLD = 68
const CONCERN_THRESHOLD = 38

export interface StaffUnitCohesionDimensionDisplay {
  readonly key: StaffUnitCohesionDimension
  readonly label: string
  readonly band: StaffUnitCohesionBand
}

export interface StaffUnitCohesionExplanation {
  readonly unitKey: string
  readonly established: boolean
  readonly dimensions: readonly StaffUnitCohesionDimensionDisplay[]
  readonly strengths: readonly string[]
  readonly concerns: readonly string[]
}

/** Degrades gracefully: a unit the pipeline has not initialized yet reports NOT YET ESTABLISHED rather than throwing. */
export function explainStaffUnitCohesion(world: GameWorld, unitKey: string): StaffUnitCohesionExplanation {
  const state = world.staffUnitCohesionStatesByUnitKey[unitKey]
  if (state === undefined) return { unitKey, established: false, dimensions: [], strengths: [], concerns: [] }

  const dimensions = STAFF_UNIT_COHESION_DIMENSIONS.map((key) => ({ key, label: STAFF_UNIT_COHESION_DIMENSION_LABELS[key], band: getStaffUnitCohesionBand(state.current[key]) }))
  const strengths = STAFF_UNIT_COHESION_DIMENSIONS.filter((key) => state.current[key] >= STRENGTH_THRESHOLD).map((key) => STRENGTH_PHRASES[key])
  const concerns = STAFF_UNIT_COHESION_DIMENSIONS.filter((key) => state.current[key] <= CONCERN_THRESHOLD).map((key) => CONCERN_PHRASES[key])

  return { unitKey, established: true, dimensions, strengths, concerns }
}

export interface StaffUnitPresentationItem {
  readonly unitKey: string
  readonly departmentLabel: string
  readonly memberCount: number
  readonly leaderLabel: string
  readonly established: boolean
  /** Compact qualitative headline bands for the grid — never raw values. */
  readonly bands: Readonly<Record<StaffUnitCohesionDimension, StaffUnitCohesionBand>>
  readonly view: StaffUnitRuntimeView
}

const NEUTRAL_BANDS: Readonly<Record<StaffUnitCohesionDimension, StaffUnitCohesionBand>> = Object.freeze(
  Object.fromEntries(STAFF_UNIT_COHESION_DIMENSIONS.map((key) => [key, 'ADEQUATE' as StaffUnitCohesionBand])) as Record<StaffUnitCohesionDimension, StaffUnitCohesionBand>,
)

/** One row per resolved runtime unit of the Team. Read-only; departments with no members produce no row. */
export function getStaffUnitsForTeam(world: GameWorld, teamId: TeamId): readonly StaffUnitPresentationItem[] {
  return buildStaffUnitRuntimeViews(world, teamId).map((view) => {
    const state = world.staffUnitCohesionStatesByUnitKey[view.unitKey]
    const leader = view.leaderStaffId === undefined ? undefined : getStaffPerson(world, view.leaderStaffId)
    return {
      unitKey: view.unitKey,
      departmentLabel: STAFF_DEPARTMENT_LABELS[view.department],
      memberCount: view.memberStaffIds.length,
      leaderLabel: leader === undefined ? '—' : `${leader.identity.firstName} ${leader.identity.lastName}`,
      established: state !== undefined,
      bands: state === undefined
        ? NEUTRAL_BANDS
        : Object.fromEntries(STAFF_UNIT_COHESION_DIMENSIONS.map((key) => [key, getStaffUnitCohesionBand(state.current[key])])) as Record<StaffUnitCohesionDimension, StaffUnitCohesionBand>,
      view,
    }
  })
}
