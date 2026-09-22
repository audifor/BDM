import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createOrganizationOwnership, type OrganizationOwnershipActor } from '@/domain/ownership'
import { createOrganizationOwnershipTransaction, createOrganizationOwnershipTransactionEvent } from '@/domain/ownership/OrganizationOwnershipTransaction'
import { createOrganizationCapitalRaise, createOrganizationCapitalRaiseEvent, createOrganizationInvestmentProposal, createOrganizationInvestmentProposalEvent, executeOrganizationInvestmentProposal } from '@/domain/investment'
import { createOrganizationInvestorInterest } from '@/domain/investment/OrganizationInvestorInterest'
import { assessMultiClubConflict, createMultiClubOwnershipPolicy, previewOwnershipTransactionMultiClubImpact } from '@/domain/multiClub'
import { updateGameWorld } from '@/domain/world'
import { createOrganizationStructuralChange } from '@/domain/structuralRegulation/OrganizationStructuralChange'
import { createOrganizationSuccession, resolveOrganizationSuccessionChain } from '@/domain/structuralRegulation/OrganizationSuccession'
import { createRegulatoryOrder } from '@/domain/structuralRegulation/RegulatoryOrder'
import { createRegulatoryRemediationPlan } from '@/domain/structuralRegulation/RegulatoryRemediationPlan'
import { completeRegulatoryRemediationPlan, executeRegulatoryDivestment, satisfyRegulatoryOrder } from '@/domain/structuralRegulation/StructuralRegulationIntegration'
import { executeOrganizationOwnershipTransaction } from '@/domain/ownership/OrganizationOwnershipTransactionExecution'

function fixture() {
  const world = createNewGame()
  const teams = Object.values(world.teams)
  const organizationAId = teams[0]!.organizationId
  const organizationBId = teams.find((team) => team.organizationId !== organizationAId)!.organizationId
  const organizationCId = Object.values(world.organizationsById).find((organization) => organization.id !== organizationAId && organization.id !== organizationBId)!.id
  const people = Object.values(world.personsById)
  const personA = { kind: 'PERSON', personId: people[0]!.id } as const
  const personB = { kind: 'PERSON', personId: people[1]!.id } as const
  const personC = { kind: 'PERSON', personId: people[2]!.id } as const
  const competition = Object.values(world.competitions)[0]!
  const policy = (id: string, enforcement: 'BLOCK' | 'ADVISORY' = 'ADVISORY') => createMultiClubOwnershipPolicy({ id, scope: { kind: 'COMPETITION', competitionId: competition.id }, effectiveFrom: null, effectiveTo: null, commonControlRule: 'IGNORE', ownershipThresholdPercentage: 50, includeIndirectOwnership: true, enforcement })
  return { world, organizationAId, organizationBId, organizationCId, personA, personB, personC, competition, policy }
}

function ownership(id: string, organizationId: string, owner: OrganizationOwnershipActor, percentage: number) {
  return createOrganizationOwnership({ id, organizationId, owner, ownershipPercentage: percentage, validFrom: '2020-01-01', validTo: null })
}

