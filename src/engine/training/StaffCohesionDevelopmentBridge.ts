import type { GameWorld } from '@/domain/world'
import { getTeamStaffAssignments } from '@/domain/world'
import type { ScheduledTrainingSession } from '@/domain/training'
import { staffRoleDefinition } from '@/domain/staff'
import { staffUnitKeyFor } from '@/domain/staffUnitCohesion'
import { relationshipKey } from '@/domain/relationships'

/** P7: one bounded read-only connection from canonical Staff Unit Cohesion into
 * the existing player's training development stimulus.
 *
 * A politically formed alliance does not magically raise player skills. The
 * effect requires REAL witnessed Staff-to-Staff interactions within the executing
 * employee's own department, and an actual evaluated StaffUnitCohesionState.
 * Political COORDINATE actions are one existing source for those relationships.
 *
 * No separate RPG power score, no match modifier, no injury/fatigue changes.
 * Missing signals mean multiplier 1 exactly (legacy-safe).
 */
export function staffCohesionDevelopmentMultiplier(world: GameWorld, session: ScheduledTrainingSession): number {
  const executing = session.assignedStaffPersonIds
  if (executing === undefined || executing.length === 0) return 1

  const membersByDepartment = new Map<string, Set<string>>()
  const executingDepartments = new Set<string>()
  for (const assignment of getTeamStaffAssignments(world, session.teamId)) {
    const employment = world.staffEmploymentByStaffId[assignment.staffPersonId]
    if (employment?.status !== 'employed' || employment.teamId !== session.teamId) continue
    const department = staffRoleDefinition(assignment.role).department
    if (!membersByDepartment.has(department)) membersByDepartment.set(department, new Set())
    membersByDepartment.get(department)!.add(assignment.staffPersonId)
    if (executing.includes(assignment.staffPersonId)) executingDepartments.add(department)
  }

  const multipliers: number[] = []
  for (const department of [...executingDepartments].sort()) {
    const members = membersByDepartment.get(department)
    if (!members || members.size < 2) continue
    const state = world.staffUnitCohesionStatesByUnitKey[staffUnitKeyFor(session.teamId, department as Parameters<typeof staffUnitKeyFor>[1])]
    if (state === undefined || state.lastEvaluatedOn > world.currentDate) continue
    // A structure-only cohesion value cannot justify emotional or political
    // training gains; require at least one *observed* intra-unit relationship.
    const memberIds = [...members].sort()
    const observed = memberIds.some(sourceId => memberIds.some(targetId =>
      sourceId !== targetId &&
      (world.relationshipsByKey[relationshipKey(sourceId, targetId)]?.events.length ?? 0) > 0))
    if (!observed) continue
    const { communication, coordination, mutualSupport, trustClimate } = state.current
    const evidenceScore = (communication + coordination + mutualSupport + trustClimate) / 4
    multipliers.push(Math.max(0.96, Math.min(1.04, 1 + (evidenceScore - 50) * 0.0008)))
  }
  return multipliers.length === 0 ? 1 : Math.max(0.96, Math.min(1.04,
    multipliers.reduce((sum, multiplier) => sum + multiplier, 0) / multipliers.length))
}
