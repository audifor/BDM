import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { setTrainingResponsibility } from '@/engine/training'
import { migrateTrainingResponsibilities } from './migrateTrainingResponsibilities'
import { getResponsibility } from './responsibility'

describe('Training responsibility compatibility (Wave 2: migrateTrainingResponsibilities retires the legacy map as a runtime authority)', () => {
  it('the legacy setter alone does not create a second permanent Responsibility source of truth: responsibilitiesById is unaffected until migration runs', () => {
    const world = createNewGame()
    const teamId = Object.keys(world.teams)[0]! as never
    const staffId = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId
    const before = world.responsibilitiesById
    const updated = setTrainingResponsibility(world, teamId, 'teamTraining', staffId)
    expect(updated.responsibilitiesById).toBe(before)
  })

  it('migration converts a legacy holder into the canonical delegated Responsibility and empties the legacy map', () => {
    const world = createNewGame()
    const teamId = Object.keys(world.teams)[0]! as never
    const staffId = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId
    const withLegacyHolder = setTrainingResponsibility(world, teamId, 'teamTraining', staffId)
    const migrated = migrateTrainingResponsibilities(withLegacyHolder)

    const responsibility = getResponsibility(migrated, teamId, 'createTeamTrainingPlan')
    expect(responsibility?.mode).toBe('delegated')
    expect(responsibility?.holderStaffId).toBe(staffId)
    expect(migrated.trainingResponsibilitiesByTeamId[teamId]).toBeUndefined()
    expect(Object.values(migrated.trainingResponsibilitiesByTeamId).every((entry) => Object.keys(entry).length === 0)).toBe(true)
  })
})
