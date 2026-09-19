/** Structural UI constants for NG player workspace — not game data. */

/** Definitive PLAYER page order: Compare is a contextual action, never a tab. */
export const PLAYER_WORKSPACE_VIEWS = [
  'overview',
  'attributes',
  'performance',
  'development',
  'contract',
  'medical',
  'scouting',
  'history',
] as const

export type PlayerWorkspaceViewId = (typeof PLAYER_WORKSPACE_VIEWS)[number]

export const PLAYER_VIEW_LABELS: Record<PlayerWorkspaceViewId, string> = {
  overview: 'Overview',
  attributes: 'Attributes',
  performance: 'Performance',
  development: 'Development',
  contract: 'Contract',
  medical: 'Medical',
  scouting: 'Scouting Report',
  history: 'History',
}

/**
 * Every page of the PLAYER workspace has its own implementation, so no page falls back to a
 * placeholder message any more. Kept as an explicit empty contract so the invariant is testable.
 */
export const PLAYER_VIEW_PLACEHOLDERS: Partial<Record<PlayerWorkspaceViewId, string>> = {}

export const TASKBAR_APPS = [
  { id: 'home', label: 'Home' },
  { id: 'roster', label: 'Roster' },
  { id: 'player', label: 'Player' },
  { id: 'scouting', label: 'Scouting' },
  { id: 'tactics', label: 'Tactics' },
  { id: 'medical', label: 'Medical' },
] as const

export const UNAVAILABLE_LABEL = 'Not available'

export function parsePlayerWorkspaceView(value: string | null): PlayerWorkspaceViewId {
  if (value !== null && PLAYER_WORKSPACE_VIEWS.includes(value as PlayerWorkspaceViewId)) {
    return value as PlayerWorkspaceViewId
  }
  return 'overview'
}
