import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  getContractFinancialSchedule,
  getOrganizationFinanceAccounts,
  materializeContractFinanceForDate,
  materializeDebtFinanceForDate,
  materializeOperatingCostsForDate,
  materializeRevenueForDate,
  organizationFinanceAccountId,
  ORGANIZATION_FINANCE_ACCOUNT_ROLES,
  settleDuePayableBatchForDate,
  type DuePayableSettlementResult,
  type DuePayableSettlementStatus,
} from '@/domain/finance'
import { financeFiscalPeriodsOf } from '@/domain/finance/FinanceFoundation'
import type { FiscalPeriodId, OrganizationId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

/**
 * BS16I/BS16J — the single canonical daily Finance lifecycle processor.
 *
 * It processes only economic facts whose source already exists in the world: contracts (shipped careers have
 * them), plus revenue, operating cost or debt engines strictly when the world declares the corresponding
 * source. It never creates a source to have something to process, never invents an opening position and never
 * funds a club.
 *
 * Payroll is the mandatory shipped producer: a contract's due schedule entry becomes a canonical commitment,
 * expense recognition, payable and ledger posting on its own effective date. A club can legitimately hold zero
 * cash, so the result is an outstanding obligation — cash is untouched and the funding problem stays visible
 * instead of being secretly solved.
 *
 * BS16J adds the canonical Treasury step last: after every legitimate date-D economic materialization, the
 * Organization's due payable batch is settled through the canonical batch policy, and only when the whole batch
 * is fundable by the cash its ledger derives.
 *
 * Replay protection comes from the Finance facts themselves (deterministic event, artifact and settlement ids
 * keyed by their canonical source), so processing a date twice is a no-op and no coarse "last processed date"
 * marker is introduced.
 */
export type ClubFinanceOrganizationStatus =
  | 'MATERIALIZED'
  | 'ALREADY_PROCESSED'
  | 'NO_DUE_FACTS'
  | 'FINANCE_PROFILE_UNAVAILABLE'
  | 'FINANCE_ACCOUNTS_UNAVAILABLE'
  | 'REJECTED'

export interface ClubFinanceOrganizationResult {
  readonly organizationId: OrganizationId
  readonly currencyCode: string | null
  readonly fiscalPeriodId: FiscalPeriodId | null
  readonly status: ClubFinanceOrganizationStatus
  readonly payrollOccurrences: number
  readonly operatingCostOccurrences: number
  readonly revenueOccurrences: number
  readonly debtOccurrences: number
  readonly materializedMinorUnits: number
  readonly reason: string | null
  /** BS16J Treasury outcome; `null` when settlement could not be evaluated for this Organization. */
  readonly treasury: DuePayableSettlementResult | null
}

export interface ClubFinanceDiagnostic {
  readonly code: string
  readonly message: string
  readonly sourceId?: string
}

/**
 * BS16J date-level Treasury summary: the whole-date rollup of the per-Organization due-payable batch settlement.
 * `BLOCKED` dominates (a batch that could not be applied must stay visible), then `SETTLED`, then the
 * insufficient-liquidity case, then a day with nothing due. Cash and gap totals only include Organizations whose
 * batch was actually evaluated, because a day with nothing due never reads the ledger.
 */
export interface ClubFinanceTreasurySummary {
  readonly status: DuePayableSettlementStatus
  readonly eligiblePayableCount: number
  readonly totalDueMinorUnits: number
  readonly availableCashMinorUnits: number
  readonly fundingGapMinorUnits: number
  readonly settledCount: number
  readonly settledMinorUnits: number
}

export interface ClubFinanceDateResult {
  readonly date: GameDate
  readonly organizations: readonly ClubFinanceOrganizationResult[]
  readonly diagnostics: readonly ClubFinanceDiagnostic[]
  readonly treasury: ClubFinanceTreasurySummary
}

export interface ClubFinanceApplication {
  readonly world: GameWorld
  readonly result: ClubFinanceDateResult
}

function financeBearingOrganizationIds(world: GameWorld): readonly OrganizationId[] {
  return [...new Set(Object.values(world.teams).map((team) => team.organizationId))].sort((left, right) => String(left).localeCompare(String(right)))
}

function fiscalPeriodIdForDate(world: GameWorld, organizationId: OrganizationId, date: GameDate): FiscalPeriodId | null {
  const covering = financeFiscalPeriodsOf(world, organizationId).filter((period) => compareGameDates(date, period.startsOn) >= 0 && compareGameDates(date, period.endsOn) <= 0)
  return covering.length === 0 ? null : covering[covering.length - 1]!.id
}

/**
 * Processes one GameDate for every finance-bearing Organization, deterministically ordered by organization id.
 * The returned world is the identical instance when nothing was due, so a phase that materializes nothing is
 * free to run daily and one organization's failure can never corrupt another.
 */
export function processClubFinanceForDate(world: GameWorld, gameDate: GameDate | string = world.currentDate): ClubFinanceApplication {
  const date = parseGameDate(gameDate)
  let current = world
  const organizations: ClubFinanceOrganizationResult[] = []
  const diagnostics: ClubFinanceDiagnostic[] = []
  const payrollAnniversaries = payrollAnniversaryIndex(world)
  const dateMonthDay = date.slice(5)

  for (const organizationId of financeBearingOrganizationIds(world)) {
    const profile = current.organizationFinancialProfilesById[organizationId]
    if (profile === undefined) {
      organizations.push(result(organizationId, null, null, 'FINANCE_PROFILE_UNAVAILABLE', zeroOccurrences(), 0, 'Organization has no canonical finance profile, so no Finance fact can be recorded for it.'))
      continue
    }
    const currencyCode = String(profile.baseCurrencyCode)
    const fiscalPeriodId = fiscalPeriodIdForDate(current, organizationId, date)
    const accounts = tryOrganizationFinanceAccounts(current, organizationId, currencyCode)
    if (accounts === null) {
      organizations.push(result(organizationId, currencyCode, fiscalPeriodId, 'FINANCE_ACCOUNTS_UNAVAILABLE', zeroOccurrences(), 0, 'Canonical account catalog is incomplete for this organization.'))
      continue
    }

    const occurrences = zeroOccurrences()
    let materialized = 0
    let anyAccepted = false
    let anyAlreadyProcessed = false

    // 1. Contract payroll: the shipped producer whose source (contracts) already exists in every career.
    // A contract's schedule entries are dated at the anniversary of its term start, so an organization none of
    // whose contracts reaches an anniversary today has no due payroll: that is a cheap early-out over the
    // canonical dates (the actual dates always come from the schedule below), which keeps the daily phase free
    // on ordinary days. February 29 starts are always treated as possible because calendar-year addition can
    // normalize the day.
    const payrollPossible = payrollAnniversaries.leapDayOrganizations.has(String(organizationId)) || (payrollAnniversaries.byOrganization.get(String(organizationId))?.has(dateMonthDay) ?? false)
    const duePayroll = payrollPossible
      ? getContractFinancialSchedule(current, { organizationId, currencyCode, includeConditional: true }).filter((entry) => entry.effectiveOn === date && entry.compensationStatus === 'GUARANTEED')
      : []
    if (duePayroll.length > 0) {
      const payroll = materializeContractFinanceForDate(current, date, {
        organizationId,
        currencyCode,
        includeConditional: true,
        dueDatePolicy: 'ON_RECOGNITION',
        ledger: { offsetAccountId: accounts.payableControl.id, resultAccountId: accounts.expenseOperating.id },
      })
      if (payroll.status === 'rejected') {
        const reason = payroll.error ?? 'Contract payroll materialization was rejected.'
        diagnostics.push({ code: 'CONTRACT_PAYROLL_REJECTED', message: reason, sourceId: String(organizationId) })
        organizations.push(result(organizationId, currencyCode, fiscalPeriodId, 'REJECTED', zeroOccurrences(), 0, reason))
        continue
      }
      occurrences.payroll = duePayroll.length
      if (payroll.status === 'accepted') anyAccepted = true
      else anyAlreadyProcessed = true
      materialized += duePayroll.reduce((sum, entry) => sum + entry.amount.minorUnits, 0)
      current = payroll.world
      for (const entry of duePayroll) {
        diagnostics.push({ code: 'CONTRACT_PAYROLL_DUE', message: `Guaranteed ${entry.category === 'STAFF_SALARY' ? 'staff' : 'player'} payroll of ${entry.amount.minorUnits} ${entry.amount.currencyCode} is due for contract ${entry.contractId}.`, sourceId: String(entry.id) })
      }
    }

    // 2-4. Operating cost, revenue and debt: only when the world actually declares such a source, so a missing
    // authority performs zero work instead of being manufactured here.
    const operatingCost = runWhenSourcesExist(current, Object.values(current.operatingCostSourcesById).some((source) => String(source.organizationId) === String(organizationId)), () => materializeOperatingCostsForDate(current, date, {
      organizationId,
      currencyCode,
      ledger: { offsetAccountId: accounts.payableControl.id, resultAccountId: accounts.expenseOperating.id },
    }))
    if (operatingCost !== null) {
      if (operatingCost.status === 'rejected') diagnostics.push({ code: 'OPERATING_COST_REJECTED', message: operatingCost.error ?? 'Operating cost materialization was rejected.', sourceId: String(organizationId) })
      else {
        occurrences.operatingCost = operatingCost.entries.length
        if (operatingCost.status === 'accepted') anyAccepted = true
        else if (operatingCost.entries.length > 0) anyAlreadyProcessed = true
        current = operatingCost.world
      }
    }

    const revenue = runWhenSourcesExist(current, Object.values(current.revenueSourcesById).some((source) => String(source.organizationId) === String(organizationId) && source.status === 'ACTIVE'), () => materializeRevenueForDate(current, date, {
      organizationId,
      currencyCode,
      ledger: { offsetAccountId: accounts.receivableControl.id, resultAccountId: accounts.revenueOperating.id },
    }))
    if (revenue !== null) {
      if (revenue.status === 'rejected') diagnostics.push({ code: 'REVENUE_REJECTED', message: revenue.error ?? 'Revenue materialization was rejected.', sourceId: String(organizationId) })
      else {
        occurrences.revenue = revenue.entries.length
        if (revenue.status === 'accepted') anyAccepted = true
        else if (revenue.entries.length > 0) anyAlreadyProcessed = true
        current = revenue.world
      }
    }

    const debt = runWhenSourcesExist(current, Object.values(current.debtInstrumentsById).some((instrument) => String(instrument.organizationId) === String(organizationId) && instrument.status === 'ACTIVE'), () => materializeDebtFinanceForDate(current, date, {
      organizationId,
      currencyCode,
      ledger: {
        cashAccountId: accounts.cashOperating.id,
        debtLiabilityAccountId: accounts.debtLiability.id,
        interestPayableAccountId: accounts.payableControl.id,
        interestExpenseAccountId: accounts.expenseOperating.id,
      },
    }))
    if (debt !== null) {
      if (debt.status === 'rejected') diagnostics.push({ code: 'DEBT_REJECTED', message: debt.error ?? 'Debt materialization was rejected.', sourceId: String(organizationId) })
      else {
        occurrences.debt = debt.entries.length
        if (debt.status === 'accepted') anyAccepted = true
        else if (debt.entries.length > 0) anyAlreadyProcessed = true
        current = debt.world
      }
    }

    // 5. Treasury (BS16J): settle the Organization's due payable batch, and only when the whole batch is
    // fundable by the cash its own ledger derives. It runs after every legitimate date-D economic
    // materialization above, so same-day revenue, debt drawdown or receipts are real liquidity by now.
    // There is no creditor priority in BDM, so a partially fundable batch settles nothing automatically.
    const treasury = settleDuePayableBatchForDate(current, {
      organizationId,
      currencyCode,
      date,
      cashAccountId: accounts.cashOperating.id,
      payableAccountId: accounts.payableControl.id,
    })
    current = treasury.world
    if (treasury.result.status === 'SETTLED') diagnostics.push({ code: 'TREASURY_DUE_BATCH_SETTLED', message: `The complete due payable batch of ${treasury.result.settledMinorUnits} ${currencyCode} settled across ${treasury.result.settledCount} payable(s).`, sourceId: String(organizationId) })
    else if (treasury.result.status === 'INSUFFICIENT_LIQUIDITY_FOR_DUE_PAYABLES') diagnostics.push({ code: 'INSUFFICIENT_LIQUIDITY_FOR_DUE_PAYABLES', message: treasury.result.reason ?? 'Due payables are not fully covered by cash, so none is settled automatically.', sourceId: String(organizationId) })
    else if (treasury.result.status === 'BLOCKED') diagnostics.push({ code: 'TREASURY_SETTLEMENT_BLOCKED', message: treasury.result.reason ?? 'The due payable batch could not be settled.', sourceId: String(organizationId) })
    if (treasury.result.ineligibleCurrencyPayableCount > 0) diagnostics.push({ code: 'TREASURY_CURRENCY_CONFLICT', message: `${treasury.result.ineligibleCurrencyPayableCount} due payable(s) are in another currency and were neither converted nor settled.`, sourceId: String(organizationId) })

    const dueOccurrences = occurrences.payroll + occurrences.operatingCost + occurrences.revenue + occurrences.debt
    const status: ClubFinanceOrganizationStatus = anyAccepted ? 'MATERIALIZED' : dueOccurrences > 0 && anyAlreadyProcessed ? 'ALREADY_PROCESSED' : 'NO_DUE_FACTS'
    organizations.push(result(organizationId, currencyCode, fiscalPeriodId, status, occurrences, materialized, null, treasury.result))
  }

  const treasuryResults = organizations.flatMap((entry) => entry.treasury === null ? [] : [entry.treasury])
  const treasurySummary: ClubFinanceTreasurySummary = Object.freeze({
    status: summarizeTreasuryStatus(treasuryResults),
    eligiblePayableCount: treasuryResults.reduce((sum, entry) => sum + entry.eligiblePayableCount, 0),
    totalDueMinorUnits: treasuryResults.reduce((sum, entry) => sum + entry.totalDueMinorUnits, 0),
    availableCashMinorUnits: treasuryResults.reduce((sum, entry) => sum + (entry.availableCashMinorUnits ?? 0), 0),
    fundingGapMinorUnits: treasuryResults.reduce((sum, entry) => sum + (entry.fundingGapMinorUnits ?? 0), 0),
    settledCount: treasuryResults.reduce((sum, entry) => sum + entry.settledCount, 0),
    settledMinorUnits: treasuryResults.reduce((sum, entry) => sum + entry.settledMinorUnits, 0),
  })
  return Object.freeze({
    world: current,
    result: Object.freeze({ date, organizations: Object.freeze(organizations), diagnostics: Object.freeze(diagnostics), treasury: treasurySummary }),
  })
}

interface Occurrences {
  payroll: number
  operatingCost: number
  revenue: number
  debt: number
}

interface PayrollAnniversaryIndex {
  /** Organization id → the set of `MM-DD` dates on which one of its contracts reaches a schedule boundary. */
  readonly byOrganization: ReadonlyMap<string, ReadonlySet<string>>
  readonly leapDayOrganizations: ReadonlySet<string>
}

function payrollAnniversaryIndex(world: GameWorld): PayrollAnniversaryIndex {
  const byOrganization = new Map<string, Set<string>>()
  const leapDayOrganizations = new Set<string>()
  const record = (teamId: string, startsOn: string): void => {
    const organizationId = world.teams[teamId as never]?.organizationId
    if (organizationId === undefined) return
    const key = String(organizationId)
    const monthDay = startsOn.slice(5)
    const existing = byOrganization.get(key)
    if (existing === undefined) byOrganization.set(key, new Set([monthDay]))
    else existing.add(monthDay)
    if (monthDay === '02-29') leapDayOrganizations.add(key)
  }
  for (const contract of Object.values(world.contractsById)) record(String(contract.teamId), String(contract.term.startsOn))
  for (const contract of Object.values(world.staffContractsById)) record(String(contract.teamId), String(contract.term.startsOn))
  return Object.freeze({ byOrganization, leapDayOrganizations })
}

function zeroOccurrences(): Occurrences {
  return { payroll: 0, operatingCost: 0, revenue: 0, debt: 0 }
}

function result(organizationId: OrganizationId, currencyCode: string | null, fiscalPeriodId: FiscalPeriodId | null, status: ClubFinanceOrganizationStatus, occurrences: Occurrences, materializedMinorUnits: number, reason: string | null, treasury: DuePayableSettlementResult | null = null): ClubFinanceOrganizationResult {
  return Object.freeze({
    organizationId,
    currencyCode,
    fiscalPeriodId,
    status,
    payrollOccurrences: occurrences.payroll,
    operatingCostOccurrences: occurrences.operatingCost,
    revenueOccurrences: occurrences.revenue,
    debtOccurrences: occurrences.debt,
    materializedMinorUnits,
    reason,
    treasury,
  })
}

/** `BLOCKED` dominates a settled or insufficient day, so an unapplied batch can never be hidden by another Organization. */
function summarizeTreasuryStatus(results: readonly DuePayableSettlementResult[]): DuePayableSettlementStatus {
  if (results.some((entry) => entry.status === 'BLOCKED')) return 'BLOCKED'
  if (results.some((entry) => entry.status === 'SETTLED')) return 'SETTLED'
  if (results.some((entry) => entry.status === 'INSUFFICIENT_LIQUIDITY_FOR_DUE_PAYABLES')) return 'INSUFFICIENT_LIQUIDITY_FOR_DUE_PAYABLES'
  return 'NO_DUE_PAYABLES'
}

function tryOrganizationFinanceAccounts(world: GameWorld, organizationId: OrganizationId, currencyCode: string): ReturnType<typeof getOrganizationFinanceAccounts> | null {
  // Existence is checked before resolving, so an incomplete catalog never relies on catching an exception in
  // the daily loop.
  const complete = ORGANIZATION_FINANCE_ACCOUNT_ROLES.every((role) => world.financialAccountsById[organizationFinanceAccountId(organizationId, currencyCode, role)] !== undefined)
  if (!complete) return null
  try {
    return getOrganizationFinanceAccounts(world, organizationId, currencyCode)
  } catch {
    return null
  }
}

interface MaterializationOutcome {
  readonly status: 'accepted' | 'alreadyProcessed' | 'rejected'
  readonly world: GameWorld
  readonly entries: readonly unknown[]
  readonly error?: string
}

/** A source-backed engine runs only when the world declares at least one source for that organization. */
function runWhenSourcesExist(world: GameWorld, hasSource: boolean, execute: () => MaterializationOutcome): MaterializationOutcome | null {
  if (!hasSource) return null
  try {
    return execute()
  } catch (error) {
    return { status: 'rejected', world, entries: [], error: error instanceof Error ? error.message : 'Finance materialization failed' }
  }
}

/** Convenience seam: the world after one date of Finance lifecycle processing. */
export function advanceClubFinanceForDate(world: GameWorld, gameDate: GameDate | string = world.currentDate): GameWorld {
  return processClubFinanceForDate(world, gameDate).world
}
