import type { StaffPersonId, TeamId } from '@/domain/ids'
import { validateResponsibilityAssignment } from '@/domain/responsibility'
import { getResponsibility, getStaffAssignment, getStaffPerson, type GameWorld } from '@/domain/world'

export type SigningExecutionOwner =
  | { readonly kind: 'USER' }
  | { readonly kind: 'STAFF'; readonly staffPersonId: StaffPersonId }

export type SigningExecutionAuthority =
  | { readonly status: 'AUTHORIZED'; readonly owner: SigningExecutionOwner }
  | { readonly status: 'NO_EXECUTION_OWNER' }
  | { readonly status: 'BLOCKED'; readonly reason: string }

/** Resolves operational signature ownership independently of Governance rights. */
export function resolveSigningExecutionAuthority(world: GameWorld, teamId: TeamId): SigningExecutionAuthority {
  const team = world.teams[teamId]
  if (team === undefined) return { status: 'BLOCKED', reason: 'TEAM_NOT_FOUND' }
  if (team.coachId === world.userCoachId) return { status: 'AUTHORIZED', owner: { kind: 'USER' } }

  const responsibility = getResponsibility(world, teamId, 'executePlayerContractSigning')
  if (responsibility?.mode !== 'delegated' || responsibility.holderStaffId === undefined) return { status: 'NO_EXECUTION_OWNER' }
  const staff = getStaffPerson(world, responsibility.holderStaffId)
  const assignment = getStaffAssignment(world, responsibility.holderStaffId)
  if (staff === undefined || assignment === undefined || assignment.teamId !== teamId || assignment.assignedOn > world.currentDate) {
    return { status: 'BLOCKED', reason: 'INVALID_SIGNING_OWNER_ASSIGNMENT' }
  }
  const validation = validateResponsibilityAssignment(responsibility.kind, responsibility.mode, assignment.role, staff)
  if (!validation.ok) return { status: 'BLOCKED', reason: `INVALID_SIGNING_OWNER_ASSIGNMENT:${validation.reason ?? 'unknown'}` }
  return { status: 'AUTHORIZED', owner: { kind: 'STAFF', staffPersonId: staff.id } }
}
