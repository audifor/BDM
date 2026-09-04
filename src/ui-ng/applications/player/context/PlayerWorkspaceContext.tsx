import { createContext, useContext, type ReactNode } from 'react'

import type { PlayerWorkspaceState } from '@/ui-ng/applications/player/data/usePlayerWorkspaceModel'

const PlayerWorkspaceContext = createContext<PlayerWorkspaceState | null>(null)

export function PlayerWorkspaceProvider({
  value,
  children,
}: {
  readonly value: PlayerWorkspaceState
  readonly children: ReactNode
}) {
  return <PlayerWorkspaceContext.Provider value={value}>{children}</PlayerWorkspaceContext.Provider>
}

export function usePlayerWorkspace(): PlayerWorkspaceState {
  const context = useContext(PlayerWorkspaceContext)
  if (context === null) {
    throw new Error('usePlayerWorkspace must be used within PlayerWorkspaceProvider')
  }
  return context
}
