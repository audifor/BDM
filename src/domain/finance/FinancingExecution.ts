import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { deriveGovernanceDecisionStatus } from '@/domain/governance/GovernanceDecision'
import type { GovernanceDecisionType } from '@/domain/governance'
import { financialAccountIdFromString, financialTransactionIdFromString, organizationIdFromString, type FinancialAccountId, type FinancialTransactionId, type OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createFinancialTransaction, type FinancialSource, type FinancialTransaction } from './FinancialLedger'
import { createDebtInstrument, materializeCapitalContribution, materializeDebtFinanceForDate, type DebtInterest, type DebtRepayment } from './DebtEngine'
import { getOrganizationFinanceAccounts, organizationFinanceAccountId } from './FinanceFoundation'
import {
  FINANCING_AGREEMENT_PROVENANCE_KIND,
  financingDebtInstrumentIdFor,
  getActiveFinancingAgreements,
  getAgreementDrawdowns,
  getDrawnPrincipal,
  type FinancingAgreement,
  type FinancingDrawdown,
} from './FinancingAgreement'
import type { CapitalContribution } from './CapitalContribution'

/**
 * BS16L — the canonical execution authority for financing and capital.
 *
 * It executes only **explicit** facts: a declared drawdown order and a declared capital contribution, both due on
 * the processed GameDate. It never reacts to a liquidity shortfall (§15: a shortfall is not a loan request), never
 * invents an emergency overdraft and never funds a club on its own initiative — `AUTHORIZED CREDIT ≠ CASH`.
 *
 * Funding-source honesty is enforced per funding party:
 * - `EXTERNAL` — an institution outside the simulated ledgers: the agreement itself explains the cash, and BDM
 *   never invents an external balance sheet.
 * - `ORGANIZATION` — an in-world lender: world cash must be conserved, so the lender's own cash decreases and its
 *   **loan asset** increases in the same atomic step (`LOAN_ASSET` is a canonical account role). An in-world lender
 *   without enough cash is blocked rather than overdrawn.
 * - `PERSON` — representable but blocked (`FUNDING_CAPACITY_UNVERIFIED`), because BDM has no canonical personal
 *   wealth authority yet and Human RPG will own it. No personal money is ever invented.
 *
 * Related-party financing cannot silently self-authorize: it needs a referenced canonical Governance decision,
 * approved by its own event history, of the decision type that governs the operation.
 */
export const FINANCING_EXECUTION_STATUSES = ['EXECUTED', 'NOTHING_DUE', 'BLOCKED'] as const
export type FinancingExecutionStatus = (typeof FINANCING_EXECUTION_STATUSES)[number]

export const FINANCING_BLOCK_CODES = [
  'AGREEMENT_NOT_ACTIVE',
  'AGREEMENT_NOT_IN_FORCE',
  'CURRENCY_MISMATCH',
  'DRAW_LIMIT_EXCEEDED',
  'RELATED_PARTY_APPROVAL_REQUIRED',
  'GOVERNANCE_DECISION_UNKNOWN',
  'GOVERNANCE_DECISION_NOT_APPROVED',
  'GOVERNANCE_DECISION_TYPE_MISMATCH',
  'FUNDING_CAPACITY_UNVERIFIED',
  'FUNDING_PARTY_LIQUIDITY_INSUFFICIENT',
  'LOAN_ASSET_ACCOUNT_UNAVAILABLE',
  'FINANCE_ACCOUNTS_UNAVAILABLE',
] as const
export type FinancingBlockCode = (typeof FINANCING_BLOCK_CODES)[number]

/** Capabilities BS16L deliberately does not model yet, recorded as code so they cannot be silently assumed. */
export const FINANCING_V1_LIMITATIONS = [
  Object.freeze({ code: 'PERSONAL_WEALTH_AUTHORITY_NOT_MODELLED' as const, kind: 'FUNDING_SOURCE' as const, detail: 'An in-world Person lender or contributor is representable, but no canonical personal-liquidity authority can prove their funds, so execution is blocked instead of inventing personal money. Human RPG owns that authority.' }),
  Object.freeze({ code: 'INTEREST_INCOME_AUTHORITY_NOT_MODELLED' as const, kind: 'REVENUE' as const, detail: 'An in-world Organization lender cannot accrue interest income, because no canonical interest-income source authority exists. Interest-bearing Organization→Organization financing is therefore rejected; interest with an external funding party keeps the existing CF9 borrower-side accounting.' }),
  Object.freeze({ code: 'FINANCING_APPROVAL_FLOW_NOT_MODELLED' as const, kind: 'GOVERNANCE' as const, detail: 'Finance reuses the canonical Governance decision rights (DEBT, CAPITAL_EXPENDITURE) as an approval reference, but no canonical proposal/approval flow is driven from Finance. BS16L neither invents nor replaces Governance gameplay.' }),
] as const

