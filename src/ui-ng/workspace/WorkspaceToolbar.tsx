import type { ReactNode } from 'react'

import './workspace.css'

export interface WorkspaceToolbarProps {
  readonly children: ReactNode
}

export function WorkspaceToolbar({ children }: WorkspaceToolbarProps) {
  return (
    <div className="ng-workspace-toolbar" data-ng-region="workspace-toolbar">
      {children}
    </div>
  )
}
