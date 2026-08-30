import { beforeEach, describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { teamIdFromString } from '@/domain/ids'
import { useEntityNavigationStore } from '@/ui/navigation/entityNavigation'
import { useMatchViewerStore } from './matchViewerStore'
import { useDesktopStore } from './desktopStore'

const resetDesktop = () => useDesktopStore.setState({ windows: [], focusedWindowId: null, launcherOpen: false, recentAppIds: [], launcherOrder: [] })

describe('desktop window manager store', () => {
  beforeEach(resetDesktop)

  it('opens a window and keeps singleton applications unique', () => {
    useDesktopStore.getState().openWindow('squad')
    useDesktopStore.getState().openWindow('squad')
    expect(useDesktopStore.getState().windows).toHaveLength(1)
    expect(useDesktopStore.getState().focusedWindowId).toBe('squad-window')
  })

  it('consolidates duplicate app windows left by an older session', () => {
    useDesktopStore.setState({ windows: [
      { id: 'squad-window-old', appId: 'squad', x: 96, y: 64, width: 980, height: 700, minimized: false, maximized: false, zIndex: 10 },
      { id: 'squad-window', appId: 'squad', x: 124, y: 92, width: 980, height: 700, minimized: true, maximized: false, zIndex: 11 },
    ] })

    useDesktopStore.getState().openWindow('squad')

    expect(useDesktopStore.getState().windows).toHaveLength(1)
    expect(useDesktopStore.getState().windows[0]).toMatchObject({ id: 'squad-window', minimized: false })
  })

  it('keeps separate entity instances open together', () => {
    const store = useDesktopStore.getState()
    store.openWindow('entity', 'player-a'); store.openWindow('entity', 'player-b')
    expect(useDesktopStore.getState().windows.map((window) => window.id)).toEqual(['entity-player-a', 'entity-player-b'])
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

  it('snaps a window to either desktop half and keeps restore bounds', () => {
    const store = useDesktopStore.getState(); store.openWindow('schedule')
    store.snapWindow('schedule-window', 'right', { width: 1200, height: 800 })
    expect(useDesktopStore.getState().windows[0]).toMatchObject({ x: 600, y: 48, width: 600, height: 696 })
    expect(useDesktopStore.getState().windows[0]?.restoreBounds).toMatchObject({ x: 96, y: 64 })
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

  it('keeps desktop and entity navigation state when the match viewer closes', () => {
    const store = useDesktopStore.getState()
    store.openWindow('schedule')
    useEntityNavigationStore.getState().navigate({ type: 'team', teamId: teamIdFromString('team-viewed'), section: 'squad' })

    useMatchViewerStore.getState().clear()

    expect(useDesktopStore.getState().windows.map((window) => window.id)).toEqual(['schedule-window'])
    expect(useEntityNavigationStore.getState().destination).toEqual({ type: 'team', teamId: teamIdFromString('team-viewed'), section: 'squad' })
  })

  it('toggles the launcher and stores a serializable custom module order', () => {
    const store = useDesktopStore.getState()
    store.toggleLauncher(); expect(useDesktopStore.getState().launcherOpen).toBe(true)
    store.toggleLauncher(); expect(useDesktopStore.getState().launcherOpen).toBe(false)
    store.reorderLauncher('schedule', 'squad')
    expect(useDesktopStore.getState().launcherOrder.slice(0, 2)).toEqual(['schedule', 'squad'])
    expect(JSON.parse(JSON.stringify(useDesktopStore.getState().launcherOrder))).toEqual(useDesktopStore.getState().launcherOrder)
  })
})
