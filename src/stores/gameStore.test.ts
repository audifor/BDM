import { createGameDate } from '@/domain/date'
import { getGamesToday } from '@/engine/calendar'
import { getTeamFinancialSnapshot } from '@/domain/world/finances'
import { applyCoachReputationEvent } from '@/domain/coachReputation'
import { beforeEach, describe, expect, it } from 'vitest'

import { selectUserCoachRecentReputationEvents, selectUserCoachReputationProfile, useGameStore } from './gameStore'

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
})
