import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { getDesktopApp, reorderLauncherApps, resolveLauncherOrder } from '@/ui/desktop/DesktopAppRegistry'

export interface DesktopBounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export type DesktopSnap = 'left' | 'right' | 'maximized'
export const DESKTOP_TOP_BAR_HEIGHT = 48
export const DESKTOP_BOTTOM_BAR_HEIGHT = 56
export interface DesktopWindowState extends DesktopBounds { readonly id: string; readonly appId: string; readonly instanceId?: string; readonly minimized: boolean; readonly maximized: boolean; readonly restoreBounds?: DesktopBounds; readonly zIndex: number }

interface DesktopStore {
  readonly windows: readonly DesktopWindowState[]
  readonly focusedWindowId: string | null
  readonly launcherOpen: boolean
  readonly recentAppIds: readonly string[]
  readonly launcherOrder: readonly string[]
  openWindow(appId: string, instanceId?: string, initialBounds?: Partial<DesktopBounds>): void
  closeWindow(windowId: string): void
  focusWindow(windowId: string): void
  minimizeWindow(windowId: string): void
  restoreWindow(windowId: string): void
  maximizeWindow(windowId: string): void
  restoreMaximizedWindow(windowId: string): void
  moveWindow(windowId: string, position: Pick<DesktopBounds, 'x' | 'y'>): void
  resizeWindow(windowId: string, bounds: DesktopBounds): void
  snapWindow(windowId: string, snap: DesktopSnap, viewport: Pick<DesktopBounds, 'width' | 'height'>): void
  toggleLauncher(): void
  closeLauncher(): void
  reorderLauncher(movedId: string, targetId: string): void
}

const withZIndexes = (windows: readonly DesktopWindowState[]) => windows.map((window, index) => ({ ...window, zIndex: 10 + index }))
const focusTopVisible = (windows: readonly DesktopWindowState[]) => [...windows].reverse().find((window) => !window.minimized)?.id ?? null
const updateRecent = (recentAppIds: readonly string[], appId: string) => [appId, ...recentAppIds.filter((id) => id !== appId)].slice(0, 4)
const viewport = () => ({ width: globalThis.innerWidth || 1920, height: globalThis.innerHeight || 1080 })
export function clampDesktopBounds(bounds: DesktopBounds, viewportBounds = viewport()): DesktopBounds { const width = Math.min(bounds.width, viewportBounds.width); const height = Math.min(bounds.height, Math.max(1, viewportBounds.height - DESKTOP_TOP_BAR_HEIGHT - DESKTOP_BOTTOM_BAR_HEIGHT)); return { x: Math.max(0, Math.min(bounds.x, viewportBounds.width - width)), y: Math.max(DESKTOP_TOP_BAR_HEIGHT, Math.min(bounds.y, viewportBounds.height - DESKTOP_BOTTOM_BAR_HEIGHT - height)), width, height } }

