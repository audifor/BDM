import type { WorkspaceTab } from '@/ui-ng/types/workspace'

import './workspace.css'

export interface WorkspaceTabsProps {
  readonly tabs: readonly WorkspaceTab[]
  readonly activeTabId?: string
  readonly onTabSelect?: (tabId: string) => void
}

export function WorkspaceTabs({ tabs, activeTabId, onTabSelect }: WorkspaceTabsProps) {
  return (
    <nav aria-label="Workspace tabs" className="ng-workspace-tabs" data-ng-region="workspace-tabs">
      {tabs.map((tab) => {
        const isActive = activeTabId !== undefined ? tab.id === activeTabId : tab.active === true
        return (
          <button
            aria-current={isActive ? 'page' : undefined}
            className={`ng-workspace-tabs__tab${isActive ? ' is-active' : ''}`}
            key={tab.id}
            onClick={() => onTabSelect?.(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