export interface FinancingExecutionEntry {
  readonly kind: 'DRAWDOWN' | 'CAPITAL_CONTRIBUTION'
  readonly id: string
  readonly organizationId: OrganizationId
  readonly currencyCode: string
  readonly amountMinorUnits: number
  readonly status: 'EXECUTED' | 'ALREADY_EXECUTED' | 'BLOCKED'
  readonly code: FinancingBlockCode | null
  readonly reason: string | null
  readonly transactionIds: readonly string[]
}

export interface FinancingExecutionResult {
  readonly status: FinancingExecutionStatus
  readonly organizationId: OrganizationId
  readonly date: GameDate
  readonly executedCount: number
  readonly alreadyExecutedCount: number
  readonly blockedCount: number
  readonly executedMinorUnits: number
  readonly entries: readonly FinancingExecutionEntry[]
  readonly reason: string | null
}

export interface FinancingExecutionApplication {
  readonly world: GameWorld
  readonly result: FinancingExecutionResult
}

export interface InterOrganizationMirrorResult {
  readonly organizationId: OrganizationId
  readonly date: GameDate
  readonly mirroredCount: number
  readonly mirroredMinorUnits: number
  readonly entries: readonly FinancingExecutionEntry[]
}

export interface InterOrganizationMirrorApplication {
  readonly world: GameWorld
  readonly result: InterOrganizationMirrorResult
}

/**
 * Executes today's declared financing in one canonical step: drawdown orders whose date is today (creating the
 * debt instrument and the borrower's cash/liability fact) and capital contributions due today (cash/equity). Every
 * failure leaves the world exactly as it was — the complete step is built first and only then applied.
 */
export function executeFinancingForDate(world: GameWorld, input: { readonly organizationId: OrganizationId | string; readonly date: GameDate | string }): FinancingExecutionApplication {
  const organizationId = organizationIdFromString(input.organizationId)
  const date = parseGameDate(input.date)
  const entries: FinancingExecutionEntry[] = []
  let current = world
  let executed = 0
  let alreadyExecuted = 0
  let blocked = 0
  let executedMinorUnits = 0

  const profile = world.organizationFinancialProfilesById[organizationId]
  if (profile === undefined) {
    return Object.freeze({
      world,
      result: Object.freeze({ status: 'NOTHING_DUE' as const, organizationId, date, executedCount: 0, alreadyExecutedCount: 0, blockedCount: 0, executedMinorUnits: 0, entries: Object.freeze([]), reason: `Organization ${organizationId} has no canonical finance profile, so no financing fact can be executed for it.` }),
    })
  }
  const currencyCode = String(profile.baseCurrencyCode)

  const drawdowns = Object.values(world.financingDrawdownsById)
    .filter((drawdown) => String(drawdown.organizationId) === String(organizationId) && drawdown.drawnOn === date)
    .sort((left, right) => left.id.localeCompare(right.id))
  const contributions = Object.values(world.capitalContributionsById)
    .filter((contribution) => String(contribution.recipientOrganizationId) === String(organizationId) && contribution.effectiveOn === date)
    .sort((left, right) => left.id.localeCompare(right.id))

  for (const drawdown of drawdowns) {
    const outcome = executeDrawdown(current, drawdown, currencyCode)
    if (outcome.entry.status === 'EXECUTED') { executed += 1; executedMinorUnits += outcome.entry.amountMinorUnits }
    else if (outcome.entry.status === 'ALREADY_EXECUTED') alreadyExecuted += 1
    else blocked += 1
    entries.push(outcome.entry)
    current = outcome.world
  }

  for (const contribution of contributions) {
    const outcome = executeCapitalContribution(current, contribution, currencyCode)
    if (outcome.entry.status === 'EXECUTED') { executed += 1; executedMinorUnits += outcome.entry.amountMinorUnits }
    else if (outcome.entry.status === 'ALREADY_EXECUTED') alreadyExecuted += 1
    else blocked += 1
    entries.push(outcome.entry)
    current = outcome.world
  }

  const status: FinancingExecutionStatus = blocked > 0 ? 'BLOCKED' : executed > 0 ? 'EXECUTED' : 'NOTHING_DUE'
  const firstBlocked = entries.find((entry) => entry.status === 'BLOCKED')
  return Object.freeze({
    world: current,
    result: Object.freeze({
      status,
      organizationId,
      date,
      executedCount: executed,
      alreadyExecutedCount: alreadyExecuted,
      blockedCount: blocked,
      executedMinorUnits,
      entries: Object.freeze(entries),
      reason: firstBlocked?.reason ?? null,
    }),
  })
}

