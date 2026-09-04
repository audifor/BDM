import { PlayerWorkspace } from '@/ui-ng/applications/player/PlayerWorkspace'
import { RosterWorkspace } from '@/ui-ng/applications/roster/RosterWorkspace'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

import './workspace.css'

export function WorkspaceHost() {
  const { app } = useNgWorkspaceNavigation()

  return (
    <main className="ng-workspace-host" data-ng-region="workspace-host">
      {app === 'roster' ? (
        <RosterWorkspace />
      ) : app === 'player' ? (
        <PlayerWorkspace />
      ) : (
        <section className="ng-workspace-placeholder" data-ng-region="workspace-placeholder">
          <p className="ng-workspace-placeholder__label">{app} workspace not implemented in NG yet.</p>
        </section>
      )}
    </main>
  )
}
