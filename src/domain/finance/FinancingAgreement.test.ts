import { describe, expect, it } from 'vitest'

import { createGameDate } from '@/domain/date'
import {
  capitalContributionIdFor,
  createCapitalContribution,
  createFinancingAgreement,
  createFinancingDrawdown,
  financingAgreementIdFor,
  financingDrawdownIdFor,
  getActiveFinancingAgreements,
  getAgreementDrawdowns,
  getDrawnPrincipal,
  getRemainingAvailability,
  validateCapitalContributionCollections,
  validateFinancingAgreementCollections,
  type FinancingAgreement,
  type FinancingDrawdown,
} from '@/domain/finance'

const EUR = 'EUR'
const ORGANIZATION = 'acb-team-rmb'
const provenance = { kind: 'TEST_FINANCING', id: 'test-agreement-v1' }

function agreement(overrides: Partial<Parameters<typeof createFinancingAgreement>[0]> = {}) {
  return createFinancingAgreement({
    id: financingAgreementIdFor(ORGANIZATION, 'facility-1'),
    borrowerOrganizationId: ORGANIZATION,
    fundingParty: { kind: 'EXTERNAL', label: 'External financial institution' },
    debtType: 'CREDIT_FACILITY',
    currencyCode: EUR,
    authorizedPrincipal: { currencyCode: EUR, minorUnits: 100_000_000 },
    startsOn: '2026-10-01',
    expiresOn: '2027-06-30',
    provenance,
    ...overrides,
  })
}

