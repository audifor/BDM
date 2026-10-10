import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { fiscalPeriodIdFromString, organizationIdFromString, type FiscalPeriodId, type OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { planAuthorizationRenewal } from './AuthorizationRenewal'
import type { FinancialAuthorizationRenewalPolicy } from './AuthorizationRenewalPolicy'
import { createBudgetLine, createFinancialBudget, type BudgetLine, type FinancialBudget } from './BudgetForecasting'
import { financeFiscalPeriodIdFor, financeFiscalPeriodsOf, getFinanceFiscalYearFor, provisionOrganizationFinanceFoundation } from './FinanceFoundation'
import { getOrganizationOpeningEconomicStateStatus, materializeOrganizationOpeningEconomicState, type OpeningEconomicStateSource, type OpeningEconomicStateStatus } from './FinanceOpeningState'
import { legacyMajorUnitsToMoney, resolveOrganizationCurrency, type ExplicitOrganizationCurrencyAuthority, type FinanceCurrencyUnavailableReason } from './FinanceCurrencyPolicy'
import { createFiscalPeriod, type FiscalPeriod } from './FinancialLedger'

/**
 * BS16E/BS16F. Canonical finance activation.
 *
 * The only shipped gameplay budget amounts are `TeamFinances.playerSalaryBudget` / `staffSalaryBudget`,
 * produced deterministically by `generateInitialTeamFinances` and completed for legacy or partial saves by
 * `ensureTeamFinances`. BS16F supplies the missing currency authority: activation resolves the organization
 * currency through the canonical policy (an explicit Organization currency authority supplied by the world's
 * builder first, then the country policy, then the shipped ecosystem policy), provisions the BS16B foundation
 * (profile, account catalog, opening fiscal period), and then materializes the payroll authorization from the
 * legacy pools through one explicit major→minor conversion boundary.
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

export type FinanceCurrencySource = 'EXPLICIT_ORGANIZATION' | 'COUNTRY' | 'ECOSYSTEM' | 'CANONICAL_PROFILE'

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
  /** BS16H opening economic state: `OPENING_ECONOMIC_STATE_UNAVAILABLE` whenever no source explains cash. */
  readonly openingEconomicState: OpeningEconomicStateStatus
}

export interface FinanceActivationReport {
  readonly asOfDate: GameDate
  readonly organizations: readonly OrganizationFinanceActivation[]
}

export interface EnsureCanonicalFinanceFoundationOptions {
  readonly asOfDate?: GameDate | string
  /**
   * Legacy re-seeding into a later fiscal period stays opt-in: renewal is policy-driven (BS16N-R), so a new
   * period's authorization comes from that Organization's assigned renewal policy, never from the legacy pools.
   */
  readonly allowNewPeriodMaterialization?: boolean
  /**
   * BS16N-R explicit, per-Organization renewal policy assignments. A policy is applied when the Organization's
   * financial profile is created, so it becomes canonical, persisted configuration; an Organization nobody
   * assigns a policy to keeps the truthful `RENEWAL_NOT_MODELLED` answer. There is no global default.
   */
  readonly authorizationRenewalPolicies?: readonly OrganizationAuthorizationRenewalAssignment[]
  /**
   * BS16H explicit opening economic sources. No shipped ecosystem declares one, so careers pass nothing and
   * keep truthful zero cash; a future legitimate authority (World DB financial data, an explicit owner capital
   * action) supplies its own source instead of a hidden initialization shortcut.
   */
  readonly openingEconomicStates?: readonly OpeningEconomicStateSource[]
  /**
   * BS16M-B2 explicit Organization currency authority supplied by universe/prototype data. Canonical Finance
   * stays generic: it resolves the currency an Organization was explicitly given and never guesses one, so a
   * caller that supplies nothing keeps the unchanged "no currency" behavior.
   */
  readonly explicitOrganizationCurrencies?: readonly ExplicitOrganizationCurrencyAuthority[]
}

/** BS16N-R: one explicit renewal-policy assignment for one Organization. */
export interface OrganizationAuthorizationRenewalAssignment {
  readonly organizationId: OrganizationId | string
  readonly policy: FinancialAuthorizationRenewalPolicy
}

export const LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE = Object.freeze({
  kind: 'MIGRATION',
  id: 'legacy-team-finances',
  description: 'Transitional activation from the legacy TeamFinances gameplay budget authority',
})

