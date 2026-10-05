import { WORKSPACE_TASKBAR_APPS, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

/**
 * MX0.2: the canonical `SimulationBreakpoint.route` values that already have a desktop workspace app.
 * The mapping is one-directional and deliberately explicit: a route without a current resolver (for
 * example Governance, which has no app) stays absent so the continue surface keeps an explicit
 * diagnostic instead of faking a destination.
 */
const BREAKPOINT_ROUTE_APPS: Readonly<Record<string, WorkspaceAppId>> = {
  match: 'match',
  medical: 'medical',
  market: 'market',
  draft: 'draft',
  media: 'media',
  coach: 'coach',
  trades: 'trades',
  competition: 'competition',
  contracts: 'contracts',
  schedule: 'schedule',
}

const WORKSPACE_APP_LABELS: ReadonlyMap<WorkspaceAppId, string> = new Map(
  WORKSPACE_TASKBAR_APPS.map((app) => [app.id, app.label]),
)

/** The workspace app that resolves a breakpoint route, or undefined when no resolver exists yet. */
export function workspaceAppForBreakpointRoute(route: string | undefined): WorkspaceAppId | undefined {
  return route === undefined ? undefined : BREAKPOINT_ROUTE_APPS[route]
}

/** The action label of the resolver app for a breakpoint route, or undefined when there is none. */
export function breakpointActionLabel(route: string | undefined): string | undefined {
  const app = workspaceAppForBreakpointRoute(route)
  return app === undefined ? undefined : WORKSPACE_APP_LABELS.get(app)
}
