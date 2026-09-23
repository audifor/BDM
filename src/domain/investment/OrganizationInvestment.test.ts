import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { createOrganizationControl, createOrganizationOwnership, type OrganizationOwnership } from '@/domain/ownership/OrganizationOwnership'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createOrganizationCapitalRaise, createOrganizationCapitalRaiseEvent, createOrganizationInvestmentProposal, createOrganizationInvestmentProposalEvent, createOrganizationInvestorInterest, executeOrganizationInvestmentProposal, findActiveCapitalRaises, findInterestedInvestorsForOrganization, findMatchingInvestorInterestsForCapitalRaise, findOrganizationsOfInterestForInvestor, getActiveInvestorInterests, getInvestorOrganizationInterests } from './index'

function fixture(): { readonly world: GameWorld; readonly organizationId: GameWorld['teams'][keyof GameWorld['teams']]['organizationId']; readonly people: readonly GameWorld['personsById'][keyof GameWorld['personsById']][]; readonly organizations: readonly GameWorld['organizationsById'][keyof GameWorld['organizationsById']][] } {
  const world = createNewGame()
  const team = Object.values(world.teams)[0]!
  return { world, organizationId: team.organizationId, people: Object.values(world.personsById).slice(0, 3), organizations: Object.values(world.organizationsById).filter((organization) => organization.id !== team.organizationId).slice(0, 2) }
}

function interest(f: ReturnType<typeof fixture>, overrides: Partial<Parameters<typeof createOrganizationInvestorInterest>[0]> = {}) {
  return createOrganizationInvestorInterest({ id: 'interest:one', organizationId: f.organizationId, investor: { kind: 'PERSON', personId: f.people[0]!.id }, interestType: 'ACQUISITION', status: 'OPEN', openedOn: '2029-01-01', closedOn: null, ...overrides })
}

function raise(f: ReturnType<typeof fixture>, overrides: Partial<Parameters<typeof createOrganizationCapitalRaise>[0]> = {}) {
  return createOrganizationCapitalRaise({ id: 'raise:one', organizationId: f.organizationId, openedOn: '2030-01-01', targetAmount: 100, currencyCode: 'EUR', maximumEquityPercentage: 40, ...overrides })
}

function proposal(f: ReturnType<typeof fixture>, overrides: Partial<Parameters<typeof createOrganizationInvestmentProposal>[0]> = {}) {
  return createOrganizationInvestmentProposal({ id: 'proposal:one', capitalRaiseId: 'raise:one', investor: { kind: 'PERSON', personId: f.people[1]!.id }, amount: 20, currencyCode: 'EUR', requestedEquityPercentage: 20, proposedOn: '2030-01-02', ...overrides })
}

function openRaiseEvents() {
  return [createOrganizationCapitalRaiseEvent({ id: 'raise-event:opened', capitalRaiseId: 'raise:one', kind: 'OPENED', effectiveOn: '2030-01-01' })]
}

function proposalEvents() {
  return [
    createOrganizationInvestmentProposalEvent({ id: 'proposal-event:proposed', proposalId: 'proposal:one', kind: 'PROPOSED', effectiveOn: '2030-01-02' }),
    createOrganizationInvestmentProposalEvent({ id: 'proposal-event:accepted', proposalId: 'proposal:one', kind: 'ACCEPTED', effectiveOn: '2030-01-03' }),
  ]
}

function worldWithProposal(f: ReturnType<typeof fixture>, ownership: readonly OrganizationOwnership[] = [
  createOrganizationOwnership({ id: 'ownership:a', organizationId: f.organizationId, owner: { kind: 'PERSON', personId: f.people[0]!.id }, ownershipPercentage: 90, validFrom: '2020-01-01', validTo: null }),
  createOrganizationOwnership({ id: 'ownership:b', organizationId: f.organizationId, owner: { kind: 'PERSON', personId: f.people[1]!.id }, ownershipPercentage: 10, validFrom: '2020-01-01', validTo: null }),
], currentRaise = raise(f), currentProposal = proposal(f), currentProposalEvents = proposalEvents()): GameWorld {
  return updateGameWorld(f.world, {
    organizationOwnership: ownership,
    organizationControl: [createOrganizationControl({ id: 'control:stable', organizationId: f.organizationId, controller: { kind: 'PERSON', personId: f.people[2]!.id }, validFrom: '2020-01-01', validTo: null })],
    organizationCapitalRaises: [currentRaise], organizationCapitalRaiseEvents: openRaiseEvents(),
    organizationInvestmentProposals: [currentProposal], organizationInvestmentProposalEvents: currentProposalEvents,
  })
}

