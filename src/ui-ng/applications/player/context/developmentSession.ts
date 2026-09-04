export interface DevelopmentSession {
  readonly selectedItemId: string | null
  readonly setSelectedItemId: (itemId: string | null) => void
}