function executeDrawdown(world: GameWorld, drawdown: FinancingDrawdown, organizationCurrencyCode: string): { readonly world: GameWorld; readonly entry: FinancingExecutionEntry } {
  const agreement = world.financingAgreementsById[drawdown.agreementId]
  const entry = (status: FinancingExecutionEntry['status'], code: FinancingBlockCode | null, reason: string | null): FinancingExecutionEntry => Object.freeze({
    kind: 'DRAWDOWN' as const,
    id: drawdown.id,
    organizationId: drawdown.organizationId,
    currencyCode: String(drawdown.amount.currencyCode),
    amountMinorUnits: drawdown.amount.minorUnits,
    status,
    code,
    reason,
    transactionIds: Object.freeze([]),
  })
  if (agreement === undefined) return { world, entry: entry('BLOCKED', 'AGREEMENT_NOT_ACTIVE', `Financing drawdown ${drawdown.id} references an unknown financing agreement.`) }
  const instrumentId = financingDebtInstrumentIdFor(drawdown.id)
  if (world.debtInstrumentsById[instrumentId] !== undefined) return { world, entry: entry('ALREADY_EXECUTED', null, null) }

  const blockedByRule = financingRuleIssue(world, agreement, drawdown.amount.minorUnits, organizationCurrencyCode, drawdown.drawnOn)
  if (blockedByRule !== null) return { world, entry: entry('BLOCKED', blockedByRule.code, blockedByRule.reason) }

  const accounts = tryFinanceAccounts(world, agreement.borrowerOrganizationId)
  if (accounts === null) return { world, entry: entry('BLOCKED', 'FINANCE_ACCOUNTS_UNAVAILABLE', 'The canonical finance account catalog is incomplete for this Organization.') }

  try {
    const instrument = createDebtInstrument({
      id: instrumentId,
      organizationId: agreement.borrowerOrganizationId,
      lender: agreement.fundingParty,
      debtType: agreement.debtType,
      currencyCode: agreement.currencyCode,
      originalPrincipal: drawdown.amount,
      startsOn: drawdown.drawnOn,
      maturityOn: agreement.expiresOn,
      interest: projectInterest(agreement.interest, drawdown.drawnOn),
      repayment: projectRepayment(agreement.repayment, drawdown.drawnOn),
      provenance: { kind: FINANCING_AGREEMENT_PROVENANCE_KIND, id: agreement.id, description: `Drawdown ${drawdown.id} of financing agreement ${agreement.id}` },
      governanceAuthorizationReference: agreement.governanceDecisionReference,
      dimensions: { ...(agreement.dimensions ?? {}), reference: { kind: FINANCING_AGREEMENT_PROVENANCE_KIND, id: agreement.id } },
    })
    const withInstrument = updateGameWorld(world, { debtInstruments: [...Object.values(world.debtInstrumentsById), instrument] })
    // The borrower's cash and liability come from the existing CF9 debt authority: there is no second debt engine.
    const materialized = materializeDebtFinanceForDate(withInstrument, drawdown.drawnOn, {
      organizationId: agreement.borrowerOrganizationId,
      debtId: instrumentId,
      currencyCode: agreement.currencyCode,
      ledger: { cashAccountId: accounts.cashAccountId, debtLiabilityAccountId: accounts.debtLiabilityAccountId },
    })
    if (materialized.status === 'rejected') return { world, entry: entry('BLOCKED', 'FINANCE_ACCOUNTS_UNAVAILABLE', materialized.error ?? 'Debt drawdown materialization was rejected.') }
    const borrowerTransactionIds = materialized.results.flatMap((result) => 'transaction' in result && result.transaction !== undefined ? [String(result.transaction.id)] : [])
    // An in-world lender's own side is posted by the dedicated counterpart step that runs after debt service, so
    // there is exactly one place that conserves world cash and no double postings.
    return {
      world: materialized.world,
      entry: Object.freeze({ ...entry('EXECUTED', null, null), transactionIds: Object.freeze([...borrowerTransactionIds]) }),
    }
  } catch (error) {
    return { world, entry: entry('BLOCKED', 'FINANCE_ACCOUNTS_UNAVAILABLE', error instanceof Error ? error.message : 'Financing drawdown failed') }
  }
}

