/**
 * BS16B — canonical Organization finance foundation.
 *
 * Provisions the minimum Finance V2 state an Organization needs to exist in the canonical
 * accounting model: one `OrganizationFinancialProfile`, one deterministic account catalog, and one
 * opening `FiscalPeriod`. It creates no money: accounts are containers, and cash stays zero until a
 * canonical posting establishes a balance.
 *
 * Provisioning is pure and idempotent. Every id is derived from (Organization, currency, role) or
 * (Organization, season), so calling it twice — including after Save V4 load — is a no-op that
 * returns the identical world reference. Existing Finance V2 facts are never overwritten: a
 * conflicting profile, account, or period is rejected instead.
 *
 * The account catalog is derived from what the existing Finance V2 engines actually require (see
 * `EconomicEventAdapters`, `Treasury`, `Recognition`, `DebtEngine`): cash, receivable control,
 * payable control, equity, revenue, expense, and debt liability. No additional accounting categories
 * are invented, and mapping is semantic (deterministic canonical ids), never label matching.
 *
 * Currency is an explicit policy input. The BDM world model has no canonical per-Organization
 * currency (Organization/Team/Country/Ecosystem carry none), so callers must supply one explicitly;
 * once provisioned, `OrganizationFinancialProfile.baseCurrencyCode` is the Organization's canonical
 * Finance V2 currency.
 */

import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  financialAccountIdFromString,
  fiscalPeriodIdFromString,
  organizationIdFromString,
  type FinancialAccountId,
  type FiscalPeriodId,
  type OrganizationId,
} from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { DebtLedgerMapping } from './DebtEngine'
import {
  createCurrencyCode,
  createFinancialAccount,
  createFiscalPeriod,
  createOrganizationFinancialProfile,
  type CurrencyCode,
  type FinancialAccount,
  type FiscalPeriod,
  type OrganizationFinancialProfile,
} from './FinancialLedger'

export const ORGANIZATION_FINANCE_ACCOUNT_ROLES = [
  'CASH_OPERATING',
  'RECEIVABLE_CONTROL',
  'PAYABLE_CONTROL',
  'EQUITY_CONTROL',
  'REVENUE_OPERATING',
  'EXPENSE_OPERATING',
  'DEBT_LIABILITY',
  /** BS16L: the lender-side asset of an in-world Organization→Organization financing (a loan receivable). */
  'LOAN_ASSET',
] as const

export type OrganizationFinanceAccountRole = typeof ORGANIZATION_FINANCE_ACCOUNT_ROLES[number]

/** Canonical account type per role, derived from the account-type checks the existing engines apply. */
const ROLE_ACCOUNT_TYPES: Readonly<Record<OrganizationFinanceAccountRole, string>> = {
  CASH_OPERATING: 'CASH_OPERATING_BANK',
  RECEIVABLE_CONTROL: 'RECEIVABLE',
  PAYABLE_CONTROL: 'PAYABLE',
  EQUITY_CONTROL: 'EQUITY',
  REVENUE_OPERATING: 'REVENUE',
  EXPENSE_OPERATING: 'EXPENSE',
  DEBT_LIABILITY: 'LIABILITY',
  LOAN_ASSET: 'ASSET',
}

const ROLE_ID_SLUGS: Readonly<Record<OrganizationFinanceAccountRole, string>> = {
  CASH_OPERATING: 'cash-operating',
  RECEIVABLE_CONTROL: 'receivable-control',
  PAYABLE_CONTROL: 'payable-control',
  EQUITY_CONTROL: 'equity-control',
  REVENUE_OPERATING: 'revenue-operating',
  EXPENSE_OPERATING: 'expense-operating',
  DEBT_LIABILITY: 'debt-liability',
  LOAN_ASSET: 'loan-asset',
}

const ACCOUNT_ID_PREFIX = 'finance:account:'
const FISCAL_PERIOD_ID_PREFIX = 'finance:fiscal-period:'

export function organizationFinanceAccountId(organizationId: OrganizationId | string, currencyCode: CurrencyCode | string, role: OrganizationFinanceAccountRole): FinancialAccountId {
  const currency = createCurrencyCode(currencyCode)
  return financialAccountIdFromString(`${ACCOUNT_ID_PREFIX}${organizationId}:${currency.toLowerCase()}:${ROLE_ID_SLUGS[role]}`)
}

export function financeFiscalPeriodIdFor(organizationId: OrganizationId | string, fiscalYearStartsOn: GameDate | string): FiscalPeriodId {
  return fiscalPeriodIdFromString(`${FISCAL_PERIOD_ID_PREFIX}${organizationId}:${parseGameDate(fiscalYearStartsOn)}`)
}

/**
 * BS16G canonical fiscal-year rule. A Finance fiscal period is NOT a competition season: it is the fiscal year
 * that contains the effective date, derived from the profile's `fiscalYearStartMonth` and the world's GameDate.
 * Seasons may supply the default starting month as context, but they never own Finance period dates, so a
 * career that starts before its first game still sits inside a valid fiscal period.
 */
export function getFinanceFiscalYearFor(profile: Pick<OrganizationFinancialProfile, 'fiscalYearStartMonth'>, date: GameDate | string): { readonly startsOn: GameDate; readonly endsOn: GameDate; readonly label: string } {
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

/** Every canonical fiscal period of one organization, deterministically ordered. */
export function financeFiscalPeriodsOf(world: GameWorld, organizationId: OrganizationId | string): readonly FiscalPeriod[] {
  return Object.freeze(Object.values(world.fiscalPeriodsById)
    .filter((period) => String(period.organizationId) === String(organizationId))
    .sort((left, right) => compareGameDates(left.startsOn, right.startsOn) || String(left.id).localeCompare(String(right.id))))
}

function fiscalPeriodsOverlap(left: FiscalPeriod, right: Pick<FiscalPeriod, 'startsOn' | 'endsOn'>): boolean {
  return compareGameDates(left.startsOn, right.endsOn) <= 0 && compareGameDates(right.startsOn, left.endsOn) <= 0
}

export interface ParsedOrganizationFinanceAccountId {
  readonly organizationId: OrganizationId
  readonly currencyCode: CurrencyCode
  readonly role: OrganizationFinanceAccountRole
}

/** Returns null for non-canonical ids; throws for ids that claim the canonical prefix but are malformed. */
export function parseOrganizationFinanceAccountId(id: string): ParsedOrganizationFinanceAccountId | null {
  if (!id.startsWith(ACCOUNT_ID_PREFIX)) return null
  const remainder = id.slice(ACCOUNT_ID_PREFIX.length)
  const parts = remainder.split(':')
  if (parts.length < 3) throw new RangeError(`Malformed canonical finance account id: ${id}`)
  const roleSlug = parts[parts.length - 1]!
  const currencyPart = parts[parts.length - 2]!
  const organizationPart = parts.slice(0, parts.length - 2).join(':')
  const role = ORGANIZATION_FINANCE_ACCOUNT_ROLES.find((candidate) => ROLE_ID_SLUGS[candidate] === roleSlug)
  if (role === undefined || organizationPart.length === 0 || !/^[a-z]{3}$/.test(currencyPart)) throw new RangeError(`Malformed canonical finance account id: ${id}`)
  return Object.freeze({ organizationId: organizationIdFromString(organizationPart), currencyCode: createCurrencyCode(currencyPart.toUpperCase()), role })
}

/** Canonical-world guard: an account using a canonical id must match that id's role shape exactly. */
export function assertOrganizationFinanceAccountShape(account: FinancialAccount): void {
  const parsed = parseOrganizationFinanceAccountId(String(account.id))
  if (parsed === null) return
  if (parsed.organizationId !== account.organizationId || parsed.currencyCode !== account.currencyCode || ROLE_ACCOUNT_TYPES[parsed.role] !== account.accountType) throw new RangeError(`Canonical finance account ${account.id} does not match its ${parsed.role} role shape`)
}

/** A finance-bearing Organization is one that owns at least one Team; league/federation bodies own none. */
export function isFinanceBearingOrganization(world: GameWorld, organizationId: OrganizationId | string): boolean {
  const organization = String(organizationId)
  if (world.organizationsById[organization as OrganizationId] === undefined) return false
  return Object.values(world.teams).some((team) => String(team.organizationId) === organization)
}

export function listFinanceBearingOrganizationIds(world: GameWorld): readonly OrganizationId[] {
  return Object.freeze(Object.values(world.organizationsById)
    .map((organization) => organization.id)
    .filter((organizationId) => isFinanceBearingOrganization(world, organizationId))
    .sort((left, right) => String(left).localeCompare(String(right))))
}

export interface OrganizationFinanceProvisioningContext {
  /** Explicit currency policy; the world model carries no canonical Organization currency. */
  readonly currencyCode: string
  /** Effective date the opening fiscal period must contain. Defaults to the world's current date. */
  readonly asOfDate?: GameDate | string
  /** Defaults to the starting month of the current Season, which is context only and never a period date. */
  readonly fiscalYearStartMonth?: number
}

/**
 * Provisions the foundation for one organization: the currency/profile fact, the deterministic account catalog,
 * and the canonical fiscal period of the fiscal year containing the effective date. Season identity is never a
 * period authority, and an existing period that already spans that fiscal year stays the only period authority
 * for it, so no overlapping second period is ever introduced. It creates no money and never overwrites facts.
 */
export function provisionOrganizationFinanceFoundation(world: GameWorld, organizationIdInput: OrganizationId | string, context: OrganizationFinanceProvisioningContext): GameWorld {
  const organizationId = organizationIdFromString(organizationIdInput)
  if (world.organizationsById[organizationId] === undefined) throw new Error(`Unknown Organization ${organizationId}`)
  if (!isFinanceBearingOrganization(world, organizationId)) throw new RangeError(`Organization ${organizationId} is not finance-bearing: it owns no Team`)
  const currencyCode = createCurrencyCode(context.currencyCode)
  const asOfDate = parseGameDate(context.asOfDate ?? world.currentDate)
  const season = world.seasons[world.currentSeasonId]
  const fiscalYearStartMonth = context.fiscalYearStartMonth ?? Number(season?.startDate.slice(5, 7) ?? asOfDate.slice(5, 7))
  const profile = createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: currencyCode, fiscalYearStartMonth })
  const existingProfile = world.organizationFinancialProfilesById[organizationId]
  if (existingProfile !== undefined) {
    if (existingProfile.baseCurrencyCode !== currencyCode) throw new RangeError(`Organization ${organizationId} already has a financial profile in ${existingProfile.baseCurrencyCode}; refusing to overwrite it with ${currencyCode}`)
    if (existingProfile.fiscalYearStartMonth !== fiscalYearStartMonth) throw new RangeError(`Organization ${organizationId} already has a financial profile with fiscalYearStartMonth ${existingProfile.fiscalYearStartMonth}; refusing to overwrite it with ${fiscalYearStartMonth}`)
  }
  const fiscalYear = getFinanceFiscalYearFor(existingProfile ?? profile, asOfDate)
  const expectedAccounts = ORGANIZATION_FINANCE_ACCOUNT_ROLES.map((role) => createFinancialAccount({
    id: organizationFinanceAccountId(organizationId, currencyCode, role),
    organizationId,
    accountType: ROLE_ACCOUNT_TYPES[role],
    currencyCode,
    openedOn: null,
  }))
  const period = createFiscalPeriod({
    id: financeFiscalPeriodIdFor(organizationId, fiscalYear.startsOn),
    organizationId,
    label: fiscalYear.label,
    startsOn: fiscalYear.startsOn,
    endsOn: fiscalYear.endsOn,
    status: 'OPEN',
  })

  const missingAccounts: FinancialAccount[] = []
  for (const account of expectedAccounts) {
    const existing = world.financialAccountsById[account.id]
    if (existing === undefined) {
      missingAccounts.push(account)
      continue
    }
    if (existing.organizationId !== account.organizationId || existing.accountType !== account.accountType || existing.currencyCode !== account.currencyCode) throw new RangeError(`Canonical finance account ${account.id} already exists with a different shape; refusing to overwrite it`)
  }

  const existingPeriods = financeFiscalPeriodsOf(world, organizationId)
  // Identity is (organization, fiscal-year boundary): an existing period that already spans this fiscal year —
  // including a pre-BS16G season-shaped period — stays the single period authority for it.
  const periodAlreadyAuthoritative = existingPeriods.some((item) => String(item.id) === String(period.id) || fiscalPeriodsOverlap(item, period))

  if (existingProfile !== undefined && missingAccounts.length === 0 && periodAlreadyAuthoritative) return world

  return updateGameWorld(world, {
    ...(existingProfile === undefined ? { organizationFinancialProfiles: [...Object.values(world.organizationFinancialProfilesById), profile] } : {}),
    ...(missingAccounts.length === 0 ? {} : { financialAccounts: [...Object.values(world.financialAccountsById), ...missingAccounts] }),
    ...(periodAlreadyAuthoritative ? {} : { fiscalPeriods: [...Object.values(world.fiscalPeriodsById), period] }),
  })
}

export interface OrganizationFinanceAccounts {
  readonly organizationId: OrganizationId
  readonly currencyCode: CurrencyCode
  readonly cashOperating: FinancialAccount
  readonly receivableControl: FinancialAccount
  readonly payableControl: FinancialAccount
  readonly equityControl: FinancialAccount
  readonly revenueOperating: FinancialAccount
  readonly expenseOperating: FinancialAccount
  readonly debtLiability: FinancialAccount
  /** The Organization's own claim on money it lent to another Organization (never converted, never netted). */
  readonly loanAsset: FinancialAccount
}

/** The single semantic mapping authority: resolves the canonical account catalog for an Organization. */
export function getOrganizationFinanceAccounts(world: GameWorld, organizationIdInput: OrganizationId | string, currencyCodeInput?: string): OrganizationFinanceAccounts {
  const organizationId = organizationIdFromString(organizationIdInput)
  const profile = world.organizationFinancialProfilesById[organizationId]
  const currencyCode = currencyCodeInput === undefined
    ? profile?.baseCurrencyCode
    : createCurrencyCode(currencyCodeInput)
  if (currencyCode === undefined) throw new Error(`Organization ${organizationId} has no financial profile; provisionOrganizationFinanceFoundation must run first or an explicit currency must be supplied`)
  const accountFor = (role: OrganizationFinanceAccountRole): FinancialAccount => {
    const account = world.financialAccountsById[organizationFinanceAccountId(organizationId, currencyCode, role)]
    if (account === undefined) throw new Error(`Organization ${organizationId} is missing canonical finance account ${role} in ${currencyCode}; provisionOrganizationFinanceFoundation must run first`)
    assertOrganizationFinanceAccountShape(account)
    return account
  }
  return Object.freeze({
    organizationId,
    currencyCode,
    cashOperating: accountFor('CASH_OPERATING'),
    receivableControl: accountFor('RECEIVABLE_CONTROL'),
    payableControl: accountFor('PAYABLE_CONTROL'),
    equityControl: accountFor('EQUITY_CONTROL'),
    revenueOperating: accountFor('REVENUE_OPERATING'),
    expenseOperating: accountFor('EXPENSE_OPERATING'),
    debtLiability: accountFor('DEBT_LIABILITY'),
    loanAsset: accountFor('LOAN_ASSET'),
  })
}

