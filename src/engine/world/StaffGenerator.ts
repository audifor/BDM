import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { LEGACY_STAFF_ROLE_TO_ROLE_ID, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, STAFF_ROLE_ATTRIBUTE_WEIGHTS, STAFF_ROLES, type StaffPerson, type StaffRole, type TeamStaffAssignment } from '@/domain/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import type { GameDate } from '@/domain/date'
import type { Team } from '@/domain/team'
const first=['Arel','Bren','Cira','Daro','Eris'];const last=['Arden','Bexley','Corven','Dain','Elian']
export function generateInitialStaffStructure(teams:readonly Team[],assignedOn:GameDate){return teams.flatMap(team=>STAFF_ROLES.map(role=>generateInitialTeamStaff(team.id,role,assignedOn)))}
/**
 * `role` (legacy `StaffRole`) drives generation seeding/attribute weighting unchanged — byte-identical
 * ids/attributes to before. The stored `TeamStaffAssignment.role` is the canonical `StaffRoleId`
 * (`LEGACY_STAFF_ROLE_TO_ROLE_ID[role]`), since `StaffRoleId` is the sole assignment authority.
 */
export function generateInitialTeamStaff(teamId:Team['id'],role:StaffRole,assignedOn:GameDate):{person:StaffPerson;assignment:TeamStaffAssignment}{const id=staffPersonIdFromString(`generated-staff-${teamId}-${role}-001`);const seedId=String(id).replace('generated-staff-women-team-', 'generated-staff-generated-team-');const name=new SeededRandomSource(hashStringToSeed(`staff-person-name-v1:${seedId}`));const attributes=Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map(key=>[key,Math.min(100,new SeededRandomSource(hashStringToSeed(`staff-professional-v1:${seedId}:${key}`)).nextInt(20,60)+Math.round((STAFF_ROLE_ATTRIBUTE_WEIGHTS[role][key]??0)*80))])) as StaffPerson['professional']['attributes'];return{person:{id,identity:{firstName:first[name.nextInt(0,first.length-1)]!,lastName:last[name.nextInt(0,last.length-1)]!},professional:{attributes}},assignment:{id:teamStaffAssignmentIdFromString(`staff-assignment:${id}:${teamId}:${role}:${assignedOn}`),staffPersonId:id,teamId,role:LEGACY_STAFF_ROLE_TO_ROLE_ID[role],assignedOn}}}
