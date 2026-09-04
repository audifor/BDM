import type { PlayerId } from '@/domain/ids'

import { parsePlayerWorkspaceView } from '@/ui-ng/applications/player/playerStructuralData'

export const WORKSPACE_APP_IDS = ['home', 'roster', 'player', 'scouting', 'tactics', 'medical'] as const

export type WorkspaceAppId = (typeof WORKSPACE_APP_IDS)[number]

export interface WorkspaceTaskbarApp {
  readonly id: WorkspaceAppId
  readonly label: string
}

export const WORKSPACE_TASKBAR_APPS: readonly WorkspaceTaskbarApp[] = [
  { id: 'home', label: 'Home' },
  { id: 'roster', label: 'Roster' },
  { id: 'player', label: 'Player' },
  { id: 'scouting', label: 'Scouting' },
  { id: 'tactics', label: 'Tactics' },
  { id: 'medical', label: 'Medical' },
]

export function parseWorkspaceApp(value: string | null): WorkspaceAppId {
  if (value !== null && WORKSPACE_APP_IDS.includes(value as WorkspaceAppId)) {
    return value as WorkspaceAppId
  }
  return 'player'
}

export function parseWorkspacePlayerId(value: string | null): PlayerId | null {
  return value === null || value.trim() === '' ? null : (value as PlayerId)
}

export function readNgWorkspaceNavigation() {
  const params = new URLSearchParams(window.location.search)
  return {
    app: parseWorkspaceApp(params.get('app')),
    playerId: parseWorkspacePlayerId(params.get('playerId')),
    playerView: parsePlayerWorkspaceView(params.get('playerView')),
  }
}

export function notifyNgNavigation() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('bdm-ng-nav'))
  }
}

export function syncWorkspaceAppQuery(app: WorkspaceAppId, method: 'push' | 'replace' = 'replace') {
  const url = new URL(window.location.href)
  if (app === 'player') {
    url.searchParams.delete('app')
  } else {
    url.searchParams.set('app', app)
  }
  applyHistory(url, method)
  notifyNgNavigation()
}

export function syncPlayerIdQuery(playerId: PlayerId | null, method: 'push' | 'replace' = 'replace') {
  const url = new URL(window.location.href)
  if (playerId === null) {
    url.searchParams.delete('playerId')
  } else {
    url.searchParams.set('playerId', playerId)
  }
  applyHistory(url, method)
  notifyNgNavigation()
}

export function syncPlayerViewQueryFromApps(view: ReturnType<typeof parsePlayerWorkspaceView>) {
  const url = new URL(window.location.href)
  if (view === 'overview') {
    url.searchParams.delete('playerView')
  } else {
    url.searchParams.set('playerView', view)
  }
  window.history.replaceState(window.history.state, '', url)
  notifyNgNavigation()
}

export function navigateToPlayerFromRoster(playerId: PlayerId) {
  const url = new URL(window.location.href)
  url.searchParams.set('app', 'player')
  url.searchParams.set('playerId', playerId)
  url.searchParams.delete('playerView')
  applyHistory(url, 'push')
  notifyNgNavigation()
}

export function navigateToPlayer(playerId: PlayerId) {
  const url = new URL(window.location.href)
  url.searchParams.delete('app')
  url.searchParams.set('playerId', playerId)
  url.searchParams.delete('playerView')
  applyHistory(url, 'push')
  notifyNgNavigation()
}

function applyHistory(url: URL, method: 'push' | 'replace') {
  if (method === 'push') {
    window.history.pushState(window.history.state, '', url)
    return
  }
  window.history.replaceState(window.history.state, '', url)
}
