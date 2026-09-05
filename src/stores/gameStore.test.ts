import { createNewGame } from '@/app/game'
import { addDays, createGameDate } from '@/domain/date'
import { applyRelationshipEventToWorld } from '@/domain/world'
import { getGamesToday } from '@/engine/calendar'
import { getTeamFinancialSnapshot } from '@/domain/world/finances'
import { applyCoachReputationEvent } from '@/domain/coachReputation'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextEligibleTrainingDate } from '@/engine/training'
import { selectUserCoachRecentReputationEvents, selectUserCoachRelationships, selectUserCoachReputationProfile, selectUserTeamScheduledSessions, selectUserTrainingModules, useGameStore } from './gameStore'

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame()
  })

  it('starts without an active world and creates one on demand', () => {
    expect(useGameStore.getState().world).toBeNull()

    useGameStore.getState().newGame()

    expect(useGameStore.getState().world?.currentDate).toBe(createGameDate(2032, 10, 1))
    const world = useGameStore.getState().world!
    const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
    expect(() => getTeamFinancialSnapshot(world, userTeam.id)).not.toThrow()
  })

  it('delegates user game simulation and advancing the day to application services', () => {
    useGameStore.getState().newGame()
    useGameStore.getState().playUserGame()
    const playedWorld = useGameStore.getState().world!

    expect(getGamesToday(playedWorld).filter((game) => game.status === 'completed')).toHaveLength(1)

    useGameStore.getState().advanceDay()

    expect(useGameStore.getState().world?.currentDate).toBe(createGameDate(2032, 10, 2))
  })

  it('schedules and cancels a training session through the engine, persisted in GameWorld', () => {
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!
    const teamId = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!.id

    useGameStore.getState().scheduleTrainingSession({ id: 'ui-session', teamId, date: nextEligibleTrainingDate(world.currentDate), startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal', status: 'scheduled' })
    expect(selectUserTeamScheduledSessions(useGameStore.getState().world)).toHaveLength(1)

    useGameStore.getState().cancelTrainingSession('ui-session')
    expect(selectUserTeamScheduledSessions(useGameStore.getState().world)).toHaveLength(0)
  })

  it('saves a user training module and it appears in the module bank', () => {
    useGameStore.getState().newGame()
    useGameStore.getState().saveUserTrainingModule({ id: 'user-module', name: 'Custom Threes', baseDefinitionId: 'threePoint', scope: 'individual', intensity: 'high' })

    expect(selectUserTrainingModules(useGameStore.getState().world)).toHaveLength(1)

    useGameStore.getState().deleteUserTrainingModule('user-module')
    expect(selectUserTrainingModules(useGameStore.getState().world)).toHaveLength(0)
  })

  it('assigns a training module to a player as a real scheduled individual session', () => {
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!
    const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!
    const playerId = team.rosterPlayerIds[0]!

    useGameStore.getState().assignTrainingModuleToPlayer({ playerId, moduleId: 'threePoint', date: nextEligibleTrainingDate(world.currentDate), startTime: '09:00', sessionId: 'assigned-session' })

    const sessions = selectUserTeamScheduledSessions(useGameStore.getState().world)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ scope: 'individual', playerId, definitionId: 'threePoint' })
  })

  it('schedules a user-created team module through the store into the Team planner, and it executes through the canonical engine on advanceDay', () => {
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!
    const teamId = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!.id

    useGameStore.getState().saveUserTrainingModule({ id: 'team-user-module', name: 'Custom Cohesion', baseDefinitionId: 'teamCohesion', scope: 'team', intensity: 'high' })
    expect(selectUserTrainingModules(useGameStore.getState().world)).toHaveLength(1)

    useGameStore.getState().scheduleTeamModuleSession({ moduleId: 'team-user-module', date: nextEligibleTrainingDate(world.currentDate), startTime: '09:00', durationMinutes: 60, sessionId: 'team-user-session' })
    const scheduled = selectUserTeamScheduledSessions(useGameStore.getState().world)
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0]).toMatchObject({ scope: 'team', teamId, definitionId: 'teamCohesion', intensity: 'high', status: 'scheduled' })

    useGameStore.getState().advanceDay()
    expect(selectUserTeamScheduledSessions(useGameStore.getState().world)[0]!.status).toBe('completed')
  })

  it('rejects scheduling a training session dated today or in the past through the store', () => {
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!
    const teamId = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!.id
    expect(() => useGameStore.getState().scheduleTrainingSession({ id: 'dead-session', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal', status: 'scheduled' })).toThrow(RangeError)
    expect(selectUserTeamScheduledSessions(useGameStore.getState().world)).toHaveLength(0)
  })

  it('UI/store individual assignment schedules for a date advanceDay actually reaches, and normal advanceDay completes it exactly once with real effects (no direct engine invocation)', () => {
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!
    const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!
    const playerId = team.rosterPlayerIds[0]!
    const beforeFatigue = world.careerFatigueByPlayerId[playerId] ?? 0

    // Mirrors exactly what TrainingPcbPage's PersonalTraining "Asignar" button calls: the store
    // action with the same date policy the UI now uses (nextEligibleTrainingDate), never the engine directly.
    useGameStore.getState().assignTrainingModuleToPlayer({
      playerId,
      moduleId: 'threePoint',
      date: nextEligibleTrainingDate(world.currentDate),
      startTime: '09:00',
      sessionId: 'ui-assigned-session',
    })

    useGameStore.getState().advanceDay()

    const advancedWorld = useGameStore.getState().world!
    const session = advancedWorld.scheduledTrainingSessionsById['ui-assigned-session']!
    expect(session.status).toBe('completed')
    expect(advancedWorld.careerFatigueByPlayerId[playerId]!).toBeGreaterThan(beforeFatigue)
    const stimulusTotal = Object.values(advancedWorld.developmentStimulusByPlayerId[playerId]!.byRating).reduce((sum, value) => sum + value, 0)
    expect(stimulusTotal).toBeGreaterThan(0)

    // A second advanceDay must not re-execute the already-completed session.
    const fatigueAfterFirstAdvance = advancedWorld.careerFatigueByPlayerId[playerId]!
    useGameStore.getState().advanceDay()
    expect(useGameStore.getState().world!.scheduledTrainingSessionsById['ui-assigned-session']!.status).toBe('completed')
    // Fatigue may still change from daily recovery, but not from a second training execution of the same session.
    expect(useGameStore.getState().world!.careerFatigueByPlayerId[playerId]!).not.toBeGreaterThan(fatigueAfterFirstAdvance)
  })

  it('UI/store recovery scheduling from Load Management reduces fatigue after advanceDay', () => {
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!
    const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!
    const playerId = team.rosterPlayerIds[0]!
    const loadDate = nextEligibleTrainingDate(world.currentDate)

    // Elevate fatigue first so the recovery action has something real to reduce.
    useGameStore.getState().scheduleTrainingSession({ id: 'load-session', teamId: team.id, date: loadDate, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'strength', intensity: 'high', status: 'scheduled' })
    useGameStore.getState().advanceDay()
    const fatiguedWorld = useGameStore.getState().world!
    const fatigueAfterLoad = fatiguedWorld.careerFatigueByPlayerId[playerId]!
    expect(fatigueAfterLoad).toBeGreaterThan(0)

    // Mirrors LoadManagementInteractive's "Programar recuperación" action.
    const recoveryDate = nextEligibleTrainingDate(fatiguedWorld.currentDate)
    useGameStore.getState().scheduleTrainingSession({ id: 'recovery-session', teamId: team.id, date: recoveryDate, startTime: '09:00', durationMinutes: 30, scope: 'individual', playerId, definitionId: 'rest', intensity: 'light', status: 'scheduled' })
    expect(selectUserTeamScheduledSessions(useGameStore.getState().world).some((session) => session.id === 'recovery-session')).toBe(true)

    useGameStore.getState().advanceDay()

    const recoveredWorld = useGameStore.getState().world!
    expect(recoveredWorld.scheduledTrainingSessionsById['recovery-session']!.status).toBe('completed')
    expect(recoveredWorld.careerFatigueByPlayerId[playerId]!).toBeLessThan(fatigueAfterLoad)
  })

  it('delegates continuing time to the application flow and stores its resulting world', () => {
    useGameStore.getState().newGame()

    const result = useGameStore.getState().continueGame()

    expect(result.daysAdvanced).toBe(0)
    expect(result.stopReason.type).toBe('userGame')
    expect(useGameStore.getState().world).toBe(result.world)
  })

  it('delegates simulate-until-date to the application flow and stores its resulting world', () => {
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!
    const target = addDays(world.currentDate, 1)

    const result = useGameStore.getState().simulateUntilDate(target)

    expect(result.finalDate).toBe(target)
    expect(useGameStore.getState().world).toBe(result.world)
    expect(useGameStore.getState().world?.currentDate).toBe(target)
  })

  it('opens the canonical live session for the pending game without changing GameWorld', () => {
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!
    const pendingGame = getGamesToday(world).find((game) => game.status === 'scheduled')!

    const simulation = useGameStore.getState().startLiveMatch()

    expect(simulation.gameId).toBe(pendingGame.id)
    expect(useGameStore.getState().world).toBe(world)
    expect(useGameStore.getState().world?.games[pendingGame.id]?.status).toBe('scheduled')
  })

  it('resets the active career', () => {
    useGameStore.getState().newGame()
    useGameStore.getState().resetGame()

    expect(useGameStore.getState().world).toBeNull()
  })

  it('selects canonical user coach reputation without duplicating it in the store', () => {
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!

    expect(selectUserCoachReputationProfile(world)).toBe(world.coachReputationProfilesByCoachId[world.userCoachId])
    expect(selectUserCoachRecentReputationEvents(world, 5)).toEqual([])
    expect(selectUserCoachReputationProfile(null)).toBeUndefined()
  })

  it('keeps Domain recent-event ordering and limits in the selector', () => {
    useGameStore.getState().newGame()
    const world = useGameStore.getState().world!
    const initial = world.coachReputationProfilesByCoachId[world.userCoachId]!
    const first = applyCoachReputationEvent(initial, { id: 'older', gameDate: '2032-10-01', source: 'publicEvent', deltas: { publicStanding: 1 }, context: { kind: 'publicEvent', key: 'older' } })
    if (!first.ok) throw new Error('Expected valid reputation event')
    const second = applyCoachReputationEvent(first.profile, { id: 'newer', gameDate: '2032-10-02', source: 'publicEvent', deltas: { publicStanding: 1 }, context: { kind: 'publicEvent', key: 'newer' } })
    if (!second.ok) throw new Error('Expected valid reputation event')
    const updated = { ...world, coachReputationProfilesByCoachId: { ...world.coachReputationProfilesByCoachId, [world.userCoachId]: second.profile } }

    expect(selectUserCoachRecentReputationEvents(updated, 1).map((event) => event.id)).toEqual(['newer'])
  })

  it('derives user coach relationships from GameWorld without duplicated state', () => {
    const world = createNewGame()
    const player = Object.values(world.players)[0]!
    const updated = applyRelationshipEventToWorld(world, world.userCoachId, player.id, { id: 'relationship:store', gameDate: world.currentDate, source: 'professionalInteraction', delta: -10, context: { kind: 'review' } })

    expect(selectUserCoachRelationships(null)).toEqual([])
    expect(selectUserCoachRelationships(updated)).toEqual([updated.relationshipsByKey[`${world.userCoachId}->${player.id}`]])
  })
})