const LEGACY_ACTIVATION_AUTHORITY_ID = 'system:legacy-team-finances-activation'

export function authorizationBudgetIdFor(organizationId: OrganizationId | string, fiscalPeriodId: FiscalPeriodId | string): string {
  return `budget:legacy-team-finances:${organizationId}:${fiscalPeriodId}`
}

/** Read-only view of what activation resolves and would materialize; it never mutates the world. */
export function getFinanceActivationReport(world: GameWorld, options: EnsureCanonicalFinanceFoundationOptions = {}): FinanceActivationReport {
  const asOfDate = parseGameDate(options.asOfDate ?? world.currentDate)
  const allowNewPeriodMaterialization = options.allowNewPeriodMaterialization ?? false
  const explicitOrganizationCurrencies = options.explicitOrganizationCurrencies ?? []
  const renewalPolicies = renewalPoliciesByOrganization(options.authorizationRenewalPolicies)
  return Object.freeze({
    asOfDate,
    organizations: Object.freeze(financeBearingOrganizationIds(world).map((organizationId) => Object.freeze({
      ...plan(world, organizationId, asOfDate, allowNewPeriodMaterialization, explicitOrganizationCurrencies, renewalPolicies).activation,
      openingEconomicState: getOrganizationOpeningEconomicStateStatus(world, organizationId),
    }))),
  })
}

/**
 * Single shared activation authority: resolve currency, provision the canonical foundation, materialize the
 * legacy payroll authorization for the opening period and renew authorization for a later fiscal period when
 * that Organization's own renewal policy allows it. Deterministic, idempotent and migration safe — calling it
 * again on a world that needs nothing returns the identical world instance, and existing canonical facts always
 * win.
 */
export function ensureCanonicalFinanceFoundation(world: GameWorld, options: EnsureCanonicalFinanceFoundationOptions = {}): GameWorld {
  const asOfDate = parseGameDate(options.asOfDate ?? world.currentDate)
  const allowNewPeriodMaterialization = options.allowNewPeriodMaterialization ?? false
  const explicitOrganizationCurrencies = options.explicitOrganizationCurrencies ?? []
  const renewalPolicies = renewalPoliciesByOrganization(options.authorizationRenewalPolicies)
  let current = world
  let changedAny = false
  const budgetAdds: FinancialBudget[] = []
  const lineAdds: BudgetLine[] = []
  const periodAdds: FiscalPeriod[] = []
  const openingSourcesByOrganization = new Map<string, OpeningEconomicStateSource[]>()
  for (const source of options.openingEconomicStates ?? []) {
    const key = String(organizationIdFromString(source.organizationId))
    openingSourcesByOrganization.set(key, [...(openingSourcesByOrganization.get(key) ?? []), source])
  }

  for (const organizationId of financeBearingOrganizationIds(world)) {
    const planned = plan(current, organizationId, asOfDate, allowNewPeriodMaterialization, explicitOrganizationCurrencies, renewalPolicies)
    if (planned.provision !== null) {
      const provisioned = provisionOrganizationFinanceFoundation(current, organizationId, {
        currencyCode: planned.provision.currencyCode,
        fiscalYearStartMonth: planned.provision.fiscalYearStartMonth,
        asOfDate,
        authorizationRenewalPolicy: renewalPolicies.get(String(organizationId)) ?? null,
      })
      if (provisioned !== current) changedAny = true
      current = provisioned
    }
    // BS16H: a legitimate opening source is materialized through the ledger, never as a cash field.
    for (const source of openingSourcesByOrganization.get(String(organizationId)) ?? []) {
      const opening = materializeOrganizationOpeningEconomicState(current, source)
      if (opening.world !== current) {
        current = opening.world
        changedAny = true
      }
    }
    const plannedAuthorization = planned.authorization
    if (plannedAuthorization === null) continue
    const profile = current.organizationFinancialProfilesById[organizationId]!
    const fiscalPeriodId = resolveCanonicalFiscalPeriod(current, organizationId, asOfDate, profile.fiscalYearStartMonth)?.id ?? plannedAuthorization.fiscalPeriodId
    if (current.fiscalPeriodsById[fiscalPeriodId] === undefined) {
      const fiscalYear = getFinanceFiscalYearFor(profile, asOfDate)
      periodAdds.push(createFiscalPeriod({ id: fiscalPeriodId, organizationId, label: fiscalYear.label, startsOn: fiscalYear.startsOn, endsOn: fiscalYear.endsOn }))
    }
    if (plannedAuthorization.kind === 'CARRY_FORWARD_RENEWAL') {
      budgetAdds.push(plannedAuthorization.budget)
      lineAdds.push(...plannedAuthorization.lines)
      continue
    }
    const materialized = materializeLegacyTeamFinancesAuthorization(current, { organizationId, fiscalPeriodId, asOfDate, currencyCode: plannedAuthorization.currencyCode })
    budgetAdds.push(materialized.budget)
    lineAdds.push(...materialized.lines)
  }

  if (!changedAny && budgetAdds.length === 0) return world
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
    ? { kind: 'FISCAL_YEAR' as const, ...getFinanceFiscalYearFor({ fiscalYearStartMonth: profile?.fiscalYearStartMonth ?? Number(world.seasons[world.currentSeasonId]?.startDate.slice(5, 7) ?? input.asOfDate.slice(5, 7)) }, input.asOfDate) }
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
        amount: legacyMajorUnitsToMoney(amount, currencyCode),
        teamId: String(team.id),
        purpose: 'Legacy TeamFinances activation',
        provenance: LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE,
      }))
  }))
  return Object.freeze({ budget, lines })
}