describe('BG8F Governance V2 final integration certification', () => {
  it('certifies BG8D conflict -> BG8E remediation -> BG8B execution -> BG8D CLEAR', () => {
    const f = fixture()
    const transfer = createOrganizationOwnershipTransaction({ id: 'transaction:bg8f:divestment', organizationId: f.organizationAId, seller: f.personA, buyer: f.personC, transferredPercentage: 11, agreedOn: '2030-01-02' })
    const events = [
      createOrganizationOwnershipTransactionEvent({ id: 'transaction:bg8f:divestment:proposed', transactionId: transfer.id, kind: 'PROPOSED', effectiveOn: '2030-01-02' }),
      createOrganizationOwnershipTransactionEvent({ id: 'transaction:bg8f:divestment:approved', transactionId: transfer.id, kind: 'APPROVED', effectiveOn: '2030-01-03' }),
    ]
    const order = createRegulatoryOrder({ id: 'order:bg8f:divestment', issuerOrganizationId: f.organizationBId, targetOrganizationId: f.organizationAId, orderType: 'DIVESTMENT_REQUIRED', status: 'ACTIVE', issuedAt: '2030-01-01', effectiveDate: '2030-01-01', deadline: '2030-12-31', sourceAssessmentId: 'assessment:bg8f:conflict' })
    const plan = createRegulatoryRemediationPlan({ id: 'plan:bg8f:divestment', regulatoryOrderId: order.id, status: 'ACTIVE', proposedAt: '2030-01-01', actions: [{ id: 'action:bg8f:divestment', type: 'DIVEST_OWNERSHIP', organizationStructuralChangeId: null, ownershipTransactionId: transfer.id, competitionId: f.competition.id, seasonId: null, notes: null }] })
    let world = updateGameWorld(f.world, {
      organizationOwnership: [ownership('ownership:bg8f:a:owner', f.organizationAId, f.personA, 60), ownership('ownership:bg8f:a:other', f.organizationAId, f.personB, 40), ownership('ownership:bg8f:b:owner', f.organizationBId, f.personA, 50), ownership('ownership:bg8f:b:other', f.organizationBId, f.personC, 50)],
      multiClubOwnershipPolicies: [f.policy('policy:bg8f:divestment', 'BLOCK')], regulatoryOrders: [order], regulatoryRemediationPlans: [plan], organizationOwnershipTransactions: [transfer], organizationOwnershipTransactionEvents: events,
    })
    expect(assessMultiClubConflict(world, 'policy:bg8f:divestment', f.organizationAId, f.organizationBId).verdict).toBe('CONFLICT')
    expect(() => satisfyRegulatoryOrder(world, order.id, '2030-01-03')).toThrow()
    expect(previewOwnershipTransactionMultiClubImpact(world, transfer.id, '2030-01-04').blocked).toBe(false)
    world = executeRegulatoryDivestment(world, order.id, transfer.id, '2030-01-04')
    expect(assessMultiClubConflict(world, 'policy:bg8f:divestment', f.organizationAId, f.organizationBId).verdict).toBe('CLEAR')
    world = completeRegulatoryRemediationPlan(world, plan.id, '2030-01-04')
    world = satisfyRegulatoryOrder(world, order.id, '2030-01-04')
    expect(world.regulatoryOrdersById[order.id]!.status).toBe('SATISFIED')
    expect(world.organizationOwnershipById['ownership:bg8f:a:owner' as never]!.validTo).toBe('2030-01-03')
  })

  it('certifies interest -> capital raise -> proposal -> dilution -> BG8D assessment', () => {
    const f = fixture()
    const raise = createOrganizationCapitalRaise({ id: 'raise:bg8f', organizationId: f.organizationAId, openedOn: '2030-01-01', targetAmount: 100, currencyCode: 'EUR', maximumEquityPercentage: 20 })
    const proposal = createOrganizationInvestmentProposal({ id: 'proposal:bg8f', capitalRaiseId: raise.id, investor: f.personA, amount: 20, currencyCode: 'EUR', requestedEquityPercentage: 20, proposedOn: '2030-01-02' })
    const interest = createOrganizationInvestorInterest({ id: 'interest:bg8f', organizationId: f.organizationAId, investor: f.personA, interestType: 'ACQUISITION', status: 'OPEN', openedOn: '2030-01-01', closedOn: null })
    const world = updateGameWorld(f.world, {
      organizationOwnership: [ownership('ownership:bg8f:capital:owner', f.organizationAId, f.personB, 60), ownership('ownership:bg8f:capital:other', f.organizationAId, f.personC, 40), ownership('ownership:bg8f:capital:b:owner', f.organizationBId, f.personA, 50), ownership('ownership:bg8f:capital:b:other', f.organizationBId, f.personC, 50)],
      multiClubOwnershipPolicies: [f.policy('policy:bg8f:capital')], organizationInvestorInterests: [interest], organizationCapitalRaises: [raise], organizationCapitalRaiseEvents: [createOrganizationCapitalRaiseEvent({ id: 'raise:bg8f:opened', capitalRaiseId: raise.id, kind: 'OPENED', effectiveOn: '2030-01-01' })], organizationInvestmentProposals: [proposal], organizationInvestmentProposalEvents: [createOrganizationInvestmentProposalEvent({ id: 'proposal:bg8f:proposed', proposalId: proposal.id, kind: 'PROPOSED', effectiveOn: '2030-01-02' }), createOrganizationInvestmentProposalEvent({ id: 'proposal:bg8f:accepted', proposalId: proposal.id, kind: 'ACCEPTED', effectiveOn: '2030-01-03' })],
    })
    const before = assessMultiClubConflict(world, 'policy:bg8f:capital', f.organizationAId, f.organizationBId)
    expect(before.verdict).toBe('CLEAR')
    const executed = executeOrganizationInvestmentProposal(world, proposal.id, '2030-01-04')
    expect(world.organizationOwnershipById['ownership:bg8f:capital:owner' as never]!.validTo).toBe(null)
    expect(executed.organizationOwnershipById['ownership:bg8f:capital:owner' as never]!.validTo).toBe('2030-01-03')
    expect(assessMultiClubConflict(executed, 'policy:bg8f:capital', f.organizationAId, f.organizationBId).verdict).toBe('CONFLICT')
  })

  it('certifies secondary-sale preview agreement with actual ownership execution', () => {
    const f = fixture()
    const transfer = createOrganizationOwnershipTransaction({ id: 'transaction:bg8f:secondary', organizationId: f.organizationAId, seller: f.personB, buyer: f.personA, transferredPercentage: 11, agreedOn: '2030-01-01' })
    const events = [createOrganizationOwnershipTransactionEvent({ id: 'transaction:bg8f:secondary:proposed', transactionId: transfer.id, kind: 'PROPOSED', effectiveOn: '2030-01-01' }), createOrganizationOwnershipTransactionEvent({ id: 'transaction:bg8f:secondary:approved', transactionId: transfer.id, kind: 'APPROVED', effectiveOn: '2030-01-02' })]
    const world = updateGameWorld(f.world, { organizationOwnership: [ownership('ownership:bg8f:secondary:a:owner', f.organizationAId, f.personA, 40), ownership('ownership:bg8f:secondary:a:seller', f.organizationAId, f.personB, 60), ownership('ownership:bg8f:secondary:b:owner', f.organizationBId, f.personA, 50), ownership('ownership:bg8f:secondary:b:other', f.organizationBId, f.personC, 50)], multiClubOwnershipPolicies: [f.policy('policy:bg8f:secondary')], organizationOwnershipTransactions: [transfer], organizationOwnershipTransactionEvents: events })
    const preview = previewOwnershipTransactionMultiClubImpact(world, transfer.id, '2030-01-03')
    const executed = executeOrganizationOwnershipTransaction(world, transfer.id, '2030-01-03')
    expect(assessMultiClubConflict(executed, 'policy:bg8f:secondary', f.organizationAId, f.organizationBId)).toMatchObject(preview.assessments[0])
  })

  it('preserves Organization history through structural succession without rewriting ownership facts', () => {
    const f = fixture()
    const succession = createOrganizationSuccession({ id: 'succession:bg8f', predecessorOrganizationId: f.organizationAId, successorOrganizationId: f.organizationCId, effectiveDate: '2031-01-01', successionType: 'TOTAL', transfersRights: true, transfersObligations: true, transfersCompetitionRights: true })
    const change = createOrganizationStructuralChange({ id: 'change:bg8f', organizationId: f.organizationAId, changeType: 'SUCCESSION', effectiveDate: '2031-01-01', requestedAt: '2030-12-01', predecessorOrganizationIds: [f.organizationAId], successorOrganizationIds: [f.organizationCId] })
    const historicalOwnership = ownership('ownership:bg8f:history', f.organizationAId, f.personA, 100)
    const world = updateGameWorld(f.world, { organizationOwnership: [historicalOwnership], organizationSuccessions: [succession], organizationStructuralChanges: [change] })
    const resolution = resolveOrganizationSuccessionChain(world, f.organizationAId, '2032-01-01')
    expect(resolution.terminalOrganizationId).toBe(f.organizationCId)
    expect(world.organizationOwnershipById[historicalOwnership.id]).toEqual(historicalOwnership)
    expect(world.organizationsById[f.organizationAId]).toBeDefined()
  })
})
