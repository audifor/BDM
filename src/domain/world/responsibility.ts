import type { StaffPersonId, TeamId } from '@/domain/ids'
import { responsibilityDefinition, validateResponsibilityAssignment, type Responsibility, type ResponsibilityKind, type StaffWorkloadSnapshot } from '@/domain/responsibility'
import { calculateStaffRoleProficiencyByRoleId, staffRoleDefinition, type StaffRoleId, type StaffRoleSeniority } from '@/domain/staff'
import type { GameWorld } from './GameWorld'
import { getStaffAssignment, getStaffPerson, getTeamStaffAssignments } from './staff'

/** Small closed lookup: capacity scales with role seniority. Never persisted — always derived. */
const CAPACITY_LIMIT_BY_SENIORITY: Readonly<Record<StaffRoleSeniority, number>> = {
  junior: 3,
  standard: 5,
  senior: 7,
  director: 9,
}

export function getTeamResponsibilities(world: GameWorld, teamId: TeamId): readonly Responsibility[] {
  return Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.teamId === teamId).sort((a, b) => a.kind.localeCompare(b.kind))
}

export function getResponsibilitiesHeldByStaff(world: GameWorld, staffId: StaffPersonId): readonly Responsibility[] {
  return Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.holderStaffId === staffId)
}

export function getResponsibility(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind): Responsibility | undefined {
  return Object.values(world.responsibilitiesById).find((responsibility) => responsibility.teamId === teamId && responsibility.kind === kind)
}

/**
 * Pure projection over `responsibilitiesById` + `teamStaffAssignmentsById` — never persisted, and
 * never caller-supplied: the staff member's role is always resolved from their own active
 * `TeamStaffAssignment` in `world`, so a caller cannot spoof capacity/seniority by passing an
 * arbitrary role. `totalCapacityUsed` = role assignment base cost + capacityCost of every held
 * Responsibility. A staff member with no active assignment has no role to be overloaded against
 * — deterministically reported as zero capacity used/limit, not overloaded.
 */
export function calculateStaffWorkload(world: GameWorld, staffId: StaffPersonId): StaffWorkloadSnapshot {
  const assignment = getStaffAssignment(world, staffId)
  const heldResponsibilityCost = getResponsibilitiesHeldByStaff(world, staffId).reduce((sum, responsibility) => sum + responsibilityDefinition(responsibility.kind).capacityCost, 0)
  if (assignment === undefined) return { staffId, totalCapacityUsed: heldResponsibilityCost, capacityLimit: 0, utilization: heldResponsibilityCost > 0 ? Infinity : 0, overloaded: heldResponsibilityCost > 0 }
  const roleDefinition = staffRoleDefinition(assignment.role)
  const totalCapacityUsed = roleDefinition.capacityCost + heldResponsibilityCost
  const capacityLimit = CAPACITY_LIMIT_BY_SENIORITY[roleDefinition.seniority]
  const utilization = totalCapacityUsed / capacityLimit
  return { staffId, totalCapacityUsed, capacityLimit, utilization, overloaded: utilization > 1 }
}

/**
 * Projected workload for `staffId` if `kind` were (re)assigned to them on `teamId` in `mode`,
 * computed by building a transient, non-persisted `Responsibility` collection and calling the
 * canonical `calculateStaffWorkload` again — never a second workload formula. `mode` is passed
 * through explicitly (never hardcoded to `delegated`) so an advisory-only `kind` is projected
 * with a valid `advisory` Responsibility rather than fabricating an invalid `delegated` one.
 * Correctly handles: the Staff member already holding the Responsibility (no double count),
 * moving it from another holder, and simply changing mode while keeping the same holder.
 */
export function projectStaffWorkloadForResponsibility(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind, staffId: StaffPersonId, mode: 'delegated' | 'advisory'): StaffWorkloadSnapshot {
  const existing = getTeamResponsibilities(world, teamId).find((item) => item.kind === kind)
  const projectedResponsibilitiesById = { ...world.responsibilitiesById }
  const id = existing?.id ?? `responsibility:${teamId}:${kind}`
  projectedResponsibilitiesById[id as keyof typeof projectedResponsibilitiesById] = {
    ...(existing ?? { id, teamId, kind }),
    mode,
    holderStaffId: staffId,
  } as never
  const projectedWorld: GameWorld = { ...world, responsibilitiesById: projectedResponsibilitiesById }
  return calculateStaffWorkload(projectedWorld, staffId)
}

