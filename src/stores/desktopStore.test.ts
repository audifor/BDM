import { beforeEach, describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { useDesktopStore } from './desktopStore'

const resetDesktop = () => useDesktopStore.setState({ windows: [], focusedWindowId: null, launcherOpen: false, recentAppIds: [] })

describe('desktop window manager store', () => {
  beforeEach(resetDesktop)

  it('opens a window and keeps singleton applications unique', () => {
    useDesktopStore.getState().openWindow('squad')
    useDesktopStore.getState().openWindow('squad')
    expect(useDesktopStore.getState().windows).toHaveLength(1)
    expect(useDesktopStore.getState().focusedWindowId).toBe('squad-window')
  })

  it('focuses, closes, minimizes and restores windows without closing the app', () => {
    const store = useDesktopStore.getState(); store.openWindow('schedule'); store.openWindow('squad')
    store.focusWindow('schedule-window'); expect(useDesktopStore.getState().focusedWindowId).toBe('schedule-window')
    store.minimizeWindow('schedule-window'); expect(useDesktopStore.getState().windows.find((window) => window.id === 'schedule-window')?.minimized).toBe(true)
    expect(useDesktopStore.getState().focusedWindowId).toBe('squad-window')
    store.restoreWindow('schedule-window'); expect(useDesktopStore.getState().focusedWindowId).toBe('schedule-window')
    store.closeWindow('schedule-window'); expect(useDesktopStore.getState().windows.map((window) => window.id)).toEqual(['squad-window'])
  })

  it('preserves bounds through maximize and restore', () => {
    const store = useDesktopStore.getState(); store.openWindow('schedule'); store.moveWindow('schedule-window', { x: 220, y: 140 }); store.resizeWindow('schedule-window', { x: 220, y: 140, width: 700, height: 600 })
    store.maximizeWindow('schedule-window'); expect(useDesktopStore.getState().windows[0]?.restoreBounds).toEqual({ x: 220, y: 140, width: 700, height: 600 })
    store.restoreMaximizedWindow('schedule-window'); expect(useDesktopStore.getState().windows[0]).toMatchObject({ x: 220, y: 140, width: 700, height: 600, maximized: false })
  })

  it('moves windows and enforces app minimum resize bounds', () => {
    const store = useDesktopStore.getState(); store.openWindow('schedule'); store.moveWindow('schedule-window', { x: 180, y: 110 }); store.resizeWindow('schedule-window', { x: 180, y: 110, width: 10, height: 10 })
    expect(useDesktopStore.getState().windows[0]).toMatchObject({ x: 180, y: 110, width: 520, height: 400 })
  })

  it('contains UI-only state and does not mutate gameplay', () => {
    const world = createNewGame(); const before = JSON.stringify(world)
    useDesktopStore.getState().openWindow('schedule'); useDesktopStore.getState().maximizeWindow('schedule-window')
    expect(JSON.stringify(world)).toBe(before)
  })
})
