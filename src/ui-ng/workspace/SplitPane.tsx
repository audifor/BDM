import type { ReactNode } from 'react'

import './workspace.css'

export interface SplitPaneProps {
  readonly primary: ReactNode
  readonly secondary: ReactNode
  readonly primaryRatio?: number
}

export function SplitPane({ primary, secondary, primaryRatio = 0.65 }: SplitPaneProps) {
  const clampedRatio = Math.min(0.85, Math.max(0.15, primaryRatio))

  return (
    <div
      className="ng-split-pane"
      data-ng-region="split-pane"
      style={{
        gridTemplateColumns: `${clampedRatio}fr ${1 - clampedRatio}fr`,
      }}
    >
      <div className="ng-split-pane__primary">{primary}</div>
      <div className="ng-split-pane__divider" />
      <div className="ng-split-pane__secondary">{secondary}</div>
    </div>
  )
}
