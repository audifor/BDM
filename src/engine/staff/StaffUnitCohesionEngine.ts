import type { GameDate } from '@/domain/date'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { getRelationshipDimensions, type RelationshipDimensionKey } from '@/domain/relationships'
import { staffRoleDefinition, calculateStaffRoleProficiencyByRoleId, type StaffDepartment } from '@/domain/staff'
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
import { calculateStaffWorkload, getResponsibilitiesHeldByStaff, getTeamStaffAssignments, type GameWorld } from '@/domain/world'

import { seniorityWeight } from './StaffCultureEngine'

/**
 * Wave 5C — Staff Unit Cohesion derivation.
 *
 * Consumes existing sparse `RelationshipProfile` data between members of the unit for the dyadic
 * dimensions, plus structural (non-relationship) signals — canonical role assignment, Responsibility
 * ownership/coverage, workload balance, and employment/assignment continuity — for the dimensions
 * that are legitimately about STRUCTURE rather than lived rapport. It never materializes a full
 * pairwise Staff×Staff matrix: it iterates the profiles that already exist in
 * `world.relationshipsByKey` and keeps the ones whose BOTH endpoints are unit members.
 *
 * Missing RELATIONSHIP data is always NEUTRAL, never a penalty — a unit BDM has no relationship
 * signal for reads as exactly 50 on the dyadic dimensions. Structural dimensions (`roleClarity`,
 * `stability`) can still carry real signal even with zero relationship data, because they do not
 * depend on relationships at all.
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
    if (world.staffEmploymentByStaffId[assignment.staffPersonId] !== undefined && world.staffEmploymentByStaffId[assignment.staffPersonId]!.status !== 'employed') continue
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

/**
 * Canonical leader tiebreak: director > senior > standard > junior; ties broken by role proficiency
 * (existing `calculateStaffRoleProficiencyByRoleId` authority — no new reporting-relationship
 * concept); final tie broken by lowest staff id string, for a fully stable, deterministic result.
 * Derived, never stored.
 */
