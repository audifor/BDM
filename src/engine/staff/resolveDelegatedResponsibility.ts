import type { DecisionQualityContext, ResponsibilityId, ResponsibilityKind } from '@/domain/responsibility'
import { relationshipKey } from '@/domain/relationships'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { getPersonality, getResponsibility, getStaffAssignment, getStaffPerson, getTeamCoach, calculateStaffWorkload, type GameWorld } from '@/domain/world'

export interface DelegatedResponsibilityResolution {
  readonly responsibilityId: ResponsibilityId
  readonly staffId: StaffPersonId
  readonly context: DecisionQualityContext
}

/**
 * Resolves a `ResponsibilityKind` for `teamId` to a `DelegatedResponsibilityResolution` only when
 * it is genuinely `mode: 'delegated'` with a holder who has a real, canonical `TeamStaffAssignment`
 * and `StaffPerson` record. Every other case (vacant, `userControlled`, `advisory`,
 * `organizational`, a holder with no live assignment, an unknown staff id) returns `undefined` so
 * the caller falls back to existing unchanged behavior — this is the sole gate that keeps
 * delegated execution from ever running when the canonical world state does not actually
 * authorize it.
 */
export function resolveDelegatedResponsibility(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind): DelegatedResponsibilityResolution | undefined {
  const responsibility = getResponsibility(world, teamId, kind)
  if (responsibility === undefined || responsibility.mode !== 'delegated' || responsibility.holderStaffId === undefined) return undefined
  const staffId = responsibility.holderStaffId
  const staff = getStaffPerson(world, staffId)
  const assignment = getStaffAssignment(world, staffId)
  if (staff === undefined || assignment === undefined || assignment.teamId !== teamId) return undefined
  const personality = getPersonality(world, staffId)
  if (personality === undefined) return undefined
  const coach = getTeamCoach(world, teamId)
  const relationshipToCoach = coach === undefined ? undefined : world.relationshipsByKey[relationshipKey(staffId, coach.id)]
  const workload = calculateStaffWorkload(world, staffId)
  return {
    responsibilityId: responsibility.id,
    staffId,
    context: { staff, roleId: assignment.role, personality, ...(relationshipToCoach === undefined ? {} : { relationshipToCoach }), workload },
  }
}