interface OrganizationActivationPlan {
  readonly activation: OrganizationFinanceActivation
  /**
   * Non-null when the currency resolved: the foundation (profile, account catalog, canonical fiscal period) is
   * ensured for the organization. It is currency/identity truth, so it exists independently of any budget
   * authority; an organization whose fiscal year has no period yet still gains period truth while its
   * authorization stays unmodelled.
   */
  readonly provision: OrganizationFinanceProvisioning | null
  /** Non-null only for `ACTIVATED`: the authorization this activation materializes (or already materialized). */
  readonly authorization: PlannedOrganizationAuthorization | null
}

/**
 * The authorization an activation plan materializes. `LEGACY_SEED` is the one-way transitional materialization
 * from the legacy `TeamFinances` pools for an organization that has no canonical authorization yet;
 * `CARRY_FORWARD_RENEWAL` is the BS16N-R annual continuity of an already-authorized organization's approved
 * limits into its next fiscal period. They are distinct kinds because they must never be confused: renewal is
 * never a legacy re-seed, and a legacy re-seed into a later period stays opt-in.
 */
type PlannedOrganizationAuthorization =
  | { readonly kind: 'LEGACY_SEED'; readonly currencyCode: string; readonly fiscalPeriodId: FiscalPeriodId }
  | { readonly kind: 'CARRY_FORWARD_RENEWAL'; readonly currencyCode: string; readonly fiscalPeriodId: FiscalPeriodId; readonly budget: FinancialBudget; readonly lines: readonly BudgetLine[] }

interface OrganizationFinanceProvisioning {
  readonly currencyCode: string
  readonly fiscalYearStartMonth: number
}

function activationOf(organizationId: OrganizationId, status: FinanceActivationStatus, overrides: Partial<OrganizationFinanceActivation> = {}): OrganizationFinanceActivation {
  return Object.freeze({
    organizationId,
    status,
    fiscalPeriodId: null,
    budgetId: null,
    currencyCode: null,
    currencySource: null,
    currencyUnavailableReason: null,
    policyCurrencyCode: null,
    authorizedMinorUnits: 0,
    openingEconomicState: 'OPENING_ECONOMIC_STATE_UNAVAILABLE',
    ...overrides,
  })
}

function noMaterialization(activation: OrganizationFinanceActivation, provision: OrganizationFinanceProvisioning | null = null): OrganizationActivationPlan {
  return Object.freeze({ activation, provision, authorization: null })
}

/** BS16N-R: the explicit per-Organization renewal assignments, indexed by Organization id. */
function renewalPoliciesByOrganization(assignments: readonly OrganizationAuthorizationRenewalAssignment[] | undefined): Map<string, FinancialAuthorizationRenewalPolicy> {
  const byOrganization = new Map<string, FinancialAuthorizationRenewalPolicy>()
  for (const assignment of assignments ?? []) byOrganization.set(String(organizationIdFromString(assignment.organizationId)), assignment.policy)
  return byOrganization
}

