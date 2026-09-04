import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { EntityDestination } from '@/ui/navigation/entityNavigation'

import {
  navigateToPlayer,
  navigateToPlayerFromRoster,
  readNgWorkspaceNavigation,
  syncWorkspaceAppQuery,
  type WorkspaceAppId,
} from '@/ui-ng/workspace/workspaceApps'

interface NgWorkspaceNavigationValue {
  readonly app: WorkspaceAppId
  readonly setActiveApp: (app: WorkspaceAppId) => void
  readonly openEntity: (destination: EntityDestination) => void
}

const NgWorkspaceNavigationContext = createContext<NgWorkspaceNavigationValue | null>(null)

function readNavigation() {
  const snapshot = readNgWorkspaceNavigation()
  return {
    app: snapshot.app,
  }
}

export function NgWorkspaceNavigationProvider({ children }: { readonly children: ReactNode }) {
  const [navigation, setNavigation] = useState(readNavigation)

  useEffect(() => {
    const sync = () => setNavigation(readNavigation())
    window.addEventListener('bdm-ng-nav', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('bdm-ng-nav', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  const value = useMemo<NgWorkspaceNavigationValue>(
    () => ({
      ...navigation,
      setActiveApp: (app: WorkspaceAppId) => syncWorkspaceAppQuery(app),
      openEntity: (destination: EntityDestination) => {
        if (destination.type === 'player') {
          const current = readNavigation()
          if (current.app === 'roster') {
            navigateToPlayerFromRoster(destination.playerId)
            return
          }
          navigateToPlayer(destination.playerId)
          return
        }
        window.dispatchEvent(new Event('bdm-ng-nav'))
      },
    }),
    [navigation],
  )

  return (
    <NgWorkspaceNavigationContext.Provider value={value}>{children}</NgWorkspaceNavigationContext.Provider>
  )
}

export function useNgWorkspaceNavigation(): NgWorkspaceNavigationValue {
  const value = useContext(NgWorkspaceNavigationContext)
  if (value === null) {
    throw new Error('useNgWorkspaceNavigation must be used within NgWorkspaceNavigationProvider')
  }
  return value
}
