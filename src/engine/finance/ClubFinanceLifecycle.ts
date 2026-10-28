import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { staffFinancialScheduleStartsOn } from '@/domain/staffContract'
import {
  collectDueReceivablesForDate,
  closeFiscalPeriod,
  executeFinancingForDate,
  getContractFinancialSchedule,
  getOrganizationFinanceAccounts,
  materializeContractFinanceForDate,
  materializeDebtFinanceForDate,
  materializeOperatingCostsForDate,
  materializeRevenueForDate,
  mirrorInterOrganizationFinancingForDate,
  organizationFinanceAccountId,
  ORGANIZATION_FINANCE_ACCOUNT_ROLES,
  settleDuePayableBatchForDate,
  type DuePayableSettlementResult,
  type DuePayableSettlementStatus,
  type FinancingExecutionResult,
  type ReceivableCollectionResult,
} from '@/domain/finance'
import { financeFiscalPeriodsOf, ensureFinanceFiscalPeriodForDate } from '@/domain/finance/FinanceFoundation'
import { renewOrganizationAuthorizationForPeriod } from '@/domain/finance/AuthorizationRenewal'
import { isCarryForwardAuthorizationRenewalPolicy } from '@/domain/finance/AuthorizationRenewalPolicy'
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
  /** BS16K-C: receivables collected today because their own source policy declares collection on the due date. */
  readonly collectionOccurrences: number
  readonly collectedMinorUnits: number
  /** BS16L: financing/capital facts executed today, how many were blocked, and the full execution detail. */
  readonly financingOccurrences: number
  readonly financingBlockedCount: number
  readonly financing: FinancingExecutionResult | null
  readonly collection: ReceivableCollectionResult | null
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
  /** BS16K-C: whole-date rollup of source-driven receivable collection. */
  readonly collection: ReceivableCollectionSummary
}

/**
 * BS16K-C date-level collection summary: how much declared-collectible revenue actually became cash today.
 * `BLOCKED` dominates (a collection that could not be applied must stay visible), then `COLLECTED`, then a day
 * with nothing collectible. Totals only count Organizations whose collection was actually evaluated.
 */
export interface ReceivableCollectionSummary {
  readonly status: 'COLLECTED' | 'NOTHING_DUE' | 'BLOCKED'
  readonly evaluatedOrganizations: number
  readonly collectedCount: number
  readonly collectedMinorUnits: number
  readonly policylessDueReceivableCount: number
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
  // BS16L: one pass per processed date builds the only indexes the financing stages need, so no Organization ever
  // scans the world's agreements, drawdown orders or contributions on an ordinary day.
  const financingDueOrganizations = new Set<string>()
  for (const drawdown of Object.values(world.financingDrawdownsById)) if (drawdown.drawnOn === date) financingDueOrganizations.add(String(drawdown.organizationId))
  for (const contribution of Object.values(world.capitalContributionsById)) if (contribution.effectiveOn === date) financingDueOrganizations.add(String(contribution.recipientOrganizationId))
  const inWorldLenderBorrowers = new Set<string>()
  for (const agreement of Object.values(world.financingAgreementsById)) if (agreement.status === 'ACTIVE' && agreement.fundingParty.kind === 'ORGANIZATION') inWorldLenderBorrowers.add(String(agreement.borrowerOrganizationId))
  // BS16N-R: which fiscal periods already carry an authorization. Built once per processed date so the annual
  // rollover check below never rescans every budget for every Organization.
  const authorizedFiscalPeriods = new Set<string>()
  for (const budget of Object.values(world.financialBudgetsById)) authorizedFiscalPeriods.add(`${budget.organizationId}|${budget.fiscalPeriodId ?? ''}`)

