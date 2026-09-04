import type { ReactNode } from 'react'

import './workspace.css'

export interface ApplicationWorkspaceProps {
  readonly header: ReactNode
  readonly tabs?: ReactNode
  readonly toolbar?: ReactNode
  readonly children: ReactNode
}

export function ApplicationWorkspace({
  header,
  tabs,
  toolbar,
  children,
}: ApplicationWorkspaceProps) {
  const gridTemplateRows = [
    'var(--ng-workspace-header-height)',
    ...(tabs !== undefined ? ['var(--ng-workspace-tabs-height)'] : []),
    ...(toolbar !== undefined ? ['var(--ng-workspace-toolbar-height)'] : []),
    'minmax(0, 1fr)',
  ].join(' ')

  return (
    <section
      className="ng-application-workspace bdm-os-ng__scaffold-outline"
      data-ng-region="application-workspace"
      style={{ gridTemplateRows }}
    >
      <div className="ng-application-workspace__header-slot">{header}</div>
      {tabs !== undefined && (
        <div className="ng-application-workspace__tabs-slot">{tabs}</div>
      )}
      {toolbar !== undefined && (
        <div className="ng-application-workspace__toolbar-slot">{toolbar}</div>
      )}
      <div className="ng-application-workspace__body-slot">{children}</div>
    </section>
  )
}
