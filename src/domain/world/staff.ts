import { calculateStaffRoleProficiencyByRoleId, type StaffRoleId } from '@/domain/staff'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'
import { staffAssignmentIndex } from './collectionIndexes'
export function getTeamStaffAssignments(world:GameWorld,teamId:TeamId){return [...(staffAssignmentIndex(world.teamStaffAssignmentsById).byTeam.get(teamId)??[])].sort((a,b)=>a.role.localeCompare(b.role)||a.staffPersonId.localeCompare(b.staffPersonId))}
export function getTeamStaffPeople(world:GameWorld,teamId:TeamId){return getTeamStaffAssignments(world,teamId).map(a=>world.staffPeopleById[a.staffPersonId]!)}
export function getTeamStaffByRole(world:GameWorld,teamId:TeamId,role:StaffRoleId){return getTeamStaffAssignments(world,teamId).filter(a=>a.role===role).map(a=>world.staffPeopleById[a.staffPersonId]!)}
// WSR2: indexed per (immutable) assignment collection; same answer as the first-match scan.
export function getStaffAssignment(world:GameWorld,staffPersonId:StaffPersonId){return staffAssignmentIndex(world.teamStaffAssignmentsById).byStaff.get(staffPersonId)}
export function getStaffPerson(world:GameWorld,staffPersonId:StaffPersonId){return world.staffPeopleById[staffPersonId]}
export function getStaffRoleProficiency(world:GameWorld,staffPersonId:StaffPersonId){const assignment=getStaffAssignment(world,staffPersonId);return assignment===undefined?undefined:calculateStaffRoleProficiencyByRoleId(world.staffPeopleById[staffPersonId]!,assignment.role)}
