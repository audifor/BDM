import type { ReactNode } from 'react'

import './workspace.css'

export interface ApplicationWorkspaceProps {
  readonly header?: ReactNode
  readonly identityBand?: ReactNode
  readonly tabs?: ReactNode
  /** Optional context header that belongs *under* the tab bar (app-specific grammar). */
  readonly tabsHeader?: ReactNode
  readonly toolbar?: ReactNode
  readonly children: ReactNode
}

export function ApplicationWorkspace({
  header,
  identityBand,
  tabs,
  tabsHeader,
  toolbar,
  children,
}: ApplicationWorkspaceProps) {
  const gridTemplateRows = [
    ...(header !== undefined ? ['var(--ng-workspace-header-height)'] : []),
    ...(identityBand !== undefined ? ['var(--po-identity-height)'] : []),
    ...(tabs !== undefined ? ['var(--ng-workspace-tabs-height)'] : []),
    ...(tabsHeader !== undefined ? ['var(--ng-workspace-header-height)'] : []),
    ...(toolbar !== undefined ? ['var(--ng-workspace-toolbar-height)'] : []),
    'minmax(0, 1fr)',
  ].join(' ')

  return (
    <section
      className="ng-application-workspace"
      data-ng-region="application-workspace"
      style={{ gridTemplateRows }}
    >
      {header !== undefined && (
        <div className="ng-application-workspace__header-slot">{header}</div>
      )}
      {identityBand !== undefined && (
        <div className="ng-application-workspace__identity-slot">{identityBand}</div>
      )}
      {tabs !== undefined && (
        <div className="ng-application-workspace__tabs-slot">{tabs}</div>
      )}
      {tabsHeader !== undefined && (
        <div className="ng-application-workspace__tabs-header-slot">{tabsHeader}</div>
      )}
      {toolbar !== undefined && (
        <div className="ng-application-workspace__toolbar-slot">{toolbar}</div>
      )}
      <div className="ng-application-workspace__body-slot">{children}</div>
    </section>
  )
}
