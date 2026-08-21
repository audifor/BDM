import { create } from 'zustand'

import type { CompetitionId, PlayerId, TeamId } from '@/domain/ids'

export type TeamSection = 'overview' | 'squad' | 'staff' | 'competitions'
export type PlayerSection = 'overview'
export type CompetitionSection = 'overview' | 'standings' | 'schedule' | 'teams'

export type EntityDestination =
  | { readonly type: 'team'; readonly teamId: TeamId; readonly section: TeamSection }
  | { readonly type: 'player'; readonly playerId: PlayerId; readonly section: PlayerSection }
  | { readonly type: 'competition'; readonly competitionId: CompetitionId; readonly section: CompetitionSection }

export interface EntityNavigationState {
  readonly destination: EntityDestination | null
  readonly history: readonly EntityDestination[]
  navigate(destination: EntityDestination): void
  back(): void
  reset(): void
}

export const useEntityNavigationStore = create<EntityNavigationState>()((set) => ({
  destination: null,
  history: [],
  navigate: (destination) => set((state) => ({
    destination,
    history: state.destination === null ? state.history : [...state.history, state.destination],
  })),
  back: () => set((state) => {
    const previous = state.history.at(-1)
    return previous === undefined ? state : { destination: previous, history: state.history.slice(0, -1) }
  }),
  reset: () => set({ destination: null, history: [] }),
}))
