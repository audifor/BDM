import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getTeamResponsibilities, updateGameWorld } from '@/domain/world'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { createGameDate } from '@/domain/date'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

const testAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 45])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>

describe('Responsibility persistence', () => {
  it('round-trips Responsibility rows created for a real world', () => {
    const base = createNewGame()
    const teamId = Object.keys(base.teams)[0]! as never
    const responsibilities = getTeamResponsibilities(base, teamId)
    expect(responsibilities.length).toBeGreaterThan(0)

    const saved = serializeGameWorldV1(base, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(loaded.responsibilitiesById).toEqual(base.responsibilitiesById)
    expect(loaded.delegationOutcomesById).toEqual(base.delegationOutcomesById)
  })

  it('round-trips a delegated assignment and a DelegationOutcome', () => {
    const base = createNewGame()
    const teamId = Object.keys(base.teams)[0]! as never
    const staffId = Object.values(base.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId
    const responsibilityId = responsibilityIdForTeam(teamId, 'createTeamTrainingPlan')
    const withAssignment = updateGameWorld(base, {
      responsibilities: [{ ...base.responsibilitiesById[responsibilityId]!, mode: 'delegated', holderStaffId: staffId }],
      delegationOutcomes: [{ id: 'outcome:round-trip' as never, responsibilityId, staffId, decidedOn: base.currentDate, kind: 'createTeamTrainingPlan', applied: true, qualityScore: 61, payload: { intensity: 'normal' } }],
    })
    const saved = serializeGameWorldV1(withAssignment, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(loaded.responsibilitiesById[responsibilityId]).toEqual(withAssignment.responsibilitiesById[responsibilityId])
    expect(Object.values(loaded.delegationOutcomesById)).toEqual(Object.values(withAssignment.delegationOutcomesById))
  })

  it('backward-compatible: a legacy save missing responsibilities/delegationOutcomes fields deterministically backfills userControlled defaults', () => {
    const base = createNewGame()
    const saved = serializeGameWorldV1(base, '2032-10-01T00:00:00.000Z')
    const { responsibilities: _responsibilities, delegationOutcomes: _delegationOutcomes, ...legacyPayload } = saved.payload
    const loaded = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    const teamId = Object.keys(loaded.teams)[0]! as never
    expect(getTeamResponsibilities(loaded, teamId).length).toBeGreaterThan(0)
    expect(getTeamResponsibilities(loaded, teamId).every((responsibility) => responsibility.mode === 'userControlled' && responsibility.holderStaffId === undefined)).toBe(true)
    expect(Object.keys(loaded.delegationOutcomesById)).toHaveLength(0)
  })

  it('enrichment is idempotent across repeated legacy loads', () => {
    const base = createNewGame()
    const saved = serializeGameWorldV1(base, '2032-10-01T00:00:00.000Z')
    const { responsibilities: _responsibilities, ...legacyPayload } = saved.payload
    const first = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    const second = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    expect(first.responsibilitiesById).toEqual(second.responsibilitiesById)
  })

  it('regression: StaffIdentity.dateOfBirth/nationality survive serialize -> JSON -> deserialize (previously silently dropped by readStaffPerson)', () => {
    const base = createNewGame()
    const staffId = staffPersonIdFromString('identity-round-trip-staff')
    const withIdentity = updateGameWorld(base, {
      staffPeople: [...Object.values(base.staffPeopleById), { id: staffId, identity: { firstName: 'Talia', lastName: 'Novak', dateOfBirth: createGameDate(1985, 6, 20), nationality: 'Meridia' }, professional: { attributes: testAttributes } }],
    })
    const saved = serializeGameWorldV1(withIdentity, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(loaded.staffPeopleById[staffId]!.identity.dateOfBirth).toBe(createGameDate(1985, 6, 20))
    expect(loaded.staffPeopleById[staffId]!.identity.nationality).toBe('Meridia')
  })

  it('regression: a StaffPerson with no optional identity fields still round-trips cleanly (no phantom fields introduced)', () => {
    const base = createNewGame()
    const staffId = staffPersonIdFromString('identity-round-trip-minimal')
    const withStaff = updateGameWorld(base, {
      staffPeople: [...Object.values(base.staffPeopleById), { id: staffId, identity: { firstName: 'Kian', lastName: 'Ash' }, professional: { attributes: testAttributes } }],
    })
    const saved = serializeGameWorldV1(withStaff, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(loaded.staffPeopleById[staffId]!.identity.dateOfBirth).toBeUndefined()
    expect(loaded.staffPeopleById[staffId]!.identity.nationality).toBeUndefined()
  })

  it('regression: assigning a non-legacy canonical StaffRoleId round-trips and remains a valid Responsibility holder', () => {
    const base = createNewGame()
    const teamId = Object.keys(base.teams)[0]! as never
    const staffId = staffPersonIdFromString('canonical-role-staff')
    const withStaff = updateGameWorld(base, {
      staffPeople: [...Object.values(base.staffPeopleById), { id: staffId, identity: { firstName: 'Reo', lastName: 'Ibarra' }, professional: { attributes: { ...testAttributes, medicalKnowledge: 90, rehabilitation: 85 } } }],
      teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('canonical-role-assignment'), staffPersonId: staffId, teamId, role: 'teamDoctor', assignedOn: base.currentDate }],
    })
    const responsibilityId = responsibilityIdForTeam(teamId, 'treatmentRecommendation')
    const delegated = updateGameWorld(withStaff, {
      responsibilities: [{ id: responsibilityId, teamId, kind: 'treatmentRecommendation', mode: 'advisory', holderStaffId: staffId }],
    })
    const saved = serializeGameWorldV1(delegated, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(loaded.teamStaffAssignmentsById[teamStaffAssignmentIdFromString('canonical-role-assignment')]!.role).toBe('teamDoctor')
    expect(loaded.responsibilitiesById[responsibilityId]!.holderStaffId).toBe(staffId)
  })

  it('regression: legacy save role values scout/medical deterministically load to their canonical StaffRoleId (regionalScout/physiotherapist), not a second vocabulary', () => {
    const base = createNewGame()
    const saved = serializeGameWorldV1(base, '2032-10-01T00:00:00.000Z')
    const legacyPayload = { ...saved.payload, teamStaffAssignments: saved.payload.teamStaffAssignments.map((assignment) => ({ ...assignment, role: assignment.role === 'regionalScout' ? 'scout' : assignment.role === 'physiotherapist' ? 'medical' : assignment.role })) }
    const loaded = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    const roles = new Set(Object.values(loaded.teamStaffAssignmentsById).map((assignment) => assignment.role))
    expect(roles.has('scout' as never)).toBe(false)
    expect(roles.has('medical' as never)).toBe(false)
    expect(roles.has('regionalScout')).toBe(true)
    expect(roles.has('physiotherapist')).toBe(true)
  })
})
