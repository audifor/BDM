import { PlayerWorkspace } from '@/ui-ng/applications/player/PlayerWorkspace'

import './workspace.css'

export function WorkspaceHost() {
  return (
    <main className="ng-workspace-host" data-ng-region="workspace-host">
      <PlayerWorkspace />
    </main>
  )
}
