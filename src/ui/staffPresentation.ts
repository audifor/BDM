import {
  calculateStaffRoleProficiency,
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS,
  STAFF_ROLES,
  type StaffProfessionalAttributeKey,
  type StaffRole,
} from '@/domain/staff'
import { getStaffPerson, getTeamStaffAssignments, type GameWorld } from '@/domain/world'
import type { StaffPersonId, TeamId } from '@/domain/ids'

export const STAFF_ROLE_LABELS: Readonly<Record<StaffRole, string>> = {
  assistantCoach: 'ASSISTANT COACH',
  scout: 'SCOUT',
  medical: 'MEDICAL',
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

const ROLE_ORDER: Readonly<Record<StaffRole, number>> = {
  assistantCoach: 0,
  scout: 1,
  medical: 2,
}

export interface StaffPresentationItem {
  readonly staffPersonId: StaffPersonId
  readonly name: string
  readonly role: StaffRole
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
        roleProficiency: calculateStaffRoleProficiency(person, assignment.role),
      }
    })
    .sort((left, right) => ROLE_ORDER[left.role] - ROLE_ORDER[right.role] || left.name.localeCompare(right.name) || left.staffPersonId.localeCompare(right.staffPersonId))
}

export function getStaffRoleEvaluations(world: GameWorld, staffPersonId: StaffPersonId): readonly { readonly role: StaffRole; readonly proficiency: number }[] {
  const person = getStaffPerson(world, staffPersonId)
  if (person === undefined) throw new Error(`Staff person does not exist: ${staffPersonId}`)
  return STAFF_ROLES.map((role) => ({ role, proficiency: calculateStaffRoleProficiency(person, role) }))
}

export { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS }
