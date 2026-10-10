import { WORKSPACE_APP_IDS, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

/** Courtside's default dock has Home only; the Start control is separate. */
export const COURTSIDE_DEFAULT_PINS = ['home'] as const satisfies readonly WorkspaceAppId[]
export const COURTSIDE_PIN_STORAGE_KEY = 'bdm-courtside-pins-v1'
export const COURTSIDE_ORDER_STORAGE_KEY = 'bdm-courtside-order-v1'

export function validTaskbarApps(input: unknown): WorkspaceAppId[] {
  if (!Array.isArray(input)) return []
  const allowed = new Set<string>(WORKSPACE_APP_IDS)
  return [...new Set(input.filter((id): id is WorkspaceAppId => typeof id === 'string' && allowed.has(id)))]
}

export function readTaskbarApps(key: string, fallback: readonly WorkspaceAppId[]): WorkspaceAppId[] {
  try {
    const text = window.localStorage.getItem(key)
    if (text === null) return [...fallback]
    return validTaskbarApps(JSON.parse(text))
  } catch {
    return [...fallback]
  }
}

export function withMandatoryHome(ids: readonly WorkspaceAppId[]): WorkspaceAppId[] {
  return ['home', ...ids.filter((id) => id !== 'home')]
}

export function orderedVisibleTaskbarApps(
  pinned: readonly WorkspaceAppId[],
  open: readonly WorkspaceAppId[],
  order: readonly WorkspaceAppId[],
): WorkspaceAppId[] {
  const visible = withMandatoryHome(validTaskbarApps([...pinned, ...open]))
  const ordered = validTaskbarApps(order).filter((id) => visible.includes(id))
  return [...ordered, ...visible.filter((id) => !ordered.includes(id))]
}

export function moveTaskbarApp(
  items: readonly WorkspaceAppId[],
  source: WorkspaceAppId,
  target: WorkspaceAppId,
): WorkspaceAppId[] {
  if (source === target || source === 'home' || target === 'home') return [...items]
  const list = [...items]
  const from = list.indexOf(source)
  const to = list.indexOf(target)
  if (from < 0 || to < 0) return list
  list.splice(from, 1)
  list.splice(list.indexOf(target), 0, source)
  return list
}
