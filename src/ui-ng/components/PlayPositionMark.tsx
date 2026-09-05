import type { ReactNode } from 'react'

export function PlayPositionMark({
  position,
  className,
}: {
  readonly position: ReactNode
  readonly className?: string
}) {
  return <span className={className === undefined ? 'ng-play-position' : `ng-play-position ${className}`}>{position}</span>
}
