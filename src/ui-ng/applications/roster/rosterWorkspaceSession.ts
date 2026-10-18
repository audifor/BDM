import { create } from 'zustand'

import type { RosterPositionFilter } from '@/ui-ng/applications/roster/rosterPositionFilter'
import type { DataGridView } from '@/ui/dataGrid/types'
import { EMPTY_ROSTER_V4_FILTERS, type RosterV4Filters } from './rosterV4Filters'

export interface RosterWorkspaceSessionState {
  readonly activePreset: string
  readonly searchQuery: string
  readonly positionFilter: RosterPositionFilter
  readonly selectedRowIds: readonly string[]
  readonly scrollTop: number
  readonly scrollLeft: number
  readonly tab: 'plantilla' | 'profundidad' | 'briefing' | 'planificar'
  readonly favoritePresets: readonly string[]
  readonly customViews: readonly DataGridView[]
  readonly v4Filters: RosterV4Filters
}

interface RosterWorkspaceSessionActions {
  readonly setActivePreset: (activePreset: string) => void
  readonly setSearchQuery: (searchQuery: string) => void
  readonly setPositionFilter: (positionFilter: RosterPositionFilter) => void
  readonly setSelectedRowIds: (selectedRowIds: readonly string[]) => void
  readonly setScrollTop: (scrollTop: number) => void
  readonly setScrollLeft: (scrollLeft: number) => void
  readonly setTab: (tab: RosterWorkspaceSessionState['tab']) => void
  readonly setFavoritePresets: (favoritePresets: readonly string[]) => void
  readonly setCustomViews: (customViews: readonly DataGridView[]) => void
  readonly setV4Filters: (filters: RosterV4Filters) => void
  readonly reset: () => void
}

const readSaved = <T,>(key: string, fallback: T): T => {
  try {
    if (typeof localStorage === 'undefined') return fallback
    const value = localStorage.getItem('bdm:roster:v4:' + key)
    return value === null ? fallback : JSON.parse(value) as T
  } catch { return fallback }
}
const save = (key: string, value: unknown) => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem('bdm:roster:v4:' + key, JSON.stringify(value)) } catch { /* storage disabled */ }
}

const defaultState: RosterWorkspaceSessionState = {
  activePreset: 'general',
  searchQuery: '',
  positionFilter: 'ALL',
  selectedRowIds: [],
  scrollTop: 0,
  scrollLeft: 0,
  tab: 'plantilla',
  favoritePresets: ['general','performance','shooting','finishing','defense','physical'],
  customViews: [],
  v4Filters: EMPTY_ROSTER_V4_FILTERS,
}

export const useRosterWorkspaceSession = create<RosterWorkspaceSessionState & RosterWorkspaceSessionActions>(
  (set) => ({
    ...defaultState,
    favoritePresets: readSaved<string[]>('favorites', [...defaultState.favoritePresets]).map(id=>id==='offense'?'finishing':id).filter((id,i,list)=>list.indexOf(id)===i).slice(0,6),
    customViews: readSaved('customViews', defaultState.customViews),
    v4Filters: readSaved('filters', defaultState.v4Filters),
    setActivePreset: (activePreset) => set({ activePreset }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setPositionFilter: (positionFilter) => set({ positionFilter }),
    setSelectedRowIds: (selectedRowIds) => set({ selectedRowIds }),
    setScrollTop: (scrollTop) => set({ scrollTop }),
    setScrollLeft: (scrollLeft) => set({ scrollLeft }),
    setTab: (tab) => set({ tab }),
    setFavoritePresets: (favoritePresets) => { save('favorites', favoritePresets); set({ favoritePresets }) },
    setCustomViews: (customViews) => { save('customViews', customViews); set({ customViews }) },
    setV4Filters: (v4Filters) => { save('filters', v4Filters); set({ v4Filters }) },
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
  readonly customViews?: readonly DataGridView[]
}
