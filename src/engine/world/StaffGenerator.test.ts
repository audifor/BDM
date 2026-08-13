import { createNewGame } from '@/app/game'
import { calculateStaffRoleProficiency } from '@/domain/staff'
import { getTeamStaffAssignments, getTeamStaffByRole } from '@/domain/world'
import { describe, expect, it } from 'vitest'
describe('initial staff structure',()=>{it('creates three deterministic common-profile staff members per team',()=>{const world=createNewGame();expect(Object.keys(world.staffPeopleById)).toHaveLength(Object.keys(world.teams).length*3);for(const team of Object.values(world.teams)){expect(getTeamStaffAssignments(world,team.id)).toHaveLength(3);for(const role of ['assistantCoach','scout','medical'] as const)expect(getTeamStaffByRole(world,team.id,role)).toHaveLength(1)}expect(createNewGame().staffPeopleById).toEqual(world.staffPeopleById);expect(Object.values(world.staffPeopleById).every(person=>calculateStaffRoleProficiency(person,'assistantCoach')>=0)).toBe(true)})})
