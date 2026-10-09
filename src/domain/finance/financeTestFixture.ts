import type { GameDate } from '@/domain/date'
import { compareGameDates } from '@/domain/date'
import { organizationIdFromString, type OrganizationId, type TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'
import { updateGameWorld } from '@/domain/world'
import { createBudgetLine, createFinancialBudget } from './BudgetForecasting'
import { createFinancingAgreement, createFinancingDrawdown, financingAgreementIdFor, financingDrawdownIdFor } from './FinancingAgreement'
import { executeFinancingForDate } from './FinancingExecution'
import { createFinancialCommitment } from './Recognition'
import { addYears } from '@/domain/date'
import { ensureCanonicalFinanceFoundation } from './FinanceActivation'
import { materializeOrganizationOpeningEconomicState } from './FinanceOpeningState'
import { financeFiscalPeriodsOf, provisionOrganizationFinanceFoundation } from './FinanceFoundation'
import { getCashBalancesByCurrency } from './CashFlowQueries'

/**
 * Shared test fixture for the BS16M consumer-convergence suites. Gameplay decisions are answered by
 * canonical Finance, so a test that expects a signing or a hiring to succeed must give its club real
 * canonical liquidity from a legitimate source instead of raising a legacy payroll-budget pool.
 *
 * Two canonical operations are used and nothing else: `provisionOrganizationFinanceFoundation`
 * (the currency/profile/account catalog authority, which accepts an explicit currency exactly
 * because the world model carries none — prototype fixtures have no competition-based currency
 * resolution) and `materializeOrganizationOpeningEconomicState` (the BS16H opening authority, owner
 * capital posture). No cash field, no budget pool and no ledger posting is written directly here.
 */
export interface TestFinanceFunding {
  /** Currency of the fixture world; it must be the currency the canonical profile is provisioned in. */
  readonly currencyCode: string
  readonly cashMinorUnits: number
  readonly effectiveOn?: GameDate | string
}

export function fundTeamWithOpeningCapital(world: GameWorld, teamId: TeamId, funding: TestFinanceFunding): GameWorld {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Test funding needs a known Team (${teamId})`)
  const organizationId = organizationIdFromString(team.organizationId)
  const provisioned = world.organizationFinancialProfilesById[organizationId] === undefined
    ? provisionOrganizationFinanceFoundation(world, organizationId, { currencyCode: funding.currencyCode })
    : world
  return ensureCanonicalFinanceFoundation(provisioned, {
    openingEconomicStates: [ownerCapitalSource(organizationId, funding, provisioned.currentDate)],
  })
}

export function fundOrganizationWithOpeningCapital(world: GameWorld, organizationIdInput: OrganizationId | string, funding: TestFinanceFunding): GameWorld {
  const organizationId = organizationIdFromString(organizationIdInput)
  const provisioned = world.organizationFinancialProfilesById[organizationId] === undefined
    ? provisionOrganizationFinanceFoundation(world, organizationId, { currencyCode: funding.currencyCode })
    : world
  return ensureCanonicalFinanceFoundation(provisioned, {
    openingEconomicStates: [ownerCapitalSource(organizationId, funding, provisioned.currentDate)],
  })
}

export interface TestSalaryAuthorization {
  readonly currencyCode: string
  readonly playerSalaryMinorUnits: number
  readonly staffSalaryMinorUnits: number
}

/**
 * Gives an organization a real canonical spending authorization for the fiscal period containing the
 * current date: an APPROVED `FinancialBudget` with explicit `PLAYER_SALARY` / `STAFF_SALARY` lines.
 * This is the authorization fact canonical Finance reads; tests that need a signature to succeed use it
 * instead of raising a legacy payroll pool, and it never creates money (funding is separate).
 */
export function authorizeTeamSalaryForTest(world: GameWorld, teamId: TeamId, authorization: TestSalaryAuthorization): GameWorld {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Test authorization needs a known Team (${teamId})`)
  const organizationId = organizationIdFromString(team.organizationId)
  const provisioned = world.organizationFinancialProfilesById[organizationId] === undefined
    ? provisionOrganizationFinanceFoundation(world, organizationId, { currencyCode: authorization.currencyCode })
    : world
  const period = financeFiscalPeriodsOf(provisioned, organizationId).find((item) => compareGameDates(item.startsOn, provisioned.currentDate) <= 0 && compareGameDates(item.endsOn, provisioned.currentDate) >= 0)
  if (period === undefined) throw new Error(`Test authorization needs a canonical fiscal period covering ${provisioned.currentDate} for ${organizationId}`)
  const provenance = { kind: 'TEST_FIXTURE', id: 'bs16m-a-salary-authorization' }
  // Each authorization is a new APPROVED budget fact, never a rewrite of an existing one (canonical
  // planning facts are immutable), and it becomes the effective authorization for the period.
  const revision = Object.keys(provisioned.financialBudgetsById).filter((id) => id.startsWith(`budget:test-salary-authorization:${String(organizationId)}:`)).length + 1
  const budgetId = `budget:test-salary-authorization:${String(organizationId)}:${String(period.id)}:r${revision}`
  const budget = createFinancialBudget({
    id: budgetId,
    organizationId,
    currencyCode: authorization.currencyCode,
    period: { kind: 'FISCAL_YEAR', startsOn: period.startsOn, endsOn: period.endsOn },
    fiscalPeriodId: String(period.id),
    status: 'APPROVED',
    label: 'Test salary authorization',
    createdOn: provisioned.currentDate,
    approval: { authorityKind: 'MANUAL_SYSTEM_ACTION', authorityId: 'system:bs16m-a-test-fixture', approvedOn: provisioned.currentDate, provenance },
    provenance,
  })
  const line = (category: 'PLAYER_SALARY' | 'STAFF_SALARY', minorUnits: number) => createBudgetLine({
    id: `${budgetId}:${String(teamId)}:${category}`,
    budgetId,
    organizationId,
    category,
    direction: 'EXPENSE',
    amount: { currencyCode: authorization.currencyCode, minorUnits },
    teamId: String(teamId),
    purpose: 'Test salary authorization',
    provenance,
  })
  return updateGameWorld(provisioned, {
    financialBudgets: [...Object.values(provisioned.financialBudgetsById).filter((item) => item.id !== budgetId), budget],
    budgetLines: [...Object.values(provisioned.budgetLinesById).filter((item) => item.budgetId !== budgetId), line('PLAYER_SALARY', authorization.playerSalaryMinorUnits), line('STAFF_SALARY', authorization.staffSalaryMinorUnits)],
  })
}

