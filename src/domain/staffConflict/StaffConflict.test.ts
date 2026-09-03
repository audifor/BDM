import { describe, expect, it } from 'vitest'
import { STAFF_CONFLICT_PARTICIPANT_ROLES, STAFF_CONFLICT_PARTICIPANT_STATE_DIMENSIONS, STAFF_CONFLICT_PRIMARY_CAUSES, STAFF_CONFLICT_RESOLUTION_TYPES, STAFF_CONFLICT_SEVERITIES, STAFF_CONFLICT_STAGES, STAFF_CONFLICT_TYPES, createStaffConflict, createStaffConflictTrigger } from './StaffConflict'

const participant = (actorId: string, role: 'PRIMARY' | 'SECONDARY') => ({ actorId, role, joinedOn: '2030-01-07' as never, state: { grievance: 50, willingnessToCompromise: 50, perceivedFairness: 50, emotionalInvestment: 50 } })
describe('StaffConflict domain', () => {
  it('keeps the canonical catalogs exact', () => { expect(STAFF_CONFLICT_TYPES).toHaveLength(12); expect(STAFF_CONFLICT_PRIMARY_CAUSES).toHaveLength(29); expect(STAFF_CONFLICT_STAGES).toHaveLength(7); expect(STAFF_CONFLICT_SEVERITIES).toHaveLength(5); expect(STAFF_CONFLICT_PARTICIPANT_ROLES).toHaveLength(5); expect(STAFF_CONFLICT_PARTICIPANT_STATE_DIMENSIONS).toHaveLength(4); expect(STAFF_CONFLICT_RESOLUTION_TYPES).toHaveLength(7) })
  it('validates active/resolved invariants and unique participants', () => {
    const active = { id: 'conflict:1', scopeKey: 'team:1', type: 'AUTHORITY' as const, primaryCause: 'autonomyDeficit' as const, startedOn: '2030-01-07' as never, lastEvaluatedOn: '2030-01-07' as never, status: 'ACTIVE' as const, stage: 'ACTIVE' as const, severity: 'MODERATE' as const, participants: [participant('a', 'PRIMARY'), participant('b', 'SECONDARY')], sourceTriggerIds: ['trigger:1'] }
    expect(createStaffConflict(active).participants[0]!.state.grievance).toBe(50)
    expect(() => createStaffConflict({ ...active, participants: [participant('a', 'PRIMARY'), participant('a', 'SECONDARY')] })).toThrow()
    expect(() => createStaffConflict({ ...active, stage: 'RESOLVED' })).toThrow()
  })
  it('requires a concrete two-actor bounded trigger', () => {
    expect(() => createStaffConflictTrigger({ id: 't', occurredOn: '2030-01-07' as never, scopeKey: 's', subjectActorId: 'a', counterpartActorId: 'a', type: 'AUTHORITY', cause: 'autonomyDeficit', basePressure: 60, sourceKind: 'test' })).toThrow()
  })
})
