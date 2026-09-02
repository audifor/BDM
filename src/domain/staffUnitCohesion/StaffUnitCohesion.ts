import type { GameDate } from '@/domain/date'
import { parseGameDate } from '@/domain/date'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { StaffDepartment } from '@/domain/staff'
import { requireNonEmptyString } from '@/domain/validation'

/**
 * Wave 5C — Staff Unit Cohesion.
 *
 * World Database alignment: a canonical STAFF_UNIT aggregate does not exist yet. A "unit" is
 * therefore RESOLVED at runtime as (Team × StaffDepartment) from the existing canonical
 * `TeamStaffAssignment` + `STAFF_ROLE_REGISTRY.department` authorities, exactly the way
 * `StaffHumanContext` resolves employment identity from `StaffEmployment` — a temporary adapter,
 * not a `Team+Department === StaffUnit` assumption baked into the engine. `StaffUnitRuntimeView`
 * is the ONLY place that resolution happens, so a future canonical `organizationId`/`staffUnitId`
 * only requires changing how `unitKey`/`memberStaffIds` are resolved there.
 *
 * These 8 dimensions are GROUP-level ("how well does this unit work as a unit"). They are a
 * different semantic layer from the 8 dyadic `RELATIONSHIP_DIMENSION_KEYS` (PERSON↔PERSON,
 * -100..100) which are their INPUT, not their duplicate, and from the 14 organization-level
 * `STAFF_CULTURE_DIMENSIONS` (norms, not working quality). `stability` intentionally names both a
 * Culture dimension and a Cohesion dimension — organizational continuity-as-a-norm and this unit's
 * lived continuity-of-membership are different questions that happen to share the correct English
 * word; vocabulary uniqueness was never the goal.
 */

/** 8 canonical Staff Unit Cohesion dimensions. Integer 0-100, 50 = neutral/no-signal. */
export const STAFF_UNIT_COHESION_DIMENSIONS = [
  'communication',
  'coordination',
  'roleClarity',
  'mutualSupport',
  'sharedPurpose',
  'trustClimate',
  'leadershipAlignment',
  'stability',
] as const
export type StaffUnitCohesionDimension = typeof STAFF_UNIT_COHESION_DIMENSIONS[number]

export type StaffUnitCohesionValues = Readonly<Record<StaffUnitCohesionDimension, number>>

/**
 * Pure runtime projection — NEVER persisted. Membership and leadership are always re-derived from
 * the canonical assignment/role registry data, so they can never drift from the real world state.
 */
export interface StaffUnitRuntimeView {
  /** `${teamId}:${department}` — the temporary Team×Department unit identity; see module doc comment. */
  readonly unitKey: string
  readonly teamId: TeamId
  readonly department: StaffDepartment
  readonly memberStaffIds: readonly StaffPersonId[]
  /** Highest-seniority member (director > senior > standard > junior), tie-broken by lowest staff id. Derived, never stored. */
  readonly leaderStaffId?: StaffPersonId
}

export function staffUnitKeyFor(teamId: TeamId, department: StaffDepartment): string {
  return `${teamId}:${department}`
}

export interface StaffUnitCohesionState {
  readonly unitKey: string
  /** Where the unit's real relationship signals currently point — recomputed each weekly tick. */
  readonly target: StaffUnitCohesionValues
  /** Where the lived cohesion actually is — moves toward `target` faster than Culture, slower than a single event. */
  readonly current: StaffUnitCohesionValues
  readonly lastEvaluatedOn: GameDate
}

/** Self-contained clamp. Integer 0-100, non-finite -> neutral 50. */
export function clampUnitCohesionValue(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function clampUnitCohesionValues(values: StaffUnitCohesionValues): StaffUnitCohesionValues {
  const clamped: Record<StaffUnitCohesionDimension, number> = {} as never
  for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) clamped[dimension] = clampUnitCohesionValue(values[dimension])
  return clamped
}

/** Neutral cohesion — a unit with no members, no pairs, or no relationship signal at all. */
export function neutralUnitCohesionValues(): StaffUnitCohesionValues {
  const neutral: Record<StaffUnitCohesionDimension, number> = {} as never
  for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) neutral[dimension] = 50
  return neutral
}

export function createStaffUnitCohesionState(input: StaffUnitCohesionState): StaffUnitCohesionState {
  return {
    unitKey: requireNonEmptyString(input.unitKey, 'Staff unit cohesion unit key'),
    target: clampUnitCohesionValues(input.target),
    current: clampUnitCohesionValues(input.current),
    lastEvaluatedOn: parseGameDate(input.lastEvaluatedOn),
  }
}
