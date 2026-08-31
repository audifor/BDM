import { describe, expect, it } from 'vitest'
import { staffPersonIdFromString, teamIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { createGameDate } from '@/domain/date'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS, STAFF_ROLE_REGISTRY } from '@/domain/staff'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { ensureResponsibilityStructure } from '@/engine/world/ResponsibilityEnrichment'
import { calculateStaffWorkload, createGameWorld, GameWorldValidationError, getResponsibility, getTeamResponsibilities, updateGameWorld } from './index'
import { createValidGameWorldInput } from './testFixtures'

const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>

function worldWithScout() {
  const input = createValidGameWorldInput()
  const world = createGameWorld(input)
  const teamId = teamIdFromString('team-home')
  const staffId = staffPersonIdFromString('resp-world-scout')
  return updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Uma', lastName: 'Ferris' }, professional: { attributes } }],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('resp-world-assignment'), staffPersonId: staffId, teamId, role: 'regionalScout', assignedOn: createGameDate(2032, 10, 1) }],
  })
}

describe('GameWorld responsibilities', () => {
  it('initializes with empty responsibility collections by default', () => {
    const world = createGameWorld(createValidGameWorldInput())
    expect(world.responsibilitiesById).toEqual({})
    expect(world.delegationOutcomesById).toEqual({})
  })

  it('rejects a responsibility whose holder is not eligible for the role', () => {
    const world = worldWithScout()
    const teamId = teamIdFromString('team-home')
    const staffId = staffPersonIdFromString('resp-world-scout')
    expect(() => updateGameWorld(world, {
      responsibilities: [{ id: responsibilityIdForTeam(teamId, 'manageRecovery'), teamId, kind: 'manageRecovery', mode: 'delegated', holderStaffId: staffId }],
    })).toThrow(GameWorldValidationError)
  })

  it('accepts a valid delegated assignment to an eligible scout', () => {
    const world = worldWithScout()
    const teamId = teamIdFromString('team-home')
    const staffId = staffPersonIdFromString('resp-world-scout')
    const updated = updateGameWorld(world, {
      responsibilities: [{ id: responsibilityIdForTeam(teamId, 'assignScouts'), teamId, kind: 'assignScouts', mode: 'delegated', holderStaffId: staffId }],
    })
    expect(getResponsibility(updated, teamId, 'assignScouts')?.holderStaffId).toBe(staffId)
  })

  it('rejects two Responsibility rows of the same kind for the same team', () => {
    const world = worldWithScout()
    const teamId = teamIdFromString('team-home')
    expect(() => updateGameWorld(world, {
      responsibilities: [
        { id: responsibilityIdForTeam(teamId, 'assignScouts'), teamId, kind: 'assignScouts', mode: 'userControlled' },
        { id: 'responsibility:team-home:assignScouts:dup' as never, teamId, kind: 'assignScouts', mode: 'userControlled' },
      ],
    })).toThrow(GameWorldValidationError)
  })

  it('rejects a delegation outcome referencing a missing Responsibility', () => {
    const world = worldWithScout()
    const staffId = staffPersonIdFromString('resp-world-scout')
    expect(() => updateGameWorld(world, {
      delegationOutcomes: [{ id: 'outcome-missing' as never, responsibilityId: 'responsibility:missing:assignScouts' as never, staffId, decidedOn: createGameDate(2032, 10, 1), kind: 'assignScouts', applied: true, qualityScore: 50, payload: {} }],
    })).toThrow(GameWorldValidationError)
  })

  it('regression: a real StaffPerson can be assigned a non-legacy canonical StaffRoleId (e.g. teamDoctor) and hold a Responsibility that depends on it', () => {
    // Confirms STAFF_ROLE_REGISTRY is the real assignment authority, not just a catalogue that
    // can never back a real TeamStaffAssignment: teamDoctor is not one of the 3 legacy STAFF_ROLES.
    const input = createValidGameWorldInput()
    const world = createGameWorld(input)
    const teamId = teamIdFromString('team-home')
    const doctorId = staffPersonIdFromString('resp-world-doctor')
    const withDoctor = updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: doctorId, identity: { firstName: 'Elin', lastName: 'Voss' }, professional: { attributes: { ...attributes, medicalKnowledge: 95, rehabilitation: 90 } } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('resp-world-doctor-assignment'), staffPersonId: doctorId, teamId, role: 'teamDoctor', assignedOn: createGameDate(2032, 10, 1) }],
    })
    expect(withDoctor.teamStaffAssignmentsById[teamStaffAssignmentIdFromString('resp-world-doctor-assignment')]!.role).toBe('teamDoctor')
    const delegated = updateGameWorld(withDoctor, {
      responsibilities: [{ id: responsibilityIdForTeam(teamId, 'treatmentRecommendation'), teamId, kind: 'treatmentRecommendation', mode: 'advisory', holderStaffId: doctorId }],
    })
    expect(getResponsibility(delegated, teamId, 'treatmentRecommendation')?.holderStaffId).toBe(doctorId)
  })

  it('rejects a StaffRoleId that is not assignable (headCoach is a marker for the Head Coach, never a TeamStaffAssignment role)', () => {
    const input = createValidGameWorldInput()
    const world = createGameWorld(input)
    const teamId = teamIdFromString('team-home')
    const staffId = staffPersonIdFromString('resp-world-headcoach-attempt')
    expect(() => updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Ivo', lastName: 'Kade' }, professional: { attributes } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('resp-world-headcoach-assignment'), staffPersonId: staffId, teamId, role: 'headCoach', assignedOn: createGameDate(2032, 10, 1) }],
    })).toThrow()
  })
})

