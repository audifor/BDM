import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

import type { EntityContextAction, EntityContextEntry } from './entityContextActions'
import './EntityContextMenu.css'

export interface ContextMenuAnchor { readonly x: number; readonly y: number }
export interface Viewport { readonly width: number; readonly height: number }
const GAP = 8

export function clampContextMenuPosition(anchor: ContextMenuAnchor, viewport: Viewport, size = { width: 196, height: 42 }) { return { left: Math.max(GAP, Math.min(anchor.x, viewport.width - size.width - GAP)), top: Math.max(GAP, Math.min(anchor.y, viewport.height - size.height - GAP)) } }

export function EntityContextMenu({ anchor, actions, onClose, onInvoke }: { readonly anchor: ContextMenuAnchor; readonly actions: readonly EntityContextEntry[]; readonly onClose: () => void; readonly onInvoke: (action: EntityContextAction) => void }) {
  const [path, setPath] = useState<readonly string[]>([])
  const triggers = useRef(new Map<string, HTMLButtonElement>())
  const open = (next: readonly string[], trigger: HTMLButtonElement, focus: boolean) => { triggers.current.set(next.join('/'), trigger); setPath(next); if (focus) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-menu-path="${next.join('/')}"] button:not(:disabled)`)?.focus()) }
  const close = (current: readonly string[]) => { setPath(current.slice(0, -1)); requestAnimationFrame(() => triggers.current.get(current.join('/'))?.focus()) }
  return <div className="entity-context-menu__backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}><ContextMenuSurface anchor={anchor} entries={actions} onClose={onClose} onInvoke={onInvoke} onOpen={open} onCloseSubmenu={close} openPath={path} path={[]} /></div>
}

function ContextMenuSurface({ anchor, entries, path, openPath, onClose, onInvoke, onOpen, onCloseSubmenu }: { readonly anchor: ContextMenuAnchor; readonly entries: readonly EntityContextEntry[]; readonly path: readonly string[]; readonly openPath: readonly string[]; readonly onClose: () => void; readonly onInvoke: (action: EntityContextAction) => void; readonly onOpen: (path: readonly string[], trigger: HTMLButtonElement, focus: boolean) => void; readonly onCloseSubmenu: (path: readonly string[]) => void }) {
  const root = useRef<HTMLElement>(null); const [position, setPosition] = useState(() => clampContextMenuPosition(anchor, viewport()))
  useLayoutEffect(() => { const rect = root.current?.getBoundingClientRect(); if (rect) setPosition(clampContextMenuPosition(anchor, viewport(), { width: rect.width, height: rect.height })) }, [anchor, entries])
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); return } const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus() } else if (event.key === 'ArrowLeft' && path.length > 0) { event.preventDefault(); event.stopPropagation(); onCloseSubmenu(path) } }
  return <section aria-label="Entity actions" className="entity-context-menu" data-menu-path={path.join('/')} onKeyDown={onKeyDown} ref={root} role="menu" style={position}>{entries.map((entry) => <ContextMenuEntry entry={entry} key={entry.id} onClose={onClose} onCloseSubmenu={onCloseSubmenu} onInvoke={onInvoke} onOpen={onOpen} openPath={openPath} parentPath={path} />)}</section>
}

function ContextMenuEntry({ entry, parentPath, openPath, onInvoke, onOpen, onClose, onCloseSubmenu }: { readonly entry: EntityContextEntry; readonly parentPath: readonly string[]; readonly openPath: readonly string[]; readonly onInvoke: (action: EntityContextAction) => void; readonly onOpen: (path: readonly string[], trigger: HTMLButtonElement, focus: boolean) => void; readonly onClose: () => void; readonly onCloseSubmenu: (path: readonly string[]) => void }) {
  if (entry.kind === 'separator') return <div className="entity-context-menu__separator" role="separator" />
  if (entry.kind === 'action') return <button disabled={entry.disabled} onClick={() => onInvoke(entry)} role="menuitem" title={entry.reason} type="button">{entry.label}</button>
  const path = [...parentPath, entry.id]; const isOpen = path.every((id, index) => openPath[index] === id)
  return <><button aria-expanded={isOpen} aria-haspopup="menu" onClick={(event) => onOpen(path, event.currentTarget, false)} onPointerEnter={(event) => onOpen(path, event.currentTarget, false)} onKeyDown={(event) => { if (event.key === 'ArrowRight') { event.preventDefault(); onOpen(path, event.currentTarget, true) } }} role="menuitem" type="button">{entry.label} ›</button>{isOpen && <ContextSubmenu entries={entry.children} onClose={onClose} onCloseSubmenu={onCloseSubmenu} onInvoke={onInvoke} onOpen={onOpen} openPath={openPath} path={path} />}</>
}

function ContextSubmenu({ entries, path, openPath, onInvoke, onOpen, onClose, onCloseSubmenu }: { readonly entries: readonly EntityContextEntry[]; readonly path: readonly string[]; readonly openPath: readonly string[]; readonly onInvoke: (action: EntityContextAction) => void; readonly onOpen: (path: readonly string[], trigger: HTMLButtonElement, focus: boolean) => void; readonly onClose: () => void; readonly onCloseSubmenu: (path: readonly string[]) => void }) {
  const parent = path.slice(0, -1).join('/'); const trigger = document.querySelector<HTMLButtonElement>(`[data-menu-path="${parent}"] button[aria-expanded="true"]`); const rect = trigger?.getBoundingClientRect(); const viewportSize = viewport(); const width = 196; const anchor = rect === undefined ? { x: 0, y: 0 } : { x: rect.right + 2 <= viewportSize.width - width - GAP ? rect.right + 2 : rect.left - width - 2, y: rect.top }
  return <ContextMenuSurface anchor={anchor} entries={entries} onClose={onClose} onCloseSubmenu={onCloseSubmenu} onInvoke={onInvoke} onOpen={onOpen} openPath={openPath} path={path} />
}

function viewport(): Viewport {
  const designer = window.__bdmDesignerViewportBridge?.stageViewport()
  if (designer !== undefined) {
    return designer
  }
  return { width: globalThis.innerWidth, height: globalThis.innerHeight }
}
