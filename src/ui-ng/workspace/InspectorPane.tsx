import type { ReactNode } from 'react'

import './workspace.css'

export interface InspectorPaneProps {
  readonly title?: ReactNode
  readonly collapsed?: boolean
  readonly onToggleCollapse?: () => void
  readonly children?: ReactNode
}

export function InspectorPane({
  title = 'Inspector',
  collapsed = false,
  onToggleCollapse,
  children,
}: InspectorPaneProps) {
  return (
    <section
      aria-label="Contextual inspector"
      className={`ng-inspector-pane${collapsed ? ' is-collapsed' : ''}`}
      data-ng-region="inspector-pane"
    >
      <header className="ng-inspector-pane__header">
        <span className="ng-inspector-pane__title">{title}</span>
        {onToggleCollapse !== undefined && (
          <button
            aria-expanded={!collapsed}
            className="ng-inspector-pane__toggle"
            onClick={onToggleCollapse}
            type="button"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        )}
      </header>
      {!collapsed && (
        <div className="ng-inspector-pane__content">
          {children ?? (
            <p className="bdm-os-ng__scaffold-label">Inspector region · 336px default</p>
          )}
        </div>
      )}
    </section>
  )
}
