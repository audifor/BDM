/**
 * CFI7 query layer — reads Finance facts through the Facilities lens (and vice versa) using the
 * `FacilityFinancialBinding` cross-reference collection. Every function here is a pure projection
 * over `GameWorld`'s existing Facilities/Finance collections plus the bindings this wave adds — no
 * new stored aggregate, no cached total, nothing persisted beyond the bindings themselves.
 *
 * Named per the CFI7 brief's own suggested query list, restricted to what CF1-CF9's real primitives
 * can actually answer (see the certification report's audit matrix for what was deliberately NOT
 * added because Finance does not yet model it, e.g. an arbitrary "funding %").
 */

import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { FacilityDevelopmentProjectId, FacilityId, FacilityMaintenanceActionId, OrganizationId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getOperatingExpenseByFacility, type AuthorizedOperatingCostFact, type DebtInstrument, type ExpenseRecognition, type FinancialCommitment, type FinancialTransaction, type OperatingCostSource } from '@/domain/finance'
import type { FacilityFinancialBinding, FacilityFinancialBindingSourceKind } from '@/domain/facilities'

/** One resolved Finance fact reached through a binding, with its own kind/amount/date already attached. */
export interface FacilityFinancialFact {
  readonly binding: FacilityFinancialBinding
  readonly commitment?: FinancialCommitment
  readonly expenseRecognition?: ExpenseRecognition
  readonly transaction?: FinancialTransaction
  readonly operatingCostSource?: OperatingCostSource
  readonly operatingCostFact?: AuthorizedOperatingCostFact
  readonly debtInstrument?: DebtInstrument
}

function resolveFact(world: GameWorld, binding: FacilityFinancialBinding): FacilityFinancialFact {
  switch (binding.factKind) {
    case 'FINANCIAL_COMMITMENT':
      return { binding, commitment: world.financialCommitmentsById[binding.factId as never] }
    case 'EXPENSE_RECOGNITION':
      return { binding, expenseRecognition: world.expenseRecognitionsById[binding.factId as never] }
    case 'FINANCIAL_TRANSACTION':
      return { binding, transaction: world.financialTransactionsById[binding.factId as never] }
    case 'OPERATING_COST_SOURCE':
      return { binding, operatingCostSource: world.operatingCostSourcesById[binding.factId] }
    case 'OPERATING_COST_FACT':
      return { binding, operatingCostFact: world.operatingCostFactsById[binding.factId] }
    case 'DEBT_INSTRUMENT':
      return { binding, debtInstrument: world.debtInstrumentsById[binding.factId] }
    default:
      return { binding }
  }
}

function bindingsBySource(world: GameWorld, sourceKind: FacilityFinancialBindingSourceKind, sourceId: string): readonly FacilityFinancialBinding[] {
  return Object.values(world.facilityFinancialBindingsById)
    .filter((binding) => binding.sourceKind === sourceKind && binding.sourceId === sourceId)
    .sort((left, right) => compareGameDates(left.createdOn, right.createdOn) || left.id.localeCompare(right.id))
}

/** Every Finance fact bound to a specific maintenance action — the "why did this money leave" trace, forward direction. */
export function financialFactsForMaintenanceAction(world: GameWorld, maintenanceActionId: FacilityMaintenanceActionId | string): readonly FacilityFinancialFact[] {
  return Object.freeze(bindingsBySource(world, 'FACILITY_MAINTENANCE_ACTION', String(maintenanceActionId)).map((binding) => resolveFact(world, binding)))
}

/** Every Finance fact bound to a specific development project — supports "one project, many financial facts" directly. */
export function financialFactsForDevelopmentProject(world: GameWorld, projectId: FacilityDevelopmentProjectId | string): readonly FacilityFinancialFact[] {
  return Object.freeze(bindingsBySource(world, 'FACILITY_DEVELOPMENT_PROJECT', String(projectId)).map((binding) => resolveFact(world, binding)))
}

/** Every Finance fact bound to any Facilities fact (maintenance action or project) that targets this Facility. */
export function financialFactsForFacility(world: GameWorld, facilityId: FacilityId | string): readonly FacilityFinancialFact[] {
  return Object.freeze(
    Object.values(world.facilityFinancialBindingsById)
      .filter((binding) => binding.facilityId === facilityId)
      .sort((left, right) => compareGameDates(left.createdOn, right.createdOn) || left.id.localeCompare(right.id))
      .map((binding) => resolveFact(world, binding)),
  )
}

