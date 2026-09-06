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
})
