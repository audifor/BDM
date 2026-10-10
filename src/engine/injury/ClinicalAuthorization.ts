import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'

export function clinicalAuthorizationAt(world: GameWorld, staffId: StaffPersonId, teamId: TeamId, action: 'INDICATE' | 'PERFORM', date: GameDate, authorizationId?: string) {
  const person = world.staffPeopleById[staffId]
  if (!person) return { ok: false as const, reason: 'PROFESSIONAL_NOT_FOUND' }
  const employment = world.staffEmploymentByStaffId[staffId]
  if (employment && (employment.status !== 'employed' || employment.teamId !== teamId || employment.startedOn !== undefined && employment.startedOn > date)) return { ok: false as const, reason: 'PROFESSIONAL_NOT_EMPLOYED_FOR_TEAM' }
  const grants = person.professional.clinicalAuthorizations ?? []
  const grant = grants.find(item => (authorizationId === undefined || item.id === authorizationId) && item.operation === 'EQUIPPED_REHABILITATION_SESSION' && item.eligibility === 'VERIFIED' && item.actions.includes(action) && item.validFrom <= date && date <= item.validTo && (() => {
    const assignment = world.teamStaffAssignmentsById[item.assignmentId]
    return assignment?.staffPersonId === staffId && assignment.teamId === teamId && assignment.assignedOn <= date
  })())
  return grant ? { ok: true as const, authorizationId: grant.id, indicationEvidence: { authorization: grant, assignment: world.teamStaffAssignmentsById[grant.assignmentId]! }, professionalAvailability: 'UNVERIFIED' as const } : { ok: false as const, reason: 'NO_VERIFIED_CLINICAL_AUTHORIZATION' }
}
