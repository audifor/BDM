import { describe, expect, it } from 'vitest'
import { nbaDraftRulesForYear } from './Draft'

describe('NBA Draft rules by annual cycle', () => {
  it('keeps 2026 official annual deadlines separate from simulated future dates', () => {
    expect(nbaDraftRulesForYear(2026)).toMatchObject({
      version: 'NBA-NBPA-CBA-2023/2026-DATES',
      draftDate: '2026-06-23',
      preEnrollmentOptInEffectiveFrom: '2026-04-15',
      minimumAgeDuringDraftYear: 19,
      postHighSchoolSeasonRequirement: 1,
      internationalAutomaticEligibilityAge: 22,
      earlyEntryDeadline: '2026-04-24',
      collegeWithdrawalDeadline: '2026-05-27',
      finalWithdrawalDeadline: '2026-06-13',
      provenance: 'OFFICIAL_SOURCE',
    })
    expect(nbaDraftRulesForYear(2045)).toMatchObject({
      version: 'NBA-NBPA-CBA-2023-CARRY-FORWARD',
      effectiveFrom: 2031,
      provenance: 'SIMULATED_CARRY_FORWARD',
    })
    expect(nbaDraftRulesForYear(2045).earlyEntryDeadline).toBe('2045-04-24')
    expect(nbaDraftRulesForYear(2045).collegeWithdrawalDeadline).toBe('2045-05-27')
  })
})
