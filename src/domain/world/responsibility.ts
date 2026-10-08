import type { StaffPersonId, TeamId } from '@/domain/ids'
import { isResponsibilityConnected, responsibilityDefinition, type Responsibility, type ResponsibilityKind, type StaffWorkloadSnapshot } from '@/domain/responsibility'
import { staffRoleDefinition, type StaffRoleSeniority } from '@/domain/staff'
import type { GameWorld } from './GameWorld'
import { getStaffAssignment } from './staff'
import { SCOUTING_TERRITORY_WORKLOAD_COST } from '@/domain/scouting'

/** Small closed lookup: capacity scales with role seniority. Never persisted — always derived. */
const CAPACITY_LIMIT_BY_SENIORITY: Readonly<Record<StaffRoleSeniority, number>> = {
  junior: 3,
  standard: 5,
  senior: 7,
  director: 9,
}

const responsibilityIndexes = new WeakMap<GameWorld['responsibilitiesById'], { readonly byTeam: ReadonlyMap<TeamId, readonly Responsibility[]>; readonly byStaff: ReadonlyMap<StaffPersonId, readonly Responsibility[]> }>()
function responsibilityIndex(world: GameWorld) {
  let index = responsibilityIndexes.get(world.responsibilitiesById)
  if (index === undefined) {
    const byTeam = new Map<TeamId, Responsibility[]>()
    const byStaff = new Map<StaffPersonId, Responsibility[]>()
    for (const responsibility of Object.values(world.responsibilitiesById)) {
      const team = byTeam.get(responsibility.teamId) ?? []
      team.push(responsibility)
      byTeam.set(responsibility.teamId, team)
      if (responsibility.holderStaffId !== undefined) {
        const staff = byStaff.get(responsibility.holderStaffId) ?? []
        staff.push(responsibility)
        byStaff.set(responsibility.holderStaffId, staff)
      }
    }
    index = { byTeam, byStaff }
    responsibilityIndexes.set(world.responsibilitiesById, index)
  }
  return index
}
export function getTeamResponsibilities(world: GameWorld, teamId: TeamId): readonly Responsibility[] {
  return [...(responsibilityIndex(world).byTeam.get(teamId) ?? [])].sort((a, b) => a.kind.localeCompare(b.kind))
}
export function getResponsibilitiesHeldByStaff(world: GameWorld, staffId: StaffPersonId): readonly Responsibility[] {
  return responsibilityIndex(world).byStaff.get(staffId) ?? []
}
export function getResponsibility(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind): Responsibility | undefined {
  return responsibilityIndex(world).byTeam.get(teamId)?.find(responsibility => responsibility.kind === kind)
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
  const heldResponsibilityCost = getResponsibilitiesHeldByStaff(world, staffId).filter((responsibility) => isResponsibilityConnected(responsibility.kind)).reduce((sum, responsibility) => sum + responsibilityDefinition(responsibility.kind).capacityCost, 0)
  const activeTerritoryCost = Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.scoutStaffId === staffId && item.status === 'ACTIVE').length * SCOUTING_TERRITORY_WORKLOAD_COST
  if (assignment === undefined) {
    const totalCapacityUsed = heldResponsibilityCost + activeTerritoryCost
    return { staffId, totalCapacityUsed, capacityLimit: 0, utilization: totalCapacityUsed > 0 ? Infinity : 0, overloaded: totalCapacityUsed > 0 }
  }
  const roleDefinition = staffRoleDefinition(assignment.role)
  const totalCapacityUsed = roleDefinition.capacityCost + heldResponsibilityCost + activeTerritoryCost
  const capacityLimit = CAPACITY_LIMIT_BY_SENIORITY[roleDefinition.seniority]
  const utilization = totalCapacityUsed / capacityLimit
  return { staffId, totalCapacityUsed, capacityLimit, utilization, overloaded: utilization > 1 }
}
