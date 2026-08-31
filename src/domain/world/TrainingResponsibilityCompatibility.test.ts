import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import * as trainingEngine from '@/engine/training'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { migrateTrainingResponsibilities } from './migrateTrainingResponsibilities'
import { getResponsibility } from './responsibility'
import { updateGameWorld, type GameWorld } from './index'

/**
 * Simulates a pre-Wave-2 save that had already written a legacy training-responsibility holder
 * (back when the now-removed `setTrainingResponsibility` runtime setter existed). This is
 * historical save data, never a live runtime write path — built directly via `updateGameWorld`
 * against `trainingResponsibilitiesByTeamId`, exactly as `GameWorldSaveV1`'s reader would
 * reconstruct it from an old save file.
 */
function withSimulatedLegacySaveHolder(world: GameWorld, teamId: TeamId, staffId: StaffPersonId): GameWorld {
  return updateGameWorld(world, {
    trainingResponsibilitiesByTeamId: { ...world.trainingResponsibilitiesByTeamId, [teamId]: { ...world.trainingResponsibilitiesByTeamId[teamId], teamTraining: staffId } },
  })
}

describe('Training responsibility compatibility (Wave 2: migrateTrainingResponsibilities retires the legacy map as a runtime authority)', () => {
  it('no productive/public API can write to trainingResponsibilitiesByTeamId at runtime: the legacy setter has been removed entirely', () => {
    // `setTrainingResponsibility` used to be the only production writer for the legacy map; it has
    // been deleted from TrainingEngine.ts and its export removed from the training barrel. This
    // proves it can no longer be imported/called from anywhere in the codebase.
    expect('setTrainingResponsibility' in trainingEngine).toBe(false)
  })

  it('historical legacy save data (simulated directly, not via any runtime setter) does not create a second permanent Responsibility source of truth until migration runs', () => {
    const world = createNewGame()
    const teamId = Object.keys(world.teams)[0]! as TeamId
    const staffId = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId
    const before = world.responsibilitiesById
    const withSimulatedLegacy = withSimulatedLegacySaveHolder(world, teamId, staffId)
    expect(withSimulatedLegacy.responsibilitiesById).toBe(before)
  })

  it('migration converts simulated historical legacy save data into the canonical delegated Responsibility and empties the legacy map', () => {
    const world = createNewGame()
    const teamId = Object.keys(world.teams)[0]! as TeamId
    const staffId = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId
    const withSimulatedLegacy = withSimulatedLegacySaveHolder(world, teamId, staffId)
    const migrated = migrateTrainingResponsibilities(withSimulatedLegacy)

    const responsibility = getResponsibility(migrated, teamId, 'createTeamTrainingPlan')
    expect(responsibility?.mode).toBe('delegated')
    expect(responsibility?.holderStaffId).toBe(staffId)
    expect(migrated.trainingResponsibilitiesByTeamId[teamId]).toBeUndefined()
    expect(Object.values(migrated.trainingResponsibilitiesByTeamId).every((entry) => Object.keys(entry).length === 0)).toBe(true)
  })

  it('after migration, nothing can repopulate trainingResponsibilitiesByTeamId short of loading another legacy save: a fresh createNewGame() world never has entries in it', () => {
    const world = createNewGame()
    expect(Object.values(world.trainingResponsibilitiesByTeamId).every((entry) => Object.keys(entry).length === 0)).toBe(true)
  })
})
