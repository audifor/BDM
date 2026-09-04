import type { ReactNode } from 'react'

import './workspace.css'

export interface WorkspaceHeaderProps {
  readonly title: ReactNode
  readonly meta?: ReactNode
}

export function WorkspaceHeader({ title, meta }: WorkspaceHeaderProps) {
  return (
    <header className="ng-workspace-header" data-ng-region="workspace-header">
      <div className="ng-workspace-header__main">
        <div className="ng-workspace-header__title">{title}</div>
      </div>
      {meta !== undefined && <div className="ng-workspace-header__meta">{meta}</div>}
    </header>
  )
}
