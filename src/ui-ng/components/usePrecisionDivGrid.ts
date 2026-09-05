import { useEffect, useMemo, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'

import { loadGridPreferences, saveGridPreferences } from '@/ui/dataGrid/persistence'
import { reorderColumn } from '@/ui/dataGrid/columns'

export type PrecisionDivColumn = {
  readonly id: string
  readonly label: string
  readonly width: number
  readonly minWidth?: number
  readonly flex?: number
  readonly locked?: boolean
}

export function normalizeDivColumnOrder(
  columns: readonly PrecisionDivColumn[],
  order: readonly string[],
): readonly PrecisionDivColumn[] {
  const known = new Map(columns.map((column) => [column.id, column]))
  const normalized = [...order.filter((id) => known.has(id)), ...columns.map((column) => column.id).filter((id) => !order.includes(id))]
  return normalized.map((id) => known.get(id)!)
}

export function usePrecisionDivGrid(gridId: string, columns: readonly PrecisionDivColumn[]) {
  const stored = useMemo(() => loadGridPreferences(gridId), [gridId])
  const defaultOrder = columns.map((column) => column.id)
  const [order, setOrder] = useState<readonly string[]>(() => stored?.columnIds ?? defaultOrder)
  const [widths, setWidths] = useState<Readonly<Record<string, number>>>(() => {
    const defaults = Object.fromEntries(columns.map((column) => [column.id, column.width]))
    return { ...defaults, ...(stored?.columnWidths ?? {}) }
  })
  const [dragged, setDragged] = useState<string>()

  const ordered = useMemo(() => normalizeDivColumnOrder(columns, order), [columns, order])

  useEffect(() => {
    saveGridPreferences(gridId, {
      schemaVersion: 1,
      activeViewId: 'default',
      customViews: [],
      columnIds: ordered.map((column) => column.id),
      hiddenColumnIds: [],
      columnWidths: widths,
      sorting: [],
      filters: [],
    })
  }, [gridId, ordered, widths])

  const style = {
    gridTemplateColumns: ordered
      .map((column) => {
        const width = widths[column.id] ?? column.width
        return column.flex !== undefined && column.flex > 0
          ? `minmax(${width}px, ${column.flex}fr)`
          : `${width}px`
      })
      .join(' '),
  } as CSSProperties

  const startResize = (id: string) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const column = columns.find((item) => item.id === id)
    const startX = event.clientX
    const initialWidth = widths[id] ?? column?.width ?? 120
    const minWidth = column?.minWidth ?? 72
    const move = (next: PointerEvent) => {
      setWidths((current) => ({ ...current, [id]: Math.max(minWidth, initialWidth + next.clientX - startX) }))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const headerProps = (id: string) => {
    const column = columns.find((item) => item.id === id)
    const locked = column?.locked === true
    return {
      draggable: !locked,
      onDragStart: () => {
        if (!locked) setDragged(id)
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        event.preventDefault()
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault()
        if (dragged === undefined || dragged === id || locked) {
          setDragged(undefined)
          return
        }
        const dropAfter = event.clientX > event.currentTarget.getBoundingClientRect().left + event.currentTarget.clientWidth / 2
        setOrder((current) =>
          reorderColumn(current.length === 0 ? defaultOrder : current, dragged, id, dropAfter),
        )
        setDragged(undefined)
      },
      onDragEnd: () => setDragged(undefined),
    }
  }

  return {
    ordered,
    style,
    widths,
    startResize,
    headerProps,
  }
}
