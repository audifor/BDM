import { describe, expect, it } from 'vitest'
import { deriveGovernanceFollowUpItems, deriveGovernanceInteractionSignals, selectGovernanceAgendaItemsReferencingCommitment, selectGovernanceAgendaItemsReferencingRequest, selectGovernanceCommitmentsForDecision, selectGovernanceCommitmentsForRequest, selectGovernanceCommitmentsOriginatingFromMeeting, selectGovernanceInteractionSignalsForParty, selectGovernanceRequestsOriginatingFromMeeting } from './GovernanceInteraction'

const date = (value: string) => value as never
const board = { kind: 'BODY' as const, bodyId: 'board' }
const coach = { kind: 'ACTOR' as const, actor: { kind: 'COACH' as const, id: 'coach' } }
const staff = { kind: 'ACTOR' as const, actor: { kind: 'STAFF' as const, id: 'staff' } }
const request = { id: 'request', institutionId: 'institution', issuer: board, recipient: coach, category: 'PERFORMANCE' as const, summary: 'Win', dueOn: date('2032-01-10'), origin: { kind: 'STANDALONE' as const } }
const commitment = { id: 'commitment', institutionId: 'institution', promisor: board, beneficiary: coach, summary: 'Plan', dueOn: date('2032-01-10'), provenance: { kind: 'REQUEST' as const, requestId: request.id } }
const input = (asOfDate: string) => ({ institutionId: 'institution', asOfDate: date(asOfDate), requests: [request], requestEvents: [{ id: 'r-issued', requestId: request.id, kind: 'ISSUED' as const, effectiveOn: date('2032-01-01'), actor: board }, { id: 'r-declined', requestId: request.id, kind: 'DECLINED' as const, effectiveOn: date('2032-01-12'), actor: coach }], commitments: [commitment], commitmentEvents: [{ id: 'c-made', commitmentId: commitment.id, kind: 'MADE' as const, effectiveOn: date('2032-01-01'), actor: board }, { id: 'c-breached', commitmentId: commitment.id, kind: 'BREACHED' as const, effectiveOn: date('2032-01-11') }, { id: 'c-fulfilled', commitmentId: commitment.id, kind: 'FULFILLED' as const, effectiveOn: date('2032-01-15'), actor: coach }] })

