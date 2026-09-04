/** Structural UI constants for NG player workspace — not game data. */

export const PLAYER_WORKSPACE_VIEWS = [
  'overview',
  'attributes',
  'performance',
  'development',
  'contract',
  'medical',
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
  history: 'History',
}

export const PLAYER_VIEW_PLACEHOLDERS: Partial<Record<PlayerWorkspaceViewId, string>> = {
  performance: 'Performance workspace not implemented in NG yet.',
  development: 'Development workspace not implemented in NG yet.',
  contract: 'Contract workspace not implemented in NG yet.',
  medical: 'Medical workspace not implemented in NG yet.',
  history: 'History workspace not implemented in NG yet.',
}

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
