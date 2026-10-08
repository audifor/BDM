import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { fiscalPeriodIdFromString, organizationIdFromString, type FiscalPeriodId, type OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createBudgetLine, createFinancialBudget, type BudgetLine, type FinancialBudget } from './BudgetForecasting'
import { provisionOrganizationFinanceFoundation, organizationFinanceFiscalPeriodId } from './FinanceFoundation'
import { legacyTeamFinanceAmountToMoney, resolveOrganizationCurrency, type FinanceCurrencyUnavailableReason } from './FinanceCurrencyPolicy'
import { createFiscalPeriod, type FiscalPeriod, type OrganizationFinancialProfile } from './FinancialLedger'

/**
 * BS16E/BS16F. Canonical finance activation.
 *
 * The only shipped gameplay budget amounts are `TeamFinances.playerSalaryBudget` / `staffSalaryBudget`,
 * produced deterministically by `generateInitialTeamFinances` and completed for legacy or partial saves by
 * `ensureTeamFinances`. BS16F supplies the missing currency authority: activation resolves the organization
 * currency through the canonical policy (country first, then the shipped ecosystem policy), provisions the
 * BS16B foundation (profile, account catalog, opening fiscal period), and then materializes the payroll
 * authorization from the legacy pools through one explicit major→minor conversion boundary.
 *
 * Activation never invents a currency, never overwrites an existing canonical profile, and never creates
 * cash, ledger transactions, revenue, capital or debt.
 */
export type FinanceActivationStatus =
  | 'ACTIVATED'
  | 'ALREADY_PROVISIONED'
  | 'RENEWAL_NOT_MODELLED'
  | 'FINANCE_PROFILE_UNAVAILABLE'
  | 'FINANCE_CURRENCY_UNAVAILABLE'
  | 'CURRENCY_POLICY_CONFLICT'
  | 'NO_LEGACY_BUDGET_SOURCE'

export type FinanceCurrencySource = 'COUNTRY' | 'ECOSYSTEM' | 'CANONICAL_PROFILE'

export interface OrganizationFinanceActivation {
  readonly organizationId: OrganizationId
  /** `ACTIVATED` means the organization has everything it needs and activation materialized it (or would). */
  readonly status: FinanceActivationStatus
  readonly fiscalPeriodId: FiscalPeriodId | null
  readonly budgetId: string | null
  readonly currencyCode: string | null
  readonly currencySource: FinanceCurrencySource | null
  readonly currencyUnavailableReason: FinanceCurrencyUnavailableReason | null
  /** Populated only for `CURRENCY_POLICY_CONFLICT`: the currency the provisioning policy derives. */
  readonly policyCurrencyCode: string | null
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
   * materializing a new period's authorization is opt-in only (BS16G+).
   */
  readonly allowNewPeriodMaterialization?: boolean
}

export const LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE = Object.freeze({
  kind: 'MIGRATION',
  id: 'legacy-team-finances',
  description: 'Transitional activation from the legacy TeamFinances gameplay budget authority',
})

const LEGACY_ACTIVATION_AUTHORITY_ID = 'system:legacy-team-finances-activation'

