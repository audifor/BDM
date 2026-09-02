import type { GameDate } from '@/domain/date'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { getRelationshipDimensions, type RelationshipDimensionKey } from '@/domain/relationships'
import { staffRoleDefinition, type StaffDepartment } from '@/domain/staff'
import {
  clampUnitCohesionValue,
  createStaffUnitCohesionState,
  neutralUnitCohesionValues,
  staffUnitKeyFor,
  STAFF_UNIT_COHESION_DIMENSIONS,
  type StaffUnitCohesionDimension,
  type StaffUnitCohesionState,
  type StaffUnitCohesionValues,
  type StaffUnitRuntimeView,
} from '@/domain/staffUnitCohesion'
import { getTeamStaffAssignments, type GameWorld } from '@/domain/world'

import { seniorityWeight } from './StaffCultureEngine'

/**
 * Wave 5C — Staff Unit Cohesion derivation.
 *
 * Consumes ONLY existing sparse `RelationshipProfile` data between members of the unit. It never
 * materializes a full pairwise Staff×Staff matrix: it iterates the profiles that already exist in
 * `world.relationshipsByKey` and keeps the ones whose BOTH endpoints are unit members.
 *
 * Missing data is always NEUTRAL, never a penalty: a unit BDM has no relationship signal for reads
 * as exactly 50 across all 8 dimensions.
 */

/**
 * Resolves the runtime units of a Team from the canonical assignment + role-registry data.
 *
 * This is the ONLY unit-resolution seam. A future canonical `organizationId`/`staffUnitId` swap only
 * needs to change how `unitKey`/`memberStaffIds` are produced here — every consumer downstream just
 * reads a `StaffUnitRuntimeView`. A department with no members produces NO row at all.
 */
