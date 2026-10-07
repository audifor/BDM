import { describe, expect, it } from 'vitest'

import { WORKSPACE_APP_IDS, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'
import { breakpointActionLabel, resolveBreakpointDestination } from './breakpointRouting'

/** Every canonical `SimulationBreakpoint.route` that has a resolver, and the workspace app it opens. */
const EXPECTED_ROUTES: Readonly<Record<string, WorkspaceAppId>> = {
  match: 'match', medical: 'medical', market: 'market', draft: 'draft', media: 'media',
  coach: 'coach', trades: 'trades', competition: 'competition', contracts: 'contracts', schedule: 'schedule',
}

describe('MX0.2 breakpoint routing', () => {
  it('reports a mapped route whose workspace is registered as both routable and actionable', () => {
    for (const [route, app] of Object.entries(EXPECTED_ROUTES)) {
      expect(resolveBreakpointDestination(route)).toEqual({ route, appId: app, routable: true, actionable: true })
      // The mapping only ever names an app the BDM OS workspace registry actually implements.
      expect(WORKSPACE_APP_IDS).toContain(app)
      expect(typeof breakpointActionLabel(route)).toBe('string')
    }
  })

  it('never claims actionability for a route whose workspace app is not registered', () => {
    const withoutContracts = WORKSPACE_APP_IDS.filter((id) => id !== 'contracts')

    expect(resolveBreakpointDestination('contracts', withoutContracts)).toEqual({
      route: 'contracts', appId: 'contracts', routable: true, actionable: false,
      reasonUnavailable: 'Workspace app "contracts" is not registered in the BDM OS workspace registry.',
    })

    // A missing app only affects its own route: the rest of the mapping stays actionable.
    expect(resolveBreakpointDestination('match', withoutContracts).actionable).toBe(true)
  })

  it('offers no destination for an unmapped or absent route instead of faking one', () => {
    expect(resolveBreakpointDestination(undefined)).toEqual({
      routable: false, actionable: false, reasonUnavailable: 'The breakpoint carries no route.',
    })
    expect(resolveBreakpointDestination('unmapped-route')).toEqual({
      route: 'unmapped-route', routable: false, actionable: false,
      reasonUnavailable: 'No workspace app is mapped to breakpoint route "unmapped-route".',
    })
    expect(breakpointActionLabel('unmapped-route')).toBeUndefined()
  })

  // MX0.7: Governance decisions and requests are real surfaces — the Board workspace resolves them.
  it('resolves the governance route to the Board workspace', () => {
    expect(resolveBreakpointDestination('governance')).toEqual({ route: 'governance', appId: 'board', routable: true, actionable: true })
    expect(breakpointActionLabel('governance')).toBe('Board')
  })
})
