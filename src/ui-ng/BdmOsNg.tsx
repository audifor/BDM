import '@/ui-ng/styles/reset.css'
import '@/ui-ng/styles/ng-global.css'

import { useGameStore } from '@/stores/gameStore'
import { EntityContextMenuProvider } from '@/ui/entityContextMenu/EntityContextMenuProvider'
import { SystemBar } from '@/ui-ng/system/SystemBar'
import { Taskbar } from '@/ui-ng/system/Taskbar'
import { NgWorkspaceNavigationProvider, useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { WorkspaceHost } from '@/ui-ng/workspace/WorkspaceHost'

function BdmOsNgShell() {
  const world = useGameStore((state) => state.world)
  const { openEntity } = useNgWorkspaceNavigation()

  if (world === null) {
    return (
      <div className="bdm-os-ng bdm-os-ng--empty" data-ng-shell="bdm-os-ng">
        <p className="bdm-os-ng__empty-label">Load or create a game to use BDM OS NG.</p>
      </div>
    )
  }

  return (
    <EntityContextMenuProvider onOpenEntity={openEntity} world={world}>
      <div className="bdm-os-ng" data-ng-shell="bdm-os-ng">
        <SystemBar />
        <div className="bdm-os-ng__workspace-region">
          <WorkspaceHost />
        </div>
        <Taskbar />
      </div>
    </EntityContextMenuProvider>
  )
}

export function BdmOsNg() {
  return (
    <NgWorkspaceNavigationProvider>
      <BdmOsNgShell />
    </NgWorkspaceNavigationProvider>
  )
}
