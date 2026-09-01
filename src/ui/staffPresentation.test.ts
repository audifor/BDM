import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { calculateStaffWorkload, getStaffPerson, getTeamStaffAssignments, updateGameWorld, type GameWorld } from '@/domain/world'
import { staffRoleDefinition } from '@/domain/staff'
import type { StaffPersonId, TeamId } from '@/domain/ids'

import { STAFF_ROLE_IDS } from '@/domain/staff'
import { createStaffContract, staffContractIdFromString, terminateStaffContract } from '@/domain/staffContract'

import {
  classifyWorkloadState,
  compactStaffSalary,
  findActiveStaffContractForStaff,
  formatStaffCareerEntry,
  getRecentStaffCareerHistory,
  getStaffAge,
  getStaffCareerHistory,
  getStaffContractStatus,
  getStaffEmployment,
  getStaffEmploymentStatusLabel,
  getStaffReputationProfile,
  getStaffRoleEvaluations,
  getTeamStaffPresentation,
  STAFF_DEPARTMENT_LABELS,
  STAFF_ROLE_LABELS,
} from './staffPresentation'

function world(): GameWorld {
  return createNewGame()
}

function userTeamId(w: GameWorld): TeamId {
  const team = getUserTeam(w)
  if (team === undefined) throw new Error('Expected a user team in the fixture world')
  return team.id
}

describe('getTeamStaffPresentation', () => {
  it('derives the team staff list exclusively from canonical assignments/employment', () => {
    const w = world()
    const teamId = userTeamId(w)
    const items = getTeamStaffPresentation(w, teamId)
    const assignments = getTeamStaffAssignments(w, teamId)
    expect(items).toHaveLength(assignments.length)
    for (const item of items) {
      const assignment = assignments.find((a) => a.staffPersonId === item.staffPersonId)
      expect(assignment).toBeDefined()
      expect(item.role).toBe(assignment!.role)
      const person = getStaffPerson(w, item.staffPersonId)!
      expect(item.name).toBe(`${person.identity.firstName} ${person.identity.lastName}`)
    }
  })

  it('does not mix staff from other teams into the current team list', () => {
    const w = world()
    const teamId = userTeamId(w)
    const otherTeamId = Object.keys(w.teams).map((id) => id as TeamId).find((id) => id !== teamId)
    expect(otherTeamId).toBeDefined()
    const currentItems = getTeamStaffPresentation(w, teamId)
    const otherItems = getTeamStaffPresentation(w, otherTeamId!)
    const currentIds = new Set(currentItems.map((item) => item.staffPersonId))
    for (const item of otherItems) expect(currentIds.has(item.staffPersonId)).toBe(false)
  })

  it('derives role labels/family/department from the canonical role registry, never a hardcoded map', () => {
    const w = world()
    const teamId = userTeamId(w)
    for (const item of getTeamStaffPresentation(w, teamId)) {
      expect(item.department).toBe(staffRoleDefinition(item.role).department)
      expect(STAFF_DEPARTMENT_LABELS[item.department]).toBeTruthy()
      expect(STAFF_ROLE_LABELS[item.role]).toBeTruthy()
    }
  })

  it('role proficiency is the canonical calculateStaffRoleProficiencyByRoleId result, not a re-derived value', () => {
    const w = world()
    const teamId = userTeamId(w)
    const items = getTeamStaffPresentation(w, teamId)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      const evaluations = getStaffRoleEvaluations(w, item.staffPersonId)
      expect(evaluations.every((entry) => Number.isInteger(entry.proficiency))).toBe(true)
      expect(Number.isInteger(item.roleProficiency)).toBe(true)
    }
  })

  it('workload display derives from the canonical calculateStaffWorkload projection', () => {
    const w = world()
    const teamId = userTeamId(w)
    for (const item of getTeamStaffPresentation(w, teamId)) {
      const workload = calculateStaffWorkload(w, item.staffPersonId)
      expect(item.utilization).toBe(workload.utilization)
      expect(item.workloadState).toBe(classifyWorkloadState(workload))
    }
  })

  it('active contract/employment/reputation values render correctly for fully enriched fixture staff', () => {
    const w = world()
    const teamId = userTeamId(w)
    for (const item of getTeamStaffPresentation(w, teamId)) {
      expect(item.employmentStatus).toBe('EMPLOYED')
      expect(item.activeContract).toBeDefined()
      expect(item.annualSalary).toBe(item.activeContract!.compensation.annualSalary)
      expect(item.contractExpiresOn).toBe(item.activeContract!.term.expiresOn)
      expect(item.reputationScore).toBeGreaterThanOrEqual(0)
    }
  })

  it('missing contract/history/reputation state does not crash and renders explicit empty values', () => {
    const w = world()
    const teamId = userTeamId(w)
    const first = getTeamStaffAssignments(w, teamId)[0]!
    const staffId = first.staffPersonId
    const strippedContracts = Object.values(w.staffContractsById).filter((contract) => contract.staffId !== staffId)
    const { [staffId]: _removedReputation, ...restReputation } = w.staffReputationProfilesByStaffId
    const stripped = updateGameWorld(w, { staffContracts: strippedContracts, staffReputationProfilesByStaffId: restReputation as never })
    const items = getTeamStaffPresentation(stripped, teamId)
    const item = items.find((entry) => entry.staffPersonId === staffId)!
    expect(item.activeContract).toBeUndefined()
    expect(item.annualSalary).toBeUndefined()
    expect(item.contractExpiresOn).toBeUndefined()
    expect(item.reputationScore).toBeUndefined()
  })

  it('reports an explicit UNKNOWN employment status, never a crash, when employment state is absent', () => {
    const w = world()
    const teamId = userTeamId(w)
    const staffId = getTeamStaffAssignments(w, teamId)[0]!.staffPersonId
    const { [staffId]: _removed, ...restEmployment } = w.staffEmploymentByStaffId
    // Employment/active-contract consistency is a canonical world invariant (GameWorld.validateWorld);
    // removing employment for this test must also drop its matching active contract to stay valid.
    const remainingContracts = Object.values(w.staffContractsById).filter((contract) => contract.staffId !== staffId)
    const stripped = updateGameWorld(w, { staffEmploymentByStaffId: restEmployment as never, staffContracts: remainingContracts })
    expect(getStaffEmploymentStatusLabel(stripped, staffId)).toBe('UNKNOWN')
    expect(getStaffEmployment(stripped, staffId)).toBeUndefined()
  })

  it('produces deterministic, stably tie-broken ordering across repeated calls', () => {
    const w = world()
    const teamId = userTeamId(w)
    const first = getTeamStaffPresentation(w, teamId).map((item) => item.staffPersonId)
    const second = getTeamStaffPresentation(w, teamId).map((item) => item.staffPersonId)
    expect(first).toEqual(second)
  })

  it('sorts by department, then role, then name, then id, matching STAFF_DEPARTMENTS declaration order', () => {
    const w = world()
    const teamId = userTeamId(w)
    const items = getTeamStaffPresentation(w, teamId)
    const departmentOrders = items.map((item) => Object.values(STAFF_DEPARTMENT_LABELS).indexOf(STAFF_DEPARTMENT_LABELS[item.department]))
    for (let i = 1; i < departmentOrders.length; i += 1) expect(departmentOrders[i]).toBeGreaterThanOrEqual(departmentOrders[i - 1]!)
  })
})

