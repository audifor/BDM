import { useEffect, useRef } from 'react'

import type { EntityContextAction } from './entityContextActions'
import './EntityContextMenu.css'

export interface ContextMenuAnchor { readonly x: number; readonly y: number }
export interface Viewport { readonly width: number; readonly height: number }

const MENU_WIDTH = 196
const MENU_HEIGHT = 42
const VIEWPORT_GAP = 8

export function clampContextMenuPosition(anchor: ContextMenuAnchor, viewport: Viewport) {
  return { left: Math.max(VIEWPORT_GAP, Math.min(anchor.x, viewport.width - MENU_WIDTH - VIEWPORT_GAP)), top: Math.max(VIEWPORT_GAP, Math.min(anchor.y, viewport.height - MENU_HEIGHT - VIEWPORT_GAP)) }
}

export function EntityContextMenu({ anchor, actions, onClose, onInvoke }: { readonly anchor: ContextMenuAnchor; readonly actions: readonly EntityContextAction[]; readonly onClose: () => void; readonly onInvoke: (action: EntityContextAction) => void }) {
  const firstItem = useRef<HTMLButtonElement>(null)
  useEffect(() => { firstItem.current?.focus() }, [])
  const position = clampContextMenuPosition(anchor, { width: globalThis.innerWidth, height: globalThis.innerHeight })
  return <div className="entity-context-menu__backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section aria-label="Entity actions" className="entity-context-menu" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }} role="menu" style={position}>
      {actions.map((action, index) => <button key={action.id} onClick={() => onInvoke(action)} ref={index === 0 ? firstItem : undefined} role="menuitem" type="button">{action.label}</button>)}
    </section>
  </div>
}