export const useDesktopStore = create<DesktopStore>()(persist((set) => ({
  windows: [], focusedWindowId: null, launcherOpen: false, recentAppIds: [], launcherOrder: [],
  openWindow: (appId, instanceId, initialBounds) => set((state) => {
    const app = getDesktopApp(appId)
    if (app?.availability !== 'available' || app.window === undefined) return state
    const existing = app.singleton ? state.windows.find((window) => window.appId === appId) : state.windows.find((window) => window.appId === appId && window.instanceId === instanceId)
    if (existing !== undefined) {
      const restored = existing.minimized ? { ...existing, minimized: false } : existing
      const windows = [...state.windows.filter((window) => window.id !== existing.id), restored]
      return { windows: withZIndexes(windows), focusedWindowId: existing.id, recentAppIds: updateRecent(state.recentAppIds, appId), launcherOpen: false }
    }
    const cascade = state.windows.length * 28
    const id = instanceId === undefined ? `${appId}-window` : `${appId}-${instanceId}`
    const window: DesktopWindowState = { id, appId, instanceId, ...clampDesktopBounds({ x: 96 + cascade, y: DESKTOP_TOP_BAR_HEIGHT + 16 + cascade, width: app.window.width, height: app.window.height, ...initialBounds }), minimized: false, maximized: false, zIndex: 0 }
    return { windows: withZIndexes([...state.windows, window]), focusedWindowId: window.id, recentAppIds: updateRecent(state.recentAppIds, appId), launcherOpen: false }
  }),
  closeWindow: (windowId) => set((state) => { const windows = state.windows.filter((window) => window.id !== windowId); return { windows: withZIndexes(windows), focusedWindowId: state.focusedWindowId === windowId ? focusTopVisible(windows) : state.focusedWindowId } }),
  focusWindow: (windowId) => set((state) => { const target = state.windows.find((window) => window.id === windowId); if (target === undefined || target.minimized) return state; return { windows: withZIndexes([...state.windows.filter((window) => window.id !== windowId), target]), focusedWindowId: windowId } }),
  minimizeWindow: (windowId) => set((state) => { const windows = state.windows.map((window) => window.id === windowId ? { ...window, minimized: true } : window); return { windows: withZIndexes(windows), focusedWindowId: state.focusedWindowId === windowId ? focusTopVisible(windows) : state.focusedWindowId } }),
  restoreWindow: (windowId) => set((state) => { const window = state.windows.find((candidate) => candidate.id === windowId); if (window === undefined) return state; const restored = { ...window, minimized: false }; return { windows: withZIndexes([...state.windows.filter((candidate) => candidate.id !== windowId), restored]), focusedWindowId: windowId } }),
  maximizeWindow: (windowId) => set((state) => ({ windows: withZIndexes(state.windows.map((window) => window.id === windowId && !window.maximized ? { ...window, maximized: true, restoreBounds: { x: window.x, y: window.y, width: window.width, height: window.height } } : window)), focusedWindowId: windowId })),
  restoreMaximizedWindow: (windowId) => set((state) => ({ windows: withZIndexes(state.windows.map((window) => { if (window.id !== windowId || !window.maximized || window.restoreBounds === undefined) return window; return { ...window, ...window.restoreBounds, maximized: false, restoreBounds: undefined } })), focusedWindowId: windowId })),
  moveWindow: (windowId, position) => set((state) => ({ windows: state.windows.map((window) => window.id === windowId && !window.maximized ? { ...window, ...clampDesktopBounds({ ...window, ...position }) } : window) })),
  resizeWindow: (windowId, bounds) => set((state) => ({ windows: state.windows.map((window) => { if (window.id !== windowId || window.maximized) return window; const constraints = getDesktopApp(window.appId)?.window; return { ...window, ...clampDesktopBounds({ ...bounds, width: Math.max(constraints?.minWidth ?? 320, bounds.width), height: Math.max(constraints?.minHeight ?? 240, bounds.height) }) } }) })),
  snapWindow: (windowId, snap, viewport) => set((state) => ({ windows: withZIndexes(state.windows.map((window) => { if (window.id !== windowId) return window; const restoreBounds = window.maximized ? window.restoreBounds : { x: window.x, y: window.y, width: window.width, height: window.height }; if (snap === 'maximized') return { ...window, maximized: true, restoreBounds }; const width = Math.floor(viewport.width / 2); return { ...window, x: snap === 'left' ? 0 : width, y: DESKTOP_TOP_BAR_HEIGHT, width, height: Math.max(240, viewport.height - DESKTOP_TOP_BAR_HEIGHT - DESKTOP_BOTTOM_BAR_HEIGHT), maximized: false, restoreBounds } })) })),
  toggleLauncher: () => set((state) => ({ launcherOpen: !state.launcherOpen })),
  closeLauncher: () => set({ launcherOpen: false }),
  reorderLauncher: (movedId, targetId) => set((state) => ({ launcherOrder: reorderLauncherApps(resolveLauncherOrder(state.launcherOrder), movedId, targetId) })),
}), { name: 'bdm.launcher-order.v1', partialize: (state) => ({ launcherOrder: state.launcherOrder }) }))