function executeCapitalContribution(world: GameWorld, contribution: CapitalContribution, organizationCurrencyCode: string): { readonly world: GameWorld; readonly entry: FinancingExecutionEntry } {
  const entry = (status: FinancingExecutionEntry['status'], code: FinancingBlockCode | null, reason: string | null, transactionIds: readonly string[] = []): FinancingExecutionEntry => Object.freeze({
    kind: 'CAPITAL_CONTRIBUTION' as const,
    id: contribution.id,
    organizationId: contribution.recipientOrganizationId,
    currencyCode: String(contribution.amount.currencyCode),
    amountMinorUnits: contribution.amount.minorUnits,
    status,
    code,
    reason,
    transactionIds: Object.freeze([...transactionIds]),
  })
  const transactionId = `financial:capital:${contribution.id}`
  if (world.financialTransactionsById[transactionId as never] !== undefined) return { world, entry: entry('ALREADY_EXECUTED', null, null) }
  if (String(contribution.amount.currencyCode) !== organizationCurrencyCode) {
    return { world, entry: entry('BLOCKED', 'CURRENCY_MISMATCH', `Capital contribution currency ${contribution.amount.currencyCode} does not match the Organization base currency ${organizationCurrencyCode}; no FX authority exists, so nothing is converted.`) }
  }
  const approvalIssue = approvalIssueFor(world, contribution.relatedParty, contribution.governanceDecisionReference, 'CAPITAL_EXPENDITURE')
  if (approvalIssue !== null) return { world, entry: entry('BLOCKED', approvalIssue.code, approvalIssue.reason) }
  const capacityIssue = fundingCapacityIssueFor(world, contribution.contributor.kind, contribution.contributor.id ?? null, contribution.amount.minorUnits, String(contribution.currencyCode), contribution.effectiveOn)
  if (capacityIssue !== null) return { world, entry: entry('BLOCKED', capacityIssue.code, capacityIssue.reason) }

  const accounts = tryFinanceAccounts(world, contribution.recipientOrganizationId)
  if (accounts === null) return { world, entry: entry('BLOCKED', 'FINANCE_ACCOUNTS_UNAVAILABLE', 'The canonical finance account catalog is incomplete for this Organization.') }
  try {
    // DR Cash / CR Equity, through the existing canonical capital-contribution authority.
    const recipientSide = materializeCapitalContribution(world, {
      organizationId: contribution.recipientOrganizationId,
      amount: contribution.amount,
      effectiveOn: contribution.effectiveOn,
      sourceAuthority: 'GOVERNANCE',
      sourceEntityId: contribution.id,
      provenance: contribution.provenance,
      cashAccountId: accounts.cashAccountId,
      equityAccountId: accounts.equityAccountId,
      governanceAuthorizationReference: contribution.governanceDecisionReference,
    })
    if (contribution.contributor.kind !== 'ORGANIZATION') return { world: recipientSide, entry: entry('EXECUTED', null, null, [transactionId]) }
    // An in-world contributor conserves world cash: its own cash falls and its equity is reduced by the same
    // amount, because BDM has no investment-asset authority for another Organization's equity.
    const contributorId = organizationIdFromString(String(contribution.contributor.id))
    const contributorAccounts = tryFinanceAccounts(recipientSide, contributorId)
    if (contributorAccounts === null) return { world, entry: entry('BLOCKED', 'FINANCE_ACCOUNTS_UNAVAILABLE', `The in-world contributor ${contributorId} has no complete canonical finance account catalog.`) }
    const contributorCash = recipientSide.financialAccountsById[contributorAccounts.cashAccountId as FinancialAccountId]
    if (contributorCash === undefined || contributorCash.currencyCode !== contribution.currencyCode) {
      return { world, entry: entry('BLOCKED', 'CURRENCY_MISMATCH', `The in-world contributor ${contributorId} has no cash account in ${contribution.currencyCode}.)`) }
    }
    const contributorMirror = createFinancialTransaction({
      id: `financial:capital-out:${contribution.id}`,
      organizationId: contributorId,
      effectiveOn: contribution.effectiveOn,
      transactionType: 'CAPITAL_CONTRIBUTION_OUT',
      amount: contribution.amount,
      postings: [
        { accountId: financialAccountIdFromString(contributorAccounts.equityAccountId), direction: 'DEBIT', amount: contribution.amount },
        { accountId: financialAccountIdFromString(contributorAccounts.cashAccountId), direction: 'CREDIT', amount: contribution.amount },
      ],
      provenance: { kind: CONTRIBUTOR_TRANSFER_PROVENANCE_KIND, id: contribution.id },
      dimensions: { reference: { kind: 'CAPITAL_CONTRIBUTION', id: contribution.id } },
    })
    const mirrored = updateGameWorld(recipientSide, { financialTransactions: [...Object.values(recipientSide.financialTransactionsById), contributorMirror] })
    return { world: mirrored, entry: entry('EXECUTED', null, null, [transactionId, String(contributorMirror.id)]) }
  } catch (error) {
    return { world, entry: entry('BLOCKED', 'FINANCE_ACCOUNTS_UNAVAILABLE', error instanceof Error ? error.message : 'Capital contribution failed') }
  }
}

