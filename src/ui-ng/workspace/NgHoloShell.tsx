import { useMemo, type CSSProperties, type ReactNode } from 'react'

import type { TeamId } from '@/domain/ids'

import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'

import './ng-canon.css'

export function NgMetric({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="ng-canon__metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function NgHoloShell({
  region,
  appLabel,
  title,
  meta,
  teamId,
  empty = false,
  emptyTitle,
  emptyMessage,
  tabs,
  activeTabId,
  onTabSelect,
  children,
}: {
  readonly region: string
  readonly appLabel: string
  readonly title?: string
  readonly meta?: ReactNode
  readonly teamId?: TeamId
  readonly empty?: boolean
  readonly emptyTitle?: string
  readonly emptyMessage?: string
  readonly tabs?: readonly { readonly id: string; readonly label: string }[]
  readonly activeTabId?: string
  readonly onTabSelect?: (id: string) => void
  readonly children?: ReactNode
}) {
  const teamStyle = useMemo(() => {
    if (teamId === undefined) return undefined
    const colors = deriveTeamColors(teamId)
    return {
      '--po-team-primary': colors.primary,
      '--po-team-secondary': colors.secondary,
      '--po-team-muted': colors.muted,
    } as CSSProperties
  }, [teamId])

  if (empty) {
    return (
      <div className="ng-canon ng-canon--empty" data-ng-region={region} style={teamStyle}>
        <section className="ng-canon__empty-state">
          <h1 className="ng-canon__empty-title">{emptyTitle ?? appLabel}</h1>
          <p className="ng-canon__empty-message">{emptyMessage ?? 'No team assigned to the user coach.'}</p>
          {children}
        </section>
      </div>
    )
  }

  const mappedTabs =
    tabs === undefined
      ? undefined
      : tabs.map((tab) => ({
          id: tab.id,
          label: tab.label,
          active: tab.id === activeTabId,
        }))

  return (
    <div className="ng-canon" data-ng-region={region} style={teamStyle}>
      <ApplicationWorkspace
        header={
          <header className="ng-canon-header">
            <div className="ng-canon-header__main">
              <span className="ng-canon-header__app">{appLabel}</span>
              {title === undefined ? null : (
                <>
                  <span className="ng-canon-header__sep" aria-hidden />
                  <span className="ng-canon-header__team">{title}</span>
                </>
              )}
              {meta === undefined ? null : <span className="ng-canon-header__meta">{meta}</span>}
            </div>
          </header>
        }
        tabs={
          mappedTabs === undefined || onTabSelect === undefined ? undefined : (
            <WorkspaceTabs activeTabId={activeTabId ?? mappedTabs[0]?.id ?? ''} onTabSelect={onTabSelect} tabs={mappedTabs} />
          )
        }
      >
        <ScrollRegion className="ng-canon__scroll">{children}</ScrollRegion>
      </ApplicationWorkspace>
    </div>
  )
}
