import { calculateStaffRoleProficiencyByRoleId, type StaffRoleId } from '@/domain/staff'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'
export function getTeamStaffAssignments(world:GameWorld,teamId:TeamId){return Object.values(world.teamStaffAssignmentsById).filter(a=>a.teamId===teamId).sort((a,b)=>a.role.localeCompare(b.role)||a.staffPersonId.localeCompare(b.staffPersonId))}
export function getTeamStaffPeople(world:GameWorld,teamId:TeamId){return getTeamStaffAssignments(world,teamId).map(a=>world.staffPeopleById[a.staffPersonId]!)}
export function getTeamStaffByRole(world:GameWorld,teamId:TeamId,role:StaffRoleId){return getTeamStaffAssignments(world,teamId).filter(a=>a.role===role).map(a=>world.staffPeopleById[a.staffPersonId]!)}
export function getStaffAssignment(world:GameWorld,staffPersonId:StaffPersonId){return Object.values(world.teamStaffAssignmentsById).find(a=>a.staffPersonId===staffPersonId)}
export function getStaffPerson(world:GameWorld,staffPersonId:StaffPersonId){return world.staffPeopleById[staffPersonId]}
export function getStaffRoleProficiency(world:GameWorld,staffPersonId:StaffPersonId){const assignment=getStaffAssignment(world,staffPersonId);return assignment===undefined?undefined:calculateStaffRoleProficiencyByRoleId(world.staffPeopleById[staffPersonId]!,assignment.role)}