export const CONTRIBUTOR_TRANSFER_PROVENANCE_KIND = 'CAPITAL_CONTRIBUTION_TRANSFER' as const

/**
 * Mirrors an in-world Organization lender's side of financing that the borrower already executed, so world cash is
 * conserved (`§11`, `§32`): a drawdown moves the lender's cash into its loan asset, and a principal repayment moves
 * it back. Deterministic ids derived from the borrower's transaction make this idempotent; an external funding party
 * has no in-world ledger, so nothing is mirrored for it.
 */
export function mirrorInterOrganizationFinancingForDate(world: GameWorld, input: { readonly organizationId: OrganizationId | string; readonly date: GameDate | string }): InterOrganizationMirrorApplication {
  const organizationId = organizationIdFromString(input.organizationId)
  const date = parseGameDate(input.date)
  const entries: FinancingExecutionEntry[] = []
  let current = world
  let mirroredCount = 0
  let mirroredMinorUnits = 0

  for (const agreement of getActiveFinancingAgreements(world, organizationId, date)) {
    if (agreement.fundingParty.kind !== 'ORGANIZATION' || agreement.fundingParty.id === undefined) continue
    const instrumentIds = Object.values(world.debtInstrumentsById)
      .filter((instrument) => instrument.dimensions?.reference?.kind === FINANCING_AGREEMENT_PROVENANCE_KIND && instrument.dimensions.reference.id === agreement.id && String(instrument.organizationId) === String(organizationId))
      .map((instrument) => String(instrument.id))
      .sort()
    for (const instrumentId of instrumentIds) {
      const borrowerTransactions = Object.values(current.financialTransactionsById)
        .filter((transaction) => transaction.dimensions?.reference?.kind === 'DEBT_INSTRUMENT' && transaction.dimensions.reference.id === instrumentId && transaction.effectiveOn === date && String(transaction.organizationId) === String(organizationId))
        .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      for (const transaction of borrowerTransactions) {
        const lending = transaction.transactionType === 'DEBT_DRAWDOWN'
        const mirrorId = financialTransactionIdFromString(`financial:financing:${lending ? 'lender-drawdown' : 'lender-repayment'}:${String(transaction.id)}`)
        if (current.financialTransactionsById[mirrorId] !== undefined) continue
        const agreement2 = agreement
        const lenderAccounts = tryFinanceAccounts(current, organizationIdFromString(String(agreement2.fundingParty.id)))
        if (lenderAccounts === null || lenderAccounts.loanAssetAccountId === null) {
          entries.push(Object.freeze({ kind: 'DRAWDOWN' as const, id: String(transaction.id), organizationId, currencyCode: String(transaction.amount.currencyCode), amountMinorUnits: transaction.amount.minorUnits, status: 'BLOCKED' as const, code: 'LOAN_ASSET_ACCOUNT_UNAVAILABLE' as const, reason: `The in-world lender ${String(agreement2.fundingParty.id)} has no canonical loan asset account, so its side of the financing cannot be posted and world cash would not be conserved.`, transactionIds: Object.freeze([]) }))
          continue
        }
        const cashAccount = current.financialAccountsById[financialAccountIdFromString(lenderAccounts.cashAccountId)]
        if (cashAccount === undefined || cashAccount.currencyCode !== transaction.amount.currencyCode) {
          entries.push(Object.freeze({ kind: 'DRAWDOWN' as const, id: String(transaction.id), organizationId, currencyCode: String(transaction.amount.currencyCode), amountMinorUnits: transaction.amount.minorUnits, status: 'BLOCKED' as const, code: 'CURRENCY_MISMATCH' as const, reason: `The in-world lender has no cash account in ${transaction.amount.currencyCode}.`, transactionIds: Object.freeze([]) }))
          continue
        }
        if (lending && getLenderCashMinorUnits(current, lenderAccounts.cashAccountId, date, transaction.amount.currencyCode) < transaction.amount.minorUnits) {
          entries.push(Object.freeze({ kind: 'DRAWDOWN' as const, id: String(transaction.id), organizationId, currencyCode: String(transaction.amount.currencyCode), amountMinorUnits: transaction.amount.minorUnits, status: 'BLOCKED' as const, code: 'FUNDING_PARTY_LIQUIDITY_INSUFFICIENT' as const, reason: `The in-world lender does not hold enough ${transaction.amount.currencyCode} cash to fund this financing, and BDM never invents money for a lender.`, transactionIds: Object.freeze([]) }))
          continue
        }
        const lenderTransaction = createFinancialTransaction({
          id: mirrorId,
          organizationId: organizationIdFromString(String(agreement2.fundingParty.id)),
          effectiveOn: date,
          transactionType: lending ? 'INTER_ORGANIZATION_FINANCING_LENDING' : 'INTER_ORGANIZATION_FINANCING_REPAYMENT',
          amount: transaction.amount,
          postings: lending
            ? [{ accountId: financialAccountIdFromString(lenderAccounts.loanAssetAccountId), direction: 'DEBIT', amount: transaction.amount }, { accountId: financialAccountIdFromString(lenderAccounts.cashAccountId), direction: 'CREDIT', amount: transaction.amount }]
            : [{ accountId: financialAccountIdFromString(lenderAccounts.cashAccountId), direction: 'DEBIT', amount: transaction.amount }, { accountId: financialAccountIdFromString(lenderAccounts.loanAssetAccountId), direction: 'CREDIT', amount: transaction.amount }],
          provenance: { kind: FINANCING_AGREEMENT_PROVENANCE_KIND, id: agreement2.id },
          dimensions: { reference: { kind: 'DEBT_INSTRUMENT', id: instrumentId } },
        })
        current = updateGameWorld(current, { financialTransactions: [...Object.values(current.financialTransactionsById), lenderTransaction] })
        mirroredCount += 1
        mirroredMinorUnits += transaction.amount.minorUnits
        entries.push(Object.freeze({ kind: 'DRAWDOWN' as const, id: String(transaction.id), organizationId, currencyCode: String(transaction.amount.currencyCode), amountMinorUnits: transaction.amount.minorUnits, status: 'EXECUTED' as const, code: null, reason: null, transactionIds: Object.freeze([String(lenderTransaction.id)]) }))
      }
    }
  }

  return Object.freeze({ world: current, result: Object.freeze({ organizationId, date, mirroredCount, mirroredMinorUnits, entries: Object.freeze(entries) }) })
}