/** Deterministic fiscal year containing `date`, derived from the fiscal year start month. */
export function getFiscalYearFor(profile: Pick<OrganizationFinancialProfile, 'fiscalYearStartMonth'>, date: GameDate | string): { readonly startsOn: GameDate; readonly endsOn: GameDate; readonly label: string } {
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

/** Read-only view of what activation resolves and would materialize; it never mutates the world. */
export function getFinanceActivationReport(world: GameWorld, options: EnsureCanonicalFinanceFoundationOptions = {}): FinanceActivationReport {
  const asOfDate = parseGameDate(options.asOfDate ?? world.currentDate)
  const allowNewPeriodMaterialization = options.allowNewPeriodMaterialization ?? false
  return Object.freeze({
    asOfDate,
    organizations: Object.freeze(financeBearingOrganizationIds(world).map((organizationId) => plan(world, organizationId, asOfDate, allowNewPeriodMaterialization).activation)),
  })
}

/**
 * Single shared activation authority: resolve currency, provision the canonical foundation, materialize the
 * legacy payroll authorization. Deterministic, idempotent and migration safe — calling it again on a world
 * that needs nothing returns the identical world instance, and existing canonical facts always win.
 */
export function ensureCanonicalFinanceFoundation(world: GameWorld, options: EnsureCanonicalFinanceFoundationOptions = {}): GameWorld {
  const asOfDate = parseGameDate(options.asOfDate ?? world.currentDate)
  const allowNewPeriodMaterialization = options.allowNewPeriodMaterialization ?? false
  let current = world
  let provisionedAny = false
  const budgetAdds: FinancialBudget[] = []
  const lineAdds: BudgetLine[] = []
  const periodAdds: FiscalPeriod[] = []

  for (const organizationId of financeBearingOrganizationIds(world)) {
    const planned = plan(current, organizationId, asOfDate, allowNewPeriodMaterialization)
    if (planned.status !== 'ACTIVATED') continue
    if (planned.provisionFoundation) {
      current = provisionOrganizationFinanceFoundation(current, organizationId, { currencyCode: planned.currencyCode })
      provisionedAny = true
    }
    const fiscalPeriodId = resolveCanonicalFiscalPeriod(current, organizationId, asOfDate)?.id ?? planned.fiscalPeriodId
    if (current.fiscalPeriodsById[fiscalPeriodId] === undefined) {
      const profile = current.organizationFinancialProfilesById[organizationId]!
      const fiscalYear = getFiscalYearFor(profile, asOfDate)
      periodAdds.push(createFiscalPeriod({ id: fiscalPeriodId, organizationId, label: fiscalYear.label, startsOn: fiscalYear.startsOn, endsOn: fiscalYear.endsOn }))
    }
    const materialized = materializeLegacyTeamFinancesAuthorization(current, { organizationId, fiscalPeriodId, asOfDate, currencyCode: planned.currencyCode })
    budgetAdds.push(materialized.budget)
    lineAdds.push(...materialized.lines)
  }

  if (!provisionedAny && budgetAdds.length === 0) return world
  return updateGameWorld(current, {
    ...(periodAdds.length === 0 ? {} : { fiscalPeriods: [...Object.values(current.fiscalPeriodsById), ...periodAdds] }),
    ...(budgetAdds.length === 0 ? {} : { financialBudgets: [...Object.values(current.financialBudgetsById), ...budgetAdds] }),
    ...(lineAdds.length === 0 ? {} : { budgetLines: [...Object.values(current.budgetLinesById), ...lineAdds] }),
  })
}

/**
 * One-way transitional materialization: legacy TeamFinances → canonical APPROVED authorization.
 * `playerSalaryBudget` maps to the existing canonical `PLAYER_SALARY` category and `staffSalaryBudget` to
 * `STAFF_SALARY`; no other category is authorized, so unrelated scopes keep reporting
 * `BUDGET_AUTHORIZATION_NOT_MODELLED` until a real producer exists. Legacy amounts are whole major currency
 * units and are converted through the single canonical conversion boundary.
 */
export function materializeLegacyTeamFinancesAuthorization(world: GameWorld, input: {
  readonly organizationId: OrganizationId | string
  readonly fiscalPeriodId: FiscalPeriodId | string
  readonly asOfDate: GameDate | string
  readonly currencyCode?: string
}): { readonly budget: FinancialBudget; readonly lines: readonly BudgetLine[] } {
  const organizationId = organizationIdFromString(input.organizationId)
  const profile = world.organizationFinancialProfilesById[organizationId]
  const currencyCode = input.currencyCode ?? profile?.baseCurrencyCode
  if (currencyCode === undefined) throw new TypeError(`Cannot activate canonical authorization for ${organizationId} without an organization financial profile or an explicit currency`)
  const fiscalPeriod = world.fiscalPeriodsById[fiscalPeriodIdFromString(input.fiscalPeriodId)]
  const planningPeriod = fiscalPeriod === undefined
    ? { kind: 'FISCAL_YEAR' as const, ...getFiscalYearFor({ fiscalYearStartMonth: profile?.fiscalYearStartMonth ?? Number(world.seasons[world.currentSeasonId]?.startDate.slice(5, 7) || 1) }, input.asOfDate) }
    : { kind: 'FISCAL_YEAR' as const, startsOn: fiscalPeriod.startsOn, endsOn: fiscalPeriod.endsOn }
  const budgetId = authorizationBudgetIdFor(organizationId, input.fiscalPeriodId)
  const budget = createFinancialBudget({
    id: budgetId,
    organizationId,
    currencyCode,
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
        amount: legacyTeamFinanceAmountToMoney(amount, currencyCode),
        teamId: String(team.id),
        purpose: 'Legacy TeamFinances activation',
        provenance: LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE,
      }))
  }))
  return Object.freeze({ budget, lines })
}