export interface EligibleResponsibilityCandidate {
  readonly staffPersonId: StaffPersonId
  readonly name: string
  readonly role: StaffRoleId
  readonly proficiency: number
  readonly currentUtilization: number
  readonly projectedUtilization: number
  /** Canonical `overloaded` flag of the projection — the same signal `calculateStaffWorkload` reports. */
  readonly projectedOverloaded: boolean
  /** Deterministic suitability score (0-100) for this Responsibility — see `staffAssignmentSuitability`. */
  readonly suitability: number
}

/**
 * Availability multiplier for the suitability score: a candidate with headroom keeps their full
 * proficiency; one whose projected utilization approaches or crosses capacity is discounted.
 * Purely a ranking aid — never a simulation rule, and never used to exclude a candidate.
 */
export function staffAvailabilityFactor(projectedUtilization: number): number {
  if (!Number.isFinite(projectedUtilization)) return MIN_AVAILABILITY_FACTOR
  const pressure = Math.max(0, Math.min(1, (projectedUtilization - AVAILABILITY_FULL_UTILIZATION) / AVAILABILITY_SPAN))
  return 1 - pressure * (1 - MIN_AVAILABILITY_FACTOR)
}

const AVAILABILITY_FULL_UTILIZATION = 0.6
const AVAILABILITY_SPAN = 0.55
const MIN_AVAILABILITY_FACTOR = 0.35

/**
 * Suitability (0-100) = canonical role proficiency discounted by projected workload pressure.
 * This is the single ranking score used by the Staff Assignments UI and the bulk assignment
 * strategies, so "best candidate" never means two different things in two places.
 */
export function staffAssignmentSuitability(proficiency: number, projectedUtilization: number): number {
  return Math.round(proficiency * staffAvailabilityFactor(projectedUtilization))
}

/**
 * Eligible `delegated`/`advisory` candidates for `kind` on `teamId`, evaluated against the given
 * target `mode` (never hardcoded/inferred — many kinds support `advisory` but not `delegated`):
 * only Staff from this Team, currently employed, with a real `TeamStaffAssignment`, whose role is
 * eligible per `validateResponsibilityAssignment` for `mode` — never `marketRole`, free agents,
 * another Team's Staff, or `headCoach`. Ordered by current-role proficiency descending, then
 * StaffPersonId ascending; callers that want the best overall fit sort by `suitability` instead.
 */
export function getEligibleResponsibilityCandidates(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind, mode: 'delegated' | 'advisory'): readonly EligibleResponsibilityCandidate[] {
  const definition = responsibilityDefinition(kind)
  if (definition.eligibleParticipant !== 'staff') return []

  return getTeamStaffAssignments(world, teamId)
    .filter((assignment) => world.staffEmploymentByStaffId[assignment.staffPersonId]?.status === 'employed')
    .map((assignment) => {
      const person = getStaffPerson(world, assignment.staffPersonId)
      if (person === undefined) return undefined
      const validation = validateResponsibilityAssignment(kind, mode, assignment.role, person)
      if (!validation.ok) return undefined
      const currentWorkload = calculateStaffWorkload(world, person.id)
      const projectedWorkload = projectStaffWorkloadForResponsibility(world, teamId, kind, person.id, mode)
      const proficiency = calculateStaffRoleProficiencyByRoleId(person, assignment.role)
      return {
        staffPersonId: person.id,
        name: `${person.identity.firstName} ${person.identity.lastName}`,
        role: assignment.role,
        proficiency,
        currentUtilization: currentWorkload.utilization,
        projectedUtilization: projectedWorkload.utilization,
        projectedOverloaded: projectedWorkload.overloaded,
        suitability: staffAssignmentSuitability(proficiency, projectedWorkload.utilization),
      }
    })
    .filter((candidate): candidate is EligibleResponsibilityCandidate => candidate !== undefined)
    .sort((left, right) => right.proficiency - left.proficiency || left.staffPersonId.localeCompare(right.staffPersonId))
}

/** Eligible candidates ordered best-fit first — the ordering the assignment UI and strategies use. */
export function getRankedResponsibilityCandidates(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind, mode: 'delegated' | 'advisory'): readonly EligibleResponsibilityCandidate[] {
  return [...getEligibleResponsibilityCandidates(world, teamId, kind, mode)].sort(
    (left, right) => right.suitability - left.suitability || right.proficiency - left.proficiency || left.staffPersonId.localeCompare(right.staffPersonId),
  )
}