/**
 * Consumes an Organization's available liquidity with one real outstanding canonical commitment, which
 * is the canonical successor of draining a legacy payroll pool: liquidity exists, but it is already
 * committed. Authorization is untouched, so a blocked decision reports the liquidity constraint.
 */
export function commitTeamLiquidityForTest(world: GameWorld, teamId: TeamId, minorUnits: number): GameWorld {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Test liquidity commitment needs a known Team (${teamId})`)
  const organizationId = organizationIdFromString(team.organizationId)
  const profile = world.organizationFinancialProfilesById[organizationId]
  if (profile === undefined) throw new Error(`Test liquidity commitment needs a provisioned Organization (${organizationId})`)
  const commitment = createFinancialCommitment({
    id: `financial-commitment:test-liquidity:${String(organizationId)}`,
    organizationId,
    amount: { currencyCode: String(profile.baseCurrencyCode), minorUnits },
    startsOn: world.currentDate,
    dueOn: world.currentDate,
    category: 'PLAYER_SALARY',
    provenance: { kind: 'TEST_FIXTURE', id: 'bs16m-a-liquidity-consumed' },
    counterparty: { kind: 'EXTERNAL', label: 'Existing commitments' },
  })
  return updateGameWorld(world, { financialCommitments: [...Object.values(world.financialCommitmentsById), commitment] })
}

/**
 * Executes one explicit canonical financing drawdown (BS16L) so a test can add real ledger cash without
 * touching authorization. The agreement is external, unrelated-party and active, so no Governance
 * decision is involved; execution goes through the canonical financing execution authority.
 */
export function financingDrawdownForTest(world: GameWorld, teamId: TeamId, minorUnits: number): GameWorld {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Test drawdown needs a known Team (${teamId})`)
  const organizationId = organizationIdFromString(team.organizationId)
  const profile = world.organizationFinancialProfilesById[organizationId]
  if (profile === undefined) throw new Error(`Test drawdown needs a provisioned Organization (${organizationId})`)
  const currencyCode = String(profile.baseCurrencyCode)
  const provenance = { kind: 'TEST_FIXTURE', id: 'bs16m-a-financing' }
  const agreement = createFinancingAgreement({
    id: financingAgreementIdFor(organizationId, 'test-facility'),
    borrowerOrganizationId: organizationId,
    fundingParty: { kind: 'EXTERNAL', label: 'Test lender' },
    debtType: 'CREDIT_FACILITY',
    currencyCode,
    authorizedPrincipal: { currencyCode, minorUnits },
    startsOn: world.currentDate,
    expiresOn: addYears(world.currentDate, 5),
    provenance,
  })
  const drawdown = createFinancingDrawdown({
    id: financingDrawdownIdFor(agreement.id, 'test-draw-1'),
    agreementId: agreement.id,
    organizationId,
    amount: { currencyCode, minorUnits },
    drawnOn: world.currentDate,
    provenance,
  })
  const withFacts = updateGameWorld(world, {
    financingAgreements: [...Object.values(world.financingAgreementsById).filter((item) => item.id !== agreement.id), agreement],
    financingDrawdowns: [...Object.values(world.financingDrawdownsById).filter((item) => item.id !== drawdown.id), drawdown],
  })
  return executeFinancingForDate(withFacts, { organizationId, date: withFacts.currentDate }).world
}

export function cashMinorUnitsForTest(world: GameWorld, organizationIdInput: OrganizationId | string, asOfDate?: GameDate | string): number {
  return getCashBalancesByCurrency(world, organizationIdInput, asOfDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
}

/** Owner capital is the one shipped-candidate-free opening posture that needs a named counterpart. */
function ownerCapitalSource(organizationId: OrganizationId, funding: TestFinanceFunding, fallbackDate: GameDate) {
  return Object.freeze({
    sourceAuthority: 'OWNERSHIP' as const,
    sourceEntityId: `owner:${String(organizationId)}`,
    organizationId,
    currencyCode: funding.currencyCode,
    effectiveOn: funding.effectiveOn ?? fallbackDate,
    cashMinorUnits: funding.cashMinorUnits,
    counterpartKind: 'OWNER_CAPITAL' as const,
    counterpartId: `person:owner:${String(organizationId)}`,
  })
}
