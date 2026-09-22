import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { createOrganizationControl, createOrganizationOwnership, type OrganizationOwnershipActor } from '@/domain/ownership'
import { createOrganizationOwnershipTransaction, createOrganizationOwnershipTransactionEvent } from '@/domain/ownership/OrganizationOwnershipTransaction'
import { createOrganizationCapitalRaise, createOrganizationCapitalRaiseEvent, createOrganizationInvestmentProposal, createOrganizationInvestmentProposalEvent, executeOrganizationInvestmentProposal } from '@/domain/investment'
import { createOrganizationInvestorInterest } from '@/domain/investment/OrganizationInvestorInterest'
import { executeOrganizationOwnershipTransaction } from '@/domain/ownership/OrganizationOwnershipTransactionExecution'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createMultiClubOwnershipPolicy, assessMultiClubConflict, assessMultiClubConflictsForPolicy, deriveMultiClubRelationshipCandidate, findCommonControllers, findCommonOwnershipActors, findMultiClubRelationshipCandidatesForPolicy, getDirectOrganizationOwnership, getOrganizationsDirectlyOwnedByActor, resolveEffectiveOrganizationOwnership, previewInvestmentProposalMultiClubImpact, previewOwnershipTransactionMultiClubImpact } from './index'

function fixture() {
  const world = createNewGame()
  const competition = Object.values(world.competitions)[0]!
  const teams = competition.participantTeamIds.map((id) => world.teams[id]).filter((team): team is NonNullable<typeof team> => team !== undefined)
  const organizations = [...new Map(teams.map((team) => [team.organizationId, team.organizationId])).values()]
  const organizationAId = organizations[0]!
  const organizationBId = organizations.find((id) => id !== organizationAId)!
  const holdingId = Object.values(world.organizationsById).find((organization) => organization.id !== organizationAId && organization.id !== organizationBId)!.id
  const people = Object.values(world.personsById).slice(0, 4)
  return { world, competition, organizationAId, organizationBId, holdingId, people }
}

function ownership(id: string, organizationId: string, owner: OrganizationOwnershipActor, ownershipPercentage: number | null, validFrom = '2020-01-01') {
  return createOrganizationOwnership({ id, organizationId, owner, ownershipPercentage, validFrom, validTo: null })
}

function policy(f: ReturnType<typeof fixture>, overrides: Partial<Parameters<typeof createMultiClubOwnershipPolicy>[0]> = {}) {
  return createMultiClubOwnershipPolicy({ id: 'policy:competition', scope: { kind: 'COMPETITION', competitionId: f.competition.id }, effectiveFrom: null, effectiveTo: null, commonControlRule: 'IGNORE', ownershipThresholdPercentage: 25, includeIndirectOwnership: true, enforcement: 'ADVISORY', ...overrides })
}

function ownershipFixture(f: ReturnType<typeof fixture>) {
  const personA = { kind: 'PERSON' as const, personId: f.people[0]!.id }
  const personB = { kind: 'PERSON' as const, personId: f.people[1]!.id }
  return [
    ownership('ownership:a:person', f.organizationAId, personA, 5),
    ownership('ownership:a:holding', f.organizationAId, { kind: 'ORGANIZATION', organizationId: f.holdingId }, 20),
    ownership('ownership:holding:person', f.holdingId, personA, 50),
    ownership('ownership:b:person', f.organizationBId, personA, 25),
    ownership('ownership:b:other', f.organizationBId, personB, 75),
  ]
}

