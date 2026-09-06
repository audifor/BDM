import { describe, expect, it } from 'vitest'
import { createGovernanceRequest, createGovernanceRequestEvent, deriveGovernanceRequestStatus, isGovernanceRequestOverdue, sameGovernanceInteractionParty, validateGovernanceRequestLifecycle } from './GovernanceRequest'

const issuer = { kind: 'BODY' as const, bodyId: 'issuer' }, recipient = { kind: 'ACTOR' as const, actor: { kind: 'COACH' as const, id: 'coach' } }
const request = { id: 'request', institutionId: 'institution', issuer, recipient, category: 'PERFORMANCE' as const, summary: 'Improve results', dueOn: '2032-01-05' as never, origin: { kind: 'STANDALONE' as const } }
const event = (kind: 'ISSUED' | 'ACKNOWLEDGED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'FULFILLED', id: string, actor = kind === 'ISSUED' || kind === 'WITHDRAWN' ? issuer : recipient, effectiveOn = '2032-01-01' as never) => createGovernanceRequestEvent({ id, requestId: request.id, kind, actor, effectiveOn } as never)

describe('Governance requests', () => {
  it('validates roots, origins, categories and canonical party equality', () => {
    expect(createGovernanceRequest(request)).toEqual(request)
    expect(createGovernanceRequest({ ...request, origin: { kind: 'MEETING', meetingId: 'meeting', agendaItemId: 'agenda' } }).origin.kind).toBe('MEETING')
    for (const invalid of [{ ...request, id: ' ' }, { ...request, institutionId: ' ' }, { ...request, issuer: recipient }, { ...request, category: 'UNKNOWN' as never }, { ...request, summary: ' ' }, { ...request, dueOn: 'bad' as never }]) expect(() => createGovernanceRequest(invalid)).toThrow()
    expect(sameGovernanceInteractionParty(issuer, { kind: 'BODY', bodyId: 'issuer' })).toBe(true); expect(sameGovernanceInteractionParty(recipient, { kind: 'ACTOR', actor: { kind: 'STAFF', id: 'coach' } })).toBe(false)
  })
  it('enforces ordered lifecycle and derives every terminal/current status', () => {
    const issued = event('ISSUED', '01'), acknowledged = event('ACKNOWLEDGED', '02'), accepted = event('ACCEPTED', '03'), fulfilled = event('FULFILLED', '04')
    expect(() => validateGovernanceRequestLifecycle([fulfilled, accepted, issued, acknowledged])).not.toThrow()
    expect(deriveGovernanceRequestStatus([issued, acknowledged])).toBe('ACKNOWLEDGED')
    expect(() => validateGovernanceRequestLifecycle([issued, event('ISSUED', '02')])).toThrow()
    expect(() => validateGovernanceRequestLifecycle([issued, event('DECLINED', '02'), accepted])).toThrow()
    expect(() => validateGovernanceRequestLifecycle([{ ...acknowledged, effectiveOn: '2031-12-31' as never }, issued])).toThrow()
  })
  it('keeps overdue separate from lifecycle status', () => {
    const issued = [event('ISSUED', '01')]
    expect(isGovernanceRequestOverdue({ ...request, dueOn: undefined }, issued, '2032-02-01' as never)).toBe(false)
    expect(isGovernanceRequestOverdue(request, issued, '2032-01-05' as never)).toBe(false)
    expect(isGovernanceRequestOverdue(request, issued, '2032-01-06' as never)).toBe(true)
    for (const kind of ['DECLINED', 'WITHDRAWN', 'FULFILLED'] as const) expect(isGovernanceRequestOverdue(request, [event('ISSUED', '01'), event(kind, '02')], '2032-01-06' as never)).toBe(false)
  })
  it('accepts decision or commitment fulfillment evidence and rejects malformed commitment evidence', () => {
    expect((createGovernanceRequestEvent({ id: 'decision', requestId: request.id, kind: 'FULFILLED', effectiveOn: '2032-01-02' as never, actor: recipient, evidence: { kind: 'GOVERNANCE_DECISION', decisionId: 'decision' } }) as Extract<import('./GovernanceRequest').GovernanceRequestEvent, { kind: 'FULFILLED' }>).evidence).toEqual({ kind: 'GOVERNANCE_DECISION', decisionId: 'decision' })
    expect((createGovernanceRequestEvent({ id: 'commitment', requestId: request.id, kind: 'FULFILLED', effectiveOn: '2032-01-02' as never, actor: recipient, evidence: { kind: 'GOVERNANCE_COMMITMENT', commitmentId: 'commitment' } }) as Extract<import('./GovernanceRequest').GovernanceRequestEvent, { kind: 'FULFILLED' }>).evidence).toEqual({ kind: 'GOVERNANCE_COMMITMENT', commitmentId: 'commitment' })
    expect(() => createGovernanceRequestEvent({ id: 'bad', requestId: request.id, kind: 'FULFILLED', effectiveOn: '2032-01-02' as never, actor: recipient, evidence: { kind: 'GOVERNANCE_COMMITMENT', commitmentId: ' ' } })).toThrow()
    expect(() => createGovernanceRequestEvent({ id: 'unknown', requestId: request.id, kind: 'FULFILLED', effectiveOn: '2032-01-02' as never, actor: recipient, evidence: { kind: 'UNKNOWN', commitmentId: 'x' } } as never)).toThrow()
  })
})