function applyLenderCounterpart(world: GameWorld, agreement: FinancingAgreement, amount: { readonly currencyCode: string; readonly minorUnits: number }, date: GameDate, direction: 'LEND'): { readonly world: GameWorld; readonly transactionIds: readonly string[]; readonly blocked: { readonly code: FinancingBlockCode; readonly reason: string } | null } {
  if (agreement.fundingParty.kind !== 'ORGANIZATION' || agreement.fundingParty.id === undefined) return { world, transactionIds: [], blocked: null }
  const lenderId = organizationIdFromString(String(agreement.fundingParty.id))
  const lenderAccounts = tryFinanceAccounts(world, lenderId)
  if (lenderAccounts === null || lenderAccounts.loanAssetAccountId === null) {
    return { world, transactionIds: [], blocked: { code: 'LOAN_ASSET_ACCOUNT_UNAVAILABLE', reason: `The in-world lender ${lenderId} has no canonical loan asset account, so its side of the financing cannot be posted and world cash would not be conserved.` } }
  }
  if (getLenderCashMinorUnits(world, lenderAccounts.cashAccountId, date, amount.currencyCode) < amount.minorUnits) {
    return { world, transactionIds: [], blocked: { code: 'FUNDING_PARTY_LIQUIDITY_INSUFFICIENT', reason: `The in-world lender ${lenderId} does not hold enough ${amount.currencyCode} cash to fund this financing, and BDM never invents money for a lender.` } }
  }
  const transaction = createFinancialTransaction({
    id: financialTransactionIdFromString(`financial:financing:${direction === 'LEND' ? 'lender-drawdown' : 'lender-repayment'}:${agreement.id}:${date}`),
    organizationId: lenderId,
    effectiveOn: date,
    transactionType: 'INTER_ORGANIZATION_FINANCING_LENDING',
    amount,
    postings: [
      { accountId: financialAccountIdFromString(lenderAccounts.loanAssetAccountId), direction: 'DEBIT', amount },
      { accountId: financialAccountIdFromString(lenderAccounts.cashAccountId), direction: 'CREDIT', amount },
    ],
    provenance: { kind: FINANCING_AGREEMENT_PROVENANCE_KIND, id: agreement.id },
    dimensions: { reference: { kind: FINANCING_AGREEMENT_PROVENANCE_KIND, id: agreement.id } },
  })
  if (world.financialTransactionsById[transaction.id] !== undefined) return { world, transactionIds: [String(transaction.id)], blocked: null }
  return { world: updateGameWorld(world, { financialTransactions: [...Object.values(world.financialTransactionsById), transaction] }), transactionIds: [String(transaction.id)], blocked: null }
}