/** Reverse traceability: given a FinancialCommitment id, which Facilities fact (if any) it was authorized for. */
export function facilitySourceForFinancialCommitment(world: GameWorld, commitmentId: string): FacilityFinancialBinding | null {
  return Object.values(world.facilityFinancialBindingsById).find((binding) => binding.factKind === 'FINANCIAL_COMMITMENT' && binding.factId === commitmentId) ?? null
}

/** Reverse traceability: given a FinancialTransaction id, which Facilities fact (if any) it was posted for. */
export function facilitySourceForFinancialTransaction(world: GameWorld, transactionId: string): FacilityFinancialBinding | null {
  return Object.values(world.facilityFinancialBindingsById).find((binding) => binding.factKind === 'FINANCIAL_TRANSACTION' && binding.factId === transactionId) ?? null
}

/** Sum of FinancialCommitment amounts bound to a project, still outstanding (not cancelled) as of a date — "authorized/committed", never "paid". */
export function committedFacilityExpenditureAt(world: GameWorld, projectId: FacilityDevelopmentProjectId | string, onDate: GameDate | string): readonly { readonly currencyCode: string; readonly minorUnits: number }[] {
  const asOf = parseGameDate(onDate)
  const commitments = financialFactsForDevelopmentProject(world, projectId)
    .map((fact) => fact.commitment)
    .filter((commitment): commitment is FinancialCommitment => commitment !== undefined && commitment.cancelledOn === null && compareGameDates(commitment.startsOn, asOf) <= 0)
  return sumByCurrency(commitments.map((commitment) => commitment.amount))
}

/** Sum of ExpenseRecognition amounts bound to a project as of a date — "recognized", independent of whether cash has actually moved. */
export function recognizedFacilityExpenditureAt(world: GameWorld, projectId: FacilityDevelopmentProjectId | string, onDate: GameDate | string): readonly { readonly currencyCode: string; readonly minorUnits: number }[] {
  const asOf = parseGameDate(onDate)
  const recognitions = financialFactsForDevelopmentProject(world, projectId)
    .map((fact) => fact.expenseRecognition)
    .filter((recognition): recognition is ExpenseRecognition => recognition !== undefined && compareGameDates(recognition.recognizedOn, asOf) <= 0)
  return sumByCurrency(recognitions.map((recognition) => recognition.amount))
}

/** Sum of amounts actually settled (paid) against payables bound to a project's expense recognitions, as of a date — "paid", the strictest of the three. */
export function paidFacilityExpenditureAt(world: GameWorld, projectId: FacilityDevelopmentProjectId | string, onDate: GameDate | string): readonly { readonly currencyCode: string; readonly minorUnits: number }[] {
  const asOf = parseGameDate(onDate)
  const paid: { readonly currencyCode: string; readonly minorUnits: number }[] = []
  for (const fact of financialFactsForDevelopmentProject(world, projectId)) {
    const recognition = fact.expenseRecognition
    if (recognition === undefined || recognition.payableId === null || compareGameDates(recognition.recognizedOn, asOf) > 0) continue
    const payable = world.payablesById[recognition.payableId]
    if (payable === undefined) continue
    const settledMinorUnits = payable.amount.minorUnits - remainingPayableMinorUnits(world, payable.id, asOf)
    if (settledMinorUnits > 0) paid.push({ currencyCode: payable.amount.currencyCode, minorUnits: settledMinorUnits })
  }
  return sumByCurrency(paid)
}

function remainingPayableMinorUnits(world: GameWorld, payableId: string, asOf: GameDate): number {
  let settled = 0
  for (const settlement of Object.values(world.treasuryApplicationsById)) {
    if (settlement.obligationKind !== 'PAYABLE' || settlement.obligationId !== payableId || compareGameDates(settlement.settledOn, asOf) > 0) continue
    settled += settlement.amount.minorUnits
  }
  const payable = world.payablesById[payableId as never]
  return payable === undefined ? 0 : payable.amount.minorUnits - settled
}

/**
 * Operating (OPEX) expenditure recognized against a Facility. A thin, intentional alias for CF8's
 * own `getOperatingExpenseByFacility` — CFI7 does not re-implement facility OPEX aggregation, it only
 * gives it a name consistent with this module's own query-list convention (facility-scoped, dated
 * range). `getOperatingExpenseByFacility` is exported unchanged from `@/domain/finance` for any
 * caller that prefers to import it directly instead.
 */
