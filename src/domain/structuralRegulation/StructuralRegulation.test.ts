import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createOrganizationOwnership, type OrganizationOwnershipActor } from '@/domain/ownership'
import { createOrganizationOwnershipTransaction, createOrganizationOwnershipTransactionEvent } from '@/domain/ownership/OrganizationOwnershipTransaction'
import { createMultiClubOwnershipPolicy } from '@/domain/multiClub'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createOrganizationLicense, getOrganizationLicensesValidOn } from './OrganizationLicense'
import { createOrganizationStructuralChange, transitionOrganizationStructuralChange } from './OrganizationStructuralChange'
import { createOrganizationSuccession, getEffectiveOrganizationSuccessor, resolveOrganizationSuccessionChain } from './OrganizationSuccession'
import { createRegulatoryOrder, transitionRegulatoryOrder } from './RegulatoryOrder'
import { createRegulatoryRemediationPlan } from './RegulatoryRemediationPlan'
import { executeRegulatoryDivestment, previewRegulatoryDivestment, satisfyRegulatoryOrder } from './StructuralRegulationIntegration'

function fixture() {
  const world = createNewGame()
  const organizations = Object.values(world.organizationsById)
  const organizationAId = Object.values(world.teams)[0]!.organizationId
  const organizationBId = organizations.find((organization) => organization.id !== organizationAId)!.id
  const people = Object.values(world.personsById)
  return { world, organizationAId, organizationBId, personA: { kind: 'PERSON', personId: people[0]!.id } as OrganizationOwnershipActor, personB: { kind: 'PERSON', personId: people[1]!.id } as OrganizationOwnershipActor, personC: { kind: 'PERSON', personId: people[2]!.id } as OrganizationOwnershipActor }
}