function deriveUnitLeader(world: GameWorld, teamId: TeamId, memberStaffIds: readonly StaffPersonId[]): StaffPersonId | undefined {
  const assignments = getTeamStaffAssignments(world, teamId)
  let best: { readonly staffId: StaffPersonId; readonly weight: number; readonly proficiency: number } | undefined
  for (const staffId of memberStaffIds) {
    const assignment = assignments.find((item) => item.staffPersonId === staffId)
    if (assignment === undefined) continue
    const person = world.staffPeopleById[staffId]
    const weight = seniorityWeight(staffRoleDefinition(assignment.role).seniority)
    const proficiency = person === undefined ? 0 : calculateStaffRoleProficiencyByRoleId(person, assignment.role)
    if (
      best === undefined
      || weight > best.weight
      || (weight === best.weight && proficiency > best.proficiency)
      || (weight === best.weight && proficiency === best.proficiency && staffId.localeCompare(best.staffId) < 0)
    ) {
      best = { staffId, weight, proficiency }
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

// ---------------------------------------------------------------------------
// Structural (non-relationship) signals — real evidence even with zero relationship data
// ---------------------------------------------------------------------------

/**
 * roleClarity: are this unit's members' responsibilities actually owned and unambiguous? Reads the
 * canonical `Responsibility` records held by this unit's own members (never a duplicate
 * StaffUnitAssignment concept) and scores by real ownership coverage. Each held responsibility
 * always has exactly one concrete owner by construction, so the honest signal is COVERAGE — how
 * many of the unit's members actually hold at least one responsibility versus how many hold none —
 * not whether the ownership itself is ambiguous. A unit with no held responsibilities at all
 * (nothing yet assigned) reads as a mild positive neutral rather than being penalized for data that
 * does not exist.
 */
function deriveRoleClarity(world: GameWorld, unitView: StaffUnitRuntimeView): number {
  const heldByMembers = unitView.memberStaffIds.flatMap((staffId) => getResponsibilitiesHeldByStaff(world, staffId))
  if (heldByMembers.length === 0) return 58
  const membersWithOwnership = new Set(heldByMembers.map((item) => item.holderStaffId)).size
  const ownershipCoverage = membersWithOwnership / unitView.memberStaffIds.length
  return clampUnitCohesionValue(50 + ownershipCoverage * 45)
}

/**
 * stability: employment + assignment continuity across the unit's members. Long unbroken tenures
 * on this Team read as a stable unit regardless of relationship data; very recent/short tenures
 * read as lower, but never punitively so for a legitimately brand-new unit.
 */
function deriveStructuralStability(world: GameWorld, unitView: StaffUnitRuntimeView): number {
  const tenureMonths = unitView.memberStaffIds.map((staffId) => {
    const employment = world.staffEmploymentByStaffId[staffId]
    if (employment?.status !== 'employed' || employment.startedOn === undefined) return 0
    return monthsBetween(employment.startedOn, world.currentDate)
  })
  if (tenureMonths.length === 0) return 50
  const averageTenure = tenureMonths.reduce((sum, value) => sum + value, 0) / tenureMonths.length
  // 0 months -> 50 (neutral, not penalized for a legitimately brand-new unit); ~20 months -> high.
  return clampUnitCohesionValue(50 + Math.min(45, averageTenure * 2.25))
}

function monthsBetween(fromDate: string, toDate: string): number {
  const [fromYear, fromMonth] = fromDate.split('-').map(Number)
  const [toYear, toMonth] = toDate.split('-').map(Number)
  return Math.max(0, (toYear! - fromYear!) * 12 + (toMonth! - fromMonth!))
}

/** coordination structural signal: how balanced is workload utilization across the unit's members. Balanced -> healthy; lopsided -> pressure, independent of any relationship data. */
function deriveWorkloadBalance(world: GameWorld, unitView: StaffUnitRuntimeView): number {
  if (unitView.memberStaffIds.length === 0) return 50
  const utilizations = unitView.memberStaffIds
    .map((staffId) => calculateStaffWorkload(world, staffId).utilization)
    .filter((value) => Number.isFinite(value))
  if (utilizations.length < 2) return 55 // Not enough members to have an imbalance at all.
  const mean = utilizations.reduce((sum, value) => sum + value, 0) / utilizations.length
  const variance = utilizations.reduce((sum, value) => sum + (value - mean) ** 2, 0) / utilizations.length
  const spread = Math.sqrt(variance)
  // Low spread (everyone similarly loaded) -> healthy; high spread -> coordination pressure.
  return clampUnitCohesionValue(75 - Math.min(45, spread * 60))
}

/** Blend of every dyadic facet, used where a unit-wide "general mood" reading is the honest signal. */
function allFacetAverage(dimensions: Readonly<Record<RelationshipDimensionKey, number>>): number {
  const keys: readonly RelationshipDimensionKey[] = ['trust', 'professionalRespect', 'communicationQuality', 'collaboration', 'personalCloseness', 'perceivedSupport', 'reliability', 'professionalAlignment']
  return keys.reduce((sum, key) => sum + dimensions[key], 0) / keys.length
}

export function deriveStaffUnitCohesionTarget(world: GameWorld, unitView: StaffUnitRuntimeView): StaffUnitCohesionValues {
  const memberCount = unitView.memberStaffIds.length
  const readings = collectPairReadings(world, unitView.memberStaffIds)

  // Structural dimensions carry real signal even with zero relationship data or a single-member unit.
  const roleClarity = deriveRoleClarity(world, unitView)
  const structuralStability = deriveStructuralStability(world, unitView)

  if (readings.length === 0) {
    return {
      ...neutralUnitCohesionValues(),
      roleClarity,
      stability: structuralStability,
    }
  }

  const facet = (read: (dimensions: Readonly<Record<RelationshipDimensionKey, number>>) => number): number => aggregateFacet(readings, memberCount, read)

  // Leadership alignment reads only the leader's own relationships with the rest of the unit. With
  // no leader, or no real relationship data involving them, it degrades to the unit-wide average.
  const leaderId = unitView.leaderStaffId
  const leaderReadings = leaderId === undefined ? [] : readings.filter((reading) => reading.sourceId === leaderId || reading.targetId === leaderId)
  const leadershipAlignment = leaderReadings.length === 0
    ? facet(allFacetAverage)
    : aggregateFacet(leaderReadings, memberCount, (dimensions) => (dimensions.trust + dimensions.professionalRespect + dimensions.professionalAlignment) / 3)

  const workloadBalance = deriveWorkloadBalance(world, unitView)

  const values: Record<StaffUnitCohesionDimension, number> = {
    communication: facet((dimensions) => dimensions.communicationQuality),
    // Coordination blends the lived collaboration facet with a real structural signal (workload
    // balance) — coordination is not reducible to relationships alone.
    coordination: (facet((dimensions) => dimensions.collaboration) + workloadBalance) / 2,
    roleClarity,
    mutualSupport: facet((dimensions) => dimensions.perceivedSupport),
    sharedPurpose: facet((dimensions) => dimensions.professionalAlignment),
    trustClimate: facet((dimensions) => dimensions.trust),
    leadershipAlignment,
    stability: structuralStability,
  }

  const clamped: Record<StaffUnitCohesionDimension, number> = {} as never
  for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) clamped[dimension] = clampUnitCohesionValue(values[dimension])
  return clamped
}

export function initializeStaffUnitCohesionState(world: GameWorld, unitView: StaffUnitRuntimeView): StaffUnitCohesionState {
  const target = deriveStaffUnitCohesionTarget(world, unitView)
  return createStaffUnitCohesionState({ unitKey: unitView.unitKey, scopeKey: unitView.teamId, departmentProxy: unitView.department, target, current: target, establishedOn: world.currentDate, lastEvaluatedOn: world.currentDate })
}

/** Cohesion moves faster than Culture — how a unit works together shifts sooner than what an organization believes. */
export const STAFF_UNIT_COHESION_INERTIA_RATE = 0.1

export function progressStaffUnitCohesionState(current: StaffUnitCohesionState, target: StaffUnitCohesionValues, evaluatedOn: GameDate): StaffUnitCohesionState {
  const next: Record<StaffUnitCohesionDimension, number> = {} as never
  for (const dimension of STAFF_UNIT_COHESION_DIMENSIONS) {
    const from = current.current[dimension]
    next[dimension] = clampUnitCohesionValue(from + (target[dimension] - from) * STAFF_UNIT_COHESION_INERTIA_RATE)
  }
  return createStaffUnitCohesionState({ unitKey: current.unitKey, scopeKey: current.scopeKey, departmentProxy: current.departmentProxy, target, current: next, establishedOn: current.establishedOn, lastEvaluatedOn: evaluatedOn })
}
