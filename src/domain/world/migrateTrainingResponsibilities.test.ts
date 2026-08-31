import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { setTrainingResponsibility } from '@/engine/training'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { migrateTrainingResponsibilities } from './migrateTrainingResponsibilities'
import { getResponsibility, updateGameWorld, type GameWorld } from './index'

const flatAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>

/** The default-generated `assistantCoach` is eligible for teamTraining/individualDevelopment but not physicalLoad (determineIntensity requires strengthConditioningCoach/performanceCoach/loadManagementSpecialist), so tests exercising physicalLoad need a role-eligible staff member. */
function withPerformanceCoach(world: GameWorld, teamId: TeamId) {
  const staffId = staffPersonIdFromString(`migration-test-performance-coach-${teamId}`)
  const withStaff = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Cam', lastName: 'Oduya' }, professional: { attributes: flatAttributes } }],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`migration-test-performance-assignment-${teamId}`), staffPersonId: staffId, teamId, role: 'performanceCoach', assignedOn: world.currentDate }],
  })
  return { world: withStaff, staffId }
}

function teamAndStaff(world: ReturnType<typeof createNewGame>) {
  const teamId = Object.keys(world.teams)[0]! as TeamId
  const assistantCoachAssignment = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId && assignment.role === 'assistantCoach')!
  return { teamId, staffId: assistantCoachAssignment.staffPersonId }
}

