import {
  advanceGameDay,
  completeMatch,
  createNewGame,
  instantResult,
  prepareUserMatch,
  playUserGame,
  simulateRemainingGamesToday,
} from '@/app/game'
import type { GameWorld } from '@/domain/world'
import type { MatchSimulation, MatchTacticalPlan } from '@/engine/match'
import { create } from 'zustand'

interface GameStore {
  readonly world: GameWorld | null
  newGame(): void
  prepareUserMatch(tacticalPlan?: MatchTacticalPlan): MatchSimulation
  completeMatch(simulation: MatchSimulation): void
  instantResult(tacticalPlan?: MatchTacticalPlan): void
  playUserGame(): void
  simulateRemainingGamesToday(): void
  advanceDay(): void
  resetGame(): void
}

/** UI bridge only: game operations remain in Application services. */
export const useGameStore = create<GameStore>((set, get) => ({
  world: null,
  newGame: () => set({ world: createNewGame() }),
  prepareUserMatch: (tacticalPlan) => prepareUserMatch(requireWorld(get().world), tacticalPlan),
  completeMatch: (simulation) => {
    const world = requireWorld(get().world)
    set({ world: completeMatch(world, simulation) })
  },
  instantResult: (tacticalPlan) => {
    const world = requireWorld(get().world)
    set({ world: instantResult(world, tacticalPlan) })
  },
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