describe('BG8D multi-club ownership and conflict engine', () => {
  it('resolves direct, inverse, indirect and multiple ownership paths deterministically', () => {
    const f = fixture()
    const world = Object.freeze({ ...f.world, ...{ organizationOwnershipById: Object.fromEntries(ownershipFixture(f).map((row) => [row.id, row])) } })
    const direct = getDirectOrganizationOwnership(world, f.organizationAId, parseGameDate('2030-01-01'))
    expect(direct.map((row) => row.id)).toEqual(['ownership:a:holding', 'ownership:a:person'])
    expect(getOrganizationsDirectlyOwnedByActor(world, { kind: 'PERSON', personId: f.people[0]!.id }, parseGameDate('2030-01-01'))).toEqual([f.holdingId, f.organizationAId, f.organizationBId].sort())
    const graph = resolveEffectiveOrganizationOwnership(world, f.organizationAId, parseGameDate('2030-01-01'))
    const person = graph.resolutions.find((resolution) => resolution.actor.kind === 'PERSON' && resolution.actor.personId === f.people[0]!.id)!
    expect(person.knownPercentage).toBe(15)
    expect(person.hasUnknownContribution).toBe(false)
    const common = findCommonOwnershipActors(world, f.organizationAId, f.organizationBId, parseGameDate('2030-01-01'))
    expect(common[0]!.knownPercentageA).toBe(15)
    expect(common[0]!.knownPercentageB).toBe(25)
  })

  it('exposes unknown percentage and cycles without guessing or recursing forever', () => {
    const f = fixture()
    const person = { kind: 'PERSON' as const, personId: f.people[0]!.id }
    const unknownWorld = Object.freeze({ ...f.world, ...{ organizationOwnershipById: Object.fromEntries([
      ownership('unknown:a', f.organizationAId, person, 30),
      ownership('unknown:b:holding', f.organizationBId, { kind: 'ORGANIZATION', organizationId: f.holdingId }, null),
      ownership('unknown:holding:person', f.holdingId, person, 100),
    ].map((row) => [row.id, row])) } })
    const unknown = findCommonOwnershipActors(unknownWorld, f.organizationAId, f.organizationBId)
    expect(unknown[0]!.hasUnknownContributionB).toBe(true)
    const cyclicWorld = Object.freeze({ ...f.world, ...{ organizationOwnershipById: Object.fromEntries([
      ownership('cycle:a:holding', f.organizationAId, { kind: 'ORGANIZATION', organizationId: f.holdingId }, 10),
      ownership('cycle:holding:person', f.holdingId, person, 100),
      ownership('cycle:holding:self', f.holdingId, { kind: 'ORGANIZATION', organizationId: f.organizationAId }, 20),
    ].map((row) => [row.id, row])) } })
    expect(resolveEffectiveOrganizationOwnership(cyclicWorld, f.organizationAId).hasCycle).toBe(true)
    expect(assessMultiClubConflict(cyclicWorld, policy(f), f.organizationAId, f.organizationBId).verdict).toBe('INDETERMINATE')
  })

  it('keeps ownership and control separate and derives common controllers explicitly', () => {
    const f = fixture()
    const controller = { kind: 'PERSON' as const, personId: f.people[2]!.id }
    const world = Object.freeze({ ...f.world, ...{
      organizationControlById: Object.fromEntries([
        createOrganizationControl({ id: 'control:a', organizationId: f.organizationAId, controller, validFrom: '2020-01-01', validTo: null }),
        createOrganizationControl({ id: 'control:b', organizationId: f.organizationBId, controller, validFrom: '2020-01-01', validTo: null }),
      ].map((row) => [row.id, row])),
    } })
    expect(findCommonControllers(world, f.organizationAId, f.organizationBId)).toHaveLength(1)
    expect(deriveMultiClubRelationshipCandidate(world, f.organizationAId, f.organizationAId).commonControllers).toEqual([])
  })

  it.each([
    ['below threshold', 24, 25, 'CLEAR'],
    ['at threshold', 25, 25, 'CONFLICT'],
    ['above threshold', 30, 25, 'CONFLICT'],
  ] as const)('evaluates threshold policy: %s', (_label, aPercentage, bPercentage, verdict) => {
    const f = fixture()
    const actor = { kind: 'PERSON' as const, personId: f.people[0]!.id }
    const world = Object.freeze({ ...f.world, ...{ organizationOwnershipById: Object.fromEntries([
      ownership('threshold:a', f.organizationAId, actor, aPercentage),
      ownership('threshold:a:other', f.organizationAId, { kind: 'PERSON', personId: f.people[1]!.id }, 100 - aPercentage),
      ownership('threshold:b', f.organizationBId, actor, bPercentage),
      ownership('threshold:b:other', f.organizationBId, { kind: 'PERSON', personId: f.people[2]!.id }, 100 - bPercentage),
    ].map((row) => [row.id, row])) } })
    const result = assessMultiClubConflict(world, policy(f, { ownershipThresholdPercentage: 25 }), f.organizationAId, f.organizationBId)
    expect(result.verdict).toBe(verdict)
  })

  it('supports direct-only policy, control conflicts and indeterminate outcomes', () => {
    const f = fixture()
    const world = Object.freeze({ ...f.world, ...{ organizationOwnershipById: Object.fromEntries(ownershipFixture(f).map((row) => [row.id, row])) } })
    expect(assessMultiClubConflict(world, policy(f, { ownershipThresholdPercentage: 20, includeIndirectOwnership: false }), f.organizationAId, f.organizationBId).verdict).toBe('CLEAR')
    const controlled = Object.freeze({ ...world, ...{ organizationControlById: Object.fromEntries([
      createOrganizationControl({ id: 'control:a', organizationId: f.organizationAId, controller: { kind: 'PERSON', personId: f.people[2]!.id }, validFrom: '2020-01-01', validTo: null }),
      createOrganizationControl({ id: 'control:b', organizationId: f.organizationBId, controller: { kind: 'PERSON', personId: f.people[2]!.id }, validFrom: '2020-01-01', validTo: null }),
    ].map((row) => [row.id, row])) } })
    expect(assessMultiClubConflict(controlled, policy(f, { commonControlRule: 'CONFLICT' }), f.organizationAId, f.organizationBId).reasons).toContain('COMMON_CONTROL')
    const unknown = Object.freeze({ ...f.world, ...{ organizationOwnershipById: Object.fromEntries([
      ownership('indeterminate:a', f.organizationAId, { kind: 'PERSON', personId: f.people[0]!.id }, 30),
      ownership('indeterminate:a:other', f.organizationAId, { kind: 'PERSON', personId: f.people[1]!.id }, 70),
      ownership('indeterminate:b', f.organizationBId, { kind: 'PERSON', personId: f.people[0]!.id }, null),
    ].map((row) => [row.id, row])) } })
    expect(assessMultiClubConflict(unknown, policy(f), f.organizationAId, f.organizationBId).verdict).toBe('INDETERMINATE')
  })

  it('restricts candidate pairs to competition scope and ignores investor interest alone', () => {
    const f = fixture()
    const scoped = findMultiClubRelationshipCandidatesForPolicy(f.world, policy(f))
    expect(scoped.every((candidate) => candidate.organizationAId < candidate.organizationBId)).toBe(true)
    expect(scoped.every((candidate) => candidate.organizationAId !== candidate.organizationBId)).toBe(true)
    const interestWorld = Object.freeze({ ...f.world, ...{
      organizationInvestorInterestsById: Object.fromEntries([
        createOrganizationInvestorInterest({ id: 'interest:a', organizationId: f.organizationAId, investor: { kind: 'PERSON', personId: f.people[0]!.id }, interestType: 'ACQUISITION' }),
        createOrganizationInvestorInterest({ id: 'interest:b', organizationId: f.organizationBId, investor: { kind: 'PERSON', personId: f.people[0]!.id }, interestType: 'ACQUISITION' }),
      ].map((interest) => [interest.id, interest])),
    } })
    expect(assessMultiClubConflictsForPolicy(interestWorld, policy(f))).toEqual(scoped.map((candidate) => expect.objectContaining({ verdict: 'CLEAR' })))
    const ecosystemPolicy = createMultiClubOwnershipPolicy({ ...policy(f), id: 'policy:ecosystem', scope: { kind: 'ECOSYSTEM', ecosystemId: f.competition.ecosystemId } })
    expect(findMultiClubRelationshipCandidatesForPolicy(f.world, ecosystemPolicy).every((candidate) => candidate.organizationAId !== candidate.organizationBId)).toBe(true)
  })

  it('previews and blocks projected BG8B/BG8C conflicts atomically, while advisory permits them', () => {
    const f = fixture()
    const personA = { kind: 'PERSON' as const, personId: f.people[0]!.id }
    const personB = { kind: 'PERSON' as const, personId: f.people[1]!.id }
    const personC = { kind: 'PERSON' as const, personId: f.people[2]!.id }
    const baseOwnership = [
      ownership('projection:a:seller', f.organizationAId, personB, 60),
      ownership('projection:a:buyer', f.organizationAId, personA, 40),
      ownership('projection:b:buyer', f.organizationBId, personA, 50),
      ownership('projection:b:other', f.organizationBId, personC, 50),
    ]
    const transfer = createOrganizationOwnershipTransaction({ id: 'transaction:preview', organizationId: f.organizationAId, seller: personB, buyer: personA, transferredPercentage: 10, agreedOn: '2030-01-01' })
    const transferEvents = [
      createOrganizationOwnershipTransactionEvent({ id: 'transaction:preview:proposed', transactionId: transfer.id, kind: 'PROPOSED', effectiveOn: '2030-01-01' }),
      createOrganizationOwnershipTransactionEvent({ id: 'transaction:preview:approved', transactionId: transfer.id, kind: 'APPROVED', effectiveOn: '2030-01-02' }),
    ]
    const raise = createOrganizationCapitalRaise({ id: 'raise:preview', organizationId: f.organizationAId, openedOn: '2030-01-01', targetAmount: 100, currencyCode: 'EUR', maximumEquityPercentage: 30 })
    const proposal = createOrganizationInvestmentProposal({ id: 'proposal:preview', capitalRaiseId: raise.id, investor: personA, amount: 20, currencyCode: 'EUR', requestedEquityPercentage: 20, proposedOn: '2030-01-02' })
    const world = Object.freeze({ ...f.world, ...{
      organizationOwnershipById: Object.fromEntries(baseOwnership.map((row) => [row.id, row])),
      organizationOwnershipTransactionsById: { [transfer.id]: transfer },
      organizationOwnershipTransactionEventsById: Object.fromEntries(transferEvents.map((event) => [event.id, event])),
      organizationCapitalRaisesById: { [raise.id]: raise },
      organizationCapitalRaiseEventsById: { 'raise:preview:opened': createOrganizationCapitalRaiseEvent({ id: 'raise:preview:opened', capitalRaiseId: raise.id, kind: 'OPENED', effectiveOn: '2030-01-01' }) },
      organizationInvestmentProposalsById: { [proposal.id]: proposal },
      organizationInvestmentProposalEventsById: Object.fromEntries([
        createOrganizationInvestmentProposalEvent({ id: 'proposal:preview:proposed', proposalId: proposal.id, kind: 'PROPOSED', effectiveOn: '2030-01-02' }),
        createOrganizationInvestmentProposalEvent({ id: 'proposal:preview:accepted', proposalId: proposal.id, kind: 'ACCEPTED', effectiveOn: '2030-01-03' }),
      ].map((event) => [event.id, event])),
      multiClubOwnershipPoliciesById: { 'policy:competition': policy(f, { ownershipThresholdPercentage: 50, enforcement: 'BLOCK' }) },
    } })
    expect(assessMultiClubConflict(world, 'policy:competition', f.organizationAId, f.organizationBId).verdict).toBe('CLEAR')
    const transferPreview = previewOwnershipTransactionMultiClubImpact(world, transfer.id, '2030-01-03')
    expect(transferPreview.blocked).toBe(true)
    expect(world.organizationOwnershipById['projection:a:buyer' as never]!.validTo).toBe(null)
    const investmentPreview = previewInvestmentProposalMultiClubImpact(world, proposal.id, '2030-01-04')
    expect(investmentPreview.blocked).toBe(true)
    expect(() => executeOrganizationOwnershipTransaction(world, transfer.id, '2030-01-03')).toThrow(/blocks/)
    expect(() => executeOrganizationInvestmentProposal(world, proposal.id, '2030-01-04')).toThrow(/blocks/)
    const advisoryWorld = Object.freeze({ ...world, ...{ multiClubOwnershipPoliciesById: { 'policy:competition': policy(f, { ownershipThresholdPercentage: 50, enforcement: 'ADVISORY' }) } } })
    expect(() => executeOrganizationOwnershipTransaction(advisoryWorld, transfer.id, '2030-01-03')).not.toThrow()
    expect(() => executeOrganizationInvestmentProposal(advisoryWorld, proposal.id, '2030-01-04')).not.toThrow()
  })

  it('persists policies in Save V4 and defaults old V4 to empty', () => {
    const f = fixture()
    const world = Object.freeze({ ...f.world, ...{ multiClubOwnershipPoliciesById: { 'policy:competition': policy(f) } } })
    const roundTrip = deserializeGameWorldV4(serializeGameWorldV4(world, '2030-01-01'))
    expect(Object.keys(roundTrip.multiClubOwnershipPoliciesById)).toEqual(['policy:competition'])
    const payload = serializeGameWorldV4(f.world, '2030-01-01')
    const oldPayload = { ...payload, payload: { ...payload.payload } as typeof payload.payload }
    delete (oldPayload.payload as unknown as Record<string, unknown>).multiClubOwnershipPolicies
    const oldRoundTrip = deserializeGameWorldV4(oldPayload)
    expect(Object.keys(oldRoundTrip.multiClubOwnershipPoliciesById)).toEqual([])
  })
})