describe('migrateTrainingResponsibilities', () => {
  it('maps teamTraining -> createTeamTrainingPlan', () => {
    const world = createNewGame()
    const { teamId, staffId } = teamAndStaff(world)
    const migrated = migrateTrainingResponsibilities(setTrainingResponsibility(world, teamId, 'teamTraining', staffId))
    const responsibility = getResponsibility(migrated, teamId, 'createTeamTrainingPlan')
    expect(responsibility?.mode).toBe('delegated')
    expect(responsibility?.holderStaffId).toBe(staffId)
  })

  it('maps individualDevelopment -> assignIndividualDevelopment', () => {
    const world = createNewGame()
    const { teamId, staffId } = teamAndStaff(world)
    const migrated = migrateTrainingResponsibilities(setTrainingResponsibility(world, teamId, 'individualDevelopment', staffId))
    const responsibility = getResponsibility(migrated, teamId, 'assignIndividualDevelopment')
    expect(responsibility?.mode).toBe('delegated')
    expect(responsibility?.holderStaffId).toBe(staffId)
  })

  it('maps physicalLoad -> determineIntensity', () => {
    const base = createNewGame()
    const { teamId } = teamAndStaff(base)
    const { world, staffId } = withPerformanceCoach(base, teamId)
    const migrated = migrateTrainingResponsibilities(setTrainingResponsibility(world, teamId, 'physicalLoad', staffId))
    const responsibility = getResponsibility(migrated, teamId, 'determineIntensity')
    expect(responsibility?.mode).toBe('delegated')
    expect(responsibility?.holderStaffId).toBe(staffId)
  })

  it('converts the Wave 1 default row rather than duplicating it: exactly one Responsibility row exists for the (team, kind) pair', () => {
    const world = createNewGame()
    const { teamId, staffId } = teamAndStaff(world)
    const beforeCount = Object.keys(world.responsibilitiesById).length
    const migrated = migrateTrainingResponsibilities(setTrainingResponsibility(world, teamId, 'teamTraining', staffId))
    expect(Object.keys(migrated.responsibilitiesById)).toHaveLength(beforeCount)
    expect(migrated.responsibilitiesById[responsibilityIdForTeam(teamId, 'createTeamTrainingPlan')]).toBeDefined()
  })

  it('does not overwrite a canonical Responsibility already explicitly changed to a non-default state', () => {
    const world = createNewGame()
    const { teamId, staffId } = teamAndStaff(world)
    const secondStaffId = staffPersonIdFromString(`migration-test-associate-coach-${teamId}`)
    const withSecondStaff = updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: secondStaffId, identity: { firstName: 'Vera', lastName: 'Solis' }, professional: { attributes: flatAttributes } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`migration-test-associate-assignment-${teamId}`), staffPersonId: secondStaffId, teamId, role: 'associateCoach', assignedOn: world.currentDate }],
    })
    const createTeamTrainingPlanId = responsibilityIdForTeam(teamId, 'createTeamTrainingPlan')
    const explicitlyDelegatedToSecond = updateGameWorld(withSecondStaff, {
      responsibilities: [...Object.values(withSecondStaff.responsibilitiesById).filter((responsibility) => responsibility.id !== createTeamTrainingPlanId), { id: createTeamTrainingPlanId, teamId, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: secondStaffId }],
    })
    const withStaleLegacyHolder = setTrainingResponsibility(explicitlyDelegatedToSecond, teamId, 'teamTraining', staffId)
    const migrated = migrateTrainingResponsibilities(withStaleLegacyHolder)
    // Canonical state (secondStaffId) wins over the stale legacy map entry (staffId).
    expect(getResponsibility(migrated, teamId, 'createTeamTrainingPlan')?.holderStaffId).toBe(secondStaffId)
  })

  it('retires the legacy map after migration: trainingResponsibilitiesByTeamId is empty', () => {
    const world = createNewGame()
    const { teamId, staffId } = teamAndStaff(world)
    const migrated = migrateTrainingResponsibilities(setTrainingResponsibility(world, teamId, 'teamTraining', staffId))
    expect(Object.values(migrated.trainingResponsibilitiesByTeamId).every((entry) => Object.keys(entry).length === 0)).toBe(true)
  })

  it('is idempotent: migrating twice produces the same canonical state', () => {
    const world = createNewGame()
    const { teamId, staffId } = teamAndStaff(world)
    const withLegacyHolder = setTrainingResponsibility(world, teamId, 'teamTraining', staffId)
    const once = migrateTrainingResponsibilities(withLegacyHolder)
    const twice = migrateTrainingResponsibilities(once)
    expect(twice.responsibilitiesById).toEqual(once.responsibilitiesById)
    expect(twice.trainingResponsibilitiesByTeamId).toEqual(once.trainingResponsibilitiesByTeamId)
  })

  it('is a no-op (referentially unchanged) on a world with no legacy holders', () => {
    const world = createNewGame()
    expect(migrateTrainingResponsibilities(world)).toBe(world)
  })

  it('legacy save -> load -> canonical Responsibility holder is preserved', async () => {
    const { serializeGameWorldV1, deserializeGameWorldV1 } = await import('@/save/GameWorldSaveV1')
    const world = createNewGame()
    const { teamId, staffId } = teamAndStaff(world)
    const withLegacyHolder = setTrainingResponsibility(world, teamId, 'teamTraining', staffId)
    const saved = serializeGameWorldV1(withLegacyHolder, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(getResponsibility(loaded, teamId, 'createTeamTrainingPlan')?.holderStaffId).toBe(staffId)
    expect(getResponsibility(loaded, teamId, 'createTeamTrainingPlan')?.mode).toBe('delegated')
  })

  it('a Wave 2 save -> round-trip does not resurrect the legacy map', async () => {
    const { serializeGameWorldV1, deserializeGameWorldV1 } = await import('@/save/GameWorldSaveV1')
    const world = createNewGame()
    const { teamId, staffId } = teamAndStaff(world)
    const migrated = migrateTrainingResponsibilities(setTrainingResponsibility(world, teamId, 'teamTraining', staffId))
    const saved = serializeGameWorldV1(migrated, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(Object.values(loaded.trainingResponsibilitiesByTeamId).every((entry) => Object.keys(entry).length === 0)).toBe(true)
    expect(getResponsibility(loaded, teamId, 'createTeamTrainingPlan')?.holderStaffId).toBe(staffId)
  })
})