describe('BS16L financing agreement authority', () => {
  it('is actor-agnostic: an external institution, an in-world Organization or a Person can fund it', () => {
    for (const fundingParty of [
      { kind: 'EXTERNAL' as const, label: 'External financial institution' },
      { kind: 'ORGANIZATION' as const, id: 'acb-team-bar', label: 'Sister club' },
      { kind: 'PERSON' as const, id: 'person:acb-coach-1', label: 'Head coach' },
    ]) {
      const created = agreement({ fundingParty })
      expect(created.fundingParty.kind).toBe(fundingParty.kind)
      // No funding-party kind is bank-specific and `Person` is never assumed to be an owner.
      expect(created.authorizedPrincipal.minorUnits).toBe(100_000_000)
    }
    expect(() => agreement({ fundingParty: { kind: 'ORGANIZATION', label: 'Anonymous club' } })).toThrow(/Organization id/)
    expect(() => agreement({ fundingParty: { kind: 'PERSON', label: 'Anonymous person' } })).toThrow(/identity/)
  })

  it('separates the authorized facility from what has actually been drawn', () => {
    const facility = agreement()
    const empty = { financingAgreementsById: { [facility.id]: facility }, financingDrawdownsById: {}, organizationsById: { [ORGANIZATION]: {} } }

    // An approved facility is a right to draw, never cash: nothing is drawn until an explicit drawdown exists.
    expect(getDrawnPrincipal(empty as never, facility.id).minorUnits).toBe(0)
    expect(getRemainingAvailability(empty as never, facility.id).minorUnits).toBe(facility.authorizedPrincipal.minorUnits)
    expect(getAgreementDrawdowns(empty as never, facility.id)).toEqual([])

    const first = createFinancingDrawdown({ id: financingDrawdownIdFor(facility.id, 'draw-1'), agreementId: facility.id, organizationId: ORGANIZATION, amount: { currencyCode: EUR, minorUnits: 40_000_000 }, drawnOn: '2026-10-05', provenance: { kind: 'TEST_FINANCING', id: 'draw-1' } })
    const drawn = { financingAgreementsById: { [facility.id]: facility }, financingDrawdownsById: { [first.id]: first }, organizationsById: { [ORGANIZATION]: {} } }
    expect(getDrawnPrincipal(drawn as never, facility.id).minorUnits).toBe(40_000_000)
    expect(getRemainingAvailability(drawn as never, facility.id).minorUnits).toBe(60_000_000)
  })

  it('enforces the draw limit against the authorized amount and matches currency exactly', () => {
    const facility = agreement({ authorizedPrincipal: { currencyCode: EUR, minorUnits: 50_000_000 } })
    const drawdown = createFinancingDrawdown({ id: 'drawdown:over', agreementId: facility.id, organizationId: ORGANIZATION, amount: { currencyCode: EUR, minorUnits: 50_000_001 }, drawnOn: '2026-10-05', provenance })
    const drawdowns = [drawdown]
    expect(() => validateFinancingAgreementCollections([facility], drawdowns as readonly FinancingDrawdown[], { organizationsById: { [ORGANIZATION]: {} } } as never)).toThrow(/exceed its authorized amount/)

    expect(() => createFinancingAgreement({ ...agreementValues(), currencyCode: 'USD' } as Parameters<typeof createFinancingAgreement>[0])).toThrow(/must match the authorized amount currency/)
    const mismatched = [createFinancingDrawdown({ id: 'drawdown:mismatch', agreementId: facility.id, organizationId: ORGANIZATION, amount: { currencyCode: 'USD', minorUnits: 1_000 }, drawnOn: '2026-10-05', provenance })]
    expect(() => validateFinancingAgreementCollections([facility], mismatched, { organizationsById: { [ORGANIZATION]: {} } } as never)).toThrow(/currency does not match its agreement/)
  })

  it('keeps agreements and contributions Organization-scoped and rejects self-funding', () => {
    const facility = agreement()
    expect(() => validateFinancingAgreementCollections([facility], [], { organizationsById: {} } as never)).toThrow(/unknown borrower Organization/)
    const selfFunded = agreement({ fundingParty: { kind: 'ORGANIZATION', id: ORGANIZATION, label: 'Itself' } })
    expect(() => validateFinancingAgreementCollections([selfFunded], [], { organizationsById: { [ORGANIZATION]: {} } } as never)).toThrow(/cannot be funded by its own borrower/)

    const contribution = createCapitalContribution({ id: capitalContributionIdFor(ORGANIZATION, 'capital-1'), recipientOrganizationId: ORGANIZATION, contributor: { kind: 'ORGANIZATION', id: ORGANIZATION, label: 'Itself' }, currencyCode: EUR, amount: { currencyCode: EUR, minorUnits: 1_000 }, effectiveOn: '2026-10-05', provenance })
    expect(() => validateCapitalContributionCollections([contribution], { organizationsById: { [ORGANIZATION]: {} } } as never)).toThrow(/cannot be contributed by its own recipient/)
  })

  it('selects only the agreements that may still be drawn on the date', () => {
    const active = agreement()
    const expired = agreement({ id: financingAgreementIdFor(ORGANIZATION, 'expired'), expiresOn: '2026-10-04' })
    const future = agreement({ id: financingAgreementIdFor(ORGANIZATION, 'future'), startsOn: '2026-11-01' })
    const cancelled = agreement({ id: financingAgreementIdFor(ORGANIZATION, 'cancelled'), status: 'CANCELLED' })
    const world = { financingAgreementsById: { [active.id]: active, [expired.id]: expired, [future.id]: future, [cancelled.id]: cancelled } } as never

    expect(getActiveFinancingAgreements(world, ORGANIZATION, createGameDate(2026, 10, 5)).map((item: FinancingAgreement) => item.id)).toEqual([active.id])
  })
})

function agreementValues(): Parameters<typeof createFinancingAgreement>[0] {
  return {
    id: financingAgreementIdFor(ORGANIZATION, 'facility-1'),
    borrowerOrganizationId: ORGANIZATION,
    fundingParty: { kind: 'EXTERNAL', label: 'External financial institution' },
    debtType: 'CREDIT_FACILITY',
    currencyCode: EUR,
    authorizedPrincipal: { currencyCode: EUR, minorUnits: 100_000_000 },
    startsOn: '2026-10-01',
    expiresOn: '2027-06-30',
    provenance,
  }
}