function plan(world: GameWorld, organizationId: OrganizationId, asOfDate: GameDate, allowNewPeriodMaterialization: boolean, explicitOrganizationCurrencies: readonly ExplicitOrganizationCurrencyAuthority[], renewalPolicies: ReadonlyMap<string, FinancialAuthorizationRenewalPolicy>): OrganizationActivationPlan {
  const profile = world.organizationFinancialProfilesById[organizationId]
  const resolution = resolveOrganizationCurrency(world, organizationId, explicitOrganizationCurrencies)

  if (profile !== undefined) {
    // Persisted canonical financial history wins: a policy that derives a different currency is a reported
    // conflict, never a silent rewrite of the organization's currency.
    if (resolution.status === 'RESOLVED' && resolution.currencyCode !== profile.baseCurrencyCode) {
      return noMaterialization(activationOf(organizationId, 'CURRENCY_POLICY_CONFLICT', {
        currencyCode: String(profile.baseCurrencyCode),
        currencySource: 'CANONICAL_PROFILE',
        policyCurrencyCode: String(resolution.currencyCode),
      }))
    }
    return planAuthorization(world, organizationId, profile.baseCurrencyCode, 'CANONICAL_PROFILE', asOfDate, allowNewPeriodMaterialization, { currencyCode: String(profile.baseCurrencyCode), fiscalYearStartMonth: profile.fiscalYearStartMonth }, renewalPolicies)
  }

  if (resolution.status !== 'RESOLVED') {
    return noMaterialization(activationOf(organizationId, 'FINANCE_CURRENCY_UNAVAILABLE', { currencyUnavailableReason: resolution.reason }))
  }

  // The currency resolved, so the foundation is ensured regardless of whether a legacy budget authority exists.
  return planAuthorization(world, organizationId, resolution.currencyCode, resolution.source, asOfDate, allowNewPeriodMaterialization, {
    currencyCode: String(resolution.currencyCode),
    fiscalYearStartMonth: defaultFiscalYearStartMonth(world, asOfDate),
  }, renewalPolicies)
}

function defaultFiscalYearStartMonth(world: GameWorld, asOfDate: GameDate): number {
  // The Season supplies the default starting month as context only; it never owns Finance period dates.
  return Number(world.seasons[world.currentSeasonId]?.startDate.slice(5, 7) ?? asOfDate.slice(5, 7))
}

