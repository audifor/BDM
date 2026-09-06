import type { StaffPersonId, TeamId } from '@/domain/ids'
import { staffRoleDefinition, type StaffDepartment, type StaffProfessionalAttributeKey, type StaffRoleId } from '@/domain/staff'
import { calculateStaffWorkload, getTeamStaffAssignments, type GameWorld } from '@/domain/world'
import {
  classifyWorkloadState,
  findActiveStaffContractForStaff,
  getStaffContractStatus,
  getStaffEmploymentStatusLabel,
  type StaffContractStatus,
  type StaffWorkloadState,
} from '@/ui/staffPresentation'

import {
  departmentAttributeComparisons,
  departmentRoleRows,
  leadingAttributesForDepartment,
  type StaffDepartmentAttributeComparison,
  type StaffDepartmentRoleRow,
} from '@/ui-ng/applications/staff/buildStaffDepartmentBoardModel'

export interface StaffDepartmentPersonRow {
  readonly staffPersonId: StaffPersonId
  readonly name: string
  readonly role: StaffRoleId
  readonly attributes: Readonly<Partial<Record<StaffProfessionalAttributeKey, number>>>
  readonly employmentStatus: string
  readonly contractStatus: StaffContractStatus
  readonly annualSalary: number | undefined
  readonly contractExpiresOn: string | undefined
  readonly workloadState: StaffWorkloadState
  readonly utilization: number
}

export interface StaffDepartmentDetailModel {
  readonly department: StaffDepartment
  readonly employeeCount: number
  readonly roles: readonly StaffDepartmentRoleRow[]
  readonly attributes: readonly StaffProfessionalAttributeKey[]
  readonly comparisons: readonly StaffDepartmentAttributeComparison[]
  readonly people: readonly StaffDepartmentPersonRow[]
}

export function buildStaffDepartmentDetailModel(world: GameWorld, teamId: TeamId, department: StaffDepartment): StaffDepartmentDetailModel {
  const teamAssignments = getTeamStaffAssignments(world, teamId)
  const teamAssignmentsInDepartment = teamAssignments.filter((assignment) => staffRoleDefinition(assignment.role).department === department)
  const allAssignments = Object.values(world.teamStaffAssignmentsById)
  const leagueAssignmentsInDepartment = allAssignments.filter((assignment) => staffRoleDefinition(assignment.role).department === department)

  const roles = departmentRoleRows(teamAssignmentsInDepartment, department)
  const attributes = leadingAttributesForDepartment(department, 10)

  const leaguePeople = leagueAssignmentsInDepartment
    .map((assignment) => world.staffPeopleById[assignment.staffPersonId])
    .filter((person) => person !== undefined)
  const teamPeopleForComparison = teamAssignmentsInDepartment
    .map((assignment) => world.staffPeopleById[assignment.staffPersonId])
    .filter((person) => person !== undefined)

  const people: StaffDepartmentPersonRow[] = teamAssignmentsInDepartment.map((assignment) => {
    const person = world.staffPeopleById[assignment.staffPersonId]!
    const workload = calculateStaffWorkload(world, person.id)
    const contract = findActiveStaffContractForStaff(world, person.id)
    return {
      staffPersonId: person.id,
      name: `${person.identity.firstName} ${person.identity.lastName}`,
      role: assignment.role,
      attributes: Object.fromEntries(attributes.map((key) => [key, person.professional.attributes[key]])),
      employmentStatus: getStaffEmploymentStatusLabel(world, person.id),
      contractStatus: getStaffContractStatus(world, person.id),
      annualSalary: contract?.compensation.annualSalary,
      contractExpiresOn: contract?.term.expiresOn,
      workloadState: classifyWorkloadState(workload),
      utilization: workload.utilization,
    }
  })

  return {
    department,
    employeeCount: teamAssignmentsInDepartment.length,
    roles,
    attributes,
    comparisons: departmentAttributeComparisons(attributes, leaguePeople, teamPeopleForComparison),
    people,
  }
}
