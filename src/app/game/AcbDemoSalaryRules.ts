import type { SeasonId } from '@/domain/ids'
import { createSalaryRules, type SalaryRules } from '@/domain/salary'

/**
 * BDM ACB DEMO SALARY RULES V1 (Playable Core F3). The ACB development universe ships no SalaryRules, so no contract renewal can be
 * validated (the retention authority fails closed without them) even though the binding authority already supports an uncapped
 * ecosystem. This is the minimal, explicit statement of what the universe already does: no salary cap, no tax, no salary bands, no
 * exceptions, no rookie scale, and contract-length bounds equal to the range of contract lengths the universe's own generators produce
 * (initial contracts 2–5 years, free-agent terms 1–4 years). It adds no NBA mechanics and is the demo universe's data, not a statement
 * about the real ACB; later seasons inherit it through the existing season rollover.
 */
export const ACB_DEMO_CONTRACT_LENGTH_YEARS = Object.freeze({ minimumYears: 1, maximumYears: 5 })

export function createAcbDemoSalaryRulesV1(seasonId: SeasonId): SalaryRules {
  return createSalaryRules({
    seasonId,
    capModel: 'none',
    capAmount: 0,
    capAccounting: 'NOT_APPLICABLE',
    aprons: [],
    minimumSalaryBands: [],
    maximumSalaryBands: [],
    exceptionRules: [],
    contractLength: ACB_DEMO_CONTRACT_LENGTH_YEARS,
    tradeSalaryMatchingRules: [{ maximumPayroll: null, incomingMultiplier: 1, incomingAllowance: 0 }],
  })
}
