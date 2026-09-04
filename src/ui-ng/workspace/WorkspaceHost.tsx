import { PlaceholderWorkspace } from '@/ui-ng/applications/placeholder/PlaceholderWorkspace'

import './workspace.css'

export function WorkspaceHost() {
  return (
    <main className="ng-workspace-host" data-ng-region="workspace-host">
      <PlaceholderWorkspace />
    </main>
  )
}
