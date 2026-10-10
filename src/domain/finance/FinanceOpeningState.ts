import { parseGameDate, type GameDate } from '@/domain/date'
import { financialTransactionIdFromString, organizationIdFromString, type FinancialTransactionId, type OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getCashBalancesByCurrency } from './CashFlowQueries'
import { getOrganizationFinanceAccounts } from './FinanceFoundation'
import { createCurrencyCode, createFinancialTransaction, type FinancialTransaction } from './FinancialLedger'

/**
 * BS16H — canonical opening economic state.
 *
 * A club only gets cash when a real economic fact explains where it came from. Budgets are permission, not
 * money: `TeamFinances.playerSalaryBudget` / `staffSalaryBudget` and an APPROVED `FinancialBudget` never become
 * liquidity. This module is the only place a pre-career economic position may be materialized, and its source
 * contract requires the caller to state the counterpart of the cash it posts (owner capital, retained net
 * assets, or a liability), so accounting history is never fabricated to create money.
 *
 * The audit behind it found NO shipped authority that represents a club's opening economic position: the
 * prototype worlds, the ACB test career, the World DB Spain bootstrap, the NBA-like and WNBA-like ecosystems and
 * every legacy save version carry budgets, ownership percentages and rules — never a balance. `TeamFinances` has
 * exactly two budget pools, the World DB bootstrap slice has no financial field, and ownership rows carry a
 * percentage without any amount. Shipped organizations therefore stay at zero cash with an explicit
 * `OPENING_ECONOMIC_STATE_UNAVAILABLE` report, which is truthful, and a legitimate source can be supplied
 * explicitly without any change to this authority.
 */
export type OpeningEconomicCounterpartKind = 'OWNER_CAPITAL' | 'RETAINED_NET_ASSETS' | 'LIABILITY'

/**
 * `GAME_BALANCE_PRESET` is a versioned video-game parameter set (BDM_GAME_BALANCE_V1), used only when no documented or
 * canonical source of an opening balance exists. It is labeled as such in the posting's provenance; it is never a
 * claim about a real balance sheet and never replaces a `WORLD_DB`/`OWNERSHIP` source.
 */
export type OpeningEconomicStateSourceAuthority = 'WORLD_DB' | 'OWNERSHIP' | 'GOVERNANCE' | 'LEGACY_SAVE' | 'GAME_BALANCE_PRESET'

export interface OpeningEconomicStateSource {
  readonly sourceAuthority: OpeningEconomicStateSourceAuthority
  readonly sourceEntityId: string
  readonly organizationId: OrganizationId | string
  readonly currencyCode: string
  /** The date the position is effective from; a career/Finance date, never a wall-clock date. */
  readonly effectiveOn: GameDate | string
  /** Liquid asset the source represents, in canonical minor units. */
  readonly cashMinorUnits: number
  readonly counterpartKind: OpeningEconomicCounterpartKind
  /** Owner identity for `OWNER_CAPITAL`, lender identity for `LIABILITY`; unused for retained net assets. */
  readonly counterpartId: string | null
}

export type OpeningEconomicStateStatus =
  | 'MATERIALIZED'
  | 'ALREADY_MATERIALIZED'
  | 'OPENING_ECONOMIC_STATE_UNAVAILABLE'
  | 'FINANCE_PROFILE_UNAVAILABLE'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_OPENING_AMOUNT'
  | 'COUNTERPART_UNAVAILABLE'
  | 'EXISTING_FINANCE_HISTORY_PRESERVED'

export interface OpeningEconomicStateResult {
  readonly status: OpeningEconomicStateStatus
  readonly world: GameWorld
  readonly transactionId: FinancialTransactionId | null
}

export const OPENING_ECONOMIC_STATE_PROVENANCE_KIND = 'OPENING_ECONOMIC_STATE'
/** The canonical transaction type an opening position is posted with; it exists in the ledger already. */
export const OPENING_ECONOMIC_STATE_TRANSACTION_TYPE = 'OPENING_BALANCE'

/**
 * Source classification of every shipped candidate the audit inspected. It is data rather than prose so the
 * classification is testable, and `materialized` is false for every entry: nothing shipped may create money.
 */
export type OpeningEconomicSourceClass =
  | 'REAL_OPENING_BALANCE_AUTHORITY'
  | 'REVENUE_AUTHORITY'
  | 'CAPITAL_FUNDING_AUTHORITY'
  | 'DEBT_AUTHORITY'
  | 'SPENDING_AUTHORIZATION_ONLY'
  | 'INSUFFICIENT_SEMANTICS'

export interface ShippedOpeningSourceClassification {
  readonly source: string
  readonly meaning: string
  readonly classification: OpeningEconomicSourceClass
  readonly materialized: boolean
}

export const SHIPPED_OPENING_SOURCE_CLASSIFICATION: readonly ShippedOpeningSourceClassification[] = Object.freeze([
  Object.freeze({ source: 'TeamFinances.playerSalaryBudget', meaning: 'Permission to spend on player salaries for the season; a standing budget, not a balance', classification: 'SPENDING_AUTHORIZATION_ONLY' as const, materialized: false }),
  Object.freeze({ source: 'TeamFinances.staffSalaryBudget', meaning: 'Permission to spend on staff salaries for the season; a standing budget, not a balance', classification: 'SPENDING_AUTHORIZATION_ONLY' as const, materialized: false }),
  Object.freeze({ source: 'FinancialBudget (APPROVED)', meaning: 'Authorization for a category and period', classification: 'SPENDING_AUTHORIZATION_ONLY' as const, materialized: false }),
  Object.freeze({ source: 'ACB_2026_27_TEAMS', meaning: 'Club names, codes, head coaches and rosters; the shipped ACB data carries no financial field at all', classification: 'INSUFFICIENT_SEMANTICS' as const, materialized: false }),
  Object.freeze({ source: 'WorldDbGameBootstrapSliceV1', meaning: 'Countries, ecosystem, competition, season, organizations, sections, teams, persons, players, staff and matches; no balance, cash, equity or debt amount', classification: 'INSUFFICIENT_SEMANTICS' as const, materialized: false }),
  Object.freeze({ source: 'WorldDbGameBootstrapOrganizationOwnershipV1', meaning: 'Ownership percentage only; a share of a club whose value and capital amounts are not represented', classification: 'INSUFFICIENT_SEMANTICS' as const, materialized: false }),
  Object.freeze({ source: 'WorldDbGameBootstrapOrganizationInvestorInterestV1', meaning: 'Investor interest type and status without any amount', classification: 'INSUFFICIENT_SEMANTICS' as const, materialized: false }),
  Object.freeze({ source: 'World DB league/team budget field', meaning: 'League-published club budget carry-over; an authorization figure, not a derived asset balance', classification: 'SPENDING_AUTHORIZATION_ONLY' as const, materialized: false }),
  Object.freeze({ source: 'GameWorldSaveV1/V2/V3 teamFinances', meaning: 'Legacy saves persist the two budget pools only; V1 back-fills staffSalaryBudget from the player pool', classification: 'SPENDING_AUTHORIZATION_ONLY' as const, materialized: false }),
  Object.freeze({ source: 'TradeRules.cashConsideration.maximumAmount', meaning: 'A trade rule ceiling, not a balance', classification: 'SPENDING_AUTHORIZATION_ONLY' as const, materialized: false }),
  Object.freeze({ source: 'CoachFinanceProfile', meaning: 'Personal wealth of a coach/person; using it as club cash would fabricate an owner/coach contribution', classification: 'INSUFFICIENT_SEMANTICS' as const, materialized: false }),
  Object.freeze({ source: 'Contract/roster payroll values', meaning: 'Obligations and roster valuation, not liquid assets', classification: 'INSUFFICIENT_SEMANTICS' as const, materialized: false }),
])

/** Deterministic provenance identity: replay of the same source can never post a second opening fact. */
export function openingEconomicStateTransactionId(source: OpeningEconomicStateSource): FinancialTransactionId {
  const organizationId = organizationIdFromString(source.organizationId)
  return financialTransactionIdFromString(`finance:opening-economic-state:${organizationId}:${source.sourceAuthority}:${source.sourceEntityId}`)
}

/** The organization's opening economic fact, detected by provenance rather than by a non-zero cash balance. */
export function findOrganizationOpeningEconomicState(world: GameWorld, organizationId: OrganizationId | string): FinancialTransaction | undefined {
  const organization = String(organizationId)
  return Object.values(world.financialTransactionsById)
    .filter((transaction) => String(transaction.organizationId) === organization && transaction.provenance.kind === OPENING_ECONOMIC_STATE_PROVENANCE_KIND)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0]
}

function hasOrganizationLedgerHistory(world: GameWorld, organizationId: OrganizationId | string): boolean {
  const organization = String(organizationId)
  return Object.values(world.financialTransactionsById).some((transaction) => String(transaction.organizationId) === organization)
}

function insufficient(status: OpeningEconomicStateStatus, world: GameWorld): OpeningEconomicStateResult {
  return Object.freeze({ status, world, transactionId: null })
}

/**
 * Materializes one organization's opening economic position as a balanced double-entry posting: cash is debited
 * and its legitimate counterpart is credited. It never mutates a cash field, never invents a counterpart, and
 * never seeds an opening position into an organization that already has canonical ledger history.
 */
