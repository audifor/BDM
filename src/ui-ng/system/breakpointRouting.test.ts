import { describe, expect, it } from 'vitest'

import { WORKSPACE_APP_IDS } from '@/ui-ng/workspace/workspaceApps'
import { breakpointActionLabel, workspaceAppForBreakpointRoute } from './breakpointRouting'

describe('MX0.2 breakpoint routing', () => {
  it('maps every SimulationBreakpoint route that has a desktop workspace app', () => {
    const expected: Readonly<Record<string, string>> = {
      match: 'match', medical: 'medical', market: 'market', draft: 'draft', media: 'media',
      coach: 'coach', trades: 'trades', competition: 'competition', contracts: 'contracts', schedule: 'schedule',
    }
    for (const [route, app] of Object.entries(expected)) {
      expect(workspaceAppForBreakpointRoute(route)).toBe(app)
      expect(WORKSPACE_APP_IDS).toContain(app)
      expect(typeof breakpointActionLabel(route)).toBe('string')
    }
  })

  it('leaves a route without a resolver, and no route at all, unresolved instead of faking a destination', () => {
    expect(workspaceAppForBreakpointRoute(undefined)).toBeUndefined()
    expect(workspaceAppForBreakpointRoute('governance')).toBeUndefined()
    expect(breakpointActionLabel('governance')).toBeUndefined()
  })
})
