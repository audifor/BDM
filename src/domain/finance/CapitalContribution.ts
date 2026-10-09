import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { OrganizationId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { createFinancialDimensions, createFinancialSource, createMoney, type CurrencyCode, type FinancialDimensions, type FinancialDimensionsInput, type FinancialSource, type Money } from './FinancialLedger'
import { createTreasuryCounterparty, type TreasuryCounterparty } from './Treasury'

/**
 * BS16L — the canonical `CapitalContribution`: money an Organization *keeps* rather than owes.
 *
 * Accounting is the distinguishing truth: a contribution is `DR Cash / CR Equity`, with no liability, no repayment
 * schedule and no interest, while financing is `DR Cash / CR Debt Liability`. `CAPITAL ≠ REVENUE` (it is not
 * income and never improves operating profit) and `FINANCE EQUITY ≠ OWNERSHIP RIGHTS`: recording contributed
 * capital says nothing about shares, voting rights, board seats or control, which remain a separate canonical
 * Ownership/Governance fact. BS16L therefore does not invent dilution or security mechanics.
 *
 * The contributor is deliberately generic (an external owner/investor outside the simulated ledgers, another
 * in-world Organization, or a Person) and the same funding-source honesty applies: an external contributor's
 * signed contribution fact is the provenance of the cash, an in-world Organization must conserve world cash, and a
 * Person needs a personal-wealth authority that BDM does not have yet, so nothing is invented for them.
 */
export const CAPITAL_CONTRIBUTION_PROVENANCE_KIND = 'CAPITAL_CONTRIBUTION' as const

export interface CapitalContribution {
  readonly id: string
  readonly recipientOrganizationId: OrganizationId
  readonly contributor: TreasuryCounterparty
  readonly currencyCode: CurrencyCode
  readonly amount: Money
  readonly effectiveOn: GameDate
  readonly relatedParty: boolean
  readonly governanceDecisionReference: FinancialSource | null
  readonly provenance: FinancialSource
  readonly dimensions: FinancialDimensions | null
}

export function capitalContributionIdFor(organizationId: OrganizationId | string, key: string): string {
  if (typeof key !== 'string' || key.trim() === '') throw new TypeError('Capital contribution key must be non-empty')
  return `capital-contribution:${String(organizationId)}:${key}`
}

export function createCapitalContribution(input: {
  readonly id: string
  readonly recipientOrganizationId: OrganizationId | string
  readonly contributor: TreasuryCounterparty
  readonly currencyCode: string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly effectiveOn: GameDate | string
  readonly relatedParty?: boolean
  readonly governanceDecisionReference?: FinancialSource | null
  readonly provenance: FinancialSource
  readonly dimensions?: FinancialDimensionsInput | null
}): CapitalContribution {
  const amount = createMoney(input.amount)
  if (amount.minorUnits <= 0) throw new RangeError('Capital contribution amount must be greater than zero')
  if (input.currencyCode !== amount.currencyCode) throw new RangeError('Capital contribution currencyCode must match the amount currency')
  if (input.contributor.kind === 'ORGANIZATION' && input.contributor.id === undefined) throw new TypeError('An in-world Organization contributor requires its Organization id')
  if (input.contributor.kind === 'PERSON' && input.contributor.id === undefined) throw new TypeError('A Person contributor requires its identity')
  return Object.freeze({
    id: nonEmpty(input.id, 'Capital contribution id'),
    recipientOrganizationId: String(input.recipientOrganizationId) as OrganizationId,
    contributor: createTreasuryCounterparty(input.contributor),
    currencyCode: amount.currencyCode,
    amount,
    effectiveOn: parseGameDate(input.effectiveOn),
    relatedParty: input.relatedParty ?? false,
    governanceDecisionReference: input.governanceDecisionReference === undefined || input.governanceDecisionReference === null ? null : createFinancialSource(input.governanceDecisionReference),
    provenance: createFinancialSource(input.provenance),
    dimensions: input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions),
  })
}

/** Contributions of one Organization effective on or before `asOfDate`, deterministic order. */
export function getCapitalContributionsAsOf(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly CapitalContribution[] {
  const asOf = parseGameDate(asOfDate)
  return Object.freeze(Object.values(world.capitalContributionsById)
    .filter((contribution) => String(contribution.recipientOrganizationId) === String(organizationId) && compareGameDates(contribution.effectiveOn, asOf) <= 0)
    .sort((left, right) => compareGameDates(left.effectiveOn, right.effectiveOn) || left.id.localeCompare(right.id)))
}

export function validateCapitalContributionCollections(contributions: readonly CapitalContribution[], world: Pick<GameWorld, 'organizationsById'>): void {
  const ids = new Set<string>()
  for (const contribution of contributions) {
    if (ids.has(contribution.id)) throw new Error(`Duplicate capital contribution ${contribution.id}`)
    ids.add(contribution.id)
    if (!world.organizationsById[contribution.recipientOrganizationId]) throw new Error(`Capital contribution ${contribution.id} references an unknown recipient Organization`)
    if (contribution.contributor.kind === 'ORGANIZATION' && contribution.contributor.id !== undefined && !world.organizationsById[contribution.contributor.id as OrganizationId]) throw new Error(`Capital contribution ${contribution.id} references an unknown contributor Organization`)
    if (contribution.contributor.kind === 'ORGANIZATION' && String(contribution.contributor.id) === String(contribution.recipientOrganizationId)) throw new Error(`Capital contribution ${contribution.id} cannot be contributed by its own recipient`)
  }
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be non-empty`)
  return value
}