type OrganizationActivationPlan =
  | {
      readonly status: 'ACTIVATED'
      readonly activation: OrganizationFinanceActivation
      readonly currencyCode: string
      readonly fiscalPeriodId: FiscalPeriodId
      readonly provisionFoundation: boolean
    }
  | { readonly status: Exclude<FinanceActivationStatus, 'ACTIVATED'>; readonly activation: OrganizationFinanceActivation }

function plan(world: GameWorld, organizationId: OrganizationId, asOfDate: GameDate, allowNewPeriodMaterialization: boolean): OrganizationActivationPlan {
  const profile = world.organizationFinancialProfilesById[organizationId]
  const resolution = resolveOrganizationCurrency(world, organizationId)

  if (profile !== undefined) {
    // Persisted canonical financial history wins: a policy that derives a different currency is a reported
    // conflict, never a silent rewrite of the organization's currency.
    if (resolution.status === 'RESOLVED' && resolution.currencyCode !== profile.baseCurrencyCode) {
      return {
        status: 'CURRENCY_POLICY_CONFLICT',
        activation: Object.freeze({
          organizationId,
          status: 'CURRENCY_POLICY_CONFLICT' as const,
          fiscalPeriodId: null,
          budgetId: null,
          currencyCode: String(profile.baseCurrencyCode),
          currencySource: 'CANONICAL_PROFILE' as const,
          currencyUnavailableReason: null,
          policyCurrencyCode: String(resolution.currencyCode),
          authorizedMinorUnits: 0,
        }),
      }
    }
    return planAuthorization(world, organizationId, profile.baseCurrencyCode, 'CANONICAL_PROFILE', asOfDate, allowNewPeriodMaterialization, false)
  }

  if (resolution.status !== 'RESOLVED') {
    return {
      status: 'FINANCE_CURRENCY_UNAVAILABLE',
      activation: Object.freeze({
        organizationId,
        status: 'FINANCE_CURRENCY_UNAVAILABLE' as const,
        fiscalPeriodId: null,
        budgetId: null,
        currencyCode: null,
        currencySource: null,
        currencyUnavailableReason: resolution.reason,
        policyCurrencyCode: null,
        authorizedMinorUnits: 0,
      }),
    }
  }

  // Provisioning the foundation needs a Season to anchor the opening fiscal period.
  if (world.seasons[world.currentSeasonId] === undefined) {
    return {
      status: 'FINANCE_PROFILE_UNAVAILABLE',
      activation: Object.freeze({
        organizationId,
        status: 'FINANCE_PROFILE_UNAVAILABLE' as const,
        fiscalPeriodId: null,
        budgetId: null,
        currencyCode: resolution.currencyCode,
        currencySource: resolution.source,
        currencyUnavailableReason: null,
        policyCurrencyCode: null,
        authorizedMinorUnits: 0,
      }),
    }
  }

  const planned = planAuthorization(world, organizationId, resolution.currencyCode, resolution.source, asOfDate, allowNewPeriodMaterialization, true)
  return planned.status === 'ACTIVATED' ? { ...planned, provisionFoundation: true } : planned
}

