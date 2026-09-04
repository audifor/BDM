import type { WorkspaceTab } from '@/ui-ng/types/workspace'

import './workspace.css'

export interface WorkspaceTabsProps {
  readonly tabs: readonly WorkspaceTab[]
}

export function WorkspaceTabs({ tabs }: WorkspaceTabsProps) {
  return (
    <nav aria-label="Workspace tabs" className="ng-workspace-tabs" data-ng-region="workspace-tabs">
      {tabs.map((tab) => (
        <button
          aria-current={tab.active ? 'page' : undefined}
          className={`ng-workspace-tabs__tab${tab.active ? ' is-active' : ''}`}
          key={tab.id}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