export function buildStaffUnitRuntimeViews(world: GameWorld, teamId: TeamId): readonly StaffUnitRuntimeView[] {
  const byDepartment = new Map<StaffDepartment, StaffPersonId[]>()
  for (const assignment of getTeamStaffAssignments(world, teamId)) {
    if (world.staffPeopleById[assignment.staffPersonId] === undefined) continue
    const department = staffRoleDefinition(assignment.role).department
    const members = byDepartment.get(department)
    if (members === undefined) byDepartment.set(department, [assignment.staffPersonId])
    else if (!members.includes(assignment.staffPersonId)) members.push(assignment.staffPersonId)
  }

  const views: StaffUnitRuntimeView[] = []
  for (const [department, members] of [...byDepartment.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (members.length === 0) continue
    const memberStaffIds = [...members].sort((a, b) => a.localeCompare(b))
    const leaderStaffId = deriveUnitLeader(world, teamId, memberStaffIds)
    views.push({
      unitKey: staffUnitKeyFor(teamId, department),
      teamId,
      department,
      memberStaffIds,
      ...(leaderStaffId === undefined ? {} : { leaderStaffId }),
    })
  }
  return views
}

/** Highest seniority wins; ties broken deterministically by lowest staff id string. Derived, never stored. */
function deriveUnitLeader(world: GameWorld, teamId: TeamId, memberStaffIds: readonly StaffPersonId[]): StaffPersonId | undefined {
  const assignments = getTeamStaffAssignments(world, teamId)
  let best: { readonly staffId: StaffPersonId; readonly weight: number } | undefined
  for (const staffId of memberStaffIds) {
    const assignment = assignments.find((item) => item.staffPersonId === staffId)
    if (assignment === undefined) continue
    const weight = seniorityWeight(staffRoleDefinition(assignment.role).seniority)
    if (best === undefined || weight > best.weight || (weight === best.weight && staffId.localeCompare(best.staffId) < 0)) {
      best = { staffId, weight }
    }
  }
  return best?.staffId
}

/** Relationship facets live on -100..100; cohesion lives on 0..100. */
function rescale(relationshipValue: number): number {
  return (relationshipValue + 100) / 2
}

interface PairReading {
  readonly sourceId: string
  readonly targetId: string
  readonly dimensions: Readonly<Record<RelationshipDimensionKey, number>>
}

function collectPairReadings(world: GameWorld, memberStaffIds: readonly StaffPersonId[]): readonly PairReading[] {
  if (memberStaffIds.length < 2) return []
  const members = new Set<string>(memberStaffIds)
  const readings: PairReading[] = []
  for (const profile of Object.values(world.relationshipsByKey)) {
    if (!members.has(profile.sourceId) || !members.has(profile.targetId)) continue
    if (profile.sourceId === profile.targetId) continue
    readings.push({ sourceId: profile.sourceId, targetId: profile.targetId, dimensions: getRelationshipDimensions(profile) })
  }
  return readings
}

/**
 * Trimmed, coverage-aware aggregation of one relationship facet across the unit's real pairs.
 *
 * - Outlier tolerance: with 3+ readings, the single most extreme high AND low reading are dropped,
 *   so one furious or one euphoric pair can never dominate a whole unit's dimension.
 * - Coverage awareness: the trimmed average is blended toward neutral-50 in proportion to how few
 *   of the `n*(n-1)` possible directed pairs actually carry data, so a unit with one known
 *   relationship out of twenty never reads as if the whole unit felt that way.
 */
function aggregateFacet(readings: readonly PairReading[], memberCount: number, read: (dimensions: Readonly<Record<RelationshipDimensionKey, number>>) => number): number {
  const possiblePairs = Math.max(1, memberCount * (memberCount - 1))
  const values = readings.map((reading) => rescale(read(reading.dimensions)))
  if (values.length === 0) return 50

  const trimmed = values.length >= 3 ? trimExtremes(values) : values
  const rawAverage = trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length
  const coverage = Math.min(1, readings.length / possiblePairs)
  return rawAverage * coverage + 50 * (1 - coverage)
}

function trimExtremes(values: readonly number[]): readonly number[] {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.slice(1, sorted.length - 1)
}

/** Blend of every facet, used where a unit-wide "general mood" reading is the honest signal. */
function allFacetAverage(dimensions: Readonly<Record<RelationshipDimensionKey, number>>): number {
  const keys: readonly RelationshipDimensionKey[] = ['trust', 'professionalRespect', 'communicationQuality', 'collaboration', 'personalCloseness', 'perceivedSupport', 'reliability', 'professionalAlignment']
  return keys.reduce((sum, key) => sum + dimensions[key], 0) / keys.length
}

export function deriveStaffUnitCohesionTarget(world: GameWorld, unitView: StaffUnitRuntimeView): StaffUnitCohesionValues {
  const memberCount = unitView.memberStaffIds.length
  const readings = collectPairReadings(world, unitView.memberStaffIds)
  if (readings.length === 0) return neutralUnitCohesionValues()

  const facet = (read: (dimensions: Readonly<Record<RelationshipDimensionKey, number>>) => number): number => aggregateFacet(readings, memberCount, read)

  // Leadership cohesion reads only the leader's own relationships with the rest of the unit. With no
  // leader, or no real relationship data involving them, it degrades to the unit-wide average.
  const leaderId = unitView.leaderStaffId
  const leaderReadings = leaderId === undefined ? [] : readings.filter((reading) => reading.sourceId === leaderId || reading.targetId === leaderId)
  const leadershipCohesion = leaderReadings.length === 0
    ? facet(allFacetAverage)
    : aggregateFacet(leaderReadings, memberCount, (dimensions) => (dimensions.trust + dimensions.professionalRespect + dimensions.perceivedSupport) / 3)

  const values: Record<StaffUnitCohesionDimension, number> = {
    cohesionTrust: facet((dimensions) => dimensions.trust),
    communicationFlow: facet((dimensions) => dimensions.communicationQuality),
    coordinationQuality: facet((dimensions) => dimensions.collaboration),
    sharedPurpose: facet((dimensions) => dimensions.professionalAlignment),
    // Conflict tolerance = how much friction the unit can absorb: reliability (predictability under
    // pressure) blended with professional respect (disagreeing without contempt).
    conflictTolerance: facet((dimensions) => (dimensions.reliability + dimensions.professionalRespect) / 2),
    mutualSupport: facet((dimensions) => dimensions.perceivedSupport),
    moraleAlignment: facet((dimensions) => (allFacetAverage(dimensions) + dimensions.personalCloseness) / 2),
    leadershipCohesion,
  }

  const clamped: Record<StaffUnitCohesionDimension, number> = {} as never
  for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) clamped[dimension] = clampUnitCohesionValue(values[dimension])
  return clamped
}

export function initializeStaffUnitCohesionState(world: GameWorld, unitView: StaffUnitRuntimeView): StaffUnitCohesionState {
  const target = deriveStaffUnitCohesionTarget(world, unitView)
  return createStaffUnitCohesionState({ unitKey: unitView.unitKey, target, current: target, lastEvaluatedOn: world.currentDate })
}

/** Cohesion moves faster than Culture — how a unit works together shifts sooner than what an organization believes. */
export const STAFF_UNIT_COHESION_INERTIA_RATE = 0.1

export function progressStaffUnitCohesionState(current: StaffUnitCohesionState, target: StaffUnitCohesionValues, evaluatedOn: GameDate): StaffUnitCohesionState {
  const next: Record<StaffUnitCohesionDimension, number> = {} as never
  for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) {
    const from = current.current[dimension]
    next[dimension] = clampUnitCohesionValue(from + (target[dimension] - from) * STAFF_UNIT_COHESION_INERTIA_RATE)
  }
  return createStaffUnitCohesionState({ unitKey: current.unitKey, target, current: next, lastEvaluatedOn: evaluatedOn })
}