describe('BG8C investment and primary equity', () => {
  it('keeps investor interest separate and provides deterministic temporal searches', () => {
    const f = fixture()
    const personInterest = interest(f)
    const organizationInterest = interest(f, { id: 'interest:organization', investor: { kind: 'ORGANIZATION', organizationId: f.organizations[0]!.id }, interestType: 'PARTNERSHIP', openedOn: null, closedOn: '2029-12-31' })
    const world = updateGameWorld(f.world, { organizationInvestorInterests: [personInterest, organizationInterest] })
    expect(getActiveInvestorInterests(world, f.organizationId, parseGameDate('2029-06-01'))).toEqual([personInterest, organizationInterest])
    expect(getActiveInvestorInterests(world, f.organizationId, parseGameDate('2030-01-01'))).toEqual([personInterest])
    expect(getInvestorOrganizationInterests(world, personInterest.investor, parseGameDate('2030-01-01'))).toEqual([personInterest])
    expect(findInterestedInvestorsForOrganization(world, f.organizationId, parseGameDate('2029-06-01'))).toHaveLength(2)
    expect(findOrganizationsOfInterestForInvestor(world, personInterest.investor, parseGameDate('2029-06-01'))).toEqual([f.organizationId])
    expect(findInterestedInvestorsForOrganization(world, f.organizationId, parseGameDate('2029-12-31'))).toEqual([personInterest.investor, organizationInterest.investor].sort((left, right) => `${left.kind}:${left.kind === 'PERSON' ? left.personId : left.organizationId}`.localeCompare(`${right.kind}:${right.kind === 'PERSON' ? right.personId : right.organizationId}`)))
    expect(world.organizationOwnershipById).toEqual(f.world.organizationOwnershipById)
    expect(world.organizationControlById).toEqual(f.world.organizationControlById)
  })

  it('validates identities, raise boundaries, proposal currency and lifecycle', () => {
    const f = fixture()
    expect(() => createOrganizationCapitalRaise({ ...raise(f), targetAmount: 0 })).toThrow(RangeError)
    expect(() => createOrganizationCapitalRaise({ ...raise(f), maximumEquityPercentage: 100 })).toThrow(RangeError)
    expect(() => createOrganizationInvestmentProposal({ ...proposal(f), amount: 0 })).toThrow(RangeError)
    expect(() => createOrganizationInvestmentProposal({ ...proposal(f), requestedEquityPercentage: 100 })).toThrow(RangeError)
    expect(() => updateGameWorld(f.world, { organizationInvestorInterests: [interest(f, { investor: { kind: 'PERSON', personId: 'person:missing' as never } })] })).toThrow(/investor Person/)
    expect(() => updateGameWorld(f.world, { organizationInvestorInterests: [interest(f, { organizationId: 'organization:missing' })] })).toThrow(/target/)
    expect(() => worldWithProposal(f, undefined, raise(f), proposal(f, { currencyCode: 'USD' }))).toThrow(/currency/)
    expect(() => worldWithProposal(f, undefined, raise(f, { maximumEquityPercentage: 10 }), proposal(f, { requestedEquityPercentage: 20 }))).toThrow(/ceiling/)
    expect(() => updateGameWorld(f.world, { organizationCapitalRaises: [raise(f)], organizationCapitalRaiseEvents: [] })).toThrow(/historical events/)
  })

  it('does not change ownership until accepted execution and dilutes an existing investor deterministically', () => {
    const f = fixture()
    const world = worldWithProposal(f)
    const before = world.organizationOwnershipById
    const accepted = world
    expect(accepted.organizationOwnershipById).toEqual(before)
    const first = executeOrganizationInvestmentProposal(accepted, 'proposal:one', parseGameDate('2030-01-04'))
    const second = executeOrganizationInvestmentProposal(worldWithProposal(f), 'proposal:one', parseGameDate('2030-01-04'))
    expect(first.organizationOwnershipById).toEqual(second.organizationOwnershipById)
    const active = Object.values(first.organizationOwnershipById).filter((row) => row.organizationId === f.organizationId && (row.validFrom === '2030-01-04' || row.validTo === null)).sort((left, right) => left.id.localeCompare(right.id))
    expect(active.map((row) => [row.owner.kind === 'PERSON' ? row.owner.personId : row.owner.organizationId, row.ownershipPercentage])).toEqual([[f.people[0]!.id, 72], [f.people[1]!.id, 28]])
    expect(first.organizationOwnershipById['ownership:a' as never]?.validTo).toBe('2030-01-03')
    expect(first.organizationOwnershipById['ownership:b' as never]?.validTo).toBe('2030-01-03')
    expect(first.organizationControlById).toEqual(world.organizationControlById)
    expect(() => executeOrganizationInvestmentProposal(first, 'proposal:one', parseGameDate('2030-01-04'))).toThrow(/not accepted/)
  })

  it.each([
    ['unknown percentage', [null, 100] as const, /unknown/],
    ['incomplete basis', [40, 40] as const, /expected 100/],
    ['over basis', [60, 50] as const, /expected 100/],
  ])('blocks unsafe dilution: %s', (_label, percentages, error) => {
    const f = fixture()
    const ownership = percentages.map((ownershipPercentage, index) => createOrganizationOwnership({ id: `ownership:${index}`, organizationId: f.organizationId, owner: { kind: 'PERSON', personId: f.people[index]!.id }, ownershipPercentage, validFrom: '2020-01-01', validTo: null }))
    expect(() => executeOrganizationInvestmentProposal(worldWithProposal(f, ownership), 'proposal:one', parseGameDate('2030-01-04'))).toThrow(error)
  })

  it('matches active interests and capital raises without inventing investor scoring', () => {
    const f = fixture()
    const currentRaise = raise(f)
    const currentInterest = interest(f, { organizationId: f.organizationId })
    const world = updateGameWorld(f.world, { organizationInvestorInterests: [currentInterest], organizationCapitalRaises: [currentRaise], organizationCapitalRaiseEvents: openRaiseEvents() })
    expect(findActiveCapitalRaises(world, parseGameDate('2030-01-02'))).toEqual([currentRaise])
    expect(findMatchingInvestorInterestsForCapitalRaise(world, currentRaise.id, parseGameDate('2030-01-02'))).toEqual([currentInterest])
  })
})
