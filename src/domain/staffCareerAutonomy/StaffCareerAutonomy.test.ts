import { describe, expect, it } from 'vitest'
import { createStaffCareerAutonomyState, createStaffCareerRequest, staffCareerRequestIdFor } from './StaffCareerAutonomy'

describe('StaffCareerAutonomy', () => {
  it('keeps bounded persistent state and semantic request ids deterministic', () => {
    const state = createStaffCareerAutonomyState({ contextId: 'context' as never, staffId: 'staff' as never, teamId: 'team' as never, outlook: 'STABLE', primaryIntent: 'NONE', intensity: 25.4, intentSince: '2026-01-01' as never, lastEvaluatedOn: '2026-01-01' as never })
    expect(state.intensity).toBe(25)
    expect(staffCareerRequestIdFor('context' as never, 'PROMOTION', 'associateCoach')).toBe(staffCareerRequestIdFor('context' as never, 'PROMOTION', 'associateCoach'))
  })

  it('requires semantically actionable request targets', () => {
    expect(() => createStaffCareerRequest({ id: 'request', contextId: 'context' as never, staffId: 'staff' as never, teamId: 'team' as never, kind: 'PROMOTION', createdOn: '2026-01-01' as never, status: 'OPEN' })).toThrow(RangeError)
  })
})
