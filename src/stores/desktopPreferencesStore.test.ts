import { beforeEach, describe, expect, it } from 'vitest'
import { useDesktopPreferencesStore } from './desktopPreferencesStore'

describe('desktop preferences', () => {
  beforeEach(() => useDesktopPreferencesStore.setState({ wallpaper: 'arena', density: 'standard', dockAutoHide: false }))
  it('keeps appearance preferences outside gameplay state', () => {
    const store = useDesktopPreferencesStore.getState()
    store.setWallpaper('court'); store.setDensity('compact'); store.setDockAutoHide(true)
    expect(useDesktopPreferencesStore.getState()).toMatchObject({ wallpaper: 'court', density: 'compact', dockAutoHide: true })
  })
})
