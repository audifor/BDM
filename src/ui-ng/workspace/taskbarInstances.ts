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
  staff: ['staffId', 'staffDept', 'teamId'],
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

/** Resolve a workspace's implicit current entity before it is recorded in the dock.
 * This makes the first entry the visible player/team, not an anonymous app shell.
 * The returned URL can be opened directly to restore the same entity.
 */
export function withTaskbarDefaultEntity(
  url: URL,
  context: { readonly playerId?: string | null; readonly teamId?: string | null },
): URL {
  const resolved = new URL(url.href)
  const app = parseWorkspaceApp(resolved.searchParams.get('app'))
  if (app === 'player' && !resolved.searchParams.has('playerId') && context.playerId) {
    resolved.searchParams.set('playerId', context.playerId)
  }
  if ((app === 'roster' || app === 'club' || app === 'staff') &&
    !resolved.searchParams.has('teamId') &&
    !resolved.searchParams.has('staffId') &&
    !resolved.searchParams.has('staffDept') &&
    context.teamId) {
    resolved.searchParams.set('teamId', context.teamId)
  }
  return resolved
}

export function rememberTaskbarInstance(
  previous: readonly TaskbarInstance[],
  current: TaskbarInstance | null,
): readonly TaskbarInstance[] {
  if (current === null) return previous
  // Never keep a redundant generic app tile alongside actual entity dossiers.
  // A true generic route is still tracked when that application has no entity.
  if (current.entityId === null && previous.some(entry =>
    entry.app === current.app && entry.entityId !== null)) return previous
  const cleaned = current.entityId === null ? previous : previous.filter(entry =>
    !(entry.app === current.app && entry.entityId === null))
  const index = cleaned.findIndex(entry => entry.key === current.key)
  if (index === -1) return [...cleaned, current]
  if (cleaned[index]!.url === current.url) return cleaned
  return cleaned.map(entry => entry.key === current.key ? current : entry)
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
