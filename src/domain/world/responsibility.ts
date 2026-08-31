import type { StaffPersonId, TeamId } from '@/domain/ids'
import { responsibilityDefinition, type Responsibility, type ResponsibilityKind, type StaffWorkloadSnapshot } from '@/domain/responsibility'
import { staffRoleDefinition, type StaffRoleSeniority } from '@/domain/staff'
import type { GameWorld } from './GameWorld'
import { getStaffAssignment } from './staff'

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