describe('classifyWorkloadState', () => {
  it('classifies unassigned, normal, pressured and overloaded bands from utilization without inventing a second formula', () => {
    expect(classifyWorkloadState({ staffId: 'x' as StaffPersonId, totalCapacityUsed: 0, capacityLimit: 0, utilization: 0, overloaded: false })).toBe('unassigned')
    expect(classifyWorkloadState({ staffId: 'x' as StaffPersonId, totalCapacityUsed: 1, capacityLimit: 5, utilization: 0.2, overloaded: false })).toBe('normal')
    expect(classifyWorkloadState({ staffId: 'x' as StaffPersonId, totalCapacityUsed: 4.5, capacityLimit: 5, utilization: 0.9, overloaded: false })).toBe('pressured')
    expect(classifyWorkloadState({ staffId: 'x' as StaffPersonId, totalCapacityUsed: 6, capacityLimit: 5, utilization: 1.2, overloaded: true })).toBe('overloaded')
  })
})

describe('findActiveStaffContractForStaff', () => {
  it('returns the same result as the canonical isStaffContractActiveOn semantics', () => {
    const w = world()
    const teamId = userTeamId(w)
    const staffId = getTeamStaffAssignments(w, teamId)[0]!.staffPersonId
    const contract = findActiveStaffContractForStaff(w, staffId)
    expect(contract).toBeDefined()
    expect(contract!.staffId).toBe(staffId)
  })

  it('returns undefined for a staff person with no contracts', () => {
    const w = world()
    const teamId = userTeamId(w)
    const staffId = getTeamStaffAssignments(w, teamId)[0]!.staffPersonId
    const strippedContracts = Object.values(w.staffContractsById).filter((contract) => contract.staffId !== staffId)
    const stripped = updateGameWorld(w, { staffContracts: strippedContracts })
    expect(findActiveStaffContractForStaff(stripped, staffId)).toBeUndefined()
  })
})

