import type { HistoryFilterId } from '@/ui-ng/applications/player/data/buildPlayerHistoryModel'

export interface HistorySession {
  readonly selectedItemId: string | null
  readonly setSelectedItemId: (itemId: string | null) => void
  readonly activeFilter: HistoryFilterId
  readonly setActiveFilter: (filterId: HistoryFilterId) => void
}
