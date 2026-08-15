import { useEffect, useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'

import type { EntityActionEnvironment } from '@/app/entityActions/ActionAvailability'
import type { EntityRef } from '@/app/entityActions/EntityRef'
import { RightMouseHoldController } from './RightMouseHold'
import { useEntityActionComposerStore } from '@/stores/entityActionComposerStore'

export function suppressEntityActionContextMenu(event: Pick<MouseEvent, 'preventDefault' | 'stopPropagation'>): void {
  event.preventDefault()
  event.stopPropagation()
}

export function useEntityActions(entity: EntityRef, environment: EntityActionEnvironment) {
  const open = useEntityActionComposerStore((state) => state.open)
  const openQuick = useEntityActionComposerStore((state) => state.openQuick)
  const anchor = useRef({ x: 0, y: 0 })
  const latest = useRef({ entity, environment, open, openQuick })
  latest.current = { entity, environment, open, openQuick }
  const controllerRef = useRef<RightMouseHoldController | null>(null)
  if (controllerRef.current === null) controllerRef.current = new RightMouseHoldController(
    () => { const current = latest.current; current.open(current.entity, current.environment, anchor.current) },
    () => { const current = latest.current; current.openQuick(current.entity, current.environment, anchor.current) },
  )
  const controller = controllerRef.current
  useEffect(() => () => controller.dispose(), [controller])
  return {
    onPointerDown: (event: PointerEvent) => { if (event.button === 2) { anchor.current = { x: event.clientX, y: event.clientY }; event.preventDefault(); event.stopPropagation(); controller.pointerDown(event.button) } },
    onPointerUp: (event: PointerEvent) => { if (event.button === 2) { event.preventDefault(); event.stopPropagation(); controller.pointerUp(event.button) } },
    onPointerCancel: () => controller.cancel(),
    onContextMenuCapture: suppressEntityActionContextMenu,
    onContextMenu: suppressEntityActionContextMenu,
  }
}
