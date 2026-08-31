import {
  calculateStaffRoleProficiencyByRoleId,
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS,
  STAFF_ROLE_IDS,
  type StaffProfessionalAttributeKey,
  type StaffRoleId,
} from '@/domain/staff'
import { getStaffPerson, getTeamStaffAssignments, type GameWorld } from '@/domain/world'
import type { StaffPersonId, TeamId } from '@/domain/ids'

/**
 * Presentation labels for every canonical `StaffRoleId`. Only `assistantCoach`/`regionalScout`/
 * `physiotherapist` are reachable in Wave 1 (the only roles anything currently generates or
 * assigns) — the other entries exist so the map stays total over `StaffRoleId` without a
 * hand-maintained closed switch, per the "no switch/if-chain" extensibility rule. Wording for
 * the three reachable roles is unchanged from the pre-Wave-1 labels.
 */
export const STAFF_ROLE_LABELS: Readonly<Record<StaffRoleId, string>> = Object.fromEntries(
  STAFF_ROLE_IDS.map((id) => [id, id === 'regionalScout' ? 'SCOUT' : id === 'physiotherapist' ? 'MEDICAL' : formatRoleLabel(id)]),
) as Readonly<Record<StaffRoleId, string>>

function formatRoleLabel(id: StaffRoleId): string {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase()
}

export const STAFF_PROFESSIONAL_ATTRIBUTE_LABELS: Readonly<Record<StaffProfessionalAttributeKey, string>> = {
  coaching: 'Coaching',
  tacticalKnowledge: 'Tactical Knowledge',
  playerDevelopment: 'Player Development',
  talentEvaluation: 'Talent Evaluation',
  potentialEvaluation: 'Potential Evaluation',
  medicalKnowledge: 'Medical Knowledge',
  rehabilitation: 'Rehabilitation',
  analysis: 'Analysis',
  leadership: 'Leadership',
  communication: 'Communication',
  motivation: 'Motivation',
  discipline: 'Discipline',
  adaptability: 'Adaptability',
}

/** Wave 1 reachable-role display order (unchanged from pre-Wave-1: assistant coach, scout, medical); any other canonical role sorts after, by registry declaration order. */
const REACHABLE_ROLE_ORDER: readonly StaffRoleId[] = ['assistantCoach', 'regionalScout', 'physiotherapist']
function roleOrder(role: StaffRoleId): number {
  const reachableIndex = REACHABLE_ROLE_ORDER.indexOf(role)
  return reachableIndex === -1 ? REACHABLE_ROLE_ORDER.length + STAFF_ROLE_IDS.indexOf(role) : reachableIndex
}

export interface StaffPresentationItem {
  readonly staffPersonId: StaffPersonId
  readonly name: string
  readonly role: StaffRoleId
  readonly roleProficiency: number
}

/** Presentation projection only; professional truth and role calculations remain canonical. */
export function getTeamStaffPresentation(world: GameWorld, teamId: TeamId): readonly StaffPresentationItem[] {
  return getTeamStaffAssignments(world, teamId)
    .map((assignment) => {
      const person = getStaffPerson(world, assignment.staffPersonId)
      if (person === undefined) throw new Error(`Staff person does not exist: ${assignment.staffPersonId}`)
      return {
        staffPersonId: person.id,
        name: `${person.identity.firstName} ${person.identity.lastName}`,
        role: assignment.role,
        roleProficiency: calculateStaffRoleProficiencyByRoleId(person, assignment.role),
      }
    })
    .sort((left, right) => roleOrder(left.role) - roleOrder(right.role) || left.name.localeCompare(right.name) || left.staffPersonId.localeCompare(right.staffPersonId))
}

/** Evaluates the person against the three Wave-1-reachable roles, unchanged from pre-Wave-1 behavior (no UI redesign). */
export function getStaffRoleEvaluations(world: GameWorld, staffPersonId: StaffPersonId): readonly { readonly role: StaffRoleId; readonly proficiency: number }[] {
  const person = getStaffPerson(world, staffPersonId)
  if (person === undefined) throw new Error(`Staff person does not exist: ${staffPersonId}`)
  return REACHABLE_ROLE_ORDER.map((role) => ({ role, proficiency: calculateStaffRoleProficiencyByRoleId(person, role) }))
}

export { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS }
