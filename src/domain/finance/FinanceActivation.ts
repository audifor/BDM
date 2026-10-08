import { parseGameDate, type GameDate } from '@/domain/date'
import { fiscalPeriodIdFromString, organizationIdFromString, type FiscalPeriodId, type OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createBudgetLine, createFinancialBudget, type BudgetLine, type FinancialBudget } from './BudgetForecasting'
import { createFiscalPeriod, type FiscalPeriod, type OrganizationFinancialProfile } from './FinancialLedger'

/**
 * BS16E. Authorization activation.
 *
 * Audit result: the only shipped gameplay budget amounts in this codebase are
 * `TeamFinances.playerSalaryBudget` / `staffSalaryBudget`, produced deterministically by
 * `generateInitialTeamFinances` (seeded by team id from initial payroll) and completed for legacy or
 * partial saves by `ensureTeamFinances`. There is no canonical currency authority anywhere: `Country`
 * and `SportsEcosystem` carry no currency, the World DB league data carries only a currencyless
 * `budget` field, and the only canonical currency source is `OrganizationFinancialProfile`, which no
 * shipped path provisions. The activation seam therefore requires an already-provisioned profile and
 * refuses to invent one; organizations without a profile are classified, never faked.
 */
export type FinanceActivationStatus =
  | 'ACTIVATED'
  | 'ALREADY_PROVISIONED'
  | 'RENEWAL_NOT_MODELLED'
  | 'FINANCE_PROFILE_UNAVAILABLE'
  | 'NO_LEGACY_BUDGET_SOURCE'

export interface OrganizationFinanceActivation {
  readonly organizationId: OrganizationId
  readonly status: FinanceActivationStatus
  readonly fiscalPeriodId: FiscalPeriodId | null
  readonly budgetId: string | null
  readonly currencyCode: string | null
  readonly authorizedMinorUnits: number
}

export interface FinanceActivationReport {
  readonly asOfDate: GameDate
  readonly organizations: readonly OrganizationFinanceActivation[]
}

export interface EnsureCanonicalFinanceFoundationOptions {
  readonly asOfDate?: GameDate | string
  /**
   * Renewal is NOT modelled: a later fiscal period stays unauthorized until a real authority exists, so
   * materializing a new period's authorization is opt-in only (BS16F+).
   */
  readonly allowNewPeriodMaterialization?: boolean
}

/**
 * Legacy `TeamFinances` amounts are currencyless nominal club amounts; canonical Finance interprets them
 * 1:1 as minor units of the organization's already-provisioned currency, exactly like the existing
 * canonical adapters that bridge legacy contract salaries into `Money`. No FX or scale conversion happens.
 */
export const LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE = Object.freeze({
  kind: 'MIGRATION',
  id: 'legacy-team-finances',
  description: 'Transitional activation from the legacy TeamFinances gameplay budget authority',
})

const LEGACY_ACTIVATION_AUTHORITY_ID = 'system:legacy-team-finances-activation'

/** Deterministic fiscal year containing `date`, derived from the profile's own canonical `fiscalYearStartMonth`. */
export function getFiscalYearFor(profile: OrganizationFinancialProfile, date: GameDate | string): { readonly startsOn: GameDate; readonly endsOn: GameDate; readonly label: string } {
  const asOf = parseGameDate(date)
  const year = Number(asOf.slice(0, 4))
  const month = Number(asOf.slice(5, 7))
  const startYear = month >= profile.fiscalYearStartMonth ? year : year - 1
  const endYear = startYear + 1
  const monthText = String(profile.fiscalYearStartMonth).padStart(2, '0')
  const startsOn = parseGameDate(`${startYear}-${monthText}-01`)
  const lastDay = new Date(`${endYear}-${monthText}-01T00:00:00Z`)
  lastDay.setUTCDate(lastDay.getUTCDate() - 1)
  return Object.freeze({ startsOn, endsOn: parseGameDate(lastDay.toISOString().slice(0, 10)), label: `${startYear}-${String(endYear).slice(2)}` })
}

export function fiscalPeriodIdFor(organizationId: OrganizationId | string, startsOn: GameDate | string): FiscalPeriodId {
  return fiscalPeriodIdFromString(`fiscal-period:${organizationId}:${parseGameDate(startsOn)}`)
}

export function authorizationBudgetIdFor(organizationId: OrganizationId | string, fiscalPeriodId: FiscalPeriodId | string): string {
  return `budget:legacy-team-finances:${organizationId}:${fiscalPeriodId}`
}

export function getFinanceActivationReport(world: GameWorld, options: EnsureCanonicalFinanceFoundationOptions = {}): FinanceActivationReport {
  const asOfDate = parseGameDate(options.asOfDate ?? world.currentDate)
  const allowNewPeriodMaterialization = options.allowNewPeriodMaterialization ?? false
  return Object.freeze({
    asOfDate,
    organizations: Object.freeze(financeBearingOrganizationIds(world).map((organizationId) => plan(world, organizationId, asOfDate, allowNewPeriodMaterialization).activation)),
  })
}

/**
 * Single shared activation authority. Deterministic and idempotent: it never rewrites an existing
 * canonical fiscal period or authorization, creates no ledger transaction, no cash, no account and no
 * reservation, and returns the world unchanged when there is nothing legitimate to materialize.
 */
export function ensureCanonicalFinanceFoundation(world: GameWorld, options: EnsureCanonicalFinanceFoundationOptions = {}): GameWorld {
  const asOfDate = parseGameDate(options.asOfDate ?? world.currentDate)
  const allowNewPeriodMaterialization = options.allowNewPeriodMaterialization ?? false
  const fiscalPeriods: FiscalPeriod[] = [...Object.values(world.fiscalPeriodsById)]
  const budgets: FinancialBudget[] = [...Object.values(world.financialBudgetsById)]
  const budgetLines: BudgetLine[] = [...Object.values(world.budgetLinesById)]
  let changed = false

  for (const organizationId of financeBearingOrganizationIds(world)) {
    const planned = plan(world, organizationId, asOfDate, allowNewPeriodMaterialization)
    if (planned.status !== 'ACTIVATED') continue
    if (world.fiscalPeriodsById[planned.fiscalPeriodId] === undefined) {
      const profile = world.organizationFinancialProfilesById[organizationId]!
      const fiscalYear = getFiscalYearFor(profile, asOfDate)
      fiscalPeriods.push(createFiscalPeriod({ id: planned.fiscalPeriodId, organizationId, label: fiscalYear.label, startsOn: fiscalYear.startsOn, endsOn: fiscalYear.endsOn }))
    }
    budgets.push(planned.budget)
    budgetLines.push(...planned.lines)
    changed = true
  }

  if (!changed) return world
  return updateGameWorld(world, { fiscalPeriods, financialBudgets: budgets, budgetLines })
}

/**
 * One-way transitional materialization: legacy TeamFinances → canonical APPROVED authorization.
 * `playerSalaryBudget` maps to the existing canonical `PLAYER_SALARY` category and `staffSalaryBudget`
 * to `STAFF_SALARY`; no other category is authorized, so unrelated scopes keep reporting
 * `BUDGET_AUTHORIZATION_NOT_MODELLED` until a real producer exists.
 */
export function materializeLegacyTeamFinancesAuthorization(world: GameWorld, input: {
  readonly organizationId: OrganizationId | string
  readonly fiscalPeriodId: FiscalPeriodId | string
  readonly asOfDate: GameDate | string
}): { readonly budget: FinancialBudget; readonly lines: readonly BudgetLine[] } {
  const organizationId = organizationIdFromString(input.organizationId)
  const profile = world.organizationFinancialProfilesById[organizationId]
  if (profile === undefined) throw new TypeError(`Cannot activate canonical authorization for ${organizationId} without an organization financial profile`)
  const fiscalPeriod = world.fiscalPeriodsById[fiscalPeriodIdFromString(input.fiscalPeriodId)]
  const planningPeriod = fiscalPeriod === undefined
    ? { kind: 'FISCAL_YEAR' as const, ...getFiscalYearFor(profile, input.asOfDate) }
    : { kind: 'FISCAL_YEAR' as const, startsOn: fiscalPeriod.startsOn, endsOn: fiscalPeriod.endsOn }
  const budgetId = authorizationBudgetIdFor(organizationId, input.fiscalPeriodId)
  const budget = createFinancialBudget({
    id: budgetId,
    organizationId,
    currencyCode: profile.baseCurrencyCode,
    period: planningPeriod,
    fiscalPeriodId: String(input.fiscalPeriodId),
    status: 'APPROVED',
    label: 'Legacy TeamFinances activation',
    createdOn: parseGameDate(input.asOfDate),
    approval: { authorityKind: 'MANUAL_SYSTEM_ACTION', authorityId: LEGACY_ACTIVATION_AUTHORITY_ID, approvedOn: parseGameDate(input.asOfDate), provenance: LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE },
    provenance: LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE,
  })
  const lines = Object.freeze(teamsOf(world, organizationId).flatMap((team) => {
    const finance = world.teamFinancesByTeamId[team.id]
    if (finance === undefined) return []
    const pools = [['PLAYER_SALARY', finance.playerSalaryBudget], ['STAFF_SALARY', finance.staffSalaryBudget]] as const
    return pools
      .filter(([, amount]) => Number.isSafeInteger(amount) && amount > 0)
      .map(([category, amount]) => createBudgetLine({
        id: `${budgetId}:${team.id}:${category}`,
        budgetId,
        organizationId,
        category,
        direction: 'EXPENSE',
        amount: { currencyCode: profile.baseCurrencyCode, minorUnits: amount },
        teamId: String(team.id),
        purpose: 'Legacy TeamFinances activation',
        provenance: LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE,
      }))
  }))
  return Object.freeze({ budget, lines })
}

function plan(world: GameWorld, organizationId: OrganizationId, asOfDate: GameDate, allowNewPeriodMaterialization: boolean):
  | { readonly status: 'ACTIVATED'; readonly activation: OrganizationFinanceActivation; readonly fiscalPeriodId: FiscalPeriodId; readonly budget: FinancialBudget; readonly lines: readonly BudgetLine[] }
  | { readonly status: Exclude<FinanceActivationStatus, 'ACTIVATED'>; readonly activation: OrganizationFinanceActivation } {
  const profile = world.organizationFinancialProfilesById[organizationId]
  if (profile === undefined) {
    return { status: 'FINANCE_PROFILE_UNAVAILABLE', activation: Object.freeze({ organizationId, status: 'FINANCE_PROFILE_UNAVAILABLE' as const, fiscalPeriodId: null, budgetId: null, currencyCode: null, authorizedMinorUnits: 0 }) }
  }
  const fiscalYear = getFiscalYearFor(profile, asOfDate)
  const fiscalPeriodId = fiscalPeriodIdFor(organizationId, fiscalYear.startsOn)
  const existingForPeriod = Object.values(world.financialBudgetsById).find((budget) => budget.organizationId === String(organizationId) && budget.fiscalPeriodId === String(fiscalPeriodId))
  if (existingForPeriod !== undefined) {
    return { status: 'ALREADY_PROVISIONED', activation: Object.freeze({ organizationId, status: 'ALREADY_PROVISIONED' as const, fiscalPeriodId, budgetId: existingForPeriod.id, currencyCode: profile.baseCurrencyCode, authorizedMinorUnits: 0 }) }
  }
  const hasAnyCanonicalAuthorization = Object.values(world.financialBudgetsById).some((budget) => budget.organizationId === String(organizationId))
  if (hasAnyCanonicalAuthorization && !allowNewPeriodMaterialization) {
    // No silent carry-forward: a later fiscal period stays unauthorized until a real authority exists.
    return { status: 'RENEWAL_NOT_MODELLED', activation: Object.freeze({ organizationId, status: 'RENEWAL_NOT_MODELLED' as const, fiscalPeriodId: null, budgetId: null, currencyCode: profile.baseCurrencyCode, authorizedMinorUnits: 0 }) }
  }
  if (!hasLegacyBudgetSource(world, organizationId)) {
    return { status: 'NO_LEGACY_BUDGET_SOURCE', activation: Object.freeze({ organizationId, status: 'NO_LEGACY_BUDGET_SOURCE' as const, fiscalPeriodId: null, budgetId: null, currencyCode: profile.baseCurrencyCode, authorizedMinorUnits: 0 }) }
  }
  const materialized = materializeLegacyTeamFinancesAuthorization(world, { organizationId, fiscalPeriodId, asOfDate })
  return {
    status: 'ACTIVATED',
    fiscalPeriodId,
    budget: materialized.budget,
    lines: materialized.lines,
    activation: Object.freeze({
      organizationId,
      status: 'ACTIVATED' as const,
      fiscalPeriodId,
      budgetId: materialized.budget.id,
      currencyCode: profile.baseCurrencyCode,
      authorizedMinorUnits: materialized.lines.reduce((sum, line) => sum + line.amount.minorUnits, 0),
    }),
  }
}

function hasLegacyBudgetSource(world: GameWorld, organizationId: OrganizationId | string): boolean {
  return teamsOf(world, organizationId).some((team) => world.teamFinancesByTeamId[team.id] !== undefined)
}

function teamsOf(world: GameWorld, organizationId: OrganizationId | string) {
  return Object.values(world.teams)
    .filter((team) => String(team.organizationId) === String(organizationId))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
}

function financeBearingOrganizationIds(world: GameWorld): readonly OrganizationId[] {
  return [...new Set(Object.values(world.teams).map((team) => team.organizationId))].sort((left, right) => String(left).localeCompare(String(right)))
}
