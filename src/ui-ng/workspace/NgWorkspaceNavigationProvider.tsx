import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { CompetitionId, TeamId } from '@/domain/ids'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'

import {
  closeOpenedTaskbarApp,
  isClosableTaskbarApp,
  rememberOpenedTaskbarApp,
  visibleTaskbarAppIds,
} from '@/ui-ng/workspace/taskbarOpenApps'
import {
  navigateToCompetitionInNg,
  navigateToPlayer,
  navigateToPlayerFromRoster,
  navigateToTeamInNg,
  readNgWorkspaceNavigation,
  syncWorkspaceAppQuery,
  type WorkspaceAppId,
} from '@/ui-ng/workspace/workspaceApps'

interface NgWorkspaceNavigationValue {
  readonly app: WorkspaceAppId
  readonly teamId: TeamId | null
  readonly competitionId: CompetitionId | null
  readonly openApps: readonly WorkspaceAppId[]
  readonly setActiveApp: (app: WorkspaceAppId) => void
  readonly closeApp: (app: WorkspaceAppId) => void
  readonly openEntity: (destination: EntityDestination) => void
}

const NgWorkspaceNavigationContext = createContext<NgWorkspaceNavigationValue | null>(null)

function readNavigation() {
  const snapshot = readNgWorkspaceNavigation()
  return {
    app: snapshot.app,
    teamId: snapshot.teamId,
    competitionId: snapshot.competitionId,
  }
}

function seedOpenApps(): readonly WorkspaceAppId[] {
  return rememberOpenedTaskbarApp([], readNavigation().app)
}

export function NgWorkspaceNavigationProvider({ children }: { readonly children: ReactNode }) {
  const [navigation, setNavigation] = useState(readNavigation)
  const [openApps, setOpenApps] = useState<readonly WorkspaceAppId[]>(seedOpenApps)
  const openAppsRef = useRef(openApps)
  openAppsRef.current = openApps

  useEffect(() => {
    const sync = () => {
      const next = readNavigation()
      const remembered = rememberOpenedTaskbarApp(openAppsRef.current, next.app)
      openAppsRef.current = remembered
      setNavigation(next)
      setOpenApps(remembered)
    }
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
      openApps: visibleTaskbarAppIds(openApps),
      setActiveApp: (app: WorkspaceAppId) => syncWorkspaceAppQuery(app),
      closeApp: (app: WorkspaceAppId) => {
        if (!isClosableTaskbarApp(app)) return
        const remaining = closeOpenedTaskbarApp(openAppsRef.current, app)
        openAppsRef.current = remaining
        setOpenApps(remaining)
        if (readNavigation().app === app) {
          syncWorkspaceAppQuery('home')
        }
      },
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
        if (destination.type === 'team') {
          navigateToTeamInNg(destination)
          return
        }
        if (destination.type === 'competition') {
          navigateToCompetitionInNg(destination)
          return
        }
        window.dispatchEvent(new Event('bdm-ng-nav'))
      },
    }),
    [navigation, openApps],
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
