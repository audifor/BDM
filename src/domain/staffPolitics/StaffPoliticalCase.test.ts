import { describe, expect, it } from 'vitest'
import { createStaffPoliticalCase, staffPoliticalCaseIdFor } from './StaffPoliticalCase'

const open = { id: 'staff-political-case:team:CAREER_REQUEST:request', scopeKey: 'team', teamId: 'team' as never, sourceKind: 'CAREER_REQUEST' as const, sourceId: 'request', agenda: 'CAREER' as const, subjectStaffId: 'staff' as never, openedOn: '2032-01-01' as never, lastEvaluatedOn: '2032-01-01' as never, status: 'OPEN' as const, positions: [] }

describe('StaffPoliticalCase', () => {
  it('accepts the canonical open-case ID and produces the explicit deterministic semantic ID', () => {
    expect(createStaffPoliticalCase(open)).toEqual(open)
    expect(staffPoliticalCaseIdFor(open.teamId, open.sourceKind, open.sourceId)).toBe('staff-political-case:team:CAREER_REQUEST:request')
    expect(staffPoliticalCaseIdFor(open.teamId, open.sourceKind, open.sourceId)).toBe(staffPoliticalCaseIdFor(open.teamId, open.sourceKind, open.sourceId))
    expect(() => createStaffPoliticalCase({ ...open, id: 'fake-alternate-id' })).toThrow()
  })

  it('enforces lifecycle and date invariants', () => {
    expect(() => createStaffPoliticalCase({ ...open, resolution: { kind: 'APPROVED', resolvedOn: open.openedOn } })).toThrow()
    expect(() => createStaffPoliticalCase({ ...open, status: 'RESOLVED' })).toThrow()
    expect(() => createStaffPoliticalCase({ ...open, status: 'EXPIRED', resolution: { kind: 'APPROVED', resolvedOn: open.openedOn } })).toThrow()
    expect(() => createStaffPoliticalCase({ ...open, lastEvaluatedOn: '2031-12-31' as never })).toThrow()
    expect(() => createStaffPoliticalCase({ ...open, status: 'RESOLVED', resolution: { kind: 'APPROVED', resolvedOn: '2031-12-31' as never } })).toThrow()
  })

  it('validates sparse unique non-subject political positions', () => {
    const position = { actorId: 'other-staff' as never, stance: 'SUPPORT' as const, since: open.openedOn, lastEvaluatedOn: open.openedOn }
    expect(createStaffPoliticalCase({ ...open, positions: [position] }).positions).toEqual([position])
    expect(() => createStaffPoliticalCase({ ...open, positions: [position, position] })).toThrow()
    expect(() => createStaffPoliticalCase({ ...open, positions: [{ ...position, actorId: open.subjectStaffId }] })).toThrow()
    expect(() => createStaffPoliticalCase({ ...open, positions: [{ ...position, stance: 'NEUTRAL' as never }] })).toThrow()
    expect(() => createStaffPoliticalCase({ ...open, positions: [{ ...position, since: '2031-12-31' as never }] })).toThrow()
    expect(() => createStaffPoliticalCase({ ...open, positions: [{ ...position, lastEvaluatedOn: '2031-12-31' as never }] })).toThrow()
  })
})
