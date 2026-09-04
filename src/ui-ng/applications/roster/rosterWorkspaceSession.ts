import { create } from 'zustand'

import type { RosterPositionFilter } from '@/ui-ng/applications/roster/rosterPositionFilter'

export interface RosterWorkspaceSessionState {
  readonly activePreset: string
  readonly searchQuery: string
  readonly positionFilter: RosterPositionFilter
  readonly selectedRowIds: readonly string[]
  readonly scrollTop: number
}

interface RosterWorkspaceSessionActions {
  readonly setActivePreset: (activePreset: string) => void
  readonly setSearchQuery: (searchQuery: string) => void
  readonly setPositionFilter: (positionFilter: RosterPositionFilter) => void
  readonly setSelectedRowIds: (selectedRowIds: readonly string[]) => void
  readonly setScrollTop: (scrollTop: number) => void
  readonly reset: () => void
}

const defaultState: RosterWorkspaceSessionState = {
  activePreset: 'general',
  searchQuery: '',
  positionFilter: 'ALL',
  selectedRowIds: [],
  scrollTop: 0,
}

export const useRosterWorkspaceSession = create<RosterWorkspaceSessionState & RosterWorkspaceSessionActions>(
  (set) => ({
    ...defaultState,
    setActivePreset: (activePreset) => set({ activePreset }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setPositionFilter: (positionFilter) => set({ positionFilter }),
    setSelectedRowIds: (selectedRowIds) => set({ selectedRowIds }),
    setScrollTop: (scrollTop) => set({ scrollTop }),
    reset: () => set(defaultState),
  }),
)

export interface RosterNgSessionBridge {
  readonly activePreset: string
  readonly onActivePresetChange: (activePreset: string) => void
  readonly searchQuery: string
  readonly onSearchQueryChange: (searchQuery: string) => void
  readonly positionFilter: RosterPositionFilter
  readonly onPositionFilterChange: (positionFilter: RosterPositionFilter) => void
  readonly selectedRowIds: readonly string[]
  readonly onSelectedRowIdsChange: (selectedRowIds: readonly string[]) => void
}
