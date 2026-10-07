import { WORKSPACE_APP_IDS, WORKSPACE_TASKBAR_APPS, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

/**
 * MX0.2: the canonical `SimulationBreakpoint.route` values and the BDM OS workspace app that can resolve them.
 * The mapping is one-directional and deliberately explicit: a route without a current resolver stays absent so the
 * continue surface keeps an explicit diagnostic instead of faking a destination.
 * MX0.7 maps `governance` to the Board workspace, the surface that owns canonical board/governance matters.
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
  governance: 'board',
}

const WORKSPACE_APP_LABELS: ReadonlyMap<WorkspaceAppId, string> = new Map(
  WORKSPACE_TASKBAR_APPS.map((app) => [app.id, app.label]),
)

/**
 * A breakpoint route resolved into a destination, separating two questions the UI must not conflate:
 *
 * - ROUTABLE: the route has a known destination identifier (`appId`) at all.
 * - ACTIONABLE: that destination is a *registered* BDM OS workspace app, so pressing the resolver opens a real
 *   surface able to act on the breakpoint. Route metadata alone never implies this.
 */
export interface BreakpointDestination {
  /** The canonical `SimulationBreakpoint.route`, when the breakpoint carries one. */
  readonly route?: string
  readonly appId?: WorkspaceAppId
  readonly routable: boolean
  readonly actionable: boolean
  /** Why no actionable destination exists; always set when `actionable` is false. */
  readonly reasonUnavailable?: string
}

/**
 * Resolves a breakpoint route against the registered BDM OS workspace apps — the registry `WorkspaceHost`
 * implements and the SystemBar resolver navigates. `registeredApps` is the seam that lets a caller (and its tests)
 * resolve against an explicit registry instead of assuming every mapped app still exists.
 */
export function resolveBreakpointDestination(route: string | undefined, registeredApps: readonly WorkspaceAppId[] = WORKSPACE_APP_IDS): BreakpointDestination {
  if (route === undefined) {
    return { routable: false, actionable: false, reasonUnavailable: 'The breakpoint carries no route.' }
  }
  const appId = BREAKPOINT_ROUTE_APPS[route]
  if (appId === undefined) {
    return { route, routable: false, actionable: false, reasonUnavailable: `No workspace app is mapped to breakpoint route "${route}".` }
  }
  if (!registeredApps.includes(appId)) {
    return { route, appId, routable: true, actionable: false, reasonUnavailable: `Workspace app "${appId}" is not registered in the BDM OS workspace registry.` }
  }
  return { route, appId, routable: true, actionable: true }
}

/** The action label of the resolver app for a breakpoint route, or undefined when there is none. */
export function breakpointActionLabel(route: string | undefined): string | undefined {
  const app = route === undefined ? undefined : BREAKPOINT_ROUTE_APPS[route]
  return app === undefined ? undefined : WORKSPACE_APP_LABELS.get(app)
}
