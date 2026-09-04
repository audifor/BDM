import { createContext, useContext, type ReactNode } from 'react'

import type { PlayerWorkspaceSession } from '@/ui-ng/applications/player/context/playerWorkspaceSession'
import type { PlayerWorkspaceState } from '@/ui-ng/applications/player/data/usePlayerWorkspaceModel'

export interface PlayerWorkspaceContextValue extends PlayerWorkspaceState {
  readonly session: PlayerWorkspaceSession
}

const PlayerWorkspaceContext = createContext<PlayerWorkspaceContextValue | null>(null)

export function PlayerWorkspaceProvider({
  value,
  children,
}: {
  readonly value: PlayerWorkspaceContextValue
  readonly children: ReactNode
}) {
  return <PlayerWorkspaceContext.Provider value={value}>{children}</PlayerWorkspaceContext.Provider>
}

export function usePlayerWorkspace(): PlayerWorkspaceContextValue {
  const context = useContext(PlayerWorkspaceContext)
  if (context === null) {
    throw new Error('usePlayerWorkspace must be used within PlayerWorkspaceProvider')
  }
  return context
}
