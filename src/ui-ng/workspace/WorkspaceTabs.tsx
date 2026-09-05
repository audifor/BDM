import type { WorkspaceTab } from '@/ui-ng/types/workspace'
import type { ReactNode } from 'react'

import './workspace.css'

export interface WorkspaceTabsProps {
  readonly tabs: readonly WorkspaceTab[]
  readonly activeTabId?: string
  readonly onTabSelect?: (tabId: string) => void
  readonly actions?: ReactNode
  readonly insertAfterTabId?: string
  readonly insertedContent?: ReactNode
}

export function WorkspaceTabs({
  tabs,
  activeTabId,
  onTabSelect,
  actions,
  insertAfterTabId,
  insertedContent,
}: WorkspaceTabsProps) {
  return (
    <nav aria-label="Workspace tabs" className="ng-workspace-tabs" data-ng-region="workspace-tabs">
      <div className="ng-workspace-tabs__list">
        {tabs.map((tab) => {
          const isActive = activeTabId !== undefined ? tab.id === activeTabId : tab.active === true
          return (
            <span className="ng-workspace-tabs__item" key={tab.id}>
              <button
                aria-current={isActive ? 'page' : undefined}
                className={`ng-workspace-tabs__tab${isActive ? ' is-active' : ''}`}
                onClick={() => onTabSelect?.(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
              {insertAfterTabId === tab.id && insertedContent !== undefined ? (
                <div className="ng-workspace-tabs__inline-actions">{insertedContent}</div>
              ) : null}
            </span>
          )
        })}
      </div>
      {actions !== undefined && <div className="ng-workspace-tabs__actions">{actions}</div>}
    </nav>
  )
}
