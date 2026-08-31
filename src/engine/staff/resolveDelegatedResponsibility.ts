import type { DecisionQualityContext, ResponsibilityId, ResponsibilityKind, ResponsibilityMode } from '@/domain/responsibility'
import { relationshipKey } from '@/domain/relationships'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { getPersonality, getResponsibility, getStaffAssignment, getStaffPerson, getTeamCoach, calculateStaffWorkload, type GameWorld } from '@/domain/world'

export interface DelegatedResponsibilityResolution {
  readonly responsibilityId: ResponsibilityId
  readonly staffId: StaffPersonId
  readonly context: DecisionQualityContext
}

/** Same shape as `DelegatedResponsibilityResolution` — kept as a distinct name so advisory call sites read as what they are, not a delegated-execution gate. */
export type AdvisoryResponsibilityResolution = DelegatedResponsibilityResolution

/**
 * Shared holder/context construction for both the delegated-execution gate and the advisory
 * resolution path. Verifies, purely from canonical world state:
 * - the Responsibility row exists and is in `expectedMode`,
 * - it has a holder,
 * - that holder has both a `StaffPerson` record and a live `TeamStaffAssignment` on `teamId`
 *   (never a caller-supplied role — always the real assigned one),
 * - a `Personality` profile exists for them.
 *
 * `workload` is derived fresh from canonical state (`calculateStaffWorkload`) and
 * `relationshipToCoach` is resolved exactly as Wave 2 did. Returns `undefined` for every
 * disqualifying case rather than throwing, so callers fall back to unchanged existing behavior —
 * no caller-supplied fake role/context can ever reach a `DecisionQualityFn`.
 */
function resolveResponsibilityHolder(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind, expectedMode: ResponsibilityMode): DelegatedResponsibilityResolution | undefined {
  const responsibility = getResponsibility(world, teamId, kind)
  if (responsibility === undefined || responsibility.mode !== expectedMode || responsibility.holderStaffId === undefined) return undefined
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
  return resolveResponsibilityHolder(world, teamId, kind, 'delegated')
}

/**
 * Advisory counterpart of `resolveDelegatedResponsibility` (Wave 3): resolves a `ResponsibilityKind`
 * for `teamId` only when it is genuinely `mode: 'advisory'` with a valid, real holder — same
 * validation as the delegated gate, different required mode. Advisory responsibilities (e.g.
 * `oppositionScouting`, `oppositionReport`, `prospectReport`) never auto-apply their output; the
 * caller is expected to record a `DelegationOutcome` with `applied: false` and surface the result
 * for explicit user acceptance, never to mutate simulation-affecting state directly.
 */
export function resolveAdvisoryResponsibility(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind): AdvisoryResponsibilityResolution | undefined {
  return resolveResponsibilityHolder(world, teamId, kind, 'advisory')
}
