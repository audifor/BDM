import type { CompetitionId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'

import type { EntityDestination } from '@/ui/navigation/entityNavigation'

import { parsePlayerWorkspaceView } from '@/ui-ng/applications/player/playerStructuralData'
import { parseStaffPersonView, type StaffPersonViewId } from '@/ui-ng/applications/staff/staffPersonWorkspaceModel'

export const WORKSPACE_APP_IDS = [
  'home',
  'roster',
  'player',
  'staff',
  'scouting',
  'tactics',
  'training',
  'mentoring',
  'medical',
  'schedule',
  'competition',
  'match',
  'market',
  'draft',
  'trades',
  'club',
  'board',
  'finances',
  'enforcement',
  'coach',
  'coach-finances',
  'memories',
  'narratives',
  'media',
  'recruiting',
  'nil',
  'boosters',
] as const

export type WorkspaceAppId = (typeof WORKSPACE_APP_IDS)[number]

export interface WorkspaceTaskbarApp {
  readonly id: WorkspaceAppId
  readonly label: string
}

export const WORKSPACE_TASKBAR_APPS: readonly WorkspaceTaskbarApp[] = [
  { id: 'home', label: 'Home' },
  { id: 'roster', label: 'Roster' },
  { id: 'player', label: 'Player' },
  { id: 'staff', label: 'Staff' },
  { id: 'scouting', label: 'Scouting' },
  { id: 'tactics', label: 'Tactics' },
  { id: 'training', label: 'Training' },
  { id: 'mentoring', label: 'Mentoring' },
  { id: 'medical', label: 'Medical' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'competition', label: 'Competition' },
  { id: 'match', label: 'Match' },
  { id: 'market', label: 'Market' },
  { id: 'draft', label: 'Draft' },
  { id: 'trades', label: 'Trades' },
  { id: 'club', label: 'Club' },
  { id: 'board', label: 'Board' },
  { id: 'finances', label: 'Finances' },
  { id: 'enforcement', label: 'Compliance' },
  { id: 'coach', label: 'Coach' },
  { id: 'coach-finances', label: 'Wealth' },
  { id: 'memories', label: 'Memories' },
  { id: 'narratives', label: 'Stories' },
  { id: 'media', label: 'Press' },
  { id: 'recruiting', label: 'Recruiting' },
  { id: 'nil', label: 'NIL' },
  { id: 'boosters', label: 'Boosters' },
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

export function parseWorkspaceStaffId(value: string | null): StaffPersonId | null {
  return value === null || value.trim() === '' ? null : (value as StaffPersonId)
}

export function parseWorkspaceTeamId(value: string | null): TeamId | null {
  return value === null || value.trim() === '' ? null : (value as TeamId)
}

export function parseWorkspaceCompetitionId(value: string | null): CompetitionId | null {
  return value === null || value.trim() === '' ? null : (value as CompetitionId)
}

export function readNgWorkspaceNavigation() {
  const params = new URLSearchParams(window.location.search)
  return {
    app: parseWorkspaceApp(params.get('app')),
    playerId: parseWorkspacePlayerId(params.get('playerId')),
    playerView: parsePlayerWorkspaceView(params.get('playerView')),
    staffId: parseWorkspaceStaffId(params.get('staffId')),
    staffView: parseStaffPersonView(params.get('staffView')),
    teamId: parseWorkspaceTeamId(params.get('teamId')),
    competitionId: parseWorkspaceCompetitionId(params.get('competitionId')),
  }
}

export function notifyNgNavigation() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('bdm-ng-nav'))
  }
}

function clearEntityQuery(url: URL) {
  url.searchParams.delete('playerId')
  url.searchParams.delete('playerView')
  url.searchParams.delete('staffId')
  url.searchParams.delete('staffView')
  url.searchParams.delete('teamId')
  url.searchParams.delete('competitionId')
}

export function syncWorkspaceAppQuery(app: WorkspaceAppId, method: 'push' | 'replace' = 'replace') {
  const url = new URL(window.location.href)
  if (app === 'player') {
    url.searchParams.delete('app')
  } else {
    url.searchParams.set('app', app)
  }
  url.searchParams.delete('staffId')
  url.searchParams.delete('staffView')
  url.searchParams.delete('teamId')
  url.searchParams.delete('competitionId')
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
  clearEntityQuery(url)
  url.searchParams.set('app', 'player')
  url.searchParams.set('playerId', playerId)
  applyHistory(url, 'push')
  notifyNgNavigation()
}

export function navigateToPlayer(playerId: PlayerId) {
  const url = new URL(window.location.href)
  clearEntityQuery(url)
  url.searchParams.delete('app')
  url.searchParams.set('playerId', playerId)
  applyHistory(url, 'push')
  notifyNgNavigation()
}

export function navigateToPlayerMedical(playerId: PlayerId) {
  const url = new URL(window.location.href)
  clearEntityQuery(url)
  url.searchParams.delete('app')
  url.searchParams.set('playerId', playerId)
  url.searchParams.set('playerView', 'medical')
  applyHistory(url, 'push')
  notifyNgNavigation()
}

export function navigateToStaff(staffId: StaffPersonId) {
  const url = new URL(window.location.href)
  clearEntityQuery(url)
  url.searchParams.set('app', 'staff')
  url.searchParams.set('staffId', staffId)
  applyHistory(url, 'push')
  notifyNgNavigation()
}

export function syncStaffViewQuery(view: StaffPersonViewId) {
  const url = new URL(window.location.href)
  if (view === 'overview') {
    url.searchParams.delete('staffView')
  } else {
    url.searchParams.set('staffView', view)
  }
  window.history.replaceState(window.history.state, '', url)
  notifyNgNavigation()
}

export function navigateToTeamInNg(
  destination: Extract<EntityDestination, { type: 'team' }>,
  method: 'push' | 'replace' = 'push',
) {
  const url = new URL(window.location.href)
  url.searchParams.set('app', destination.section === 'overview' ? 'club' : 'roster')
  url.searchParams.set('teamId', destination.teamId)
  url.searchParams.delete('playerId')
  url.searchParams.delete('playerView')
  url.searchParams.delete('staffId')
  url.searchParams.delete('staffView')
  url.searchParams.delete('competitionId')
  applyHistory(url, method)
  notifyNgNavigation()
}

export function navigateToCompetitionInNg(
  destination: Extract<EntityDestination, { type: 'competition' }>,
  method: 'push' | 'replace' = 'push',
) {
  const url = new URL(window.location.href)
  url.searchParams.set('app', 'competition')
  url.searchParams.set('competitionId', destination.competitionId)
  url.searchParams.delete('playerId')
  url.searchParams.delete('playerView')
  url.searchParams.delete('staffId')
  url.searchParams.delete('staffView')
  url.searchParams.delete('teamId')
  applyHistory(url, method)
  notifyNgNavigation()
}

function applyHistory(url: URL, method: 'push' | 'replace') {
  if (method === 'push') {
    window.history.pushState(window.history.state, '', url)
    return
  }
  window.history.replaceState(window.history.state, '', url)
}