describe('BG8E structural and regulatory domain', () => {
  it('keeps identity for rename/relocation and represents merger, split and lifecycle without mutation', () => {
    const f = fixture()
    const rename = createOrganizationStructuralChange({ id: 'change:rename', organizationId: f.organizationAId, changeType: 'RENAME', effectiveDate: '2030-01-02', requestedAt: '2030-01-01', notes: 'branding only' })
    const approved = transitionOrganizationStructuralChange(rename, 'APPROVED', '2030-01-01')
    const executed = transitionOrganizationStructuralChange(approved, 'EXECUTED', '2030-01-02')
    expect(executed.organizationId).toBe(f.organizationAId)
    expect(rename.status).toBe('PROPOSED')
    expect(() => createOrganizationStructuralChange({ id: 'change:bad-merger', organizationId: f.organizationAId, changeType: 'MERGER', effectiveDate: '2030-01-02', requestedAt: '2030-01-01' })).toThrow()
    const merger = createOrganizationStructuralChange({ id: 'change:merger', organizationId: f.organizationAId, changeType: 'MERGER', effectiveDate: '2030-01-02', requestedAt: '2030-01-01', predecessorOrganizationIds: [f.organizationAId, f.organizationBId], successorOrganizationIds: [f.organizationAId] })
    expect(merger.predecessorOrganizationIds).toHaveLength(2)
  })

  it('resolves succession chains and rejects self/cyclic institutional history', () => {
    const f = fixture()
    const third = Object.values(f.world.organizationsById).find((organization) => organization.id !== f.organizationAId && organization.id !== f.organizationBId)!.id
    const first = createOrganizationSuccession({ id: 'succession:one', predecessorOrganizationId: f.organizationAId, successorOrganizationId: f.organizationBId, effectiveDate: '2030-01-01', successionType: 'TOTAL', transfersRights: true, transfersObligations: true, transfersCompetitionRights: true })
    const second = createOrganizationSuccession({ id: 'succession:two', predecessorOrganizationId: f.organizationBId, successorOrganizationId: third, effectiveDate: '2031-01-01', successionType: 'PARTIAL', transfersRights: true, transfersObligations: false, transfersCompetitionRights: false })
    const world = updateGameWorld(f.world, { organizationSuccessions: [first, second] })
    expect(getEffectiveOrganizationSuccessor(world, f.organizationAId, '2032-01-01')).toBe(third)
    expect(resolveOrganizationSuccessionChain(world, f.organizationAId, '2032-01-01').organizationIds).toEqual([f.organizationAId, f.organizationBId, third])
    expect(() => createOrganizationSuccession({ ...first, id: 'succession:self', predecessorOrganizationId: f.organizationAId, successorOrganizationId: f.organizationAId })).toThrow()
    expect(() => updateGameWorld(f.world, { organizationSuccessions: [first, createOrganizationSuccession({ ...second, id: 'succession:cycle', predecessorOrganizationId: f.organizationBId, successorOrganizationId: f.organizationAId })] })).toThrow(/cycle/)
  })

  it('enforces regulatory lifecycle, remediation separation and dated licenses', () => {
    const f = fixture()
    const competition = Object.values(f.world.competitions)[0]!
    const order = createRegulatoryOrder({ id: 'order:license', issuerOrganizationId: f.organizationBId, targetOrganizationId: f.organizationAId, orderType: 'LICENSE_CONDITION', issuedAt: '2030-01-01', effectiveDate: '2030-01-02', deadline: '2030-02-01' })
    expect(() => transitionRegulatoryOrder(order, 'SATISFIED', '2030-01-03')).toThrow()
    const active = transitionRegulatoryOrder(order, 'ACTIVE', '2030-01-02')
    expect(() => transitionRegulatoryOrder(active, 'EXPIRED', '2030-01-15')).toThrow()
    expect(transitionRegulatoryOrder(active, 'EXPIRED', '2030-02-02').status).toBe('EXPIRED')
    const license = createOrganizationLicense({ id: 'license:one', issuerOrganizationId: f.organizationBId, holderOrganizationId: f.organizationAId, scope: { kind: 'COMPETITION', competitionId: competition.id }, status: 'CONDITIONAL', validFrom: '2030-01-02', validTo: '2030-02-01', conditions: ['field only with approval'] })
    const world = updateGameWorld(f.world, { regulatoryOrders: [active], organizationLicenses: [license] })
    expect(getOrganizationLicensesValidOn(world, f.organizationAId, '2030-01-15')).toEqual([license])
    expect(getOrganizationLicensesValidOn(world, f.organizationAId, '2030-02-02')).toEqual([])
    expect(() => transitionRegulatoryOrder(active, 'ACTIVE', '2030-01-03')).toThrow()
    const plan = createRegulatoryRemediationPlan({ id: 'plan:license', regulatoryOrderId: active.id, actions: [{ id: 'action:withdraw', type: 'WITHDRAW_FROM_COMPETITION', organizationStructuralChangeId: null, ownershipTransactionId: null, competitionId: competition.id, seasonId: null, notes: null }], proposedAt: '2030-01-02' })
    expect(plan.status).toBe('PROPOSED')
    const roundTrip = deserializeGameWorldV4(serializeGameWorldV4(updateGameWorld(world, { regulatoryRemediationPlans: [plan] }), '2030-01-03'))
    expect(roundTrip.regulatoryRemediationPlansById[plan.id]).toEqual(plan)
  })

  it('executes forced divestment through BG8B, rechecks BG8D and only then satisfies the order', () => {
    const f = fixture()
    const competition = Object.values(f.world.competitions)[0]!
    const ownership = [
      createOrganizationOwnership({ id: 'ownership:divest:a', organizationId: f.organizationAId, owner: f.personA, ownershipPercentage: 60, validFrom: '2020-01-01' }),
      createOrganizationOwnership({ id: 'ownership:divest:a:other', organizationId: f.organizationAId, owner: f.personB, ownershipPercentage: 40, validFrom: '2020-01-01' }),
      createOrganizationOwnership({ id: 'ownership:divest:b', organizationId: f.organizationBId, owner: f.personA, ownershipPercentage: 50, validFrom: '2020-01-01' }),
      createOrganizationOwnership({ id: 'ownership:divest:b:other', organizationId: f.organizationBId, owner: f.personC, ownershipPercentage: 50, validFrom: '2020-01-01' }),
    ]
    const policy = createMultiClubOwnershipPolicy({ id: 'policy:divest', scope: { kind: 'COMPETITION', competitionId: competition.id }, effectiveFrom: null, effectiveTo: null, commonControlRule: 'IGNORE', ownershipThresholdPercentage: 50, includeIndirectOwnership: true, enforcement: 'BLOCK' })
    const order = createRegulatoryOrder({ id: 'order:divest', issuerOrganizationId: f.organizationBId, targetOrganizationId: f.organizationAId, orderType: 'DIVESTMENT_REQUIRED', status: 'ACTIVE', issuedAt: '2030-01-01', effectiveDate: '2030-01-01', deadline: '2030-12-31', sourceAssessmentId: 'assessment:conflict' })
    const transaction = createOrganizationOwnershipTransaction({ id: 'transaction:divest', organizationId: f.organizationAId, seller: f.personA, buyer: f.personC, transferredPercentage: 11, agreedOn: '2030-01-02' })
    const events = [createOrganizationOwnershipTransactionEvent({ id: 'transaction:divest:proposed', transactionId: transaction.id, kind: 'PROPOSED', effectiveOn: '2030-01-02' }), createOrganizationOwnershipTransactionEvent({ id: 'transaction:divest:approved', transactionId: transaction.id, kind: 'APPROVED', effectiveOn: '2030-01-03' })]
    let world = updateGameWorld(f.world, { organizationOwnership: ownership, multiClubOwnershipPolicies: [policy], regulatoryOrders: [order], organizationOwnershipTransactions: [transaction], organizationOwnershipTransactionEvents: events })
    expect(() => satisfyRegulatoryOrder(world, order.id, '2030-01-03')).toThrow()
    expect(previewRegulatoryDivestment(world, transaction.id, '2030-01-04').blocked).toBe(false)
    world = executeRegulatoryDivestment(world, order.id, transaction.id, '2030-01-04')
    expect(world.organizationOwnershipById['ownership:transaction:divest:seller' as never]!.ownershipPercentage).toBe(49)
    world = satisfyRegulatoryOrder(world, order.id, '2030-01-04')
    expect(world.regulatoryOrdersById[order.id]!.status).toBe('SATISFIED')
  })
})
