import { describe, expect, it } from 'vitest'
import { deriveGovernanceFollowUpItems, deriveGovernanceInteractionSignals, selectGovernanceAgendaItemsReferencingCommitment, selectGovernanceCommitmentsForRequest, selectGovernanceInteractionSignalsForParty } from './GovernanceInteraction'

const board = { kind: 'BODY' as const, bodyId: 'board' }, coach = { kind: 'ACTOR' as const, actor: { kind: 'COACH' as const, id: 'coach' } }, staff = { kind: 'ACTOR' as const, actor: { kind: 'STAFF' as const, id: 'staff' } }
const request = { id: 'request', institutionId: 'institution', issuer: board, recipient: coach, category: 'PERFORMANCE' as const, summary: 'Win', dueOn: '2032-01-10' as never, origin: { kind: 'STANDALONE' as const } }
const commitment = { id: 'commitment', institutionId: 'institution', promisor: board, beneficiary: coach, summary: 'Plan', dueOn: '2032-01-10' as never, provenance: { kind: 'REQUEST' as const, requestId: request.id } }
const input = (asOfDate: string) => ({ institutionId: 'institution', asOfDate: asOfDate as never, requests: [request], requestEvents: [{ id: 'r1', requestId: request.id, kind: 'ISSUED' as const, effectiveOn: '2032-01-01' as never, actor: board }, { id: 'r2', requestId: request.id, kind: 'DECLINED' as const, effectiveOn: '2032-01-12' as never, actor: coach }], commitments: [commitment], commitmentEvents: [{ id: 'c1', commitmentId: commitment.id, kind: 'MADE' as const, effectiveOn: '2032-01-01' as never, actor: board }, { id: 'c2', commitmentId: commitment.id, kind: 'BREACHED' as const, effectiveOn: '2032-01-11' as never }, { id: 'c3', commitmentId: commitment.id, kind: 'FULFILLED' as const, effectiveOn: '2032-01-15' as never, actor: coach }] })

describe('Governance interaction projections', () => {
  it('derives strictly as-of-date historical request and commitment signals', () => {
    expect(deriveGovernanceInteractionSignals(input('2032-01-05')).map((signal) => signal.kind)).toEqual([])
    expect(deriveGovernanceInteractionSignals(input('2032-01-12')).map((signal) => signal.kind)).toEqual(['COMMITMENT_OVERDUE', 'COMMITMENT_BREACHED', 'REQUEST_DECLINED'])
    const final = deriveGovernanceInteractionSignals(input('2032-01-16')); expect(final.map((signal) => signal.kind)).toEqual(['COMMITMENT_BREACHED', 'REQUEST_DECLINED', 'COMMITMENT_FULFILLED'])
    expect(final.find((signal) => signal.kind === 'COMMITMENT_FULFILLED')).toMatchObject({ hadPriorBreach: true, fulfilledLate: true })
  })
  it('derives current follow-ups only for non-terminal histories', () => {
    expect(deriveGovernanceFollowUpItems(input('2032-01-05')).map((item) => item.kind)).toEqual(['COMMITMENT', 'REQUEST'])
    expect(deriveGovernanceFollowUpItems(input('2032-01-12')).map((item) => item.kind)).toEqual(['COMMITMENT'])
    expect(deriveGovernanceFollowUpItems(input('2032-01-16')).map((item) => item.kind)).toEqual([])
  })
  it('is deterministic and filters signals by canonical party identity', () => {
    const baseline = deriveGovernanceInteractionSignals(input('2032-01-16')), shuffled = deriveGovernanceInteractionSignals({ ...input('2032-01-16'), requestEvents: [...input('2032-01-16').requestEvents].reverse(), commitmentEvents: [...input('2032-01-16').commitmentEvents].reverse() })
    expect(shuffled).toEqual(baseline); expect(selectGovernanceInteractionSignalsForParty(baseline, board)).toHaveLength(3); expect(selectGovernanceInteractionSignalsForParty(baseline, staff)).toHaveLength(0)
  })
  it('returns deterministic reverse references without persisting them', () => {
    expect(selectGovernanceCommitmentsForRequest([{ ...commitment, id: 'b' }, { ...commitment, id: 'a' }], request.id).map((item) => item.id)).toEqual(['a', 'b'])
    const agenda = [{ id: 'b', meetingId: 'm', sequence: 2, subject: { kind: 'GOVERNANCE_COMMITMENT' as const, commitmentId: commitment.id } }, { id: 'a', meetingId: 'm', sequence: 1, subject: { kind: 'GOVERNANCE_COMMITMENT' as const, commitmentId: commitment.id } }]
    expect(selectGovernanceAgendaItemsReferencingCommitment(agenda, commitment.id).map((item) => item.id)).toEqual(['a', 'b'])
  })
})
