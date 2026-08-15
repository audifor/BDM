import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import type { DesktopWindowState } from '@/stores/desktopStore'
import { getDesktopApp } from './DesktopAppRegistry'
import { DesktopIcon } from './DesktopNavigation'

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export function DesktopWindow({ children, focused, window, onClose, onFocus, onMaximize, onMinimize, onMove, onResize, onRestoreMaximized }: { readonly children: ReactNode; readonly focused: boolean; readonly window: DesktopWindowState; readonly onClose: () => void; readonly onFocus: () => void; readonly onMaximize: () => void; readonly onMinimize: () => void; readonly onMove: (position: { x: number; y: number }) => void; readonly onResize: (bounds: { x: number; y: number; width: number; height: number }) => void; readonly onRestoreMaximized: () => void }) {
  const app = getDesktopApp(window.appId)!
  const windowRef = useRef<HTMLElement>(null)
  useEffect(() => { if (focused) windowRef.current?.focus() }, [focused])
  const style = window.maximized ? { zIndex: window.zIndex } : { left: window.x, top: window.y, width: window.width, height: window.height, zIndex: window.zIndex }
  const drag = (event: React.PointerEvent<HTMLElement>) => {
    if (window.maximized || (event.target as HTMLElement).closest('button')) return
    onFocus()
    const origin = { x: event.clientX, y: event.clientY, windowX: window.x, windowY: window.y }
    const move = (pointerEvent: PointerEvent) => onMove({ x: clamp(origin.windowX + pointerEvent.clientX - origin.x, -window.width + 96, globalThis.innerWidth - 96), y: clamp(origin.windowY + pointerEvent.clientY - origin.y, 0, globalThis.innerHeight - 140) })
    const stop = () => { globalThis.window.removeEventListener('pointermove', move); globalThis.window.removeEventListener('pointerup', stop) }
    globalThis.window.addEventListener('pointermove', move); globalThis.window.addEventListener('pointerup', stop)
  }
  const resize = (edge: ResizeEdge, event: React.PointerEvent<HTMLDivElement>) => {
    if (window.maximized) return
    event.preventDefault(); event.stopPropagation(); onFocus()
    const origin = { x: event.clientX, y: event.clientY, bounds: { x: window.x, y: window.y, width: window.width, height: window.height } }
    const constraints = app.window!
    const move = (pointerEvent: PointerEvent) => {
      const dx = pointerEvent.clientX - origin.x; const dy = pointerEvent.clientY - origin.y
      let { x, y, width, height } = origin.bounds
      if (edge.includes('e')) width += dx
      if (edge.includes('s')) height += dy
      if (edge.includes('w')) { width -= dx; x += dx }
      if (edge.includes('n')) { height -= dy; y += dy }
      if (width < constraints.minWidth) { if (edge.includes('w')) x = origin.bounds.x + origin.bounds.width - constraints.minWidth; width = constraints.minWidth }
      if (height < constraints.minHeight) { if (edge.includes('n')) y = origin.bounds.y + origin.bounds.height - constraints.minHeight; height = constraints.minHeight }
      onResize({ x, y, width, height })
    }
    const stop = () => { globalThis.window.removeEventListener('pointermove', move); globalThis.window.removeEventListener('pointerup', stop) }
    globalThis.window.addEventListener('pointermove', move); globalThis.window.addEventListener('pointerup', stop)
  }
  return <section aria-label={app.label} className={`app-surface desktop-window${focused ? ' is-focused' : ''}${window.maximized ? ' is-maximized' : ''}`} onPointerDown={onFocus} ref={windowRef} role="region" style={style} tabIndex={-1}><header className="desktop-window__titlebar" onDoubleClick={() => window.maximized ? onRestoreMaximized() : onMaximize()} onPointerDown={drag}><div className="desktop-window__title"><DesktopIcon icon={app.icon} /><span>{app.label}</span></div><div className="desktop-window__controls"><WindowControl label="Minimizar" onClick={onMinimize} shape="minimize" /><WindowControl label={window.maximized ? 'Restaurar ventana' : 'Maximizar'} onClick={window.maximized ? onRestoreMaximized : onMaximize} shape={window.maximized ? 'restore' : 'maximize'} /><WindowControl label="Cerrar" onClick={onClose} shape="close" /></div></header><div className="desktop-window__content">{children}</div>{!window.maximized && (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const).map((edge) => <div aria-hidden="true" className={`desktop-window__resize desktop-window__resize--${edge}`} key={edge} onPointerDown={(event) => resize(edge, event)} />)}</section>
}

function WindowControl({ label, onClick, shape }: { readonly label: string; readonly onClick: () => void; readonly shape: 'minimize' | 'maximize' | 'restore' | 'close' }) {
  const paths = { minimize: 'M5 12h14', maximize: 'M5 5h14v14H5z', restore: 'M8 5h11v11M5 8v11h11', close: 'M6 6l12 12M18 6 6 18' }
  return <button aria-label={label} className="desktop-window__control" onClick={onClick} type="button"><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d={paths[shape]} stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg></button>
}

function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)) }
