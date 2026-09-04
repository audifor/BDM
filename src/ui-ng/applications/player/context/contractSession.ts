export interface ContractSession {
  readonly selectedItemId: string | null
  readonly setSelectedItemId: (itemId: string | null) => void
}