describe('Governance interaction projections', () => {
  it('derives each request terminal signal, fulfillment evidence, and active overdue signal', () => {
    const active = { ...request, id: 'active', dueOn: date('2032-01-10') }, withdrawn = { ...request, id: 'withdrawn' }, fulfilled = { ...request, id: 'fulfilled' }
    const signals = deriveGovernanceInteractionSignals({ institutionId: 'institution', asOfDate: date('2032-01-12'), requests: [request, active, withdrawn, fulfilled], commitments: [], commitmentEvents: [], requestEvents: [{ id: 'declined', requestId: request.id, kind: 'DECLINED' as const, effectiveOn: date('2032-01-11'), actor: coach }, { id: 'withdrawn', requestId: withdrawn.id, kind: 'WITHDRAWN' as const, effectiveOn: date('2032-01-11'), actor: board }, { id: 'fulfilled', requestId: fulfilled.id, kind: 'FULFILLED' as const, effectiveOn: date('2032-01-11'), actor: coach, evidence: { kind: 'GOVERNANCE_DECISION' as const, decisionId: 'decision' } }] })
    expect(signals.map((signal) => signal.kind)).toEqual(['REQUEST_OVERDUE', 'REQUEST_DECLINED', 'REQUEST_FULFILLED', 'REQUEST_WITHDRAWN'])
    expect(signals.find((signal) => signal.kind === 'REQUEST_FULFILLED')).toMatchObject({ sourceEventId: 'fulfilled', effectiveOn: '2032-01-11', evidence: { kind: 'GOVERNANCE_DECISION', decisionId: 'decision' } })
  })

  it('derives every commitment lifecycle signal and overdue status', () => {
    const withdrawn = { ...commitment, id: 'withdrawn' }, superseded = { ...commitment, id: 'superseded' }, onTime = { ...commitment, id: 'on-time', dueOn: date('2032-01-12') }, active = { ...commitment, id: 'active' }
    const signals = deriveGovernanceInteractionSignals({ institutionId: 'institution', asOfDate: date('2032-01-13'), requests: [], requestEvents: [], commitments: [commitment, withdrawn, superseded, onTime, active], commitmentEvents: [{ id: 'breach', commitmentId: commitment.id, kind: 'BREACHED' as const, effectiveOn: date('2032-01-11') }, { id: 'late', commitmentId: commitment.id, kind: 'FULFILLED' as const, effectiveOn: date('2032-01-12'), actor: coach }, { id: 'withdraw', commitmentId: withdrawn.id, kind: 'WITHDRAWN' as const, effectiveOn: date('2032-01-11'), actor: board }, { id: 'supersede', commitmentId: superseded.id, kind: 'SUPERSEDED' as const, effectiveOn: date('2032-01-11'), successorCommitmentId: 'successor' }, { id: 'on-time', commitmentId: onTime.id, kind: 'FULFILLED' as const, effectiveOn: date('2032-01-12'), actor: coach }] })
    expect(signals.map((signal) => signal.kind)).toEqual(['COMMITMENT_OVERDUE', 'COMMITMENT_BREACHED', 'COMMITMENT_SUPERSEDED', 'COMMITMENT_WITHDRAWN', 'COMMITMENT_FULFILLED', 'COMMITMENT_FULFILLED'])
    expect(signals.find((signal) => signal.kind === 'COMMITMENT_SUPERSEDED')).toMatchObject({ successorCommitmentId: 'successor' })
    expect(signals.find((signal) => signal.kind === 'COMMITMENT_FULFILLED' && signal.commitmentId === commitment.id)).toMatchObject({ fulfilledLate: true, hadPriorBreach: true })
    expect(signals.find((signal) => signal.kind === 'COMMITMENT_FULFILLED' && signal.commitmentId === onTime.id)).toMatchObject({ fulfilledLate: false, hadPriorBreach: false })
  })

  it('uses canonical same-day event order for a fulfilled commitment historical breach flag', () => {
    const signals = deriveGovernanceInteractionSignals({ institutionId: 'institution', asOfDate: date('2032-01-12'), requests: [], requestEvents: [], commitments: [commitment], commitmentEvents: [{ id: '03-later-breach', commitmentId: commitment.id, kind: 'BREACHED' as const, effectiveOn: date('2032-01-12') }, { id: '02-fulfilled', commitmentId: commitment.id, kind: 'FULFILLED' as const, effectiveOn: date('2032-01-12'), actor: coach }, { id: '01-made', commitmentId: commitment.id, kind: 'MADE' as const, effectiveOn: date('2032-01-01'), actor: board }] })
    expect(signals.find((signal) => signal.kind === 'COMMITMENT_FULFILLED')).toMatchObject({ hadPriorBreach: false })
  })

  it('recognizes a lexically prior same-day breach before fulfillment', () => {
    const signals = deriveGovernanceInteractionSignals({ institutionId: 'institution', asOfDate: date('2032-01-11'), requests: [], requestEvents: [], commitments: [commitment], commitmentEvents: [{ id: '02-fulfilled', commitmentId: commitment.id, kind: 'FULFILLED' as const, effectiveOn: date('2032-01-11'), actor: coach }, { id: '01-breached', commitmentId: commitment.id, kind: 'BREACHED' as const, effectiveOn: date('2032-01-11') }] })
    expect(signals.find((signal) => signal.kind === 'COMMITMENT_FULFILLED')).toMatchObject({ hadPriorBreach: true })
  })

  it('enforces strict as-of visibility and derives follow-ups only for non-terminal histories', () => {
    expect(deriveGovernanceInteractionSignals(input('2032-01-05')).map((signal) => signal.kind)).toEqual([])
    expect(deriveGovernanceInteractionSignals(input('2032-01-12')).map((signal) => signal.kind)).toEqual(['COMMITMENT_OVERDUE', 'COMMITMENT_BREACHED', 'REQUEST_DECLINED'])
    expect(deriveGovernanceFollowUpItems(input('2032-01-05')).map((item) => item.kind)).toEqual(['COMMITMENT', 'REQUEST'])
    expect(deriveGovernanceFollowUpItems(input('2032-01-12'))).toMatchObject([{ kind: 'COMMITMENT', status: 'BREACHED', overdue: true, breachRecorded: true }])
    expect(deriveGovernanceFollowUpItems(input('2032-01-16'))).toEqual([])
  })

  it('projects the request as-of matrix without future terminal-event leakage', () => {
    const history = { institutionId: 'institution', requests: [request], commitments: [], commitmentEvents: [], requestEvents: [{ id: 'issued', requestId: request.id, kind: 'ISSUED' as const, effectiveOn: date('2032-01-01'), actor: board }, { id: 'acknowledged', requestId: request.id, kind: 'ACKNOWLEDGED' as const, effectiveOn: date('2032-01-05'), actor: coach }, { id: 'fulfilled', requestId: request.id, kind: 'FULFILLED' as const, effectiveOn: date('2032-01-15'), actor: coach }] }
    expect(deriveGovernanceInteractionSignals({ ...history, asOfDate: date('2032-01-03') })).toEqual([])
    expect(deriveGovernanceInteractionSignals({ ...history, asOfDate: date('2032-01-08') })).toEqual([])
    expect(deriveGovernanceInteractionSignals({ ...history, asOfDate: date('2032-01-12') }).map((signal) => signal.kind)).toEqual(['REQUEST_OVERDUE'])
    expect(deriveGovernanceInteractionSignals({ ...history, asOfDate: date('2032-01-16') }).map((signal) => signal.kind)).toEqual(['REQUEST_FULFILLED'])
  })

  it('keeps every active request state as a follow-up and removes terminal states', () => {
    const events = ['ISSUED', 'ACKNOWLEDGED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'FULFILLED'] as const
    for (const kind of events) {
      const result = deriveGovernanceFollowUpItems({ institutionId: 'institution', asOfDate: date('2032-01-12'), requests: [request], commitments: [], commitmentEvents: [], requestEvents: [{ id: kind, requestId: request.id, kind, effectiveOn: date('2032-01-01'), actor: board }] })
      expect(result.length, kind).toBe(['ISSUED', 'ACKNOWLEDGED', 'ACCEPTED'].includes(kind) ? 1 : 0)
      if (result.length === 1) expect(result[0]).toMatchObject({ status: kind, overdue: true })
    }
  })

  it('keeps made and breached commitments as follow-ups, with undefined due dates last', () => {
    const noDue = { ...commitment, id: 'no-due', dueOn: undefined }
    const result = deriveGovernanceFollowUpItems({ institutionId: 'institution', asOfDate: date('2032-01-12'), requests: [], requestEvents: [], commitments: [noDue, commitment], commitmentEvents: [{ id: 'made', commitmentId: commitment.id, kind: 'MADE' as const, effectiveOn: date('2032-01-01'), actor: board }, { id: 'breach', commitmentId: commitment.id, kind: 'BREACHED' as const, effectiveOn: date('2032-01-11') }, { id: 'other', commitmentId: noDue.id, kind: 'MADE' as const, effectiveOn: date('2032-01-01'), actor: board }] })
    expect(result).toMatchObject([{ commitmentId: commitment.id, status: 'BREACHED', overdue: true, breachRecorded: true }, { commitmentId: noDue.id, status: 'MADE', overdue: false, breachRecorded: false }])
  })

  it('is deterministic, institution-scoped, and filters signals by canonical party identity', () => {
    const baseline = deriveGovernanceInteractionSignals(input('2032-01-16')), shuffled = deriveGovernanceInteractionSignals({ ...input('2032-01-16'), requestEvents: [...input('2032-01-16').requestEvents].reverse(), commitmentEvents: [...input('2032-01-16').commitmentEvents].reverse() }), other = { ...request, id: 'other', institutionId: 'other-institution' }
    expect(shuffled).toEqual(baseline)
    expect(deriveGovernanceInteractionSignals({ ...input('2032-01-16'), requests: [...input('2032-01-16').requests, other] }).some((signal) => signal.institutionId === 'other-institution')).toBe(false)
    expect(selectGovernanceInteractionSignalsForParty(baseline, board)).toHaveLength(3)
    expect(selectGovernanceInteractionSignalsForParty(baseline, staff)).toHaveLength(0)
  })

  it('does not conflate body and appointment parties and excludes other-institution follow-ups', () => {
    const appointment = { kind: 'APPOINTMENT' as const, appointmentId: 'board' }, otherRequest = { ...request, id: 'other', institutionId: 'other' }
    const baseline = deriveGovernanceInteractionSignals(input('2032-01-16'))
    expect(selectGovernanceInteractionSignalsForParty(baseline, appointment)).toHaveLength(0)
    expect(selectGovernanceInteractionSignalsForParty(baseline, { kind: 'APPOINTMENT' as const, appointmentId: 'unrelated' })).toHaveLength(0)
    expect(deriveGovernanceFollowUpItems({ ...input('2032-01-05'), requests: [...input('2032-01-05').requests, otherRequest] }).every((item) => item.institutionId === 'institution')).toBe(true)
  })

  it('selects all reverse references in deterministic canonical order', () => {
    const requests = [{ ...request, id: 'request-b', origin: { kind: 'MEETING' as const, meetingId: 'meeting' } }, { ...request, id: 'request-a', origin: { kind: 'MEETING' as const, meetingId: 'meeting' } }]
    const commitments = [{ ...commitment, id: 'request-b', provenance: { kind: 'REQUEST' as const, requestId: request.id } }, { ...commitment, id: 'request-a', provenance: { kind: 'REQUEST' as const, requestId: request.id } }, { ...commitment, id: 'decision', provenance: { kind: 'GOVERNANCE_DECISION' as const, decisionId: 'decision' } }, { ...commitment, id: 'meeting', provenance: { kind: 'MEETING' as const, meetingId: 'meeting' } }]
    const agenda = [{ id: 'request-b', meetingId: 'meeting', sequence: 2, subject: { kind: 'GOVERNANCE_REQUEST' as const, requestId: request.id } }, { id: 'request-a', meetingId: 'meeting', sequence: 1, subject: { kind: 'GOVERNANCE_REQUEST' as const, requestId: request.id } }, { id: 'commitment-b', meetingId: 'meeting', sequence: 2, subject: { kind: 'GOVERNANCE_COMMITMENT' as const, commitmentId: commitment.id } }, { id: 'commitment-a', meetingId: 'meeting', sequence: 1, subject: { kind: 'GOVERNANCE_COMMITMENT' as const, commitmentId: commitment.id } }]
    expect(selectGovernanceRequestsOriginatingFromMeeting(requests, 'meeting').map((item) => item.id)).toEqual(['request-a', 'request-b'])
    expect(selectGovernanceCommitmentsForRequest(commitments, request.id).map((item) => item.id)).toEqual(['request-a', 'request-b'])
    expect(selectGovernanceCommitmentsForDecision(commitments, 'decision').map((item) => item.id)).toEqual(['decision'])
    expect(selectGovernanceCommitmentsOriginatingFromMeeting(commitments, 'meeting').map((item) => item.id)).toEqual(['meeting'])
    expect(selectGovernanceAgendaItemsReferencingRequest(agenda, request.id).map((item) => item.id)).toEqual(['request-a', 'request-b'])
    expect(selectGovernanceAgendaItemsReferencingCommitment(agenda, commitment.id).map((item) => item.id)).toEqual(['commitment-a', 'commitment-b'])
  })
})