function planAuthorization(
  world: GameWorld,
  organizationId: OrganizationId,
  currencyCode: string,
  currencySource: FinanceCurrencySource,
  asOfDate: GameDate,
  allowNewPeriodMaterialization: boolean,
  mayProvisionFoundation: boolean,
): OrganizationActivationPlan {
  const profile = world.organizationFinancialProfilesById[organizationId]
  const fiscalYearStartMonth = profile?.fiscalYearStartMonth ?? Number(world.seasons[world.currentSeasonId]?.startDate.slice(5, 7) || 1)
  const fiscalYear = getFiscalYearFor({ fiscalYearStartMonth }, asOfDate)
  const existingCanonicalPeriod = resolveCanonicalFiscalPeriod(world, organizationId, asOfDate)
  // An organization that is about to be provisioned will get the BS16B season-anchored opening period, so the
  // planned authorization must name that period instead of a fiscal-year one: a read-only report and the
  // activation it describes have to resolve the same period, and the organization must never gain a second one.
  const fiscalPeriodId = existingCanonicalPeriod?.id ?? (profile === undefined && mayProvisionFoundation
    ? organizationFinanceFiscalPeriodId(organizationId, world.currentSeasonId)
    : fiscalPeriodIdFor(organizationId, fiscalYear.startsOn))
  const base = { organizationId, fiscalPeriodId, currencyCode, currencySource, currencyUnavailableReason: null, policyCurrencyCode: null }
  const existingForPeriod = Object.values(world.financialBudgetsById).find((budget) => budget.organizationId === String(organizationId) && budget.fiscalPeriodId === String(fiscalPeriodId))
  if (existingForPeriod !== undefined) {
    return { status: 'ALREADY_PROVISIONED', activation: Object.freeze({ ...base, status: 'ALREADY_PROVISIONED' as const, budgetId: existingForPeriod.id, authorizedMinorUnits: 0 }) }
  }
  const hasAnyCanonicalAuthorization = Object.values(world.financialBudgetsById).some((budget) => budget.organizationId === String(organizationId))
  if (hasAnyCanonicalAuthorization && !allowNewPeriodMaterialization) {
    // No silent carry-forward: a later fiscal period stays unauthorized until a real authority exists.
    return { status: 'RENEWAL_NOT_MODELLED', activation: Object.freeze({ ...base, status: 'RENEWAL_NOT_MODELLED' as const, fiscalPeriodId: null, budgetId: null, authorizedMinorUnits: 0 }) }
  }
  if (!hasLegacyBudgetSource(world, organizationId)) {
    return { status: 'NO_LEGACY_BUDGET_SOURCE', activation: Object.freeze({ ...base, status: 'NO_LEGACY_BUDGET_SOURCE' as const, fiscalPeriodId: null, budgetId: null, authorizedMinorUnits: 0 }) }
  }
  const materialized = materializeLegacyTeamFinancesAuthorization(world, { organizationId, fiscalPeriodId, asOfDate, currencyCode })
  return {
    status: 'ACTIVATED',
    currencyCode,
    fiscalPeriodId,
    provisionFoundation: mayProvisionFoundation && profile === undefined,
    activation: Object.freeze({
      ...base,
      status: 'ACTIVATED' as const,
      budgetId: materialized.budget.id,
      authorizedMinorUnits: materialized.lines.reduce((sum, line) => sum + line.amount.minorUnits, 0),
    }),
  }
}

function hasLegacyBudgetSource(world: GameWorld, organizationId: OrganizationId | string): boolean {
  return teamsOf(world, organizationId).some((team) => world.teamFinancesByTeamId[team.id] !== undefined)
}

/**
 * The canonical `FiscalPeriod` collection is the single period authority: activation reuses a period already
 * provisioned for the organization (for example the BS16B season-anchored opening period) instead of
 * inserting a second, overlapping period for the same dates.
 *
 * When the as-of date falls outside every canonical period the organization already has — for example a
 * career date in the week before the opening season period starts — the organization's earliest canonical
 * period is reused. Inventing another period there would create two competing period authorities covering the
 * same fiscal year, and the reused period still reports truthfully through `getFiscalPeriodStatus`, so an
 * out-of-period date keeps producing `AUTHORIZATION_OUT_OF_PERIOD` rather than a silent second authorization.
 */
function resolveCanonicalFiscalPeriod(world: GameWorld, organizationId: OrganizationId, asOfDate: GameDate): FiscalPeriod | undefined {
  const periods = Object.values(world.fiscalPeriodsById).filter((period) => String(period.organizationId) === String(organizationId))
  const covering = periods
    .filter((period) => compareGameDates(asOfDate, period.startsOn) >= 0 && compareGameDates(asOfDate, period.endsOn) <= 0)
    .sort((left, right) => compareGameDates(right.startsOn, left.startsOn) || String(right.id).localeCompare(String(left.id)))[0]
  if (covering !== undefined) return covering
  return [...periods].sort((left, right) => compareGameDates(left.startsOn, right.startsOn) || String(left.id).localeCompare(String(right.id)))[0]
}

function teamsOf(world: GameWorld, organizationId: OrganizationId | string) {
  return Object.values(world.teams)
    .filter((team) => String(team.organizationId) === String(organizationId))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
}

function financeBearingOrganizationIds(world: GameWorld): readonly OrganizationId[] {
  return [...new Set(Object.values(world.teams).map((team) => team.organizationId))].sort((left, right) => String(left).localeCompare(String(right)))
}