describe('ensureResponsibilityStructure', () => {
  it('backfills one Responsibility per team per RESPONSIBILITY_KIND, defaulting to userControlled and vacant', () => {
    const world = createGameWorld(createValidGameWorldInput())
    const enriched = ensureResponsibilityStructure(world)
    const homeResponsibilities = getTeamResponsibilities(enriched, teamIdFromString('team-home'))
    expect(homeResponsibilities.length).toBeGreaterThan(0)
    expect(homeResponsibilities.every((responsibility) => responsibility.mode === 'userControlled' && responsibility.holderStaffId === undefined)).toBe(true)
  })

  it('is idempotent: running twice produces no additional rows', () => {
    const world = createGameWorld(createValidGameWorldInput())
    const once = ensureResponsibilityStructure(world)
    const twice = ensureResponsibilityStructure(once)
    expect(twice.responsibilitiesById).toEqual(once.responsibilitiesById)
  })

  it('is a no-op when nothing is missing', () => {
    const world = ensureResponsibilityStructure(createGameWorld(createValidGameWorldInput()))
    expect(ensureResponsibilityStructure(world)).toBe(world)
  })

  it('preserves an existing delegated assignment untouched', () => {
    const world = worldWithScout()
    const teamId = teamIdFromString('team-home')
    const staffId = staffPersonIdFromString('resp-world-scout')
    const withAssignment = updateGameWorld(world, {
      responsibilities: [{ id: responsibilityIdForTeam(teamId, 'assignScouts'), teamId, kind: 'assignScouts', mode: 'delegated', holderStaffId: staffId }],
    })
    const enriched = ensureResponsibilityStructure(withAssignment)
    expect(getResponsibility(enriched, teamId, 'assignScouts')?.holderStaffId).toBe(staffId)
  })
})

