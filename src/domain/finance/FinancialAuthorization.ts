import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { organizationIdFromString, type OrganizationId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'
import { getCashBalancesByCurrency } from './CashFlowQueries'
import { getBudgetComparison, getBudgetLifecycleStatus, type BudgetApproval, type FinancialPlanningPeriod } from './BudgetForecasting'
import { evaluateFinancialCommitment, sumReservedCapacity, type FinancialCommitmentDecision, type FinancialReservation } from './FinancialAuthority'
import { createCurrencyCode, createMoney, type CurrencyCode, type Money } from './FinancialLedger'
import { getOutstandingCommitments } from './RecognitionQueries'

/**
 * BS16D. Spending authorization truth.
 *
 * Audit result: canonical Finance already owns an approved spending-authorization fact —
 * `FinancialBudget` with `status: 'APPROVED'` and an explicit `BudgetApproval`, carrying an
 * organization, a currency, a canonical `FinancialPlanningPeriod`, per-`BudgetLine` category/scope
 * amounts and revision (`revisionOfId`/`BudgetRevision`) replacement semantics. That is a permission
 * record, not money and not a forecast: `ForecastAssumption`, `BudgetAllocation` and non-APPROVED
 * budgets stay informational. BS16D therefore derives authorization from those existing facts instead
 * of introducing a second budget model.
 *
 * Authorization is scoped to its own planning period: it is in effect only while the effective date
 * falls inside that period, and no authorization carries forward automatically into a later period.
 */
export type FinancialAuthorizationState = 'ACTIVE' | 'NOT_PROVISIONED' | 'OUT_OF_PERIOD'

export interface FinancialAuthorizationLine {
  readonly lineId: string
  readonly category: string
  readonly teamId?: string
  readonly organizationSectionId?: string
  readonly authorizedMinorUnits: number
  readonly committedMinorUnits: number
  /** Signed: a negative value means the category is already over its authorization. */
  readonly availableHeadroomMinorUnits: number
  readonly overAuthorized: boolean
}

export interface OrganizationFinancialAuthorization {
  readonly state: FinancialAuthorizationState
  readonly organizationId: OrganizationId
  readonly currencyCode: CurrencyCode
  readonly asOfDate: GameDate
  readonly budgetId: string | null
  readonly approval: BudgetApproval | null
  readonly period: FinancialPlanningPeriod | null
  readonly lines: readonly FinancialAuthorizationLine[]
  readonly authorizedMinorUnits: number
  readonly committedMinorUnits: number
  readonly reservedMinorUnits: number
  /** Signed: authorization minus in-scope commitments minus OPEN reservations. */
  readonly availableHeadroomMinorUnits: number
  readonly overAuthorized: boolean
  /** Outstanding commitment categories with no matching authorization line; category attribution is reported, never guessed. */
  readonly unattributedCommitmentCategories: readonly string[]
  /** Reservations carry no canonical budget category, so they constrain organization-level capacity only. */
  readonly reservationScopeAttribution: 'ORGANIZATION_ONLY'
}

export interface OrganizationAuthorizationInput {
  readonly organizationId: OrganizationId | string
  readonly currencyCode: string
  readonly asOfDate?: GameDate | string
  readonly period?: FinancialPlanningPeriod
  readonly reservations?: readonly FinancialReservation[]
}

export function getOrganizationFinancialAuthorization(world: GameWorld, input: OrganizationAuthorizationInput): OrganizationFinancialAuthorization {
  const organizationId = organizationIdFromString(input.organizationId)
  const currencyCode = createCurrencyCode(input.currencyCode)
  const asOfDate = parseGameDate(input.asOfDate ?? world.currentDate)

  const budgets = Object.values(world.financialBudgetsById).filter(
    (budget) => budget.organizationId === organizationId && budget.currencyCode === currencyCode && budget.status === 'APPROVED' && getBudgetLifecycleStatus(world, budget.id) === 'APPROVED'
  )
  const effective = budgets
    .filter((budget) => compareGameDates(budget.createdOn, asOfDate) <= 0 && withinPeriod(budget.period, asOfDate) && (input.period === undefined || overlapsPeriod(budget.period, input.period)))
    .sort((left, right) => compareGameDates(right.createdOn, left.createdOn) || right.id.localeCompare(left.id))[0]

  const reservations = input.reservations ?? Object.values(world.financialReservationsById)
  const reservedMinorUnits = sumReservedCapacity(reservations, organizationId, currencyCode).minorUnits
  const outstanding = getOutstandingCommitments(world, organizationId, asOfDate).filter((item) => item.commitment.amount.currencyCode === currencyCode)

  if (effective === undefined) {
    return Object.freeze({
      state: budgets.length > 0 ? 'OUT_OF_PERIOD' : 'NOT_PROVISIONED',
      organizationId,
      currencyCode,
      asOfDate,
      budgetId: null,
      approval: null,
      period: null,
      lines: Object.freeze([]),
      authorizedMinorUnits: 0,
      committedMinorUnits: 0,
      reservedMinorUnits,
      availableHeadroomMinorUnits: reservedMinorUnits > 0 ? -reservedMinorUnits : 0,
      overAuthorized: reservedMinorUnits > 0,
      unattributedCommitmentCategories: Object.freeze([...new Set(outstanding.map((item) => item.commitment.category))].sort()),
      reservationScopeAttribution: 'ORGANIZATION_ONLY',
    })
  }

  const comparison = getBudgetComparison(world, effective.id, asOfDate)
  const inScopeCommitments = outstanding.filter((item) => compareGameDates(item.commitment.dueOn, effective.period.startsOn) >= 0 && compareGameDates(item.commitment.startsOn, effective.period.endsOn) <= 0)
  const expenseLines = Object.values(world.budgetLinesById).filter((line) => line.budgetId === effective.id && line.direction === 'EXPENSE')
  const lines = Object.freeze(expenseLines
    .map((line) => {
      const committedMinorUnits = comparison.find((row) => row.lineId === line.id)?.committedMinorUnits ?? 0
      const availableHeadroomMinorUnits = line.amount.minorUnits - committedMinorUnits
      return Object.freeze({
        lineId: line.id,
        category: line.category,
        ...(line.teamId === undefined ? {} : { teamId: line.teamId }),
        ...(line.organizationSectionId === undefined ? {} : { organizationSectionId: line.organizationSectionId }),
        authorizedMinorUnits: line.amount.minorUnits,
        committedMinorUnits,
        availableHeadroomMinorUnits,
        overAuthorized: availableHeadroomMinorUnits < 0,
      })
    })
    .sort((left, right) => left.category.localeCompare(right.category) || left.lineId.localeCompare(right.lineId)))

  const authorizedMinorUnits = lines.reduce((sum, line) => sum + line.authorizedMinorUnits, 0)
  const committedMinorUnits = lines.reduce((sum, line) => sum + line.committedMinorUnits, 0)
  const availableHeadroomMinorUnits = authorizedMinorUnits - committedMinorUnits - reservedMinorUnits
  const authorizedCategories = new Set(lines.map((line) => line.category))

  return Object.freeze({
    state: 'ACTIVE',
    organizationId,
    currencyCode,
    asOfDate,
    budgetId: effective.id,
    approval: effective.approval,
    period: effective.period,
    lines,
    authorizedMinorUnits,
    committedMinorUnits,
    reservedMinorUnits,
    availableHeadroomMinorUnits,
    overAuthorized: availableHeadroomMinorUnits < 0,
    unattributedCommitmentCategories: Object.freeze([...new Set(inScopeCommitments.map((item) => item.commitment.category).filter((category) => !authorizedCategories.has(category)))].sort()),
    reservationScopeAttribution: 'ORGANIZATION_ONLY',
  })
}

export interface CategoryHeadroom {
  readonly category: string
  readonly authorizedMinorUnits: number
  readonly committedMinorUnits: number
  readonly availableHeadroomMinorUnits: number
  readonly overAuthorized: boolean
}

export function getCategoryAuthorizedHeadroom(authorization: OrganizationFinancialAuthorization, category: string): CategoryHeadroom {
  const lines = authorization.lines.filter((line) => line.category === category)
  const authorizedMinorUnits = lines.reduce((sum, line) => sum + line.authorizedMinorUnits, 0)
  const committedMinorUnits = lines.reduce((sum, line) => sum + line.committedMinorUnits, 0)
  const availableHeadroomMinorUnits = authorizedMinorUnits - committedMinorUnits
  return Object.freeze({ category, authorizedMinorUnits, committedMinorUnits, availableHeadroomMinorUnits, overAuthorized: availableHeadroomMinorUnits < 0 })
}

/**
 * A category-scoped authorization can never exceed the organization-wide one, and reservations are
 * organization-scoped, so the effective headroom is the smaller of both truthful quantities.
 */
export function getEffectiveAuthorizedHeadroomMinorUnits(authorization: OrganizationFinancialAuthorization, category?: string): number {
  if (authorization.state !== 'ACTIVE') return 0
  if (category === undefined) return Math.max(authorization.availableHeadroomMinorUnits, 0)
  const categoryHeadroom = getCategoryAuthorizedHeadroom(authorization, category).availableHeadroomMinorUnits
  return Math.max(Math.min(categoryHeadroom, authorization.availableHeadroomMinorUnits), 0)
}

export interface EvaluateOrganizationCommitmentInput {
  readonly organizationId: OrganizationId | string
  readonly currency: string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly category?: string
  readonly asOfDate?: GameDate | string
  readonly period?: FinancialPlanningPeriod
  readonly reservations?: readonly FinancialReservation[]
}

/**
 * Canonical world-bound decision path: liquidity comes from ledger postings, obligations from
 * outstanding canonical commitments, authorization from the approved budget fact and capacity
 * protection from canonical reservations. Callers no longer invent `authorizedHeadroom`.
 */
export function evaluateOrganizationFinancialCommitment(world: GameWorld, input: EvaluateOrganizationCommitmentInput): FinancialCommitmentDecision {
  const organizationId = organizationIdFromString(input.organizationId)
  const currency = createCurrencyCode(input.currency)
  const asOfDate = parseGameDate(input.asOfDate ?? world.currentDate)
  const authorization = getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: currency, asOfDate, ...(input.period === undefined ? {} : { period: input.period }), ...(input.reservations === undefined ? {} : { reservations: input.reservations }) })
  const headroomMinorUnits = getEffectiveAuthorizedHeadroomMinorUnits(authorization, input.category)
  const cashMinorUnits = getCashBalancesByCurrency(world, organizationId, asOfDate).find((row) => row.currencyCode === currency)?.totalCashMinorUnits ?? null

  return evaluateFinancialCommitment({
    organizationFinancialProfile: world.organizationFinancialProfilesById[organizationId] ?? null,
    organizationId,
    currency,
    amount: input.amount,
    currentCash: cashMinorUnits === null ? null : createMoney({ currencyCode: currency, minorUnits: cashMinorUnits }),
    existingCommitments: getOutstandingCommitments(world, organizationId, asOfDate).filter((item) => item.commitment.amount.currencyCode === currency).map((item) => item.remaining),
    authorizedHeadroom: authorization.state === 'ACTIVE' ? createMoney({ currencyCode: currency, minorUnits: Math.max(headroomMinorUnits, 0) }) : null,
    activeReservations: input.reservations ?? Object.values(world.financialReservationsById),
    authorization: { state: authorization.state, ...(authorization.budgetId === null ? {} : { budgetId: authorization.budgetId }) },
    ...(input.category === undefined ? {} : { commitmentCategory: input.category }),
  })
}

function withinPeriod(period: FinancialPlanningPeriod, date: GameDate): boolean {
  return compareGameDates(date, period.startsOn) >= 0 && compareGameDates(date, period.endsOn) <= 0
}

function overlapsPeriod(left: FinancialPlanningPeriod, right: FinancialPlanningPeriod): boolean {
  return compareGameDates(left.startsOn, right.endsOn) <= 0 && compareGameDates(right.startsOn, left.endsOn) <= 0
}
