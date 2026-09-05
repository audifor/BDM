import { WORKSPACE_TASKBAR_APPS, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

export const PINNED_TASKBAR_APP_ID = 'home' as const satisfies WorkspaceAppId

export function isClosableTaskbarApp(id: WorkspaceAppId): boolean {
  return id !== PINNED_TASKBAR_APP_ID
}

export function rememberOpenedTaskbarApp(
  openApps: readonly WorkspaceAppId[],
  app: WorkspaceAppId,
): readonly WorkspaceAppId[] {
  if (!isClosableTaskbarApp(app) || openApps.includes(app)) return openApps
  return [...openApps, app]
}

export function closeOpenedTaskbarApp(
  openApps: readonly WorkspaceAppId[],
  app: WorkspaceAppId,
): readonly WorkspaceAppId[] {
  if (!isClosableTaskbarApp(app)) return openApps
  return openApps.filter((id) => id !== app)
}

export function visibleTaskbarAppIds(openApps: readonly WorkspaceAppId[]): readonly WorkspaceAppId[] {
  return [PINNED_TASKBAR_APP_ID, ...openApps.filter((id) => id !== PINNED_TASKBAR_APP_ID)]
}

export function taskbarAppLabel(id: WorkspaceAppId): string {
  return WORKSPACE_TASKBAR_APPS.find((entry) => entry.id === id)?.label ?? id
}