export function materializeOrganizationOpeningEconomicState(world: GameWorld, source: OpeningEconomicStateSource): OpeningEconomicStateResult {
  const organizationId = organizationIdFromString(source.organizationId)
  const transactionId = openingEconomicStateTransactionId(source)
  if (world.financialTransactionsById[transactionId] !== undefined) return Object.freeze({ status: 'ALREADY_MATERIALIZED' as const, world, transactionId })

  const profile = world.organizationFinancialProfilesById[organizationId]
  if (profile === undefined) return insufficient('FINANCE_PROFILE_UNAVAILABLE', world)
  if (String(profile.baseCurrencyCode) !== String(createCurrencyCode(source.currencyCode))) return insufficient('CURRENCY_MISMATCH', world)
  if (!Number.isSafeInteger(source.cashMinorUnits) || source.cashMinorUnits <= 0) return insufficient('INVALID_OPENING_AMOUNT', world)
  if (source.counterpartKind !== 'RETAINED_NET_ASSETS' && (source.counterpartId === null || source.counterpartId.trim().length === 0)) return insufficient('COUNTERPART_UNAVAILABLE', world)

  // Existing canonical economic history always wins: a club can legitimately be at zero cash, and a career that
  // already has ledger facts is never re-seeded with an opening position.
  const existingOpening = findOrganizationOpeningEconomicState(world, organizationId)
  if (existingOpening !== undefined) return Object.freeze({ status: 'ALREADY_MATERIALIZED' as const, world, transactionId: existingOpening.id })
  if (hasOrganizationLedgerHistory(world, organizationId)) return insufficient('EXISTING_FINANCE_HISTORY_PRESERVED', world)

  const accounts = getOrganizationFinanceAccounts(world, organizationId, source.currencyCode)
  const counterpartAccountId = source.counterpartKind === 'LIABILITY' ? accounts.debtLiability.id : accounts.equityControl.id
  const amount = Object.freeze({ currencyCode: createCurrencyCode(source.currencyCode), minorUnits: source.cashMinorUnits })
  const transaction = createFinancialTransaction({
    id: transactionId,
    organizationId,
    effectiveOn: parseGameDate(source.effectiveOn),
    transactionType: OPENING_ECONOMIC_STATE_TRANSACTION_TYPE,
    amount,
    postings: [
      { accountId: accounts.cashOperating.id, direction: 'DEBIT', amount },
      { accountId: counterpartAccountId, direction: 'CREDIT', amount },
    ],
    provenance: {
      kind: OPENING_ECONOMIC_STATE_PROVENANCE_KIND,
      id: `${source.sourceAuthority}:${source.sourceEntityId}`,
      description: `${source.counterpartKind} opening economic position reported by ${source.sourceAuthority}`,
    },
    ...(source.counterpartId === null ? {} : { dimensions: { reference: { kind: source.counterpartKind, id: source.counterpartId } } }),
  })
  const next = updateGameWorld(world, { financialTransactions: [...Object.values(world.financialTransactionsById), transaction] })
  return Object.freeze({ status: 'MATERIALIZED' as const, world: next, transactionId })
}

/** Materializes every supplied source once, in a deterministic order, without duplicating an existing fact. */
export function ensureOpeningEconomicState(world: GameWorld, sources: readonly OpeningEconomicStateSource[]): { readonly world: GameWorld; readonly results: readonly OpeningEconomicStateResult[] } {
  let current = world
  const results: OpeningEconomicStateResult[] = []
  for (const source of [...sources].sort((left, right) => String(openingEconomicStateTransactionId(left)).localeCompare(String(openingEconomicStateTransactionId(right))))) {
    const result = materializeOrganizationOpeningEconomicState(current, source)
    if (result.world !== current && result.status === 'MATERIALIZED') current = result.world
    results.push(result)
  }
  return Object.freeze({ world: current, results: Object.freeze(results) })
}

/** Per-organization opening economic state, derived from canonical facts and never from a cash guess. */
export function getOrganizationOpeningEconomicStateStatus(world: GameWorld, organizationId: OrganizationId | string): OpeningEconomicStateStatus {
  if (world.organizationFinancialProfilesById[organizationIdFromString(organizationId)] === undefined) return 'FINANCE_PROFILE_UNAVAILABLE'
  const existing = findOrganizationOpeningEconomicState(world, organizationId)
  if (existing !== undefined) return 'ALREADY_MATERIALIZED'
  return hasOrganizationLedgerHistory(world, organizationId) ? 'EXISTING_FINANCE_HISTORY_PRESERVED' : 'OPENING_ECONOMIC_STATE_UNAVAILABLE'
}

export interface OrganizationOpeningEconomicStateReport {
  readonly organizationId: OrganizationId
  readonly status: OpeningEconomicStateStatus
  readonly cashMinorUnits: number
  readonly transactionId: FinancialTransactionId | null
}

/**
 * The audited answer for shipped careers: no shipped ecosystem declares an opening economic source, so every
 * organization reports `OPENING_ECONOMIC_STATE_UNAVAILABLE` and keeps exactly the cash its ledger derives.
 */
export function getOpeningEconomicStateReport(world: GameWorld, organizationIds: readonly OrganizationId[], asOfDate: GameDate | string = world.currentDate): readonly OrganizationOpeningEconomicStateReport[] {
  const asOf = parseGameDate(asOfDate)
  return Object.freeze(organizationIds.map((organizationId) => {
    const existing = findOrganizationOpeningEconomicState(world, organizationId)
    return Object.freeze({
      organizationId,
      status: getOrganizationOpeningEconomicStateStatus(world, organizationId),
      cashMinorUnits: getCashBalancesByCurrency(world, organizationId, asOf).reduce((sum, row) => sum + row.totalCashMinorUnits, 0),
      transactionId: existing === undefined ? null : existing.id,
    })
  }))
}