export function resolveCashAccount(world: GameWorld, organizationId: OrganizationId | string, currencyCode?: string): FinancialAccount {
  return getOrganizationFinanceAccounts(world, organizationId, currencyCode).cashOperating
}

export function resolveCashAccountId(world: GameWorld, organizationId: OrganizationId | string, currencyCode?: string): FinancialAccountId {
  return resolveCashAccount(world, organizationId, currencyCode).id
}

/** Ledger mapping for CF4/CF7 revenue recognition (`EconomicEventAdapterOptions['ledger']`). */
export function resolveRevenueRecognitionAccounts(world: GameWorld, organizationId: OrganizationId | string, currencyCode?: string): { readonly offsetAccountId: FinancialAccountId; readonly resultAccountId: FinancialAccountId } {
  const accounts = getOrganizationFinanceAccounts(world, organizationId, currencyCode)
  return Object.freeze({ offsetAccountId: accounts.receivableControl.id, resultAccountId: accounts.revenueOperating.id })
}

/** Ledger mapping for CF8/CF5 expense recognition and CFI7 facility expenditure (`LedgerAccountMapping` shape). */
export function resolveExpenseRecognitionAccounts(world: GameWorld, organizationId: OrganizationId | string, currencyCode?: string): { readonly offsetAccountId: FinancialAccountId; readonly resultAccountId: FinancialAccountId } {
  const accounts = getOrganizationFinanceAccounts(world, organizationId, currencyCode)
  return Object.freeze({ offsetAccountId: accounts.payableControl.id, resultAccountId: accounts.expenseOperating.id })
}