function getLenderCashMinorUnits(world: GameWorld, cashAccountId: string, date: GameDate, currencyCode: string): number {
  const accountId = financialAccountIdFromString(cashAccountId)
  let minorUnits = 0
  for (const transaction of Object.values(world.financialTransactionsById)) {
    if (compareGameDates(transaction.effectiveOn, date) > 0 || transaction.amount.currencyCode !== currencyCode) continue
    for (const posting of transaction.postings) {
      if (posting.accountId !== accountId) continue
      minorUnits += posting.direction === 'DEBIT' ? posting.amount.minorUnits : -posting.amount.minorUnits
    }
  }
  return minorUnits
}

/** Every rule that can refuse a drawdown before anything is applied, evaluated deterministically. */
function financingRuleIssue(world: GameWorld, agreement: FinancingAgreement, amountMinorUnits: number, organizationCurrencyCode: string, date: GameDate): { readonly code: FinancingBlockCode; readonly reason: string } | null {
  if (agreement.status !== 'ACTIVE') return { code: 'AGREEMENT_NOT_ACTIVE', reason: `Financing agreement ${agreement.id} is ${agreement.status}, so it cannot be drawn on.` }
  if (String(agreement.currencyCode) !== organizationCurrencyCode) {
    return { code: 'CURRENCY_MISMATCH', reason: `Financing currency ${agreement.currencyCode} does not match the borrower base currency ${organizationCurrencyCode}; no FX authority exists, so the drawdown is refused rather than reinterpreted.` }
  }
  // The limit is checked against what has actually been executed, because world validation already guarantees that
  // the declared drawdown orders together never exceed the authorized amount (that is the commitment test).
  const executed = getExecutedDrawdownMinorUnits(world, agreement.id)
  if (executed + amountMinorUnits > agreement.authorizedPrincipal.minorUnits) {
    return { code: 'DRAW_LIMIT_EXCEEDED', reason: `Drawing ${amountMinorUnits} after ${executed} already executed would exceed the authorized amount of financing agreement ${agreement.id} (${agreement.authorizedPrincipal.minorUnits}).` }
  }
  const approval = approvalIssueFor(world, agreement.relatedParty, agreement.governanceDecisionReference, 'DEBT')
  if (approval !== null) return approval
  return fundingCapacityIssueFor(world, agreement.fundingParty.kind, agreement.fundingParty.id ?? null, amountMinorUnits, String(agreement.currencyCode), date)
}

/** Already-drawn principal: the drawdown orders whose debt instrument actually exists, so a replay never re-draws. */
function getExecutedDrawdownMinorUnits(world: GameWorld, agreementId: string): number {
  return getAgreementDrawdowns(world, agreementId)
    .filter((drawdown) => world.debtInstrumentsById[financingDebtInstrumentIdFor(drawdown.id)] !== undefined)
    .reduce((sum, drawdown) => sum + drawdown.amount.minorUnits, 0)
}

function fundingCapacityIssueFor(world: GameWorld, kind: string, partyId: string | null, amountMinorUnits: number, currencyCode: string, date: GameDate): { readonly code: FinancingBlockCode; readonly reason: string } | null {
  if (kind === 'EXTERNAL') return null
  if (kind === 'PERSON') {
    return { code: 'FUNDING_CAPACITY_UNVERIFIED', reason: `Funding party ${String(partyId)} is an in-world Person whose funds no canonical authority can prove. BDM never invents personal wealth, so the drawdown is blocked (Human RPG owns personal liquidity).` }
  }
  if (kind === 'ORGANIZATION' && partyId !== null) {
    const accounts = tryFinanceAccounts(world, organizationIdFromString(partyId))
    if (accounts === null || accounts.loanAssetAccountId === null) {
      return { code: 'LOAN_ASSET_ACCOUNT_UNAVAILABLE', reason: `The in-world lender ${partyId} has no canonical loan asset account, so world cash could not be conserved.` }
    }
    const cash = world.financialAccountsById[financialAccountIdFromString(accounts.cashAccountId)]
    if (cash === undefined || cash.currencyCode !== currencyCode) {
      return { code: 'CURRENCY_MISMATCH', reason: `The in-world lender ${partyId} holds no ${currencyCode} cash account.` }
    }
    const available = getLenderCashMinorUnits(world, accounts.cashAccountId, date, currencyCode)
    if (available < amountMinorUnits) {
      return { code: 'FUNDING_PARTY_LIQUIDITY_INSUFFICIENT', reason: `The in-world lender ${partyId} holds ${available} ${currencyCode} and cannot fund ${amountMinorUnits} without an overdraft, which BDM does not create.` }
    }
    return null
  }
  return null
}

