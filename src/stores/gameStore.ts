import { advanceGameDay, createNewGame, playUserGame, simulateRemainingGamesToday } from '@/app/game'
import type { GameWorld } from '@/domain/world'
import { create } from 'zustand'

interface GameStore {
  readonly world: GameWorld | null
  newGame(): void
  playUserGame(): void
  simulateRemainingGamesToday(): void
  advanceDay(): void
  resetGame(): void
}

/** UI bridge only: game operations remain in Application services. */
export const useGameStore = create<GameStore>((set, get) => ({
  world: null,
  newGame: () => set({ world: createNewGame() }),
  playUserGame: () => {
    const world = requireWorld(get().world)
    set({ world: playUserGame(world) })
  },
  simulateRemainingGamesToday: () => {
    const world = requireWorld(get().world)
    set({ world: simulateRemainingGamesToday(world) })
  },
  advanceDay: () => {
    const world = requireWorld(get().world)
    set({ world: advanceGameDay(world) })
  },
  resetGame: () => set({ world: null }),
}))

function requireWorld(world: GameWorld | null): GameWorld {
  if (world === null) {
    throw new Error('No active game')
  }

  return world
}
