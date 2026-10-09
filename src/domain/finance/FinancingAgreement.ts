import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { OrganizationId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { createFinancialDimensions, createFinancialSource, createMoney, type CurrencyCode, type FinancialDimensions, type FinancialDimensionsInput, type FinancialSource, type Money } from './FinancialLedger'
import { createTreasuryCounterparty, type TreasuryCounterparty } from './Treasury'
import type { DebtInterest, DebtRepayment, DebtType } from './DebtEngine'

/**
 * BS16L — the canonical `FinancingAgreement`: the economic contract that says an Organization may acquire liquidity
 * and owes it back. It is deliberately **not** a bank concept: the funding party is any actor that can supply funds
 * (an external financial institution outside the simulated ledgers, another in-world Organization, or a Person), and
 * the agreement itself is the provenance of the borrower's cash.
 *
 * `FINANCING ≠ REVENUE` — a drawdown is a liability, never income. `AUTHORIZED CREDIT ≠ CASH` — the authorized
 * amount is a *right to draw*, never liquidity: only an executed drawdown creates cash and debt, and the remaining
 * availability is derived from the canonical drawdown facts rather than stored as a second mutable field.
 *
 * The accounting shape of the debt itself is projected onto the existing `DebtInstrument` (CF9) at execution time,
 * so there is exactly one debt accounting authority and no parallel model.
 */
export const FINANCING_AGREEMENT_STATUSES = ['ACTIVE', 'CLOSED', 'CANCELLED'] as const
export type FinancingAgreementStatus = (typeof FINANCING_AGREEMENT_STATUSES)[number]

/**
 * How the funding party's money can be proven. `EXTERNAL` parties exist outside the simulated organizational
 * ledgers, so the signed agreement itself is sufficient provenance (BDM never invents an external balance sheet).
 * An in-world `ORGANIZATION` must conserve cash inside the world, and an in-world `PERSON` needs a personal-wealth
 * authority that BDM does not have yet — so a drawdown naming a Person is representable but blocked.
 */
export const FUNDING_PARTY_KINDS = ['EXTERNAL', 'ORGANIZATION', 'PERSON'] as const
export type FundingPartyKind = (typeof FUNDING_PARTY_KINDS)[number]

export interface FinancingAgreement {
  readonly id: string
  readonly borrowerOrganizationId: OrganizationId
  readonly fundingParty: TreasuryCounterparty
  readonly debtType: DebtType
  readonly currencyCode: CurrencyCode
  /** The approved facility. A right to draw, never cash, and never spending authorization. */
  readonly authorizedPrincipal: Money
  /** First date a drawdown may execute; the agreement is meaningless before it. */
  readonly startsOn: GameDate
  /** Last date a drawdown may execute. */
  readonly expiresOn: GameDate
  readonly interest: DebtInterest
  readonly repayment: DebtRepayment
  /** A related party (owner, coach, executive, related Organization) must not silently self-authorize. */
  readonly relatedParty: boolean
  readonly governanceDecisionReference: FinancialSource | null
  readonly status: FinancingAgreementStatus
  readonly provenance: FinancialSource
  readonly dimensions: FinancialDimensions | null
}

export interface FinancingDrawdown {
  readonly id: string
  readonly agreementId: string
  readonly organizationId: OrganizationId
  /** The amount the borrower draws on `drawnOn`; the sum of all drawdowns may never exceed the authorized amount. */
  readonly amount: Money
  readonly drawnOn: GameDate
  readonly provenance: FinancialSource
  readonly dimensions: FinancialDimensions | null
}

export const FINANCING_AGREEMENT_PROVENANCE_KIND = 'FINANCING_AGREEMENT' as const
export const FINANCING_DRAWDOWN_PROVENANCE_KIND = 'FINANCING_DRAWDOWN' as const

export function financingAgreementIdFor(organizationId: OrganizationId | string, key: string): string {
  return `financing-agreement:${String(organizationId)}:${nonEmpty(key, 'Financing agreement key')}`
}

export function financingDrawdownIdFor(agreementId: string, key: string): string {
  return `financing-drawdown:${nonEmpty(agreementId, 'Financing agreement id')}:${nonEmpty(key, 'Financing drawdown key')}`
}

/** The deterministic debt instrument a drawdown projects into, so a replay can never create a second one. */
export function financingDebtInstrumentIdFor(drawdownId: string): string {
  return `debt:financing:${nonEmpty(drawdownId, 'Financing drawdown id')}`
}

export function createFinancingAgreement(input: {
  readonly id: string
  readonly borrowerOrganizationId: OrganizationId | string
  readonly fundingParty: TreasuryCounterparty
  readonly debtType: DebtType
  readonly currencyCode: string
  readonly authorizedPrincipal: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly startsOn: GameDate | string
  readonly expiresOn: GameDate | string
  readonly interest?: DebtInterest
  readonly repayment?: DebtRepayment
  readonly relatedParty?: boolean
  readonly governanceDecisionReference?: FinancialSource | null
  readonly status?: FinancingAgreementStatus
  readonly provenance: FinancialSource
  readonly dimensions?: FinancialDimensionsInput | null
}): FinancingAgreement {
  const startsOn = parseGameDate(input.startsOn)
  const expiresOn = parseGameDate(input.expiresOn)
  if (compareGameDates(expiresOn, startsOn) < 0) throw new RangeError('Financing agreement expiresOn cannot precede startsOn')
  const authorizedPrincipal = positiveAgreementMoney(input.authorizedPrincipal, 'Financing agreement authorized amount')
  if (input.currencyCode !== authorizedPrincipal.currencyCode) throw new RangeError('Financing agreement currencyCode must match the authorized amount currency')
  if (!FUNDING_PARTY_KINDS.includes(input.fundingParty.kind)) throw new TypeError('Financing agreement funding party kind is invalid')
  if (input.fundingParty.kind === 'ORGANIZATION' && input.fundingParty.id === undefined) throw new TypeError('An in-world Organization funding party requires its Organization id')
  if (input.fundingParty.kind === 'PERSON' && input.fundingParty.id === undefined) throw new TypeError('A Person funding party requires its identity')
  const interest: DebtInterest = input.interest ?? { kind: 'NONE' }
  const repayment: DebtRepayment = input.repayment ?? { kind: 'BULLET' }
  if (repayment.kind === 'EXPLICIT_SCHEDULE' && repayment.entries.reduce((sum, entry) => sum + entry.amount.minorUnits, 0) > authorizedPrincipal.minorUnits) {
    throw new RangeError('Financing agreement repayment schedule exceeds the authorized amount')
  }
  const status = input.status ?? 'ACTIVE'
  if (!FINANCING_AGREEMENT_STATUSES.includes(status)) throw new TypeError('Financing agreement status is invalid')
  return Object.freeze({
    id: nonEmpty(input.id, 'Financing agreement id'),
    borrowerOrganizationId: String(input.borrowerOrganizationId) as OrganizationId,
    fundingParty: createTreasuryCounterparty(input.fundingParty),
    debtType: input.debtType,
    currencyCode: authorizedPrincipal.currencyCode,
    authorizedPrincipal,
    startsOn,
    expiresOn,
    interest,
    repayment,
    relatedParty: input.relatedParty ?? false,
    governanceDecisionReference: input.governanceDecisionReference === undefined || input.governanceDecisionReference === null ? null : createFinancialSource(input.governanceDecisionReference),
    status,
    provenance: createFinancialSource(input.provenance),
    dimensions: input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions),
  })
}