/**
 * The approval seam: a related party may not silently self-authorize. Finance never decides *who* may approve; it
 * only requires that a referenced canonical Governance decision of the right type exists and is approved.
 */
function approvalIssueFor(world: GameWorld, relatedParty: boolean, reference: FinancialSource | null, requiredType: GovernanceDecisionType): { readonly code: FinancingBlockCode; readonly reason: string } | null {
  if (reference === null) {
    return relatedParty
      ? { code: 'RELATED_PARTY_APPROVAL_REQUIRED', reason: 'Related-party financing requires an approved canonical Governance decision and may not self-authorize.' }
      : null
  }
  const decision = world.governanceDecisionsById[reference.id as never]
  if (decision === undefined) return { code: 'GOVERNANCE_DECISION_UNKNOWN', reason: `Referenced Governance decision ${reference.id} does not exist in this world, so the required approval cannot be proven.` }
  if (decision.decisionType !== requiredType) return { code: 'GOVERNANCE_DECISION_TYPE_MISMATCH', reason: `Referenced Governance decision ${reference.id} is a ${decision.decisionType} decision, which cannot authorize a ${requiredType} operation.` }
  const status = deriveGovernanceDecisionStatus(Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decision.id))
  if (status !== 'APPROVED' && status !== 'EXECUTED') return { code: 'GOVERNANCE_DECISION_NOT_APPROVED', reason: `Referenced Governance decision ${reference.id} is ${status ?? 'PROPOSED'}, not approved.` }
  return null
}

interface ResolvedFinanceAccounts {
  readonly cashAccountId: string
  readonly debtLiabilityAccountId: string
  readonly loanAssetAccountId: string | null
  readonly equityAccountId: string
}

function tryFinanceAccounts(world: GameWorld, organizationId: OrganizationId): ResolvedFinanceAccounts | null {
  try {
    const accounts = getOrganizationFinanceAccounts(world, organizationId)
    return Object.freeze({
      cashAccountId: String(accounts.cashOperating.id),
      debtLiabilityAccountId: String(accounts.debtLiability.id),
      loanAssetAccountId: accounts.loanAsset === undefined ? null : String(accounts.loanAsset.id),
      equityAccountId: String(accounts.equityControl.id),
    })
  } catch {
    return null
  }
}

function projectInterest(interest: DebtInterest, drawnOn: GameDate): DebtInterest {
  if (interest.kind === 'EXPLICIT_SCHEDULE') {
    const entries = interest.entries.filter((entry) => compareGameDates(entry.recognitionOn, drawnOn) >= 0)
    return entries.length === 0 ? { kind: 'NONE' } : { kind: 'EXPLICIT_SCHEDULE', entries: Object.freeze(entries) }
  }
  if (interest.kind === 'FIXED_RATE') {
    const periods = interest.periods.filter((period) => compareGameDates(period.endsOn, drawnOn) >= 0)
    return periods.length === 0 ? { kind: 'NONE' } : { kind: 'FIXED_RATE', annualRateBps: interest.annualRateBps, periods: Object.freeze(periods) }
  }
  return { kind: 'NONE' }
}

function projectRepayment(repayment: DebtRepayment, drawnOn: GameDate): DebtRepayment {
  if (repayment.kind === 'EXPLICIT_SCHEDULE') {
    const entries = repayment.entries.filter((entry) => compareGameDates(entry.repaymentOn, drawnOn) >= 0)
    return entries.length === 0 ? { kind: 'BULLET' } : { kind: 'EXPLICIT_SCHEDULE', entries: Object.freeze(entries) }
  }
  return repayment
}

/** Convenience for tests/fixtures: the loan-asset account id of an Organization, when it exists. */
export function organizationLoanAssetAccountId(world: GameWorld, organizationId: OrganizationId | string, currencyCode: string): FinancialAccountId | null {
  const account = world.financialAccountsById[organizationFinanceAccountId(organizationIdFromString(organizationId), currencyCode, 'LOAN_ASSET')]
  return account === undefined ? null : account.id
}

export type { FinancialTransaction }