/** Ledger mapping for authorized owner funding / capital contributions. */
export function resolveOwnerFundingAccounts(world: GameWorld, organizationId: OrganizationId | string, currencyCode?: string): { readonly cashAccountId: FinancialAccountId; readonly offsetAccountId: FinancialAccountId } {
  const accounts = getOrganizationFinanceAccounts(world, organizationId, currencyCode)
  return Object.freeze({ cashAccountId: accounts.cashOperating.id, offsetAccountId: accounts.equityControl.id })
}

/** Ledger mapping for authorized Competition distribution receipts. */
export function resolveCompetitionDistributionReceiptAccounts(world: GameWorld, organizationId: OrganizationId | string, currencyCode?: string): { readonly cashAccountId: FinancialAccountId; readonly offsetAccountId: FinancialAccountId } {
  const accounts = getOrganizationFinanceAccounts(world, organizationId, currencyCode)
  return Object.freeze({ cashAccountId: accounts.cashOperating.id, offsetAccountId: accounts.revenueOperating.id })
}

/** Cash/offset account pair for a CF2 Treasury settlement. */
export function resolveTreasurySettlementAccounts(world: GameWorld, organizationId: OrganizationId | string, obligationKind: 'RECEIVABLE' | 'PAYABLE', currencyCode?: string): { readonly cashAccountId: FinancialAccountId; readonly offsetAccountId: FinancialAccountId } {
  if (obligationKind !== 'RECEIVABLE' && obligationKind !== 'PAYABLE') throw new TypeError('Treasury settlement obligation kind must be RECEIVABLE or PAYABLE')
  const accounts = getOrganizationFinanceAccounts(world, organizationId, currencyCode)
  return Object.freeze({ cashAccountId: accounts.cashOperating.id, offsetAccountId: obligationKind === 'RECEIVABLE' ? accounts.receivableControl.id : accounts.payableControl.id })
}

/** Full CF9 debt ledger mapping, including the interest payable/expense pair. */
export function resolveDebtLedgerMapping(world: GameWorld, organizationId: OrganizationId | string, currencyCode?: string): DebtLedgerMapping {
  const accounts = getOrganizationFinanceAccounts(world, organizationId, currencyCode)
  return Object.freeze({ cashAccountId: accounts.cashOperating.id, debtLiabilityAccountId: accounts.debtLiability.id, interestPayableAccountId: accounts.payableControl.id, interestExpenseAccountId: accounts.expenseOperating.id })
}
