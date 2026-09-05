import type { DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'

export function PrecisionResizeHandle({
  label,
  className = 'ng-precision-grid__resize',
  onPointerDown,
}: {
  readonly label: string
  readonly className?: string
  readonly onPointerDown: (event: ReactPointerEvent<HTMLSpanElement>) => void
}) {
  return <span aria-label={`Ajustar ancho de ${label}`} className={className} onPointerDown={onPointerDown} />
}

export function PrecisionDivHead({
  label,
  children,
  resizeClassName,
  onResize,
  headerProps,
}: {
  readonly label: string
  readonly children?: ReactNode
  readonly resizeClassName?: string
  readonly onResize: (event: ReactPointerEvent<HTMLSpanElement>) => void
  readonly headerProps: {
    readonly draggable: boolean
    readonly onDragStart: () => void
    readonly onDragOver: (event: DragEvent<HTMLElement>) => void
    readonly onDrop: (event: DragEvent<HTMLElement>) => void
    readonly onDragEnd: () => void
  }
}) {
  return (
    <span {...headerProps}>
      {children ?? label}
      <PrecisionResizeHandle className={resizeClassName} label={label} onPointerDown={onResize} />
    </span>
  )
}