export function createFinancingDrawdown(input: {
  readonly id: string
  readonly agreementId: string
  readonly organizationId: OrganizationId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly drawnOn: GameDate | string
  readonly provenance: FinancialSource
  readonly dimensions?: FinancialDimensionsInput | null
}): FinancingDrawdown {
  return Object.freeze({
    id: nonEmpty(input.id, 'Financing drawdown id'),
    agreementId: nonEmpty(input.agreementId, 'Financing drawdown agreement id'),
    organizationId: String(input.organizationId) as OrganizationId,
    amount: positiveAgreementMoney(input.amount, 'Financing drawdown amount'),
    drawnOn: parseGameDate(input.drawnOn),
    provenance: createFinancialSource(input.provenance),
    dimensions: input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions),
  })
}

/** The executed drawdowns of one agreement, in canonical order. */
export function getAgreementDrawdowns(world: GameWorld, agreementId: string): readonly FinancingDrawdown[] {
  return Object.freeze(Object.values(world.financingDrawdownsById).filter((drawdown) => drawdown.agreementId === agreementId).sort((left, right) => compareGameDates(left.drawnOn, right.drawnOn) || left.id.localeCompare(right.id)))
}

/** Drawn = the canonical drawdown facts, never a second mutable balance. */
export function getDrawnPrincipal(world: GameWorld, agreementId: string, asOfDate?: GameDate | string): Money {
  const agreement = requireAgreement(world, agreementId)
  const asOf = asOfDate === undefined ? undefined : parseGameDate(asOfDate)
  const minorUnits = getAgreementDrawdowns(world, agreementId).filter((drawdown) => asOf === undefined || compareGameDates(drawdown.drawnOn, asOf) <= 0).reduce((sum, drawdown) => sum + drawdown.amount.minorUnits, 0)
  return Object.freeze({ currencyCode: agreement.currencyCode, minorUnits })
}

