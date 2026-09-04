import { create } from 'zustand'

import type { PlayerId } from '@/domain/ids'

interface NgPlayerSelectionState {
  readonly selectedPlayerId: PlayerId | null
  setSelectedPlayerId: (playerId: PlayerId | null) => void
}

export const useNgPlayerSelectionStore = create<NgPlayerSelectionState>((set) => ({
  selectedPlayerId: null,
  setSelectedPlayerId: (playerId) => set({ selectedPlayerId: playerId }),
}))
