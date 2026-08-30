import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { advanceDay } from '@/engine/calendar'
import { assignTrainingModuleToPlayer, createOrUpdateUserTrainingModule, dailyLoadStatusForTeam, deleteUserTrainingModule, executeScheduledTrainingSessions, scheduleTeamModuleSession } from '@/engine/training'
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

  it('keeps a built-in both-scoped module available to both individual and team training', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)

    const individual = assignTrainingModuleToPlayer(world, { teamId, playerId, moduleId: 'threePoint', date, startTime: '09:00', sessionId: 'both-individual' })
    const team = scheduleTeamModuleSession(world, { teamId, moduleId: 'threePoint', date, startTime: '09:00', durationMinutes: 60, sessionId: 'both-team' })

    expect(individual.scheduledTrainingSessionsById['both-individual']?.scope).toBe('individual')
    expect(team.scheduledTrainingSessionsById['both-team']?.scope).toBe('team')
  })

  it('enforces an individual scope selected for a user module based on a both-scoped definition', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const withModule = createOrUpdateUserTrainingModule(world, { id: 'individual-threes', name: 'Individual Threes', baseDefinitionId: 'threePoint', scope: 'individual', intensity: 'normal' })

    const assigned = assignTrainingModuleToPlayer(withModule, { teamId, playerId, moduleId: 'individual-threes', date, startTime: '09:00', sessionId: 'individual-threes-session' })

    expect(assigned.scheduledTrainingSessionsById['individual-threes-session']?.scope).toBe('individual')
    expect(() => scheduleTeamModuleSession(withModule, { teamId, moduleId: 'individual-threes', date, startTime: '09:00', durationMinutes: 60, sessionId: 'invalid-team-session' })).toThrow(RangeError)
  })

  it('enforces a team scope selected for a user module based on a both-scoped definition', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const withModule = createOrUpdateUserTrainingModule(world, { id: 'team-threes', name: 'Team Threes', baseDefinitionId: 'threePoint', scope: 'team', intensity: 'normal' })

    const scheduled = scheduleTeamModuleSession(withModule, { teamId, moduleId: 'team-threes', date, startTime: '09:00', durationMinutes: 60, sessionId: 'team-threes-session' })

    expect(scheduled.scheduledTrainingSessionsById['team-threes-session']?.scope).toBe('team')
    expect(() => assignTrainingModuleToPlayer(withModule, { teamId, playerId, moduleId: 'team-threes', date, startTime: '09:00', sessionId: 'invalid-individual-session' })).toThrow(RangeError)
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

  it('accepts assigning a position-restricted definition to an eligible player (PF/C for Post Scoring)', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const eligiblePlayerId = world.teams[teamId]!.rosterPlayerIds.find((id) => ['PF', 'C'].includes(world.players[id]!.basketball.primaryPosition))
    expect(eligiblePlayerId).toBeDefined()
    const scheduled = assignTrainingModuleToPlayer(world, { teamId, playerId: eligiblePlayerId!, moduleId: 'postScoring', date: nextEligibleTrainingDate(world.currentDate), startTime: '09:00', sessionId: 's5' })
    expect(scheduled.scheduledTrainingSessionsById['s5']).toMatchObject({ definitionId: 'postScoring', status: 'scheduled' })
  })

  it('rejects assigning a position-restricted definition to an ineligible player (PG for Post Scoring, PF/C only)', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const ineligiblePlayerId = world.teams[teamId]!.rosterPlayerIds.find((id) => world.players[id]!.basketball.primaryPosition === 'PG')
    expect(ineligiblePlayerId).toBeDefined()
    expect(() => assignTrainingModuleToPlayer(world, { teamId, playerId: ineligiblePlayerId!, moduleId: 'postScoring', date: nextEligibleTrainingDate(world.currentDate), startTime: '09:00', sessionId: 's6' })).toThrow(RangeError)
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

  it.each<readonly ['light' | 'normal' | 'high']>([['light'], ['normal'], ['high']])(
    'a built-in team session persists the user-selected intensity (%s), not the definition default',
    (selected) => {
      const world = createNewGame()
      const teamId = Object.values(world.teams)[0]!.id
      const date = nextEligibleTrainingDate(world.currentDate)

      const scheduled = scheduleTeamModuleSession(world, { teamId, moduleId: 'threePoint', date, startTime: '09:00', durationMinutes: 60, sessionId: `intensity-${selected}`, intensity: selected })

      expect(scheduled.scheduledTrainingSessionsById[`intensity-${selected}`]!.intensity).toBe(selected)
    },
  )

  it('a user-created module keeps its own configured intensity authoritative even if a different intensity is passed in', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const date = nextEligibleTrainingDate(world.currentDate)
    const withModule = createOrUpdateUserTrainingModule(world, { id: 'locked-intensity', name: 'Locked Intensity', baseDefinitionId: 'threePoint', scope: 'team', intensity: 'high' })

    const scheduled = scheduleTeamModuleSession(withModule, { teamId, moduleId: 'locked-intensity', date, startTime: '09:00', durationMinutes: 60, sessionId: 'locked-session', intensity: 'light' })

    expect(scheduled.scheduledTrainingSessionsById['locked-session']!.intensity).toBe('high')
  })

  it('editing/reopening a scheduled built-in session preserves its persisted intensity across a re-save', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const date = nextEligibleTrainingDate(world.currentDate)

    const scheduled = scheduleTeamModuleSession(world, { teamId, moduleId: 'threePoint', date, startTime: '09:00', durationMinutes: 60, sessionId: 'edit-session', intensity: 'high' })
    expect(scheduled.scheduledTrainingSessionsById['edit-session']!.intensity).toBe('high')

    const reSaved = scheduleTeamModuleSession(scheduled, { teamId, moduleId: 'threePoint', date, startTime: '11:00', durationMinutes: 60, sessionId: 'edit-session', intensity: 'high' })
    expect(reSaved.scheduledTrainingSessionsById['edit-session']!.intensity).toBe('high')
  })

  it('a user-created team module is schedulable into the Team planner: created -> scheduled -> advanceDay -> completes once -> inherited effects applied', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const beforeCohesion = world.teamCohesionByTeamId[teamId]!

    const withModule = createOrUpdateUserTrainingModule(world, { id: 'my-cohesion', name: 'My Cohesion Drill', baseDefinitionId: 'teamCohesion', scope: 'team', intensity: 'high' })
    const date = nextEligibleTrainingDate(withModule.currentDate)
    const scheduled = scheduleTeamModuleSession(withModule, { teamId, moduleId: 'my-cohesion', date, startTime: '09:00', durationMinutes: 60, sessionId: 'team-user-session' })
    expect(scheduled.scheduledTrainingSessionsById['team-user-session']).toMatchObject({ scope: 'team', definitionId: 'teamCohesion', intensity: 'high', status: 'scheduled' })

    const advanced = advanceDay(scheduled)
    expect(advanced.scheduledTrainingSessionsById['team-user-session']!.status).toBe('completed')
    // Re-advancing must not re-execute it a second time.
    const advancedTwice = advanceDay(advanced)
    expect(advancedTwice.teamCohesionByTeamId[teamId]).toBe(advanced.teamCohesionByTeamId[teamId])
    expect(advanced.teamCohesionByTeamId[teamId]!).toBeGreaterThan(beforeCohesion)
    const stimulusTotal = Object.values(advanced.developmentStimulusByPlayerId[playerId]!.byRating).reduce((sum, value) => sum + value, 0)
    expect(stimulusTotal).toBeGreaterThanOrEqual(0)
  })
})
