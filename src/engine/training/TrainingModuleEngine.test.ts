import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { advanceDay } from '@/engine/calendar'
import { assignTrainingModuleToPlayer, createOrUpdateUserTrainingModule, dailyLoadStatusForTeam, deleteUserTrainingModule, executeScheduledTrainingSessions } from '@/engine/training'
import { nextEligibleTrainingDate } from './ScheduledTrainingEngine'

describe('TrainingModuleEngine', () => {
  it('creates, updates and deletes a user training module, persisted in GameWorld', () => {
    const world = createNewGame()
    const created = createOrUpdateUserTrainingModule(world, { id: 'u1', name: 'Custom Threes', baseDefinitionId: 'threePoint', scope: 'individual', intensity: 'high' })
    expect(created.userTrainingModulesById['u1']).toMatchObject({ name: 'Custom Threes', baseDefinitionId: 'threePoint' })

    const updated = createOrUpdateUserTrainingModule(created, { id: 'u1', name: 'Renamed', baseDefinitionId: 'threePoint', scope: 'individual', intensity: 'normal' })
    expect(updated.userTrainingModulesById['u1']!.name).toBe('Renamed')

    const deleted = deleteUserTrainingModule(updated, 'u1')
    expect(deleted.userTrainingModulesById['u1']).toBeUndefined()
  })

  it('assigning a built-in catalog module to a player schedules a real individual session that executes its inherited effects', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)

    const scheduled = assignTrainingModuleToPlayer(world, { teamId, playerId, moduleId: 'threePoint', date, startTime: '09:00', sessionId: 's1' })
    expect(scheduled.scheduledTrainingSessionsById['s1']).toMatchObject({ scope: 'individual', playerId, definitionId: 'threePoint', status: 'scheduled' })

    const executed = executeScheduledTrainingSessions({ ...scheduled, currentDate: date })
    expect(executed.scheduledTrainingSessionsById['s1']!.status).toBe('completed')
    expect(executed.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting!).toBeGreaterThan(0)
  })

  it('assigning a user-created module inherits the base definition\'s real effect profile (target ratings, intensity) rather than a separate authority', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const withModule = createOrUpdateUserTrainingModule(world, { id: 'custom-threes', name: 'Custom Threes', baseDefinitionId: 'threePoint', scope: 'individual', intensity: 'high' })

    const scheduled = assignTrainingModuleToPlayer(withModule, { teamId, playerId, moduleId: 'custom-threes', date, startTime: '09:00', sessionId: 's2' })
    expect(scheduled.scheduledTrainingSessionsById['s2']).toMatchObject({ definitionId: 'threePoint', intensity: 'high' })

    const executed = executeScheduledTrainingSessions({ ...scheduled, currentDate: date })
    expect(executed.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting!).toBeGreaterThan(0)
  })

  it('rejects assigning a team-only definition to individual training', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    expect(() => assignTrainingModuleToPlayer(world, { teamId, playerId, moduleId: 'teamCohesion', date: nextEligibleTrainingDate(world.currentDate), startTime: '09:00', sessionId: 's3' })).toThrow(RangeError)
  })

  it('assignment through the store/UI path executes exactly once via a normal advanceDay', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const scheduled = assignTrainingModuleToPlayer(world, { teamId, playerId, moduleId: 'threePoint', date: nextEligibleTrainingDate(world.currentDate), startTime: '09:00', sessionId: 's4' })
    const advanced = advanceDay(scheduled)
    expect(advanced.scheduledTrainingSessionsById['s4']!.status).toBe('completed')
    expect(dailyLoadStatusForTeam(advanced, teamId, advanced.currentDate)).toBe('OK')
  })
})