function planAuthorization(
  world: GameWorld,
  organizationId: OrganizationId,
  currencyCode: string,
  currencySource: FinanceCurrencySource,
  asOfDate: GameDate,
  allowNewPeriodMaterialization: boolean,
  provision: OrganizationFinanceProvisioning,
  renewalPolicies: ReadonlyMap<string, FinancialAuthorizationRenewalPolicy>,
): OrganizationActivationPlan {
  const fiscalYearStartMonth = provision.fiscalYearStartMonth
  const fiscalYear = getFinanceFiscalYearFor({ fiscalYearStartMonth }, asOfDate)
  const existingPeriod = resolveCanonicalFiscalPeriod(world, organizationId, asOfDate, fiscalYearStartMonth)
  // A read-only report and the activation it describes must resolve the same period, and an organization that
  // already has a period for this fiscal year never gains a second one.
  const fiscalPeriodId = existingPeriod?.id ?? financeFiscalPeriodIdFor(organizationId, fiscalYear.startsOn)
  const base = { fiscalPeriodId, currencyCode, currencySource }
  const existingForPeriod = Object.values(world.financialBudgetsById).find((budget) => budget.organizationId === String(organizationId) && budget.fiscalPeriodId === String(fiscalPeriodId))
  if (existingForPeriod !== undefined) {
    return noMaterialization(activationOf(organizationId, 'ALREADY_PROVISIONED', { ...base, budgetId: existingForPeriod.id }), provision)
  }
  const hasAnyCanonicalAuthorization = Object.values(world.financialBudgetsById).some((budget) => budget.organizationId === String(organizationId))
  if (hasAnyCanonicalAuthorization && !allowNewPeriodMaterialization) {
    // BS16N-R: the new fiscal period already exists as period truth. Whether it also gains authorization is
    // decided by this Organization's own explicit renewal policy — never by the previous period's authorization
    // silently leaking forward, and never by the legacy pools.
    const renewalPolicy = world.organizationFinancialProfilesById[organizationId]?.authorizationRenewalPolicy ?? renewalPolicies.get(String(organizationId)) ?? null
    const renewal = planAuthorizationRenewal(world, {
      organizationId,
      currencyCode,
      fiscalPeriodId,
      period: existingPeriod === undefined
        ? { startsOn: fiscalYear.startsOn, endsOn: fiscalYear.endsOn, label: fiscalYear.label }
        : { startsOn: existingPeriod.startsOn, endsOn: existingPeriod.endsOn, label: existingPeriod.label },
      asOfDate,
      policy: renewalPolicy,
    })
    if (renewal.status === 'RENEWED' && renewal.budget !== null) {
      return Object.freeze({
        activation: activationOf(organizationId, 'ACTIVATED', {
          ...base,
          budgetId: renewal.budget.id,
          authorizedMinorUnits: renewal.lines.reduce((sum, line) => sum + (line.direction === 'EXPENSE' ? line.amount.minorUnits : 0), 0),
        }),
        provision,
        authorization: Object.freeze({ kind: 'CARRY_FORWARD_RENEWAL' as const, currencyCode, fiscalPeriodId, budget: renewal.budget, lines: renewal.lines }),
      })
    }
    return noMaterialization(activationOf(organizationId, 'RENEWAL_NOT_MODELLED', { currencyCode, currencySource }), provision)
  }
  if (!hasLegacyBudgetSource(world, organizationId)) {
    return noMaterialization(activationOf(organizationId, 'NO_LEGACY_BUDGET_SOURCE', { currencyCode, currencySource }), provision)
  }
  const materialized = materializeLegacyTeamFinancesAuthorization(world, { organizationId, fiscalPeriodId, asOfDate, currencyCode })
  return Object.freeze({
    activation: activationOf(organizationId, 'ACTIVATED', {
      ...base,
      budgetId: materialized.budget.id,
      authorizedMinorUnits: materialized.lines.reduce((sum, line) => sum + line.amount.minorUnits, 0),
    }),
    provision,
    authorization: Object.freeze({ kind: 'LEGACY_SEED' as const, currencyCode, fiscalPeriodId }),
  })
}

function hasLegacyBudgetSource(world: GameWorld, organizationId: OrganizationId | string): boolean {
  return teamsOf(world, organizationId).some((team) => world.teamFinancesByTeamId[team.id] !== undefined)
}

/**
 * The canonical `FiscalPeriod` collection is the single period authority (BS16G): a Finance fiscal period is
 * the fiscal year containing the effective date, never a competition season. Resolution order is deterministic
 * and never disjoint from what already exists, so activation can never introduce a second, overlapping period:
 * the period whose identity encodes this fiscal year's boundary, then the period covering the date, then any
 * existing period of the same fiscal year (a pre-BS16G season-shaped period). An organization whose target
 * fiscal year is covered by nothing yet resolves to no period, which makes the caller's answer the canonical
 * fiscal-year identity the provisioning authority will create.
 */
function resolveCanonicalFiscalPeriod(world: GameWorld, organizationId: OrganizationId, asOfDate: GameDate, fiscalYearStartMonth: number): FiscalPeriod | undefined {
  const periods = financeFiscalPeriodsOf(world, organizationId)
  if (periods.length === 0) return undefined
  const fiscalYear = getFinanceFiscalYearFor({ fiscalYearStartMonth }, asOfDate)
  const byIdentity = periods.find((period) => String(period.id) === String(financeFiscalPeriodIdFor(organizationId, fiscalYear.startsOn)))
  if (byIdentity !== undefined) return byIdentity
  const covering = [...periods].reverse().find((period) => compareGameDates(asOfDate, period.startsOn) >= 0 && compareGameDates(asOfDate, period.endsOn) <= 0)
  if (covering !== undefined) return covering
  return periods.find((period) => compareGameDates(period.startsOn, fiscalYear.endsOn) <= 0 && compareGameDates(fiscalYear.startsOn, period.endsOn) <= 0)
}

function teamsOf(world: GameWorld, organizationId: OrganizationId | string) {
  return Object.values(world.teams)
    .filter((team) => String(team.organizationId) === String(organizationId))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
}

function financeBearingOrganizationIds(world: GameWorld): readonly OrganizationId[] {
  return [...new Set(Object.values(world.teams).map((team) => team.organizationId))].sort((left, right) => String(left).localeCompare(String(right)))
}