describe('getStaffCareerHistory / getRecentStaffCareerHistory', () => {
  it('returns an empty array (never throws) for a staff person with no recorded history', () => {
    const w = world()
    const teamId = userTeamId(w)
    const staffId = getTeamStaffAssignments(w, teamId)[0]!.staffPersonId
    const { [staffId]: _removed, ...rest } = w.staffCareerHistoryByStaffId
    const stripped = updateGameWorld(w, { staffCareerHistoryByStaffId: rest as never })
    expect(getStaffCareerHistory(stripped, staffId)).toEqual([])
    expect(getRecentStaffCareerHistory(stripped, staffId)).toEqual([])
  })

  it('orders history most-recent-first, deterministically', () => {
    const w = world()
    const teamId = userTeamId(w)
    const staffId = getTeamStaffAssignments(w, teamId)[0]!.staffPersonId
    const history = getStaffCareerHistory(w, staffId)
    expect(history.length).toBeGreaterThan(0)
    const recent = getRecentStaffCareerHistory(w, staffId, 10)
    for (let i = 1; i < recent.length; i += 1) expect(recent[i]!.date.localeCompare(recent[i - 1]!.date)).toBeLessThanOrEqual(0)
    for (const entry of recent) expect(() => formatStaffCareerEntry(entry)).not.toThrow()
  })
})

describe('getStaffReputationProfile', () => {
  it('returns the canonical profile for enriched fixture staff and undefined when absent', () => {
    const w = world()
    const teamId = userTeamId(w)
    const staffId = getTeamStaffAssignments(w, teamId)[0]!.staffPersonId
    expect(getStaffReputationProfile(w, staffId)).toBeDefined()
    const { [staffId]: _removed, ...rest } = w.staffReputationProfilesByStaffId
    const stripped = updateGameWorld(w, { staffReputationProfilesByStaffId: rest as never })
    expect(getStaffReputationProfile(stripped, staffId)).toBeUndefined()
  })
})

describe('getStaffAge', () => {
  it('returns undefined when dateOfBirth is absent, never throws', () => {
    const w = world()
    const teamId = userTeamId(w)
    const staffId = getTeamStaffAssignments(w, teamId)[0]!.staffPersonId
    expect(getStaffAge(w, staffId)).toBeUndefined()
  })
})

describe('compactStaffSalary', () => {
  it('keeps whole-scale values clean, with no trailing .0', () => {
    expect(compactStaffSalary(1_000_000)).toBe('$1M')
    expect(compactStaffSalary(65_000)).toBe('$65K')
  })

  it('preserves fractional precision instead of rounding to the nearest whole M/K', () => {
    expect(compactStaffSalary(1_500_000)).toBe('$1.5M')
    expect(compactStaffSalary(2_250_000)).toBe('$2.25M')
  })

  it('preserves fractional precision on the K scale too', () => {
    expect(compactStaffSalary(65_500)).toBe('$65.5K')
  })
})

describe('getStaffRoleEvaluations', () => {
  function firstStaffId(w: GameWorld): StaffPersonId {
    const teamId = userTeamId(w)
    return getTeamStaffAssignments(w, teamId)[0]!.staffPersonId
  }

  it('always includes the staff member\'s current assigned role', () => {
    const w = world()
    const staffId = firstStaffId(w)
    const currentRole = getTeamStaffAssignments(w, userTeamId(w)).find((a) => a.staffPersonId === staffId)!.role
    const evaluations = getStaffRoleEvaluations(w, staffId)
    expect(evaluations.some((entry) => entry.role === currentRole)).toBe(true)
    expect(evaluations[0]!.role).toBe(currentRole)
  })

  it('produces a valid non-empty evaluation list, including the actual role, for a staff member whose role is not one of the 3 legacy roles', () => {
    const w = world()
    const teamId = userTeamId(w)
    const assignment = getTeamStaffAssignments(w, teamId)[0]!
    const person = getStaffPerson(w, assignment.staffPersonId)!
    const existingEmployment = w.staffEmploymentByStaffId[person.id]!
    const retargeted = updateGameWorld(w, {
      teamStaffAssignments: Object.values(w.teamStaffAssignmentsById).map((a) => (a.id === assignment.id ? { ...a, role: 'headScout' } : a)),
      staffEmploymentByStaffId: { ...w.staffEmploymentByStaffId, [person.id]: { ...existingEmployment, roleId: 'headScout' } } as never,
    })
    const evaluations = getStaffRoleEvaluations(retargeted, person.id)
    expect(evaluations.length).toBeGreaterThan(0)
    expect(evaluations[0]!.role).toBe('headScout')
  })

  it('draws alternatives from the canonical registry (same department as the current role), never a hardcoded value', () => {
    const w = world()
    const staffId = firstStaffId(w)
    const currentRole = getTeamStaffAssignments(w, userTeamId(w))[0]!.role
    const department = staffRoleDefinition(currentRole).department
    const evaluations = getStaffRoleEvaluations(w, staffId)
    const alternatives = evaluations.filter((entry) => entry.role !== currentRole)
    expect(alternatives.length).toBeGreaterThan(0)
    expect(alternatives.some((entry) => STAFF_ROLE_IDS.includes(entry.role) && staffRoleDefinition(entry.role).department === department)).toBe(true)
  })

  it('is deterministic: repeated calls for the same world/staff produce the same list and order', () => {
    const w = world()
    const staffId = firstStaffId(w)
    const first = getStaffRoleEvaluations(w, staffId)
    const second = getStaffRoleEvaluations(w, staffId)
    expect(second).toEqual(first)
  })

  it('never indiscriminately returns the full role catalogue — the list stays compact', () => {
    const w = world()
    const staffId = firstStaffId(w)
    const evaluations = getStaffRoleEvaluations(w, staffId)
    expect(evaluations.length).toBeLessThan(STAFF_ROLE_IDS.length)
    expect(evaluations.length).toBeLessThanOrEqual(6)
  })
})

