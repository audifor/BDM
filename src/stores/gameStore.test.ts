import { createGameDate } from '@/domain/date'
import { getGamesToday } from '@/engine/calendar'
import { getTeamFinancialSnapshot } from '@/domain/world/finances'
import { beforeEach, describe, expect, it } from 'vitest'

import { useGameStore } from './gameStore'

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
})