  for (const organizationId of financeBearingOrganizationIds(world)) {
    const profile = current.organizationFinancialProfilesById[organizationId]
    if (profile === undefined) {
      organizations.push(result(organizationId, null, null, 'FINANCE_PROFILE_UNAVAILABLE', zeroOccurrences(), 0, 'Organization has no canonical finance profile, so no Finance fact can be recorded for it.'))
      continue
    }
    // The last day has already run its economic facts. Close each ended exercise once,
    // independently of competition seasons, before opening/authorizing its successor.
    for (const period of financeFiscalPeriodsOf(current, organizationId).filter(p => p.status === 'OPEN' && p.endsOn < date && p.endsOn < current.currentDate).sort((a, b) => a.endsOn.localeCompare(b.endsOn) || a.id.localeCompare(b.id))) {
      current = closeFiscalPeriod(current, period.id)
      diagnostics.push({ code: 'FISCAL_PERIOD_CLOSED', message: `Recorded result closed for ${period.label}.`, sourceId: period.id })
    }
    // BS16N-R fiscal rollover, before any economic stage reads the period: the first processed GameDate inside a
    // new fiscal year materializes the Organization's canonical fiscal period exactly once, and materializing a
    // period creates no cash, revenue, expense, authorization, debt or capital. Authorization for the new period
    // is granted only by that Organization's own renewal policy.
    const withFiscalPeriod = ensureFinanceFiscalPeriodForDate(current, organizationId, date)
    if (withFiscalPeriod !== current) current = withFiscalPeriod
    const currencyCode = String(profile.baseCurrencyCode)
    const coveringPeriodId = fiscalPeriodIdForDate(current, organizationId, date)
    if (coveringPeriodId !== null && !authorizedFiscalPeriods.has(`${organizationId}|${coveringPeriodId}`)) {
      const renewalPolicy = current.organizationFinancialProfilesById[organizationId]?.authorizationRenewalPolicy ?? null
      if (isCarryForwardAuthorizationRenewalPolicy(renewalPolicy)) {
        const period = current.fiscalPeriodsById[coveringPeriodId]
        const renewal = renewOrganizationAuthorizationForPeriod(current, {
          organizationId,
          currencyCode,
          fiscalPeriodId: coveringPeriodId,
          period: period === undefined
            ? { startsOn: date, endsOn: date }
            : { startsOn: period.startsOn, endsOn: period.endsOn, label: period.label },
          asOfDate: date,
          policy: renewalPolicy,
        })
        if (renewal.plan.status === 'RENEWED') {
          current = renewal.world
          authorizedFiscalPeriods.add(`${organizationId}|${coveringPeriodId}`)
          diagnostics.push({ code: 'AUTHORIZATION_RENEWED', message: `Fiscal period ${coveringPeriodId} was authorized by carrying forward ${renewal.plan.previousBudgetId ?? 'the previous approved limits'}.`, sourceId: String(organizationId) })
        }
      }
    }
    const fiscalPeriodId = coveringPeriodId
    const accounts = tryOrganizationFinanceAccounts(current, organizationId, currencyCode)
    if (accounts === null) {
      organizations.push(result(organizationId, currencyCode, fiscalPeriodId, 'FINANCE_ACCOUNTS_UNAVAILABLE', zeroOccurrences(), 0, 'Canonical account catalog is incomplete for this organization.'))
      continue
    }

    const occurrences = zeroOccurrences()
    let materialized = 0
    let collectedMinorUnits = 0
    let latestCollection: ReceivableCollectionResult | null = null
    let latestFinancing: FinancingExecutionResult | null = null
    let financingBlockedCount = 0
    let anyAccepted = false
    let anyAlreadyProcessed = false
    let anyCollected = false

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

    // 2-4. Operating cost, revenue and debt: only when the world actually declares such a source (BS17E-A: or an
    // authorized operating cost FACT, which is the same declaration for a one-off obligation), so a missing
    // authority performs zero work instead of being manufactured here.
    const operatingCost = runWhenSourcesExist(current, Object.values(current.operatingCostSourcesById).some((source) => String(source.organizationId) === String(organizationId)) || Object.values(current.operatingCostFactsById).some((fact) => String(fact.organizationId) === String(organizationId)), () => materializeOperatingCostsForDate(current, date, {
      organizationId,
      currencyCode,
      ledger: { offsetAccountId: accounts.payableControl.id, resultAccountId: accounts.expenseOperating.id },
    }))
    if (operatingCost !== null) {
      if (operatingCost.status === 'rejected') diagnostics.push({ code: 'OPERATING_COST_REJECTED', message: operatingCost.error ?? 'Operating cost materialization was rejected.', sourceId: String(organizationId) })
      else {
        occurrences.operatingCost = operatingCost.entries.length
        if (operatingCost.status === 'accepted' && operatingCost.entries.length > 0) anyAccepted = true
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
        if (revenue.status === 'accepted' && revenue.entries.length > 0) anyAccepted = true
        else if (revenue.entries.length > 0) anyAlreadyProcessed = true
        current = revenue.world
      }
    }

    // 4. Source-driven collection (BS16K-C): a receivable becomes cash only when its own source policy says the
    // money arrives on that due date, so a club that owns an approved distribution collects it here — after every
    // legitimate date-D recognition, and before financing, debt service and the Treasury batch below.
    const collectingSources = Object.values(current.revenueSourcesById).some((source) => String(source.organizationId) === String(organizationId) && source.status === 'ACTIVE' && source.collectionPolicy === 'COLLECT_ON_DUE_DATE')
    if (collectingSources) {
      const collection = collectDueReceivablesForDate(current, {
        organizationId,
        currencyCode,
        date,
        cashAccountId: accounts.cashOperating.id,
        receivableAccountId: accounts.receivableControl.id,
      })
      occurrences.collections = collection.result.collectedCount
      collectedMinorUnits += collection.result.collectedMinorUnits
      latestCollection = collection.result
      if (collection.result.status === 'COLLECTED') anyCollected = true
      current = collection.world
      if (collection.result.status === 'COLLECTED') diagnostics.push({ code: 'RECEIVABLE_COLLECTION', message: `${collection.result.collectedMinorUnits} ${currencyCode} collected across ${collection.result.collectedCount} receivable(s) declared collectible by their source policy.`, sourceId: String(organizationId) })
      else if (collection.result.status === 'BLOCKED') diagnostics.push({ code: 'RECEIVABLE_COLLECTION_BLOCKED', message: collection.result.reason ?? 'Receivable collection failed.', sourceId: String(organizationId) })
    }

    // 5. Financing and capital (BS16L): only explicitly declared facts due today are executed — a drawdown order or a
    // capital contribution — and a liquidity shortfall is never a loan request. The stage runs before debt service
    // and before Treasury, so a legitimate same-day drawdown is real liquidity by the time payables are evaluated.
    const hasFinancingDue = financingDueOrganizations.has(String(organizationId))
    if (hasFinancingDue) {
      const financing = executeFinancingForDate(current, { organizationId, date })
      occurrences.financing = financing.result.executedCount
      financingBlockedCount += financing.result.blockedCount
      latestFinancing = financing.result
      if (financing.result.executedCount > 0) anyAccepted = true
      current = financing.world
      for (const entry of financing.result.entries) {
        if (entry.status === 'EXECUTED') diagnostics.push({ code: entry.kind === 'DRAWDOWN' ? 'FINANCING_DRAWDOWN_EXECUTED' : 'CAPITAL_CONTRIBUTION_EXECUTED', message: `${entry.kind === 'DRAWDOWN' ? 'Financing drawdown' : 'Capital contribution'} ${entry.id} of ${entry.amountMinorUnits} ${entry.currencyCode} executed.`, sourceId: entry.id })
        else if (entry.status === 'BLOCKED') diagnostics.push({ code: entry.code ?? 'FINANCING_BLOCKED', message: entry.reason ?? `Financing fact ${entry.id} was blocked.`, sourceId: entry.id })
      }
    }

    // 6. Debt service: the existing CF9 authority owns principal repayment and interest accounting.
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
        if (debt.status === 'accepted' && debt.entries.length > 0) anyAccepted = true
        else if (debt.entries.length > 0) anyAlreadyProcessed = true
        current = debt.world
      }
    }

    // 5. Source-driven collection: the moved stage now runs before financing and debt service (see above). The
    // treasury summary below closes the day.

    // 7. In-world lender counterpart: when the funding party is another Organization, its own cash and loan asset
    // mirror the borrower's financing so world cash is conserved (§11/§32). External funding parties have no
    // in-world ledger, which is exactly why the agreement itself is their provenance.
    const lenderCounterpart = inWorldLenderBorrowers.has(String(organizationId))
      ? mirrorInterOrganizationFinancingForDate(current, { organizationId, date })
      : null
    if (lenderCounterpart !== null && lenderCounterpart.result.entries.length > 0) {
      current = lenderCounterpart.world
      for (const entry of lenderCounterpart.result.entries) {
        if (entry.status === 'EXECUTED') diagnostics.push({ code: 'FINANCING_LENDER_COUNTERPART_POSTED', message: `The in-world lender counterpart of ${entry.id} posted ${entry.amountMinorUnits} ${entry.currencyCode}.`, sourceId: entry.id })
        else diagnostics.push({ code: entry.code ?? 'FINANCING_LENDER_COUNTERPART_BLOCKED', message: entry.reason ?? `The in-world lender counterpart of ${entry.id} could not be posted.`, sourceId: entry.id })
      }
    }

    // 8. Treasury (BS16J): settle the Organization's due payable batch, and only when the whole batch is
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
    const status: ClubFinanceOrganizationStatus = anyAccepted || anyCollected ? 'MATERIALIZED' : dueOccurrences > 0 && anyAlreadyProcessed ? 'ALREADY_PROCESSED' : 'NO_DUE_FACTS'
    organizations.push(result(organizationId, currencyCode, fiscalPeriodId, status, occurrences, materialized, null, treasury.result, collectedMinorUnits, latestCollection, latestFinancing, financingBlockedCount))
  }

  const treasuryResults = organizations.flatMap((entry) => entry.treasury === null ? [] : [entry.treasury])
  const collectionSummary = summarizeCollection(organizations)
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
    result: Object.freeze({ date, organizations: Object.freeze(organizations), diagnostics: Object.freeze(diagnostics), treasury: treasurySummary, collection: collectionSummary }),
  })
}

