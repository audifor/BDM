import '@/ui-ng/styles/reset.css'
import '@/ui-ng/styles/ng-global.css'
import '@/ui-ng/applications/home/courtside-home.css'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import { useGameStore } from '@/stores/gameStore'
import { EntityContextMenuProvider } from '@/ui/entityContextMenu/EntityContextMenuProvider'
import { SystemBar } from '@/ui-ng/system/SystemBar'
import { Taskbar } from '@/ui-ng/system/Taskbar'
import { DesignerViewport } from '@/ui-ng/designer/DesignerViewport'
import { isDesignerMode } from '@/ui-ng/designer/designerMode'
import { resolveBdmPlayerHeightMode } from '@/ui-ng/system/responsive/breakpoints'
import { useContainerSize } from '@/ui-ng/system/responsive/useContainerSize'
import { NgWorkspaceNavigationProvider, useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { WorkspaceHost } from '@/ui-ng/workspace/WorkspaceHost'

/** Temporary opt-in shell preview; other NG screens are unchanged by default. */
function courtsideShellPreviewEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('bdm-ui') === '1'
}

function BdmOsNgShell() {
  const world = useGameStore((state) => state.world)
  const { openEntity, app } = useNgWorkspaceNavigation()
  const courtsideShellActive = app === 'home' || courtsideShellPreviewEnabled()
  const [courtsideTheme, setCourtsideTheme] = useState<'dark' | 'light'>(() => {
    try {
      return window.localStorage.getItem('bdm-courtside-theme') === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem('bdm-courtside-theme', courtsideTheme)
    } catch {
      // The visual selector remains functional even when storage is disabled.
    }
  }, [courtsideTheme])
  const workspaceSize = useContainerSize<HTMLDivElement>()
  const workspaceStyle = {
    '--bdm-workspace-width': `${workspaceSize.width}px`,
    '--bdm-workspace-height': `${workspaceSize.height}px`,
    '--bdm-workspace-aspect-ratio': workspaceSize.aspectRatio,
  } as CSSProperties

  if (world === null) {
    return (
      <div className="bdm-os-ng bdm-os-ng--empty" data-ng-shell="bdm-os-ng">
        <p className="bdm-os-ng__empty-label">Load or create a game to use BDM OS NG.</p>
      </div>
    )
  }

  return (
    <EntityContextMenuProvider onOpenEntity={openEntity} world={world}>
      <div className="bdm-os-ng" data-ng-shell="bdm-os-ng" data-bdm-courtside-home={courtsideShellActive ? 'true' : undefined} data-bdm-courtside-theme={courtsideShellActive ? courtsideTheme : undefined}>
        <SystemBar courtsideTheme={courtsideShellActive ? courtsideTheme : undefined} onToggleCourtsideTheme={() => setCourtsideTheme((theme) => theme === 'dark' ? 'light' : 'dark')} />
        <div
          className="bdm-os-ng__workspace-region"
          data-bdm-workspace-height-mode={workspaceSize.height > 0 ? resolveBdmPlayerHeightMode(workspaceSize.height) : undefined}
          ref={workspaceSize.ref}
          style={workspaceStyle}
        >
          <WorkspaceHost />
        </div>
        <Taskbar />
      </div>
    </EntityContextMenuProvider>
  )
}

export function BdmOsNg() {
  const [designer, setDesigner] = useState(isDesignerMode)

  useEffect(() => {
    const syncDesignerMode = () => setDesigner(isDesignerMode())
    window.addEventListener('popstate', syncDesignerMode)
    window.addEventListener('bdm-ng-nav', syncDesignerMode)
    return () => {
      window.removeEventListener('popstate', syncDesignerMode)
      window.removeEventListener('bdm-ng-nav', syncDesignerMode)
    }
  }, [])

  const shell = (
    <NgWorkspaceNavigationProvider>
      <BdmOsNgShell />
    </NgWorkspaceNavigationProvider>
  )

  if (designer) {
    return <DesignerViewport>{shell}</DesignerViewport>
  }

  return shell
}
