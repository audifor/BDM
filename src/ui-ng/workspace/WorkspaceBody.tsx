import type { ReactNode } from 'react'

import './workspace.css'

export interface WorkspaceBodyProps {
  readonly main: ReactNode
  readonly secondary?: ReactNode
  readonly inspector?: ReactNode
}

export function WorkspaceBody({ main, secondary, inspector }: WorkspaceBodyProps) {
  return (
    <div className="ng-workspace-body" data-ng-region="workspace-body">
      <div className="ng-workspace-body__content">
        <div className="ng-workspace-body__main">{main}</div>
        {secondary !== undefined && (
          <div className="ng-workspace-body__secondary">{secondary}</div>
        )}
      </div>
      {inspector !== undefined && (
        <aside className="ng-workspace-body__inspector-slot">{inspector}</aside>
      )}
    </div>
  )
}
