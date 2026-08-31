import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { staffContractIdFromString } from '@/domain/staffContract'
import { updateGameWorld, GameWorldValidationError } from './index'

describe('Staff employment <-> TeamStaffAssignment invariant', () => {
  it('employed => exactly one matching TeamStaffAssignment (already the case for every generated Staff person)', () => {
    const world = createNewGame()
    for (const [staffId, employment] of Object.entries(world.staffEmploymentByStaffId)) {
      if (employment.status !== 'employed') continue
      const matching = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.staffPersonId === staffId)
      expect(matching).toHaveLength(1)
      expect(matching[0]!.teamId).toBe(employment.teamId)
      expect(matching[0]!.role).toBe(employment.roleId)
    }
  })

  it('unemployed => zero TeamStaffAssignment rows', () => {
    const world = createNewGame()
    const staffId = staffPersonIdFromString('unemployed-invariant-staff')
    const withUnemployed = updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Un', lastName: 'Employed' }, professional: { attributes: Object.fromEntries(Object.keys(Object.values(world.staffPeopleById)[0]!.professional.attributes).map((key) => [key, 50])) as never } }],
      staffEmploymentByStaffId: { ...world.staffEmploymentByStaffId, [staffId]: { status: 'unemployed' } },
    })
    expect(Object.values(withUnemployed.teamStaffAssignmentsById).some((assignment) => assignment.staffPersonId === staffId)).toBe(false)
  })

  it('rejects a mismatched role between employment and assignment', () => {
    const world = createNewGame()
    const employedEntry = Object.entries(world.staffEmploymentByStaffId).find(([, employment]) => employment.status === 'employed')!
    const [staffId, employment] = employedEntry
    expect(() => updateGameWorld(world, { staffEmploymentByStaffId: { ...world.staffEmploymentByStaffId, [staffId]: { ...employment, roleId: 'headScout' } } })).toThrow(GameWorldValidationError)
  })

  it('rejects a mismatched team between employment and assignment', () => {
    const world = createNewGame()
    const employedEntry = Object.entries(world.staffEmploymentByStaffId).find(([, employment]) => employment.status === 'employed')!
    const [staffId, employment] = employedEntry
    const otherTeamId = Object.values(world.teams).find((team) => team.id !== employment.teamId)!.id
    expect(() => updateGameWorld(world, { staffEmploymentByStaffId: { ...world.staffEmploymentByStaffId, [staffId]: { ...employment, teamId: otherTeamId } } })).toThrow(GameWorldValidationError)
  })

  it('rejects duplicate active assignments for one employed Staff person', () => {
    const world = createNewGame()
    const assignment = Object.values(world.teamStaffAssignmentsById)[0]!
    const otherTeamId = Object.values(world.teams).find((team) => team.id !== assignment.teamId)!.id as TeamId
    const duplicate = { id: teamStaffAssignmentIdFromString(`${assignment.id}-dup`), staffPersonId: assignment.staffPersonId, teamId: otherTeamId, role: assignment.role, assignedOn: world.currentDate }
    expect(() => updateGameWorld(world, { teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), duplicate] })).toThrow(GameWorldValidationError)
  })

  it('rejects more than one active StaffContract for the same Staff person', () => {
    const world = createNewGame()
    const employedEntry = Object.entries(world.staffEmploymentByStaffId).find(([, employment]) => employment.status === 'employed')!
    const [staffId, employment] = employedEntry as [never, typeof employedEntry[1]]
    const secondContract = { id: staffContractIdFromString('duplicate-active-contract'), staffId, teamId: employment.teamId!, kind: 'standard' as const, term: { startsOn: world.currentDate, expiresOn: '2099-10-01' as never }, compensation: { annualSalary: 50_000 } }
    expect(() => updateGameWorld(world, { staffContracts: [...Object.values(world.staffContractsById), secondContract] })).toThrow(GameWorldValidationError)
  })

  it('rejects an active StaffContract whose team does not match employment', () => {
    const world = createNewGame()
    const employedEntry = Object.entries(world.staffEmploymentByStaffId).find(([, employment]) => employment.status === 'employed')!
    const [staffId, employment] = employedEntry as [never, typeof employedEntry[1]]
    const otherTeamId = Object.values(world.teams).find((team) => team.id !== employment.teamId)!.id
    const withoutOwnContract = { ...world.staffContractsById }
    for (const [id, contract] of Object.entries(withoutOwnContract)) if (contract.staffId === staffId && contract.termination === undefined) delete withoutOwnContract[id as never]
    const mismatched = { id: staffContractIdFromString('mismatched-team-contract'), staffId, teamId: otherTeamId, kind: 'standard' as const, term: { startsOn: world.currentDate, expiresOn: '2099-10-01' as never }, compensation: { annualSalary: 50_000 } }
    expect(() => updateGameWorld(world, { staffContracts: [...Object.values(withoutOwnContract), mismatched] })).toThrow(GameWorldValidationError)
  })
})
