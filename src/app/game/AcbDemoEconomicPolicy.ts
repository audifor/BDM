import { createGameDate, parseGameDate, type GameDate } from '@/domain/date'
import { competitionIdFromString } from '@/domain/ids'
import {
  createCompetitionEconomicProfile,
  createCompetitionOperatingCostPolicy,
  createCompetitionRevenuePolicy,
  ECONOMIC_POLICY_PROVENANCE_KIND,
  getFinanceFiscalYearFor,
  legacyMajorUnitsToMoney,
  type CompetitionEconomicProfile,
} from '@/domain/finance'

/**
 * BDM DEMO ECONOMIC POLICY V1 — shipped demo GAME DATA for the ACB demo career.
 *
 * This is economic policy data, not Finance logic and not a universal basketball rule: the Finance engines contain
 * no league branch, so another competition gets its own profile (or none at all) by changing data only. The values
 * are an explicit demo design decision for the playable ACB career; they are NOT the real-world ACB media
 * contract, and they are not historical fact.
 *
 * Approved V1 (product owner):
 * - COMPETITION_PARTICIPATION_DISTRIBUTION: EUR 2,400,000 per participating Organization per fiscal year, paid as
 *   12 equal installments of EUR 200,000 on the first date of each month of that Organization's canonical fiscal
 *   period.
 * - MATCH_OPERATIONS: EUR 25,000 per home game, borne by the Organization hosting the game, timed by the real
 *   canonical Game schedule.
 *
 * Amounts are authored here in whole euros for readability and cross the BS16G canonical money boundary exactly
 * once, through `legacyMajorUnitsToMoney`.
 */
export const BDM_DEMO_ECONOMIC_POLICY_V1_LABEL = 'BDM Demo Economic Policy V1'
export const BDM_DEMO_ECONOMIC_POLICY_ID = 'bdm-demo-economic-policy-v1'
export const BDM_DEMO_PARTICIPATION_DISTRIBUTION_ANNUAL_MAJOR_UNITS = 2_400_000
export const BDM_DEMO_PARTICIPATION_DISTRIBUTION_INSTALLMENTS = 12
export const BDM_DEMO_MATCH_OPERATIONS_PER_GAME_MAJOR_UNITS = 25_000

const DEMO_ECONOMIC_CURRENCY = 'EUR'

/** The competition the demo policy applies to; supplied by the ACB demo career data. */
export const ACB_DEMO_ECONOMIC_COMPETITION_ID = competitionIdFromString('acb-competition-liga-endesa-2026-27')
export const ACB_DEMO_ECONOMIC_SEASON_ID = 'acb-season-2026-27'
export const ACB_DEMO_ECONOMIC_SEASON_START = createGameDate(2026, 9, 26)
export const ACB_DEMO_ECONOMIC_FISCAL_YEAR_START_MONTH = 9

/**
 * The profile's installments: the first date of each month of the fiscal year derived from the demo competition's
 * canonical fiscal anchor. Occurrences before the career's own clock are declared but can never be processed —
 * exactly the BS16I rule — and are reported rather than invented.
 */
export function acbDemoParticipationInstallments(seasonStart: GameDate = ACB_DEMO_ECONOMIC_SEASON_START, fiscalYearStartMonth: number = ACB_DEMO_ECONOMIC_FISCAL_YEAR_START_MONTH) {
  const fiscalYear = getFinanceFiscalYearFor({ fiscalYearStartMonth }, seasonStart)
  const annualAmount = legacyMajorUnitsToMoney(BDM_DEMO_PARTICIPATION_DISTRIBUTION_ANNUAL_MAJOR_UNITS, DEMO_ECONOMIC_CURRENCY)
  const perInstallmentMinorUnits = annualAmount.minorUnits / BDM_DEMO_PARTICIPATION_DISTRIBUTION_INSTALLMENTS
  if (!Number.isSafeInteger(perInstallmentMinorUnits)) throw new RangeError('Demo participation distribution must divide evenly into its installments')
  return Object.freeze(Array.from({ length: BDM_DEMO_PARTICIPATION_DISTRIBUTION_INSTALLMENTS }, (_, index) => {
    const recognitionOn = addMonths(parseGameDate(fiscalYear.startsOn), index)
    return Object.freeze({ recognitionOn, dueOn: recognitionOn, amount: Object.freeze({ currencyCode: annualAmount.currencyCode, minorUnits: perInstallmentMinorUnits }) })
  }))
}

export function createAcbDemoEconomicProfileV1(): CompetitionEconomicProfile {
  const provenance = { kind: ECONOMIC_POLICY_PROVENANCE_KIND, id: BDM_DEMO_ECONOMIC_POLICY_ID, description: BDM_DEMO_ECONOMIC_POLICY_V1_LABEL }
  const competition = { kind: 'EXTERNAL' as const, label: 'Liga Endesa competition (demo policy)' }
  return createCompetitionEconomicProfile({
    competitionId: ACB_DEMO_ECONOMIC_COMPETITION_ID,
    seasonId: ACB_DEMO_ECONOMIC_SEASON_ID,
    fiscalYearStartMonth: ACB_DEMO_ECONOMIC_FISCAL_YEAR_START_MONTH,
    currencyCode: DEMO_ECONOMIC_CURRENCY,
    label: 'ACB demo competition economic profile',
    approvedPolicyLabel: BDM_DEMO_ECONOMIC_POLICY_V1_LABEL,
    revenuePolicies: [
      createCompetitionRevenuePolicy({
        code: 'COMPETITION_PARTICIPATION_DISTRIBUTION',
        category: 'COMPETITION',
        currencyCode: DEMO_ECONOMIC_CURRENCY,
        annualAmount: legacyMajorUnitsToMoney(BDM_DEMO_PARTICIPATION_DISTRIBUTION_ANNUAL_MAJOR_UNITS, DEMO_ECONOMIC_CURRENCY),
        installments: acbDemoParticipationInstallments(),
        // Approved: each installment's contractual payment date is also its collection date, so the money the
        // competition owes becomes canonical cash on that date through the Treasury receivable-collection primitive.
        collectionPolicy: 'COLLECT_ON_DUE_DATE',
        counterparty: competition,
        provenance,
      }),
    ],
    operatingCostPolicies: [
      createCompetitionOperatingCostPolicy({
        code: 'MATCH_OPERATIONS',
        category: 'MATCH_OPERATIONS',
        currencyCode: DEMO_ECONOMIC_CURRENCY,
        perEventAmount: legacyMajorUnitsToMoney(BDM_DEMO_MATCH_OPERATIONS_PER_GAME_MAJOR_UNITS, DEMO_ECONOMIC_CURRENCY),
        counterparty: competition,
        provenance,
      }),
    ],
  })
}

/** Month arithmetic on a GameDate: the first date of the month `months` after `date`. */
function addMonths(date: GameDate, months: number): GameDate {
  const year = Number(date.slice(0, 4))
  const monthIndex = Number(date.slice(5, 7)) - 1 + months
  const yearOffset = Math.floor(monthIndex / 12)
  const month = (monthIndex % 12) + 1
  return createGameDate(year + yearOffset, month, 1)
}
