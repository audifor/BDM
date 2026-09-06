import { describe, expect, it } from 'vitest'
import { createGovernanceCommitment, createGovernanceCommitmentEvent, deriveGovernanceCommitmentStatus, hasGovernanceCommitmentBreach, isGovernanceCommitmentFulfilledLate, isGovernanceCommitmentOverdue, validateGovernanceCommitmentLifecycle } from './GovernanceCommitment'
import type { GovernanceInteractionParty } from './GovernanceMeeting'

const promisor = { kind: 'BODY' as const, bodyId: 'board' }, beneficiary = { kind: 'ACTOR' as const, actor: { kind: 'COACH' as const, id: 'coach' } }
const commitment = { id: 'commitment', institutionId: 'institution', promisor, beneficiary, summary: 'Deliver plan', dueOn: '2032-01-10' as never, provenance: { kind: 'STANDALONE' as const } }
const event = (kind: 'MADE' | 'FULFILLED' | 'BREACHED' | 'WITHDRAWN' | 'SUPERSEDED', id: string, date: string, actor: GovernanceInteractionParty = promisor) => createGovernanceCommitmentEvent((kind === 'BREACHED' ? { id, commitmentId: commitment.id, kind, effectiveOn: date as never } : kind === 'SUPERSEDED' ? { id, commitmentId: commitment.id, kind, effectiveOn: date as never, successorCommitmentId: 'next' } : { id, commitmentId: commitment.id, kind, effectiveOn: date as never, actor }) as never)

describe('Governance commitments', () => {
  it('validates roots and all provenance forms', () => {
    expect(createGovernanceCommitment(commitment)).toEqual(commitment)
    for (const provenance of [{ kind: 'MEETING' as const, meetingId: 'meeting' }, { kind: 'REQUEST' as const, requestId: 'request' }, { kind: 'GOVERNANCE_DECISION' as const, decisionId: 'decision' }]) expect(createGovernanceCommitment({ ...commitment, provenance }).provenance.kind).toBe(provenance.kind)
    for (const invalid of [{ ...commitment, id: ' ' }, { ...commitment, institutionId: ' ' }, { ...commitment, beneficiary: promisor }, { ...commitment, summary: ' ' }, { ...commitment, dueOn: 'bad' as never }]) expect(() => createGovernanceCommitment(invalid)).toThrow()
  })
  it('preserves breach history through late fulfillment and enforces lifecycle', () => {
    const made = event('MADE', '01', '2032-01-01'), breach = event('BREACHED', '02', '2032-01-11'), fulfilled = event('FULFILLED', '03', '2032-01-12', beneficiary)
    expect(() => validateGovernanceCommitmentLifecycle([fulfilled, made, breach])).not.toThrow(); expect(deriveGovernanceCommitmentStatus([made, breach, fulfilled])).toBe('FULFILLED'); expect(hasGovernanceCommitmentBreach([made, breach, fulfilled])).toBe(true); expect(isGovernanceCommitmentFulfilledLate(commitment, [made, breach, fulfilled])).toBe(true); expect(isGovernanceCommitmentOverdue(commitment, [made, breach], '2032-01-12' as never)).toBe(true)
    expect(() => validateGovernanceCommitmentLifecycle([made, fulfilled, { ...breach, effectiveOn: '2032-01-13' as never }])).toThrow(); expect(() => validateGovernanceCommitmentLifecycle([made, event('MADE', '02', '2032-01-02')])).toThrow()
  })
  it.each(['FULFILLED', 'WITHDRAWN', 'SUPERSEDED'] as const)('accepts MADE then %s', (kind) => {
    expect(() => validateGovernanceCommitmentLifecycle([event('MADE', '01', '2032-01-01'), event(kind, '02', '2032-01-02', beneficiary)])).not.toThrow()
  })
  it.each(['FULFILLED', 'WITHDRAWN', 'SUPERSEDED'] as const)('accepts BREACHED then %s without losing history', (kind) => {
    const events = [event('MADE', '01', '2032-01-01'), event('BREACHED', '02', '2032-01-11'), event(kind, '03', '2032-01-12', beneficiary)]
    expect(() => validateGovernanceCommitmentLifecycle(events)).not.toThrow(); expect(hasGovernanceCommitmentBreach(events)).toBe(true)
  })
  it('orders same-day events by ID and rejects post-terminal history', () => {
    expect(() => validateGovernanceCommitmentLifecycle([event('FULFILLED', '02', '2032-01-01', beneficiary), event('MADE', '01', '2032-01-01')])).not.toThrow()
    expect(() => validateGovernanceCommitmentLifecycle([event('MADE', '01', '2032-01-01'), event('WITHDRAWN', '02', '2032-01-02'), event('FULFILLED', '03', '2032-01-03', beneficiary)])).toThrow()
  })
  it('keeps status and overdue derivations orthogonal', () => {
    const made = [event('MADE', '01', '2032-01-01')]
    expect(deriveGovernanceCommitmentStatus(made)).toBe('MADE'); expect(deriveGovernanceCommitmentStatus([...made, event('BREACHED', '02', '2032-01-11')])).toBe('BREACHED')
    expect(isGovernanceCommitmentOverdue({ ...commitment, dueOn: undefined }, made, '2032-01-12' as never)).toBe(false)
    expect(isGovernanceCommitmentOverdue(commitment, made, '2032-01-10' as never)).toBe(false); expect(isGovernanceCommitmentOverdue(commitment, made, '2032-01-11' as never)).toBe(true)
    expect(isGovernanceCommitmentOverdue(commitment, [...made, event('FULFILLED', '02', '2032-01-10', beneficiary)], '2032-01-11' as never)).toBe(false)
    expect(isGovernanceCommitmentFulfilledLate(commitment, [...made, event('FULFILLED', '02', '2032-01-10', beneficiary)])).toBe(false)
  })
})
