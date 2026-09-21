import { describe, expect, it } from 'vitest'
import { parseGameDate } from '@/domain/date'
import { createSupportComplianceCase, createSupportComplianceFinding, createSupportConflictDisclosure, createSupportConsequence, createSupportRemediation, deriveSupportComplianceCaseStatus, deriveSupportComplianceContext, detectPotentialSupportConflicts, type SupportComplianceCaseEvent } from './SupportCompliance'

describe('support compliance', () => {
  const item = createSupportComplianceCase({ id: 'case:1', institutionId: 'institution:1', openedOn: parseGameDate('2030-01-01'), sourceRefs: [{ kind: 'SUPPORTER_RELATIONSHIP', id: 'supporter:1' }] })
  const event = (id: string, kind: SupportComplianceCaseEvent['kind'], effectiveOn: string): SupportComplianceCaseEvent => ({ id, caseId: item.id, kind, effectiveOn: parseGameDate(effectiveOn) })
  it('separates disclosed conflicts, cases, findings and consequences', () => {
    const conflict = detectPotentialSupportConflicts([{ id: 'supporter:1', institutionId: 'institution:1', actor: { kind: 'EXTERNAL', id: 'person:1' } }], [{ id: 'appointment:1', bodyId: 'body:1', actor: { kind: 'EXTERNAL', id: 'person:1' } }], { 'body:1': 'institution:1' })
    const disclosure = createSupportConflictDisclosure({ id: 'disclosure:1', institutionId: 'institution:1', actor: { kind: 'EXTERNAL', id: 'person:1' }, status: 'DISCLOSED', effectiveOn: parseGameDate('2030-01-01'), sourceRefs: [{ kind: 'SUPPORTER_RELATIONSHIP', id: 'supporter:1' }] })
    const finding = createSupportComplianceFinding({ id: 'finding:1', caseId: item.id, kind: 'POLICY_CONCERN', severity: 'MINOR', issuedOn: parseGameDate('2030-01-02'), sourceRefs: item.sourceRefs })
    const consequence = createSupportConsequence({ id: 'consequence:1', caseId: item.id, findingId: finding.id, kind: 'FORMAL_WARNING', effectiveOn: parseGameDate('2030-01-03') })
    expect(conflict).toHaveLength(1); expect(deriveSupportComplianceContext([item], [], [finding], [disclosure], [consequence])).toMatchObject({ confirmedFindingCount: 1, undisclosedConflictCount: 0 }); expect(consequence.kind).toBe('FORMAL_WARNING')
  })
  it('derives deterministic lifecycle and supports remediation without downstream mutation', () => {
    expect(deriveSupportComplianceCaseStatus(item, [event('b', 'UNDER_REVIEW', '2030-01-02'), event('a', 'WARNING_ISSUED', '2030-01-02')])).toBe('UNDER_REVIEW')
    expect(deriveSupportComplianceCaseStatus(item, [event('a', 'CLOSED', '2030-01-03'), event('b', 'REOPENED', '2030-01-04')])).toBe('REOPENED')
    expect(createSupportRemediation({ id: 'remediation:1', caseId: item.id, kind: 'RECUSAL_COMPLETED', effectiveOn: parseGameDate('2030-01-04') }).kind).toBe('RECUSAL_COMPLETED')
  })
})
