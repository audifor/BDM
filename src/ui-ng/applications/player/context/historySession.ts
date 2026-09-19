export interface HistorySession {
  readonly selectedItemId: string | null
  readonly setSelectedItemId: (itemId: string | null) => void
}
