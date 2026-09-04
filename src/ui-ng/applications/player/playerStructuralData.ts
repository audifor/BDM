/** Structural UI constants for NG player workspace — not game data. */

export const WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview', active: true },
  { id: 'attributes', label: 'Attributes' },
  { id: 'performance', label: 'Performance' },
  { id: 'development', label: 'Development' },
  { id: 'contract', label: 'Contract' },
  { id: 'medical', label: 'Medical' },
  { id: 'history', label: 'History' },
] as const

export const TASKBAR_APPS = [
  { id: 'home', label: 'Home' },
  { id: 'roster', label: 'Roster' },
  { id: 'player', label: 'Player', active: true },
  { id: 'scouting', label: 'Scouting' },
  { id: 'tactics', label: 'Tactics' },
  { id: 'medical', label: 'Medical' },
] as const

export const UNAVAILABLE_LABEL = 'Not available'
