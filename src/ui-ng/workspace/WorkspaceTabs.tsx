import type { WorkspaceTab } from '@/ui-ng/types/workspace'
import type { Ref, ReactNode } from 'react'

import './workspace.css'

export interface WorkspaceTabsProps {
  readonly tabs: readonly WorkspaceTab[]
  readonly activeTabId?: string
  readonly onTabSelect?: (tabId: string) => void
  /** Tabs rendered but intentionally not actionable yet (future modules). */
  readonly disabledTabIds?: readonly string[]
  readonly actions?: ReactNode
  readonly insertAfterTabId?: string
  readonly insertedContent?: ReactNode
  /** Optional per-tab hover handlers, keyed by tab id — scoped to that single tab's button, not the whole bar. */
  readonly onTabMouseEnter?: (tabId: string) => void
  readonly onTabMouseLeave?: (tabId: string) => void
  /** Attaches `tabRef` to the DOM button for the tab matching `tabRefId`, e.g. to measure it for an anchored popover. */
  readonly tabRefId?: string
  readonly tabRef?: Ref<HTMLButtonElement>
}

export function WorkspaceTabs({
  tabs,
  activeTabId,
  onTabSelect,
  disabledTabIds,
  actions,
  insertAfterTabId,
  insertedContent,
  onTabMouseEnter,
  onTabMouseLeave,
  tabRefId,
  tabRef,
}: WorkspaceTabsProps) {
  return (
    <nav aria-label="Workspace tabs" className="ng-workspace-tabs" data-ng-region="workspace-tabs">
      <div className="ng-workspace-tabs__list">
        {tabs.map((tab) => {
          const isActive = activeTabId !== undefined ? tab.id === activeTabId : tab.active === true
          const isDisabled = disabledTabIds?.includes(tab.id) === true
          return (
            <span className="ng-workspace-tabs__item" key={tab.id}>
              <button
                aria-current={isActive ? 'page' : undefined}
                className={`ng-workspace-tabs__tab${isActive ? ' is-active' : ''}`}
                disabled={isDisabled}
                onClick={() => onTabSelect?.(tab.id)}
                onMouseEnter={onTabMouseEnter === undefined ? undefined : () => onTabMouseEnter(tab.id)}
                onMouseLeave={onTabMouseLeave === undefined ? undefined : () => onTabMouseLeave(tab.id)}
                ref={tabRefId === tab.id ? tabRef : undefined}
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
