import { createNewGame } from '@/app/game'
import { createGameDate } from '@/domain/date'
import { applyRelationshipEventToWorld } from '@/domain/world'
import { getGamesToday } from '@/engine/calendar'
import { getTeamFinancialSnapshot } from '@/domain/world/finances'
import { applyCoachReputationEvent } from '@/domain/coachReputation'
import { beforeEach, describe, expect, it } from 'vitest'
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

    useGameStore.getState().scheduleTrainingSession({ id: 'ui-session', teamId, date: world.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal', status: 'scheduled' })
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

    useGameStore.getState().assignTrainingModuleToPlayer({ playerId, moduleId: 'threePoint', date: world.currentDate, startTime: '09:00', sessionId: 'assigned-session' })

    const sessions = selectUserTeamScheduledSessions(useGameStore.getState().world)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ scope: 'individual', playerId, definitionId: 'threePoint' })
  })

  it('delegates continuing time to the application flow and stores its resulting world', () => {
    useGameStore.getState().newGame()

    const result = useGameStore.getState().continueGame()

    expect(result.daysAdvanced).toBe(0)
    expect(result.stopReason.type).toBe('userGame')
    expect(useGameStore.getState().world).toBe(result.world)
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