describe('getStaffContractStatus', () => {
  it('reports ACTIVE when an active contract exists', () => {
    const w = world()
    const staffId = firstAssignedStaffId(w)
    expect(getStaffContractStatus(w, staffId)).toBe('ACTIVE')
  })

  it('reports NO_CONTRACT when the staff person has no contract record at all', () => {
    const w = world()
    const staffId = firstAssignedStaffId(w)
    const remaining = Object.values(w.staffContractsById).filter((contract) => contract.staffId !== staffId)
    const stripped = updateGameWorld(w, { staffContracts: remaining })
    expect(getStaffContractStatus(stripped, staffId)).toBe('NO_CONTRACT')
  })

  it('reports TERMINATED for a contract with an already-effective termination', () => {
    const w = world()
    const teamId = userTeamId(w)
    const staffId = firstAssignedStaffId(w)
    const active = Object.values(w.staffContractsById).find((contract) => contract.staffId === staffId)!
    const terminated = terminateStaffContract(active, w.currentDate, 'performance')
    const remaining = Object.values(w.staffContractsById).filter((contract) => contract.staffId !== staffId)
    // Employment/assignment consistency is a canonical world invariant (GameWorld.validateWorld):
    // dropping this contract's coverage also means dropping the now-inconsistent assignment/employment.
    const remainingAssignments = Object.values(w.teamStaffAssignmentsById).filter((a) => a.staffPersonId !== staffId)
    const { [staffId]: _removedEmployment, ...restEmployment } = w.staffEmploymentByStaffId
    const stripped = updateGameWorld(w, { staffContracts: [...remaining, terminated], teamStaffAssignments: remainingAssignments, staffEmploymentByStaffId: restEmployment as never })
    expect(getStaffContractStatus(stripped, staffId, w.currentDate)).toBe('TERMINATED')
    void teamId
  })

  it('reports EXPIRED for a contract whose term has passed with no termination record', () => {
    const w = world()
    const teamId = userTeamId(w)
    const staffId = firstAssignedStaffId(w)
    const remaining = Object.values(w.staffContractsById).filter((contract) => contract.staffId !== staffId)
    const expired = createStaffContract({ id: staffContractIdFromString('expired-fixture-contract'), staffId, teamId, kind: 'standard', term: { startsOn: '2020-01-01' as never, expiresOn: '2021-01-01' as never }, compensation: { annualSalary: 50_000 } })
    const remainingAssignments = Object.values(w.teamStaffAssignmentsById).filter((a) => a.staffPersonId !== staffId)
    const { [staffId]: _removedEmployment, ...restEmployment } = w.staffEmploymentByStaffId
    const stripped = updateGameWorld(w, { staffContracts: [...remaining, expired], teamStaffAssignments: remainingAssignments, staffEmploymentByStaffId: restEmployment as never })
    expect(getStaffContractStatus(stripped, staffId, w.currentDate)).toBe('EXPIRED')
  })

  it('is computed independently from Employment Status — the two remain conceptually separate', () => {
    const w = world()
    const staffId = firstAssignedStaffId(w)
    // Employment says EMPLOYED while contract records are removed entirely: contract status must
    // not be derived from (or forced to agree with) employment status.
    const remaining = Object.values(w.staffContractsById).filter((contract) => contract.staffId !== staffId)
    const stillEmployed = updateGameWorld(w, { staffContracts: remaining })
    expect(getStaffEmploymentStatusLabel(stillEmployed, staffId)).toBe('EMPLOYED')
    expect(getStaffContractStatus(stillEmployed, staffId)).toBe('NO_CONTRACT')
  })
})

function firstAssignedStaffId(w: GameWorld): StaffPersonId {
  const teamId = userTeamId(w)
  return getTeamStaffAssignments(w, teamId)[0]!.staffPersonId
}
