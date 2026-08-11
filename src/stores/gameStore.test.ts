import { createGameDate } from '@/domain/date'
import { getGamesToday } from '@/engine/calendar'
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
