import type { SeasonId } from '@/domain/ids'
import { createSalaryRules, type SalaryRules } from '@/domain/salary'

// Existing BDM generated-contract bounds, uncapped. Simulation policy, not real national regulation.
export const GENERATED_PROFESSIONAL_CONTRACT_LENGTH_YEARS = Object.freeze({ minimumYears: 1, maximumYears: 5 })

export function createGeneratedProfessionalSalaryRulesV1(seasonId: SeasonId): SalaryRules {
  return createSalaryRules({
    seasonId,
    capModel: 'none',
    capAmount: 0,
    capAccounting: 'NOT_APPLICABLE',
    aprons: [],
    minimumSalaryBands: [],
    maximumSalaryBands: [],
    exceptionRules: [],
    contractLength: GENERATED_PROFESSIONAL_CONTRACT_LENGTH_YEARS,
    tradeSalaryMatchingRules: [{ maximumPayroll: null, incomingMultiplier: 1, incomingAllowance: 0 }],
  })
}