export function facilityOperatingExpenditureAt(world: GameWorld, organizationId: OrganizationId | string, facilityId: FacilityId | string, from: GameDate | string, to: GameDate | string): readonly { readonly currencyCode: string; readonly minorUnits: number }[] {
  return getOperatingExpenseByFacility(world, organizationId, String(facilityId), from, to)
}

/** Capital expenditure (project-bound FinancialCommitments/ExpenseRecognitions) for a project, as of a date — the CFI6 counterpart of facilityOperatingExpenditureAt. */
export function facilityCapitalExpenditureAt(world: GameWorld, projectId: FacilityDevelopmentProjectId | string, onDate: GameDate | string): readonly { readonly currencyCode: string; readonly minorUnits: number }[] {
  return recognizedFacilityExpenditureAt(world, projectId, onDate)
}

/** Committed but not-yet-recognized amounts for a project as of a date — "outstanding commitment", i.e. authorized minus recognized. */
export function outstandingFacilityCommitmentsAt(world: GameWorld, projectId: FacilityDevelopmentProjectId | string, onDate: GameDate | string): readonly { readonly currencyCode: string; readonly minorUnits: number }[] {
  const committed = committedFacilityExpenditureAt(world, projectId, onDate)
  const recognized = recognizedFacilityExpenditureAt(world, projectId, onDate)
  const recognizedByCurrency = new Map(recognized.map((item) => [item.currencyCode, item.minorUnits]))
  return Object.freeze(
    committed
      .map((item) => ({ currencyCode: item.currencyCode, minorUnits: item.minorUnits - (recognizedByCurrency.get(item.currencyCode) ?? 0) }))
      .filter((item) => item.minorUnits > 0),
  )
}

/** Every debt instrument bound to a project (multiple funding sources are representable: several bindings, one per DebtInstrument/other funding fact). */
export function facilityProjectFundingAt(world: GameWorld, projectId: FacilityDevelopmentProjectId | string): readonly FacilityFinancialFact[] {
  return Object.freeze(financialFactsForDevelopmentProject(world, projectId).filter((fact) => fact.debtInstrument !== undefined || fact.commitment !== undefined || fact.transaction !== undefined))
}

/**
 * Factually determinable "underfunded" check: true only when Finance can compute BOTH a required
 * amount (sum of non-cancelled commitments bound to the project) AND secured resources (recognized +
 * drawn debt bound to the project) in the same currency, and secured < required. Returns `null` —
 * never a guessed boolean — when no commitment has been recorded yet (nothing to compare against) or
 * when funding facts exist in a different currency than the commitment (CF9 has no FX; CFI7 does not
 * invent one to force a comparison). This deliberately does not invent an arbitrary "funding %".
 */
export function isFacilityProjectUnderfundedAt(world: GameWorld, projectId: FacilityDevelopmentProjectId | string, onDate: GameDate | string): boolean | null {
  const committed = committedFacilityExpenditureAt(world, projectId, onDate)
  if (committed.length === 0) return null
  const asOf = parseGameDate(onDate)
  const secured: { readonly currencyCode: string; readonly minorUnits: number }[] = [...recognizedFacilityExpenditureAt(world, projectId, onDate)]
  for (const fact of financialFactsForDevelopmentProject(world, projectId)) {
    if (fact.debtInstrument === undefined) continue
    const drawn = Object.values(world.financialTransactionsById).filter((transaction) => transaction.transactionType === 'DEBT_DRAWDOWN' && transaction.dimensions?.reference?.kind === 'DEBT_INSTRUMENT' && transaction.dimensions.reference.id === fact.debtInstrument!.id && compareGameDates(transaction.effectiveOn, asOf) <= 0)
    for (const transaction of drawn) secured.push(transaction.amount)
  }
  const securedByCurrency = sumByCurrency(secured)
  for (const item of committed) {
    const securedForCurrency = securedByCurrency.find((entry) => entry.currencyCode === item.currencyCode)
    if (securedForCurrency === undefined) return true
    if (securedForCurrency.minorUnits < item.minorUnits) return true
  }
  return false
}

function sumByCurrency(items: readonly { readonly currencyCode: string; readonly minorUnits: number }[]): readonly { readonly currencyCode: string; readonly minorUnits: number }[] {
  const totals = new Map<string, number>()
  for (const item of items) totals.set(item.currencyCode, (totals.get(item.currencyCode) ?? 0) + item.minorUnits)
  return Object.freeze([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, minorUnits]) => Object.freeze({ currencyCode, minorUnits })))
}
