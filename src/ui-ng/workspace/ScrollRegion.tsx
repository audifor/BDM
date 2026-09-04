import type { ReactNode } from 'react'

import './workspace.css'

export interface ScrollRegionProps {
  readonly children: ReactNode
  readonly className?: string
}

export function ScrollRegion({ children, className }: ScrollRegionProps) {
  const classes = ['ng-scroll-region', className].filter(Boolean).join(' ')

  return (
    <div className={classes} data-ng-region="scroll-region">
      {children}
    </div>
  )
}
