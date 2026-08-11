import type { MatchSimulation } from '@/engine/match'
import { create } from 'zustand'

export const PLAYBACK_SPEEDS = [1, 2, 4, 8] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

interface MatchViewerStore {
  readonly simulation: MatchSimulation | null
  readonly currentEventIndex: number
  readonly isPlaying: boolean
  readonly speed: PlaybackSpeed
  readonly resultApplied: boolean
  startMatch(simulation: MatchSimulation): void
  replaceSimulation(simulation: MatchSimulation, isPlaying?: boolean): void
  pause(): void
  resume(): void
  setSpeed(speed: PlaybackSpeed): void
  revealNextEvent(): void
  skipToEnd(): void
  markResultApplied(): boolean
  clear(): void
}

/** Ephemeral viewer state. It never belongs to the persistent GameWorld. */
export const useMatchViewerStore = create<MatchViewerStore>((set, get) => ({
  simulation: null,
  currentEventIndex: 0,
  isPlaying: false,
  speed: 1,
  resultApplied: false,
  startMatch: (simulation) => set({ simulation, currentEventIndex: 0, isPlaying: true, speed: 1, resultApplied: false }),
  replaceSimulation: (simulation, isPlaying = true) => set({ simulation, currentEventIndex: simulation.events.length, isPlaying, resultApplied: false }),
  pause: () => set({ isPlaying: false }),
  resume: () => {
    const { simulation, currentEventIndex } = get()
    if (simulation !== null && currentEventIndex < simulation.events.length) {
      set({ isPlaying: true })
    }
  },
  setSpeed: (speed) => set({ speed }),
  revealNextEvent: () => {
    const { simulation, currentEventIndex } = get()
    if (simulation === null || currentEventIndex >= simulation.events.length) return
    const nextIndex = currentEventIndex + 1
    set({ currentEventIndex: nextIndex, isPlaying: nextIndex < simulation.events.length })
  },
  skipToEnd: () => {
    const simulation = get().simulation
    if (simulation !== null) set({ currentEventIndex: simulation.events.length, isPlaying: false })
  },
  markResultApplied: () => {
    if (get().resultApplied) return false
    set({ resultApplied: true })
    return true
  },
  clear: () => set({ simulation: null, currentEventIndex: 0, isPlaying: false, speed: 1, resultApplied: false }),
}))
