import type { StaffPersonId, TeamId } from '@/domain/ids'
import {
  createResponsibility,
  responsibilityDefinition,
  responsibilityIdForTeam,
  validateResponsibilityAssignment,
  type ResponsibilityKind,
  type ResponsibilityMode,
} from '@/domain/responsibility'
import { getStaffAssignment, getStaffPerson, updateGameWorld, type GameWorld } from '@/domain/world'

export interface SetTeamResponsibilityInput {
  readonly teamId: TeamId
  readonly kind: ResponsibilityKind
  readonly mode: ResponsibilityMode
  readonly holderStaffId?: StaffPersonId
}

/**
 * The single canonical Application boundary for changing who controls a Team's Responsibility
 * (Wave 4C2). No other production code may write `GameWorld.responsibilitiesById` directly.
 *
 * Rules (see task spec for the full rationale):
 * - Team must exist.
 * - `mode` must be one of `responsibilityDefinition(kind).supportedModes`.
 * - Uses the canonical id `responsibilityIdForTeam(teamId, kind)` — never creates a duplicate row.
 * - `userControlled`/`organizational` never carry a holder, even if one was previously assigned.
 * - `delegated`/`advisory` require a holder who is a real, currently employed Staff person with a
 *   real `TeamStaffAssignment` on this same Team, in an eligible role — enforced by
 *   `validateResponsibilityAssignment`.
 * - `eligibleParticipant: 'coach'` responsibilities (e.g. Head-Coach-only) never accept a Staff
 *   holder, and are never assigned to a `StaffPerson` — this is derived from the registry, never
 *   hardcoded by kind name.
 * - `assignedOn` is `world.currentDate` when a holder exists, `undefined` otherwise.
 * - Never blocks on Staff overload — an eligible, overloaded Staff member may still receive the
 *   Responsibility; overload is only ever a UI/quality-model warning elsewhere.
 */
export function setTeamResponsibility(world: GameWorld, input: SetTeamResponsibilityInput): GameWorld {
  const team = world.teams[input.teamId]
  if (team === undefined) throw new RangeError(`Unknown Team: ${input.teamId}`)

  const definition = responsibilityDefinition(input.kind)
  if (!definition.supportedModes.includes(input.mode)) {
    throw new RangeError(`Responsibility ${input.kind} does not support mode ${input.mode}`)
  }

  const holderStaffId = input.mode === 'delegated' || input.mode === 'advisory' ? input.holderStaffId : undefined

  const staffRoleId = holderStaffId === undefined ? undefined : getStaffAssignment(world, holderStaffId)?.role
  const staffAssignment = holderStaffId === undefined ? undefined : getStaffAssignment(world, holderStaffId)
  const staffPerson = holderStaffId === undefined ? undefined : getStaffPerson(world, holderStaffId)

  if (holderStaffId !== undefined) {
    if (staffPerson === undefined) throw new RangeError(`Unknown Staff person: ${holderStaffId}`)
    if (staffAssignment === undefined || staffAssignment.teamId !== input.teamId) {
      throw new RangeError(`Staff person ${holderStaffId} is not assigned to Team ${input.teamId}`)
    }
    if (world.staffEmploymentByStaffId[holderStaffId]?.status !== 'employed') {
      throw new RangeError(`Staff person ${holderStaffId} is not currently employed`)
    }
  }

  const validation = validateResponsibilityAssignment(input.kind, input.mode, staffRoleId, staffPerson)
  if (!validation.ok) throw new RangeError(`Responsibility assignment rejected: ${validation.reason}`)

  const id = responsibilityIdForTeam(input.teamId, input.kind)
  const responsibility = createResponsibility({
    id,
    teamId: input.teamId,
    kind: input.kind,
    mode: input.mode,
    ...(holderStaffId === undefined ? {} : { holderStaffId }),
    ...(holderStaffId === undefined ? {} : { assignedOn: world.currentDate }),
  })

  return updateGameWorld(world, { responsibilities: [...Object.values(world.responsibilitiesById).filter((existing) => existing.id !== id), responsibility] })
}
