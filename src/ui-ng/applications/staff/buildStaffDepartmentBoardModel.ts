import type { TeamId } from '@/domain/ids'
import {
  STAFF_DEPARTMENTS,
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS,
  staffRoleDefinition,
  staffRoleIdsInDepartment,
  type StaffDepartment,
  type StaffProfessionalAttributeKey,
  type StaffRoleId,
} from '@/domain/staff'
import { getTeamStaffAssignments, type GameWorld } from '@/domain/world'

/**
 * Presentation-only staffing targets, not a simulation rule. There is no domain concept of an
 * "ideal headcount" per role — this exists purely to give the department board a denominator to
 * render, mirroring how other management sims surface staffing gaps. Safe to tune freely; never
 * read by engine code.
 */
const UI_ROLE_STAFFING_TARGET: Readonly<Partial<Record<StaffRoleId, number>>> = {
  associateCoach: 1,
  assistantCoach: 2,
  playerDevelopmentCoach: 2,
  offensiveSpecialist: 1,
  defensiveSpecialist: 1,
  shootingCoach: 1,
  skillsCoach: 1,
  bigManCoach: 1,
  strengthConditioningCoach: 1,
  performanceCoach: 1,
  loadManagementSpecialist: 1,
  developmentSpecialist: 1,
  teamDoctor: 1,
  physiotherapist: 2,
  rehabilitationSpecialist: 1,
  sportsScientist: 1,
  headScout: 1,
  regionalScout: 3,
  advanceScout: 1,
  collegeScout: 1,
  internationalScout: 1,
  proScout: 1,
  generalManager: 1,
  assistantGeneralManager: 1,
  directorOfBasketballOperations: 1,
  sportingDirector: 1,
  analyticsStaff: 1,
  capContractsSpecialist: 1,
  recruitingCoordinator: 1,
  positionalRecruiter: 2,
}

export interface StaffDepartmentRoleRow {
  readonly role: StaffRoleId
  readonly filled: number
  readonly target: number
}

export interface StaffDepartmentAttributeComparison {
  readonly attribute: StaffProfessionalAttributeKey
  readonly leagueLow: number
  readonly leagueHigh: number
  readonly teamValue: number | undefined
}

export interface StaffDepartmentCard {
  readonly department: StaffDepartment
  readonly employeeCount: number
  readonly roles: readonly StaffDepartmentRoleRow[]
  readonly comparisons: readonly StaffDepartmentAttributeComparison[]
}

export interface StaffDepartmentBoardModel {
  readonly cards: readonly StaffDepartmentCard[]
}

/** Attributes most weighted across a department's roles, used as the comparison chart's axes. */
export function leadingAttributesForDepartment(department: StaffDepartment, maxAttributes = 6): readonly StaffProfessionalAttributeKey[] {
  const roleIds = staffRoleIdsInDepartment(department)
  const totals = new Map<StaffProfessionalAttributeKey, number>()
  for (const roleId of roleIds) {
    const weights = staffRoleDefinition(roleId).attributeWeights
    for (const [key, weight] of Object.entries(weights)) {
      const attribute = key as StaffProfessionalAttributeKey
      totals.set(attribute, (totals.get(attribute) ?? 0) + weight!)
    }
  }
  return STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.filter((key) => totals.has(key))
    .sort((a, b) => totals.get(b)! - totals.get(a)!)
    .slice(0, maxAttributes)
}

export function departmentRoleRows(teamAssignmentsInDepartment: readonly { readonly role: StaffRoleId }[], department: StaffDepartment): readonly StaffDepartmentRoleRow[] {
  return staffRoleIdsInDepartment(department)
    .map((role) => ({
      role,
      filled: teamAssignmentsInDepartment.filter((assignment) => assignment.role === role).length,
      target: UI_ROLE_STAFFING_TARGET[role] ?? 1,
    }))
    .filter((row) => row.filled > 0 || row.target > 0)
}

export { UI_ROLE_STAFFING_TARGET }

export function departmentAttributeComparisons(
  attributes: readonly StaffProfessionalAttributeKey[],
  leaguePeople: readonly { readonly professional: { readonly attributes: Readonly<Record<StaffProfessionalAttributeKey, number>> } }[],
  teamPeople: readonly { readonly professional: { readonly attributes: Readonly<Record<StaffProfessionalAttributeKey, number>> } }[],
): readonly StaffDepartmentAttributeComparison[] {
  return attributes.map((attribute) => {
    const leagueValues = leaguePeople.map((person) => person.professional.attributes[attribute])
    const teamValues = teamPeople.map((person) => person.professional.attributes[attribute])
    const leagueLow = leagueValues.length === 0 ? 0 : Math.min(...leagueValues)
    const leagueHigh = leagueValues.length === 0 ? 0 : Math.max(...leagueValues)
    const teamValue = teamValues.length === 0 ? undefined : Math.round(teamValues.reduce((sum, value) => sum + value, 0) / teamValues.length)
    return { attribute, leagueLow, leagueHigh, teamValue }
  })
}

export function buildStaffDepartmentBoardModel(world: GameWorld, teamId: TeamId): StaffDepartmentBoardModel {
  const teamAssignments = getTeamStaffAssignments(world, teamId)
  const allAssignments = Object.values(world.teamStaffAssignmentsById)

  const cards = STAFF_DEPARTMENTS.map((department): StaffDepartmentCard => {
    const teamAssignmentsInDepartment = teamAssignments.filter((assignment) => staffRoleDefinition(assignment.role).department === department)
    const roles = departmentRoleRows(teamAssignmentsInDepartment, department)
    const attributes = leadingAttributesForDepartment(department)
    const leagueAssignmentsInDepartment = allAssignments.filter((assignment) => staffRoleDefinition(assignment.role).department === department)
    const leaguePeople = leagueAssignmentsInDepartment
      .map((assignment) => world.staffPeopleById[assignment.staffPersonId])
      .filter((person) => person !== undefined)
    const teamPeople = teamAssignmentsInDepartment
      .map((assignment) => world.staffPeopleById[assignment.staffPersonId])
      .filter((person) => person !== undefined)

    return {
      department,
      employeeCount: teamAssignmentsInDepartment.length,
      roles,
      comparisons: departmentAttributeComparisons(attributes, leaguePeople, teamPeople),
    }
  })

  return { cards }
}