/** Remaining availability: authorized − canonically executed drawdowns. Derived, never stored. */
export function getRemainingAvailability(world: GameWorld, agreementId: string, asOfDate?: GameDate | string): Money {
  const agreement = requireAgreement(world, agreementId)
  const drawn = getDrawnPrincipal(world, agreementId, asOfDate)
  return Object.freeze({ currencyCode: agreement.currencyCode, minorUnits: agreement.authorizedPrincipal.minorUnits - drawn.minorUnits })
}

/** Agreements of one Organization that may still be drawn on that date, deterministic order. */
export function getActiveFinancingAgreements(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly FinancingAgreement[] {
  const asOf = parseGameDate(asOfDate)
  return Object.freeze(Object.values(world.financingAgreementsById)
    .filter((agreement) => String(agreement.borrowerOrganizationId) === String(organizationId) && agreement.status === 'ACTIVE' && compareGameDates(agreement.startsOn, asOf) <= 0 && compareGameDates(agreement.expiresOn, asOf) >= 0)
    .sort((left, right) => compareGameDates(left.expiresOn, right.expiresOn) || left.id.localeCompare(right.id)))
}

export function validateFinancingAgreementCollections(agreements: readonly FinancingAgreement[], drawdowns: readonly FinancingDrawdown[], world: Pick<GameWorld, 'organizationsById'>): void {
  const agreementIds = new Set<string>()
  for (const agreement of agreements) {
    if (agreementIds.has(agreement.id)) throw new Error(`Duplicate financing agreement ${agreement.id}`)
    agreementIds.add(agreement.id)
    if (!world.organizationsById[agreement.borrowerOrganizationId]) throw new Error(`Financing agreement ${agreement.id} references an unknown borrower Organization`)
    if (agreement.fundingParty.kind === 'ORGANIZATION' && agreement.fundingParty.id !== undefined && !world.organizationsById[agreement.fundingParty.id as OrganizationId]) throw new Error(`Financing agreement ${agreement.id} references an unknown funding Organization`)
    if (String(agreement.fundingParty.id ?? '') === String(agreement.borrowerOrganizationId) && agreement.fundingParty.kind === 'ORGANIZATION') throw new Error(`Financing agreement ${agreement.id} cannot be funded by its own borrower`)
  }
  const drawdownIds = new Set<string>()
  const drawnByAgreement = new Map<string, number>()
  for (const drawdown of drawdowns) {
    if (drawdownIds.has(drawdown.id)) throw new Error(`Duplicate financing drawdown ${drawdown.id}`)
    drawdownIds.add(drawdown.id)
    const agreement = agreements.find((item) => item.id === drawdown.agreementId)
    if (agreement === undefined) throw new Error(`Financing drawdown ${drawdown.id} references an unknown financing agreement`)
    if (String(agreement.borrowerOrganizationId) !== String(drawdown.organizationId)) throw new Error(`Financing drawdown ${drawdown.id} does not belong to its agreement borrower`)
    if (drawdown.amount.currencyCode !== agreement.currencyCode) throw new Error(`Financing drawdown ${drawdown.id} currency does not match its agreement`)
    const drawn = (drawnByAgreement.get(drawdown.agreementId) ?? 0) + drawdown.amount.minorUnits
    if (drawn > agreement.authorizedPrincipal.minorUnits) throw new Error(`Financing drawdowns of ${drawdown.agreementId} exceed its authorized amount`)
    drawnByAgreement.set(drawdown.agreementId, drawn)
  }
}

function requireAgreement(world: GameWorld, agreementId: string): FinancingAgreement {
  const agreement = world.financingAgreementsById[agreementId]
  if (agreement === undefined) throw new Error(`Unknown financing agreement ${agreementId}`)
  return agreement
}

function positiveAgreementMoney(input: Money | { readonly currencyCode: string; readonly minorUnits: number }, label: string): Money {
  const amount = createMoney(input)
  if (amount.minorUnits <= 0) throw new RangeError(`${label} must be greater than zero`)
  return amount
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be non-empty`)
  return value
}
