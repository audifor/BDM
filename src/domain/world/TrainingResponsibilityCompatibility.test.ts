import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { setTrainingResponsibility } from '@/engine/training'
import { projectLegacyTrainingResponsibility } from './trainingResponsibilityAdapter'

describe('Training responsibility compatibility (Wave 1 adapter — not a permanent parallel authority)', () => {
  it('does not create a second permanent Responsibility source of truth: responsibilitiesById is unaffected by the legacy setter', () => {
    const world = createNewGame()
    const teamId = Object.keys(world.teams)[0]! as never
    const staffId = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId
    const before = world.responsibilitiesById
    const updated = setTrainingResponsibility(world, teamId, 'teamTraining', staffId)
    expect(updated.responsibilitiesById).toBe(before)
  })

  it('projects the legacy trainingResponsibilitiesByTeamId holder onto the general model shape for read views, without persisting it', () => {
    const world = createNewGame()
    const teamId = Object.keys(world.teams)[0]! as never
    const staffId = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId === teamId)!.staffPersonId
    const updated = setTrainingResponsibility(world, teamId, 'teamTraining', staffId)
    const projected = projectLegacyTrainingResponsibility(updated, teamId, 'createTeamTrainingPlan')
    expect(projected?.holderStaffId).toBe(staffId)
    expect(projected?.mode).toBe('delegated')
  })

  it('returns undefined when the legacy map has no holder for that team/kind', () => {
    const world = createNewGame()
    const teamId = Object.keys(world.teams)[0]! as never
    expect(projectLegacyTrainingResponsibility(world, teamId, 'createTeamTrainingPlan')).toBeUndefined()
  })

  it('returns undefined for a ResponsibilityKind with no legacy TrainingResponsibility counterpart', () => {
    const world = createNewGame()
    const teamId = Object.keys(world.teams)[0]! as never
    expect(projectLegacyTrainingResponsibility(world, teamId, 'oppositionScouting')).toBeUndefined()
  })
})
