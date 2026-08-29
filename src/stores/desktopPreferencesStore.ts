import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const DESKTOP_WALLPAPERS = ['arena', 'office', 'court', 'abstract'] as const
export type DesktopWallpaper = (typeof DESKTOP_WALLPAPERS)[number]
export const DENSITY_PRESETS = ['comfortable', 'standard', 'compact'] as const
export type DensityPreset = (typeof DENSITY_PRESETS)[number]
const DEFAULT_TEAM_NOTES = globalThis.location?.hostname === 'localhost' ? 'Focus on defense\nImprove 3PT %\nDevelop young core\nWin the East' : ''

interface DesktopPreferencesStore {
  readonly wallpaper: DesktopWallpaper
  readonly density: DensityPreset
  readonly dockAutoHide: boolean
  readonly teamNotes: string
  readonly visualQaFixture: boolean
  setWallpaper(wallpaper: DesktopWallpaper): void
  setDensity(density: DensityPreset): void
  setDockAutoHide(enabled: boolean): void
  setTeamNotes(notes: string): void
  setVisualQaFixture(enabled: boolean): void
}

/** Local workstation preferences; never part of a saved GameWorld. */
export const useDesktopPreferencesStore = create<DesktopPreferencesStore>()(persist((set) => ({
  wallpaper: 'arena', density: 'standard', dockAutoHide: false, teamNotes: DEFAULT_TEAM_NOTES, visualQaFixture: false,
  setWallpaper: (wallpaper) => set({ wallpaper }),
  setDensity: (density) => set({ density }),
  setDockAutoHide: (dockAutoHide) => set({ dockAutoHide }),
  setTeamNotes: (teamNotes) => set({ teamNotes }),
  setVisualQaFixture: (visualQaFixture) => set({ visualQaFixture }),
}), { name: 'bdm.desktop-preferences.v1' }))
