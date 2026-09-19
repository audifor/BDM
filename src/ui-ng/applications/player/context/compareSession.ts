import type { PlayerId } from '@/domain/ids'

/**
 * Contextual comparison, opened from a page's own `COMPARE WITH…` button.
 *
 * It is deliberately not a tab: the panel compares the current page's data, so the page that owns
 * that data is what decides what a comparison means.
 */
export interface CompareSession {
  readonly isOpen: boolean
  readonly playerId: PlayerId | null
  readonly open: () => void
  readonly close: () => void
  readonly setPlayerId: (playerId: PlayerId | null) => void
}