describe('calculateStaffWorkload', () => {
  it('derives capacity/utilization purely from role assignment when no responsibilities are held', () => {
    const world = worldWithScout()
    const staffId = staffPersonIdFromString('resp-world-scout')
    const workload = calculateStaffWorkload(world, staffId)
    expect(workload.totalCapacityUsed).toBeGreaterThan(0)
    expect(workload.capacityLimit).toBeGreaterThan(0)
    expect(workload.utilization).toBeCloseTo(workload.totalCapacityUsed / workload.capacityLimit)
    expect(workload.overloaded).toBe(false)
  })

  it('increases total capacity used as more responsibilities are delegated to the same staff member', () => {
    const world = worldWithScout()
    const teamId = teamIdFromString('team-home')
    const staffId = staffPersonIdFromString('resp-world-scout')
    const baseline = calculateStaffWorkload(world, staffId)
    const withOne = updateGameWorld(world, { responsibilities: [{ id: responsibilityIdForTeam(teamId, 'assignScouts'), teamId, kind: 'assignScouts', mode: 'delegated', holderStaffId: staffId }] })
    const afterOne = calculateStaffWorkload(withOne, staffId)
    expect(afterOne.totalCapacityUsed).toBeGreaterThan(baseline.totalCapacityUsed)
  })

  it('detects overload once capacity used exceeds the seniority-derived limit', () => {
    const world = worldWithScout()
    const teamId = teamIdFromString('team-home')
    const staffId = staffPersonIdFromString('resp-world-scout')
    const heavy = updateGameWorld(world, {
      responsibilities: [
        { id: responsibilityIdForTeam(teamId, 'assignScouts'), teamId, kind: 'assignScouts', mode: 'delegated', holderStaffId: staffId },
        { id: responsibilityIdForTeam(teamId, 'prioritizeRegions'), teamId, kind: 'prioritizeRegions', mode: 'delegated', holderStaffId: staffId },
        { id: responsibilityIdForTeam(teamId, 'oppositionReport'), teamId, kind: 'oppositionReport', mode: 'advisory', holderStaffId: staffId },
        { id: responsibilityIdForTeam(teamId, 'prospectReport'), teamId, kind: 'prospectReport', mode: 'advisory', holderStaffId: staffId },
      ],
    })
    expect(calculateStaffWorkload(heavy, staffId).overloaded).toBe(true)
  })

  it('does not persist workload as stored state — it is absent from GameWorld collections', () => {
    const world = worldWithScout()
    expect((world as unknown as Record<string, unknown>).staffWorkloadByStaffId).toBeUndefined()
  })

  it('regression: cannot spoof capacity/seniority — the role is always resolved from the staff member\'s own active TeamStaffAssignment, never caller-supplied', () => {
    // calculateStaffWorkload(world, staffId) takes no roleId parameter, so there is no argument
    // through which a caller could substitute a higher-seniority role (e.g. 'director') to mask
    // overload. This test proves the *same* world/staffId always yields the *same* workload,
    // regardless of what a caller might have wanted to pass, and that it matches only the
    // staff member's real assignment (regionalScout: standard seniority, capacityCost 2).
    const world = worldWithScout()
    const staffId = staffPersonIdFromString('resp-world-scout')
    const first = calculateStaffWorkload(world, staffId)
    const second = calculateStaffWorkload(world, staffId)
    expect(first).toEqual(second)
    expect(first.totalCapacityUsed).toBe(STAFF_ROLE_REGISTRY.regionalScout.capacityCost)
    expect(first.capacityLimit).toBe(5) // 'standard' seniority limit — would be 9 if a caller could spoof 'director'
  })

  it('reports zero capacity for a staff member with no active TeamStaffAssignment, rather than accepting a caller-supplied role', () => {
    const world = worldWithScout()
    const unassignedStaffId = staffPersonIdFromString('resp-world-unassigned')
    const withUnassigned = updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: unassignedStaffId, identity: { firstName: 'Nova', lastName: 'Reyes' }, professional: { attributes } }],
    })
    const workload = calculateStaffWorkload(withUnassigned, unassignedStaffId)
    expect(workload.totalCapacityUsed).toBe(0)
    expect(workload.capacityLimit).toBe(0)
    expect(workload.overloaded).toBe(false)
  })
})
