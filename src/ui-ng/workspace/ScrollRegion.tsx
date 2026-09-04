import { forwardRef, type ReactNode } from 'react'

import './workspace.css'

export interface ScrollRegionProps {
  readonly children: ReactNode
  readonly className?: string
  readonly onScroll?: () => void
}

export const ScrollRegion = forwardRef<HTMLDivElement, ScrollRegionProps>(function ScrollRegion(
  { children, className, onScroll },
  ref,
) {
  const classes = ['ng-scroll-region', className].filter(Boolean).join(' ')

  return (
    <div className={classes} data-ng-region="scroll-region" onScroll={onScroll} ref={ref}>
      {children}
    </div>
  )
})
