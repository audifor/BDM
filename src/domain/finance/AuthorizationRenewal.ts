import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { fiscalPeriodIdFromString, organizationIdFromString, type FiscalPeriodId, type OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { isCarryForwardAuthorizationRenewalPolicy, type FinancialAuthorizationRenewalPolicy } from './AuthorizationRenewalPolicy'
import { createBudgetLine, createFinancialBudget, getBudgetLifecycleStatus, type BudgetLine, type FinancialBudget } from './BudgetForecasting'
import { createCurrencyCode } from './FinancialLedger'

/**
 * BS16N-R. Annual authorization continuity.
 *
 * When an Organization's fiscal year rolls over, the new fiscal period starts with **new authorization against
 * the obligations that actually belong to that period**. Under
 * `CARRY_FORWARD_PREVIOUS_APPROVED_LIMITS` the previous fiscal period's approved category limits are copied into
 * a new APPROVED budget for the new period: new ids, new fiscal period, same currency, deterministic provenance,
 * and nothing else carried.
 *
 * The planner is a pure function (it reads the world and builds the facts), the applier is the only mutator, and
 * an authorization that already exists for the target period always wins: renewal never overwrites, never
 * double-provisions and never re-seeds from a legacy pool. Both the activation authority (a career loaded inside
 * a new fiscal year) and the daily lifecycle (the rollover date itself) use the same planner, so the two paths
 * can never disagree.
 */
export type AuthorizationRenewalPlanStatus =
  /** A new-period authorization was planned from the previous period's approved limits. */
  | 'RENEWED'
  /** The target period already has a budget: an explicit (or already renewed) authorization wins. */
  | 'ALREADY_AUTHORIZED'
  /** The policy cannot renew because there is no previous approved authorization in this currency. */
  | 'NOTHING_TO_CARRY_FORWARD'
  /** `NONE`, or no policy at all: the period stays period truth with no authorization. */
  | 'POLICY_DISABLED'

export interface AuthorizationRenewalPlan {
  readonly status: AuthorizationRenewalPlanStatus
  readonly organizationId: OrganizationId
  readonly currencyCode: string
  readonly fiscalPeriodId: FiscalPeriodId
  readonly budget: FinancialBudget | null
  readonly lines: readonly BudgetLine[]
  /** The previous period's approved budget the limits came from, when there was one. */
  readonly previousBudgetId: string | null
}

export interface AuthorizationRenewalInput {
  readonly organizationId: OrganizationId | string
  readonly currencyCode: string
  readonly fiscalPeriodId: FiscalPeriodId | string
  /** Canonical dates of the target fiscal period (the fiscal year containing the renewal date). */
  readonly period: { readonly startsOn: GameDate | string; readonly endsOn: GameDate | string; readonly label?: string }
  readonly asOfDate: GameDate | string
  readonly policy: FinancialAuthorizationRenewalPolicy | null
}

export const AUTHORIZATION_RENEWAL_BUDGET_ID_PREFIX = 'budget:authorization-renewal'
const RENEWAL_APPROVAL_AUTHORITY_ID = 'system:annual-authorization-continuity'
const RENEWAL_PURPOSE = 'Annual authorization continuity'

export function authorizationRenewalBudgetIdFor(organizationId: OrganizationId | string, fiscalPeriodId: FiscalPeriodId | string): string {
  return `${AUTHORIZATION_RENEWAL_BUDGET_ID_PREFIX}:${organizationId}:${fiscalPeriodId}`
}

/** Pure: reads the world, builds the new-period authorization, mutates nothing. */
export function planAuthorizationRenewal(world: GameWorld, input: AuthorizationRenewalInput): AuthorizationRenewalPlan {
  const organizationId = organizationIdFromString(input.organizationId)
  const currencyCode = createCurrencyCode(input.currencyCode)
  const fiscalPeriodId = fiscalPeriodIdFromString(input.fiscalPeriodId)
  const asOfDate = parseGameDate(input.asOfDate)
  const base = { organizationId, currencyCode, fiscalPeriodId }

  if (!isCarryForwardAuthorizationRenewalPolicy(input.policy)) {
    return Object.freeze({ ...base, status: 'POLICY_DISABLED' as const, budget: null, lines: Object.freeze([]), previousBudgetId: null })
  }
  // D. An existing authorization for this period — explicit, Governance-approved or already renewed — wins.
  const alreadyAuthorized = Object.values(world.financialBudgetsById).some((budget) => budget.organizationId === organizationId && budget.fiscalPeriodId === String(fiscalPeriodId))
  if (alreadyAuthorized) {
    return Object.freeze({ ...base, status: 'ALREADY_AUTHORIZED' as const, budget: null, lines: Object.freeze([]), previousBudgetId: null })
  }

  const previous = previousApprovedAuthorizationFor(world, organizationId, currencyCode, input.period.startsOn, asOfDate, fiscalPeriodId)
  if (previous === undefined) {
    return Object.freeze({ ...base, status: 'NOTHING_TO_CARRY_FORWARD' as const, budget: null, lines: Object.freeze([]), previousBudgetId: null })
  }

  const provenance = input.policy.provenance
  const budgetId = authorizationRenewalBudgetIdFor(organizationId, fiscalPeriodId)
  const label = input.period.label === undefined ? RENEWAL_PURPOSE : `${RENEWAL_PURPOSE} ${input.period.label}`
  const budget = createFinancialBudget({
    id: budgetId,
    organizationId,
    currencyCode,
    period: { kind: 'FISCAL_YEAR', startsOn: parseGameDate(input.period.startsOn), endsOn: parseGameDate(input.period.endsOn) },
    fiscalPeriodId,
    status: 'APPROVED',
    label,
    createdOn: asOfDate,
    approval: { authorityKind: 'MANUAL_SYSTEM_ACTION', authorityId: RENEWAL_APPROVAL_AUTHORITY_ID, approvedOn: asOfDate, provenance },
    provenance,
  })
  // Only the approved limits by category/currency are carried, with the exact amounts and scopes they were
  // approved with. Spent amounts, commitments, reservations, cash, obligations, debt, capital and used headroom
  // are not facts of this budget and are therefore never copied.
  const sourceLines = Object.values(world.budgetLinesById)
    .filter((line) => line.budgetId === previous.id)
    .sort((left, right) => String(left.teamId ?? '').localeCompare(String(right.teamId ?? '')) || left.category.localeCompare(right.category) || left.id.localeCompare(right.id))
  const usedLineIds = new Set<string>()
  const lines = Object.freeze(sourceLines.map((line) => {
    const scope = line.teamId ?? 'ORGANIZATION'
    const baseId = `${budgetId}:${scope}:${line.category}`
    let id = baseId
    let suffix = 2
    while (usedLineIds.has(id)) {
      id = `${baseId}#${suffix}`
      suffix += 1
    }
    usedLineIds.add(id)
    return createBudgetLine({
      id,
      budgetId,
      organizationId,
      category: line.category,
      direction: line.direction,
      amount: line.amount,
      ...(line.teamId === undefined ? {} : { teamId: line.teamId }),
      ...(line.organizationSectionId === undefined ? {} : { organizationSectionId: line.organizationSectionId }),
      purpose: RENEWAL_PURPOSE,
      provenance,
    })
  }))
  return Object.freeze({ ...base, status: 'RENEWED' as const, budget, lines, previousBudgetId: previous.id })
}

/** The only mutator: appends the planned authorization. A non-renewing plan is an exact no-op. */
export function applyAuthorizationRenewal(world: GameWorld, plan: AuthorizationRenewalPlan): GameWorld {
  if (plan.status !== 'RENEWED' || plan.budget === null) return world
  if (world.financialBudgetsById[plan.budget.id] !== undefined) return world
  return updateGameWorld(world, {
    financialBudgets: [...Object.values(world.financialBudgetsById), plan.budget],
    budgetLines: [...Object.values(world.budgetLinesById), ...plan.lines],
  })
}

/** Plan and apply for one Organization and one fiscal period. Deterministic and idempotent. */
export function renewOrganizationAuthorizationForPeriod(world: GameWorld, input: AuthorizationRenewalInput): { readonly world: GameWorld; readonly plan: AuthorizationRenewalPlan } {
  const plan = planAuthorizationRenewal(world, input)
  return { world: applyAuthorizationRenewal(world, plan), plan }
}

/**
 * The previous period's in-effect authorization: the Organization's own approved budget in the same currency,
 * already created, whose period ends strictly before the target period starts. Selection is deterministic
 * (latest period, then latest creation, then id), so re-running renewal always picks the same predecessor.
 */
function previousApprovedAuthorizationFor(world: GameWorld, organizationId: OrganizationId, currencyCode: string, targetStartsOn: GameDate | string, asOfDate: GameDate, targetFiscalPeriodId: FiscalPeriodId): FinancialBudget | undefined {
  const target = parseGameDate(targetStartsOn)
  return Object.values(world.financialBudgetsById)
    .filter((budget) => budget.organizationId === organizationId
      && budget.currencyCode === currencyCode
      && budget.fiscalPeriodId !== String(targetFiscalPeriodId)
      && budget.status === 'APPROVED'
      && getBudgetLifecycleStatus(world, budget.id) === 'APPROVED'
      && compareGameDates(budget.createdOn, asOfDate) <= 0
      && compareGameDates(authorizationPeriodEndsOn(world, budget), target) < 0)
    .sort((left, right) => compareGameDates(authorizationPeriodEndsOn(world, right), authorizationPeriodEndsOn(world, left)) || compareGameDates(right.createdOn, left.createdOn) || right.id.localeCompare(left.id))[0]
}

/** The canonical `FiscalPeriod` owns the end date when the budget declares one. */
function authorizationPeriodEndsOn(world: GameWorld, budget: FinancialBudget): GameDate {
  if (budget.fiscalPeriodId === null) return budget.period.endsOn
  return world.fiscalPeriodsById[fiscalPeriodIdFromString(budget.fiscalPeriodId)]?.endsOn ?? budget.period.endsOn
}
