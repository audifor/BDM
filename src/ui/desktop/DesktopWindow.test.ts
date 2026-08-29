import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { DesktopWindowState } from '@/stores/desktopStore'
import { DesktopWindow } from './DesktopWindow'

const windowState: DesktopWindowState = { id: 'squad-window', appId: 'squad', x: 96, y: 64, width: 760, height: 680, minimized: false, maximized: false, zIndex: 10 }

describe('DesktopWindow', () => {
  it('renders titlebar, accessible controls and resize handles', () => {
    const markup = renderToStaticMarkup(createElement(DesktopWindow, { focused: true, window: windowState, onClose: () => undefined, onFocus: () => undefined, onMaximize: () => undefined, onMinimize: () => undefined, onMove: () => undefined, onResize: () => undefined, onRestoreMaximized: () => undefined, onSnap: () => undefined, children: 'Home content' }))
    expect(markup).toContain('Plantilla')
    expect(markup).toContain('aria-label="Minimizar"')
    expect(markup).toContain('aria-label="Maximizar"')
    expect(markup).toContain('aria-label="Cerrar"')
    expect(markup).toContain('desktop-window__resize--se')
  })

  it('renders maximized windows with a restore control', () => {
    const markup = renderToStaticMarkup(createElement(DesktopWindow, { focused: true, window: { ...windowState, maximized: true, restoreBounds: { x: 96, y: 64, width: 760, height: 680 } }, onClose: () => undefined, onFocus: () => undefined, onMaximize: () => undefined, onMinimize: () => undefined, onMove: () => undefined, onResize: () => undefined, onRestoreMaximized: () => undefined, onSnap: () => undefined, children: 'Home content' }))
    expect(markup).toContain('is-maximized')
    expect(markup).toContain('aria-label="Restaurar ventana"')
  })
})