function summarizeCollection(organizations: readonly ClubFinanceOrganizationResult[]): ReceivableCollectionSummary {
  const evaluated = organizations.flatMap((entry) => entry.collection === null ? [] : [entry.collection])
  const status: ReceivableCollectionSummary['status'] = evaluated.some((entry) => entry.status === 'BLOCKED')
    ? 'BLOCKED'
    : evaluated.some((entry) => entry.status === 'COLLECTED')
      ? 'COLLECTED'
      : 'NOTHING_DUE'
  return Object.freeze({
    status,
    evaluatedOrganizations: evaluated.length,
    collectedCount: evaluated.reduce((sum, entry) => sum + entry.collectedCount, 0),
    collectedMinorUnits: evaluated.reduce((sum, entry) => sum + entry.collectedMinorUnits, 0),
    policylessDueReceivableCount: evaluated.reduce((sum, entry) => sum + entry.policylessDueReceivableCount, 0),
  })
}

interface Occurrences {
  payroll: number
  operatingCost: number
  revenue: number
  debt: number
  collections: number
  financing: number
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
  // Employment and its financial schedule are distinct: the payroll occurrence index must follow the schedule's
  // own anchor, or a contract whose salary starts after its term would have its occurrences filtered out here.
  for (const contract of Object.values(world.staffContractsById)) record(String(contract.teamId), String(staffFinancialScheduleStartsOn(contract)))
  return Object.freeze({ byOrganization, leapDayOrganizations })
}

function zeroOccurrences(): Occurrences {
  return { payroll: 0, operatingCost: 0, revenue: 0, debt: 0, collections: 0, financing: 0 }
}

function result(organizationId: OrganizationId, currencyCode: string | null, fiscalPeriodId: FiscalPeriodId | null, status: ClubFinanceOrganizationStatus, occurrences: Occurrences, materializedMinorUnits: number, reason: string | null, treasury: DuePayableSettlementResult | null = null, collectedMinorUnits = 0, collection: ReceivableCollectionResult | null = null, financing: FinancingExecutionResult | null = null, financingBlockedCount = 0): ClubFinanceOrganizationResult {
  return Object.freeze({
    organizationId,
    currencyCode,
    fiscalPeriodId,
    status,
    payrollOccurrences: occurrences.payroll,
    operatingCostOccurrences: occurrences.operatingCost,
    revenueOccurrences: occurrences.revenue,
    debtOccurrences: occurrences.debt,
    collectionOccurrences: occurrences.collections,
    collectedMinorUnits,
    collection,
    financingOccurrences: occurrences.financing,
    financingBlockedCount,
    financing,
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
