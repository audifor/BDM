import type { WorkspaceAppId } from './workspaceApps'
import { parseWorkspaceApp } from './workspaceApps'

/**
 * Every opened workspace gets an in-session tab. One tab per canonical entity
 * in an application. Subviews remain part of that entity's tab, not new tabs.
 * Apps without a supported entity context stay single-instance.
 */
export interface TaskbarInstance {
  readonly key: string
  readonly app: WorkspaceAppId
  readonly entityKind: string | null
  readonly entityId: string | null
  readonly url: string
}

const IDENTITY_PARAMS: Partial<Record<WorkspaceAppId, readonly string[]>> = {
  player: ['playerId'],
  staff: ['staffId', 'staffDept'],
  roster: ['teamId'],
  club: ['teamId'],
  competition: ['competitionId'],
  contracts: ['playerId', 'teamId'],
  medical: ['playerId', 'teamId'],
  scouting: ['focusPlayerId', 'playerId'],
  recruiting: ['focusPlayerId', 'playerId'],
  draft: ['focusPlayerId', 'playerId'],
  portal: ['focusPlayerId', 'playerId'],
  talent: ['playerId', 'focusPlayerId'],
  training: ['teamId'],
  tactics: ['teamId'],
  mentoring: ['teamId'],
  facilities: ['teamId'],
  finances: ['teamId'],
  market: ['teamId'],
  trades: ['teamId'],
  schedule: ['teamId'],
  nil: ['playerId', 'teamId'],
  boosters: ['teamId'],
  enforcement: ['decisionId', 'requestId', 'teamId'],
  board: ['decisionId', 'requestId', 'teamId'],
}

/** A clean app+entity key; no accidental instances from unrelated URL params. */
export function taskbarInstanceFromUrl(url: URL): TaskbarInstance | null {
  const app = parseWorkspaceApp(url.searchParams.get('app'))
  if (app === 'home') return null
  const matching = (IDENTITY_PARAMS[app] ?? [])
    .map(name => ({ name, value: url.searchParams.get(name)?.trim() }))
    .find(entry => entry.value)
  const entityKind = matching?.name ?? null
  const entityId = matching?.value ?? null
  return {
    key: entityKind === null ? app : app + ':' + entityKind + ':' + encodeURIComponent(entityId!),
    app,
    entityKind,
    entityId,
    url: url.pathname + url.search + url.hash,
  }
}

export function rememberTaskbarInstance(
  previous: readonly TaskbarInstance[],
  current: TaskbarInstance | null,
): readonly TaskbarInstance[] {
  if (current === null) return previous
  const index = previous.findIndex(entry => entry.key === current.key)
  if (index === -1) return [...previous, current]
  if (previous[index]!.url === current.url) return previous
  return previous.map(entry => entry.key === current.key ? current : entry)
}

export function closeTaskbarInstance(
  instances: readonly TaskbarInstance[],
  key: string,
): readonly TaskbarInstance[] {
  return instances.filter(instance => instance.key !== key)
}

export function closeTaskbarAppInstances(
  instances: readonly TaskbarInstance[],
  app: WorkspaceAppId,
): readonly TaskbarInstance[] {
  return instances.filter(instance => instance.app !== app)
}
