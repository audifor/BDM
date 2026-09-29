import type { NegotiationResponsibleActor } from '@/domain/market'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { validateResponsibilityAssignment } from '@/domain/responsibility'
import { getResponsibility, getStaffAssignment, getStaffPerson, type GameWorld } from '@/domain/world'

export type OfferExecutionOwner =
  | { readonly kind: 'USER' }
  | { readonly kind: 'STAFF'; readonly staffPersonId: StaffPersonId; readonly name: string; readonly role: string }

export interface OfferExecutionResponsibility {
  readonly status: 'USER_AUTHORITY' | 'RESOLVED_HOLDER' | 'NO_EXECUTION_OWNER' | 'BLOCKED'
  readonly owner?: OfferExecutionOwner
  readonly reasons: readonly string[]
  readonly blockers: readonly string[]
}

export function resolveOfferExecutionResponsibility(world: GameWorld, teamId: TeamId): OfferExecutionResponsibility {
  const team = world.teams[teamId]
  if (team?.coachId === world.userCoachId) {
    return { status: 'USER_AUTHORITY', owner: { kind: 'USER' }, reasons: ['USER_TEAM_HAS_EXPLICIT_APPLICATION_AUTHORITY'], blockers: [] }
  }
  const responsibility = getResponsibility(world, teamId, 'submitPlayerContractOffer')
  if (responsibility?.mode !== 'delegated' || responsibility.holderStaffId === undefined) {
    return { status: 'NO_EXECUTION_OWNER', reasons: [], blockers: ['NO_DELEGATED_FORMAL_OFFER_OWNER'] }
  }
  const holder = getStaffPerson(world, responsibility.holderStaffId)
  const assignment = getStaffAssignment(world, responsibility.holderStaffId)
  if (holder === undefined || assignment === undefined || assignment.teamId !== teamId || assignment.assignedOn > world.currentDate) {
    return { status: 'BLOCKED', reasons: [], blockers: ['INVALID_FORMAL_OFFER_OWNER_ASSIGNMENT'] }
  }
  const validation = validateResponsibilityAssignment(responsibility.kind, responsibility.mode, assignment.role, holder)
  if (!validation.ok) return { status: 'BLOCKED', reasons: [], blockers: [`INVALID_FORMAL_OFFER_OWNER_ASSIGNMENT:${validation.reason ?? 'unknown'}`] }
  return {
    status: 'RESOLVED_HOLDER',
    owner: { kind: 'STAFF', staffPersonId: holder.id, name: `${holder.identity.firstName} ${holder.identity.lastName}`, role: assignment.role },
    reasons: ['DELEGATED_FORMAL_OFFER_OWNER_RESOLVED'],
    blockers: [],
  }
}

export function isAuthorizedOfferActor(world: GameWorld, teamId: TeamId, actor: NegotiationResponsibleActor): boolean {
  const authority = resolveOfferExecutionResponsibility(world, teamId)
  if (authority.status === 'USER_AUTHORITY') return actor.kind === 'USER'
  if (authority.status === 'RESOLVED_HOLDER') return actor.kind === 'STAFF' && authority.owner?.kind === 'STAFF' && actor.staffPersonId === authority.owner.staffPersonId
  return false
}
