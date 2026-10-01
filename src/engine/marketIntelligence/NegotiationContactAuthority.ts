import type { PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import { validateResponsibilityAssignment, type ResponsibilityMode } from '@/domain/responsibility'
import type { GameWorld } from '@/domain/world'
import { getResponsibility, getStaffAssignment, getStaffPerson } from '@/domain/world'

export type NegotiationContactAuthorityStatus = 'AUTHORIZED' | 'USER_CONTROLLED' | 'NO_EXECUTION_OWNER' | 'BLOCKED' | 'UNKNOWN'

export interface NegotiationContactAuthority {
  readonly teamId: TeamId
  readonly authorityStatus: NegotiationContactAuthorityStatus
  readonly executionMode?: ResponsibilityMode
  readonly responsibleStaffId?: StaffPersonId
  readonly responsibleRole?: string
  readonly responsibilityKind: 'initiateNegotiationContact'
  readonly governanceRequirement: 'NOT_REQUIRED'
  readonly governanceStatus: 'NOT_REQUIRED'
  readonly reasons: readonly string[]
  readonly blockers: readonly string[]
}

/** Contact is operational: it does not ask for salary, terms, or a binding commitment. */
export function resolveNegotiationContactAuthority(world: GameWorld, teamId: TeamId): NegotiationContactAuthority {
  const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)
  if (userTeam?.id === teamId) return result(teamId, 'USER_CONTROLLED', undefined, undefined, undefined, ['USER_IS_EXPLICIT_APPLICATION_DECISION_MAKER'], [])

  const responsibility = getResponsibility(world, teamId, 'initiateNegotiationContact')
  if (responsibility === undefined) return result(teamId, 'NO_EXECUTION_OWNER', undefined, undefined, undefined, [], ['NO_CONTACT_EXECUTION_RESPONSIBILITY'])
  if (responsibility.mode !== 'delegated') {
    return result(teamId, 'NO_EXECUTION_OWNER', responsibility.mode, responsibility.holderStaffId, undefined,
      responsibility.mode === 'advisory' ? ['ADVISORY_IS_NOT_EXECUTION'] : responsibility.mode === 'organizational' ? ['ORGANIZATIONAL_MODE_HAS_NO_CONTACT_EXECUTOR'] : ['USER_CONTROLLED_MODE_DOES_NOT_DELEGATE_TO_AI'],
      ['NO_CONTACT_EXECUTION_OWNER'])
  }

  const holderId = responsibility.holderStaffId
  const holder = holderId === undefined ? undefined : getStaffPerson(world, holderId)
  const assignment = holderId === undefined ? undefined : getStaffAssignment(world, holderId)
  if (holderId === undefined || holder === undefined || assignment === undefined || assignment.teamId !== teamId || assignment.assignedOn > world.currentDate) {
    return result(teamId, 'BLOCKED', responsibility.mode, holderId, assignment?.role, [], ['INVALID_CONTACT_EXECUTION_ASSIGNMENT'])
  }
  const validation = validateResponsibilityAssignment(responsibility.kind, responsibility.mode, assignment.role, holder)
  if (!validation.ok) return result(teamId, 'BLOCKED', responsibility.mode, holder.id, assignment.role, [], [`INVALID_CONTACT_EXECUTION_ASSIGNMENT:${validation.reason ?? 'unknown'}`])
  return result(teamId, 'AUTHORIZED', responsibility.mode, holder.id, assignment.role, ['DELEGATED_CONTACT_EXECUTION_RESPONSIBILITY_RESOLVED'], [])
}

/** Stable, read-only attempt identity. Closed records with the same source identity advance its generation. */
export function deriveNegotiationAttemptKey(world: GameWorld, input: {
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly planId?: string
  readonly proposalId: string
}): string {
  const generation = Object.values(world.negotiationsById).filter((item) =>
    (item.status === 'CLOSED' || item.status === 'REJECTED' || item.status === 'WITHDRAWN')
    && item.teamId === input.teamId
    && item.playerId === input.playerId
    && item.sourcePlanId === input.planId
    && item.sourceProposalId === input.proposalId,
  ).length
  return `acquisition-attempt:${encodeURIComponent(input.planId ?? 'no-plan')}:${encodeURIComponent(input.proposalId)}:${generation}`
}

function result(
  teamId: TeamId,
  authorityStatus: NegotiationContactAuthorityStatus,
  executionMode: ResponsibilityMode | undefined,
  responsibleStaffId: StaffPersonId | undefined,
  responsibleRole: string | undefined,
  reasons: readonly string[],
  blockers: readonly string[],
): NegotiationContactAuthority {
  return Object.freeze({ teamId, authorityStatus, ...(executionMode === undefined ? {} : { executionMode }), ...(responsibleStaffId === undefined ? {} : { responsibleStaffId }), ...(responsibleRole === undefined ? {} : { responsibleRole }), responsibilityKind: 'initiateNegotiationContact', governanceRequirement: 'NOT_REQUIRED', governanceStatus: 'NOT_REQUIRED', reasons: Object.freeze([...reasons]), blockers: Object.freeze([...blockers]) })
}
