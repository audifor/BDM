import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createGovernanceAuthorityGrant, createGovernanceBody, createGovernanceDecision, createGovernanceDecisionEvent, createGovernanceDecisionParticipationGrant, createGovernanceInstitution } from '@/domain/governance'
import { parseGameDate } from '@/domain/date'
import type { Organization } from '@/domain/organization'
import type { Person } from '@/domain/person'
import type { Team } from '@/domain/team'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import {
  createOrganizationControl,
  createOrganizationOwnership,
  createOrganizationOwnershipTransaction,
  createOrganizationOwnershipTransactionEvent,
  deriveOrganizationOwnershipTransactionStatus,
  executeOrganizationOwnershipTransaction,
  getActiveOrganizationOwnership,
} from './index'

function fixture(): { readonly world: GameWorld; readonly target: Team; readonly people: readonly Person[]; readonly organizations: readonly Organization[] } {
  const world = createNewGame()
  const target = Object.values(world.teams)[0]!
  const people = Object.values(world.personsById).slice(0, 3)
  const organizations = Object.values(world.organizationsById).filter((organization) => organization.id !== target.organizationId).slice(0, 3)
  if (people.length < 3 || organizations.length < 3) throw new Error('Fixture does not contain enough canonical actors')
  return { world, target, people, organizations }
}

function transaction(f: ReturnType<typeof fixture>, overrides: Partial<Parameters<typeof createOrganizationOwnershipTransaction>[0]> = {}) {
  return createOrganizationOwnershipTransaction({
    id: 'transaction:partial',
    organizationId: f.target.organizationId,
    seller: { kind: 'PERSON', personId: f.people[0]!.id },
    buyer: { kind: 'PERSON', personId: f.people[1]!.id },
    transferredPercentage: 20,
    agreedOn: '2030-01-01',
    consideration: { amount: 0, currencyCode: 'EUR' },
    ...overrides,
  })
}

function proposedEvent(id = 'event:proposed', transactionId = 'transaction:partial') {
  return createOrganizationOwnershipTransactionEvent({ id, transactionId, kind: 'PROPOSED', effectiveOn: '2030-01-01' })
}

function worldWithTransaction(f: ReturnType<typeof fixture>, ownership = [
  createOrganizationOwnership({ id: 'ownership:a', organizationId: f.target.organizationId, owner: { kind: 'PERSON', personId: f.people[0]!.id }, ownershipPercentage: 70, validFrom: '2020-01-01', validTo: null }),
  createOrganizationOwnership({ id: 'ownership:b', organizationId: f.target.organizationId, owner: { kind: 'PERSON', personId: f.people[1]!.id }, ownershipPercentage: 20, validFrom: '2020-01-01', validTo: null }),
  createOrganizationOwnership({ id: 'ownership:c', organizationId: f.target.organizationId, owner: { kind: 'PERSON', personId: f.people[2]!.id }, ownershipPercentage: 10, validFrom: '2020-01-01', validTo: null }),
], tx = transaction(f), events = [proposedEvent('event:proposed', tx.id)]): GameWorld {
  return updateGameWorld(f.world, {
    organizationOwnership: ownership,
    organizationControl: [createOrganizationControl({ id: 'control:unchanged', organizationId: f.target.organizationId, controller: { kind: 'PERSON', personId: f.people[2]!.id }, validFrom: '2020-01-01', validTo: null })],
    organizationOwnershipTransactions: [tx],
    organizationOwnershipTransactionEvents: events,
  })
}

describe('organization ownership transactions', () => {
  it('validates immutable transaction facts, consideration, actor pairs, and derived lifecycle status', () => {
    const f = fixture()
    expect(deriveOrganizationOwnershipTransactionStatus([])).toBe('NONE')
    expect(transaction(f).consideration).toEqual({ amount: 0, currencyCode: 'EUR' })
    expect(createOrganizationOwnershipTransaction({ ...transaction(f), id: 'transaction:person-organization', seller: { kind: 'PERSON', personId: f.people[0]!.id }, buyer: { kind: 'ORGANIZATION', organizationId: f.organizations[0]!.id } })).toBeDefined()
    expect(createOrganizationOwnershipTransaction({ ...transaction(f), id: 'transaction:organization-person', seller: { kind: 'ORGANIZATION', organizationId: f.organizations[0]!.id }, buyer: { kind: 'PERSON', personId: f.people[0]!.id } })).toBeDefined()
    expect(createOrganizationOwnershipTransaction({ ...transaction(f), id: 'transaction:organization-organization', seller: { kind: 'ORGANIZATION', organizationId: f.organizations[0]!.id }, buyer: { kind: 'ORGANIZATION', organizationId: f.organizations[1]!.id } })).toBeDefined()
    expect(() => createOrganizationOwnershipTransaction({ ...transaction(f), transferredPercentage: 0 })).toThrow(RangeError)
    expect(() => createOrganizationOwnershipTransaction({ ...transaction(f), transferredPercentage: 101 })).toThrow(RangeError)
    expect(() => createOrganizationOwnershipTransaction({ ...transaction(f), consideration: { amount: -1, currencyCode: 'EUR' } })).toThrow(RangeError)
    expect(() => createOrganizationOwnershipTransaction({ ...transaction(f), consideration: { amount: 1, currencyCode: '' } })).toThrow(TypeError)
    expect(() => createOrganizationOwnershipTransaction({ ...transaction(f), seller: { kind: 'PERSON', personId: f.people[0]!.id }, buyer: { kind: 'PERSON', personId: f.people[0]!.id } })).toThrow(RangeError)

    const world = worldWithTransaction(f)
    expect(deriveOrganizationOwnershipTransactionStatus(Object.values(world.organizationOwnershipTransactionEventsById))).toBe('PROPOSED')
    expect(() => updateGameWorld(world, { organizationOwnershipTransactionEvents: [proposedEvent(), createOrganizationOwnershipTransactionEvent({ id: 'event:executed', transactionId: 'transaction:partial', kind: 'EXECUTED', effectiveOn: '2030-01-02' })] })).toThrow(/Invalid organization ownership transaction transition/)
  })

  it('keeps ownership unchanged through proposal, approval, rejection, and cancellation', () => {
    const f = fixture()
    const world = worldWithTransaction(f)
    const before = world.organizationOwnershipById
    const approved = updateGameWorld(world, { organizationOwnershipTransactionEvents: [proposedEvent(), createOrganizationOwnershipTransactionEvent({ id: 'event:approved', transactionId: 'transaction:partial', kind: 'APPROVED', effectiveOn: '2030-01-02' })] })
    expect(approved.organizationOwnershipById).toEqual(before)
    expect(deriveOrganizationOwnershipTransactionStatus(Object.values(approved.organizationOwnershipTransactionEventsById))).toBe('APPROVED')
    const requested = updateGameWorld(world, { organizationOwnershipTransactionEvents: [proposedEvent(), createOrganizationOwnershipTransactionEvent({ id: 'event:requested', transactionId: 'transaction:partial', kind: 'APPROVAL_REQUESTED', effectiveOn: '2030-01-01' })] })
    expect(requested.organizationOwnershipById).toEqual(before)
    const rejected = updateGameWorld(world, { organizationOwnershipTransactionEvents: [proposedEvent(), createOrganizationOwnershipTransactionEvent({ id: 'event:rejected', transactionId: 'transaction:partial', kind: 'REJECTED', effectiveOn: '2030-01-02' })] })
    expect(rejected.organizationOwnershipById).toEqual(before)
    const cancelled = updateGameWorld(approved, { organizationOwnershipTransactionEvents: [proposedEvent(), createOrganizationOwnershipTransactionEvent({ id: 'event:approved', transactionId: 'transaction:partial', kind: 'APPROVED', effectiveOn: '2030-01-02' }), createOrganizationOwnershipTransactionEvent({ id: 'event:cancelled', transactionId: 'transaction:partial', kind: 'CANCELLED', effectiveOn: '2030-01-03' })] })
    expect(cancelled.organizationOwnershipById).toEqual(before)
  })

  it('executes partial sales atomically, preserves history/unrelated owners, and leaves control unchanged', () => {
    const f = fixture()
    const world = worldWithTransaction(f, undefined, transaction(f), [proposedEvent(), createOrganizationOwnershipTransactionEvent({ id: 'event:approved', transactionId: 'transaction:partial', kind: 'APPROVED', effectiveOn: '2030-01-02' })])
    const executed = executeOrganizationOwnershipTransaction(world, 'transaction:partial', parseGameDate('2030-01-03'))
    const active = getActiveOrganizationOwnership(executed, f.target.organizationId, parseGameDate('2030-01-03'))
    expect(active.map((row) => [row.id, row.owner.kind === 'PERSON' ? row.owner.personId : row.owner.organizationId, row.ownershipPercentage]).sort(([left], [right]) => String(left).localeCompare(String(right)))).toEqual([
      ['ownership:c', f.people[2]!.id, 10],
      ['ownership:transaction:partial:buyer', f.people[1]!.id, 40],
      ['ownership:transaction:partial:seller', f.people[0]!.id, 50],
    ])
    expect(executed.organizationOwnershipById['ownership:a' as never]?.validTo).toBe('2030-01-02')
    expect(executed.organizationOwnershipById['ownership:b' as never]?.validTo).toBe('2030-01-02')
    expect(executed.organizationControlById).toEqual(world.organizationControlById)
    expect(executed.governanceAppointmentsById).toEqual(world.governanceAppointmentsById)
    expect(deriveOrganizationOwnershipTransactionStatus(Object.values(executed.organizationOwnershipTransactionEventsById))).toBe('EXECUTED')
    expect(() => executeOrganizationOwnershipTransaction(executed, 'transaction:partial', parseGameDate('2030-01-03'))).toThrow(/not approved|transition/)
    expect(world.organizationOwnershipById).not.toEqual(executed.organizationOwnershipById)
  })

  it.each([
    ['seller lacks sufficient percentage', [10, 20, 10] as const, 20, /lacks sufficient/],
    ['seller percentage unknown', [null, 20, 10] as const, 20, /seller ownership percentage is unknown/],
    ['buyer percentage unknown', [70, null, 10] as const, 20, /buyer ownership percentage is unknown/],
  ])('rejects unsafe execution: %s', (_label, percentages, transfer, error) => {
    const f = fixture()
    const ownership = percentages.map((percentage, index) => createOrganizationOwnership({ id: `ownership:${index}`, organizationId: f.target.organizationId, owner: { kind: 'PERSON', personId: f.people[index]!.id }, ownershipPercentage: percentage, validFrom: '2020-01-01', validTo: null }))
    const tx = transaction(f, { id: `transaction:${String(_label).replaceAll(' ', '-')}`, transferredPercentage: transfer })
    const world = worldWithTransaction(f, ownership, tx, [proposedEvent('event:proposed', tx.id), createOrganizationOwnershipTransactionEvent({ id: 'event:approved', transactionId: tx.id, kind: 'APPROVED', effectiveOn: '2030-01-02' })])
    expect(() => executeOrganizationOwnershipTransaction(world, tx.id, parseGameDate('2030-01-03'))).toThrow(error)
  })

  it('handles full sale without zero rows and keeps explicit control facts', () => {
    const f = fixture()
    const tx = transaction(f, { id: 'transaction:full', buyer: { kind: 'ORGANIZATION', organizationId: f.organizations[0]!.id }, transferredPercentage: 100 })
    const ownership = [createOrganizationOwnership({ id: 'ownership:full-seller', organizationId: f.target.organizationId, owner: { kind: 'PERSON', personId: f.people[0]!.id }, ownershipPercentage: 100, validFrom: '2020-01-01', validTo: null })]
    const world = worldWithTransaction(f, ownership, tx, [proposedEvent('event:proposed', tx.id), createOrganizationOwnershipTransactionEvent({ id: 'event:approved', transactionId: tx.id, kind: 'APPROVED', effectiveOn: '2030-01-02' })])
    const executed = executeOrganizationOwnershipTransaction(world, tx.id, parseGameDate('2030-01-03'))
    const active = getActiveOrganizationOwnership(executed, f.target.organizationId, parseGameDate('2030-01-03'))
    expect(active).toHaveLength(1)
    expect(active[0]!.owner).toEqual(tx.buyer)
    expect(active[0]!.ownershipPercentage).toBe(100)
    expect(executed.organizationControlById).toEqual(world.organizationControlById)
  })

  it('requires and respects a linked OWNERSHIP_CHANGE Governance decision', () => {
    const f = fixture()
    const institution = createGovernanceInstitution({ id: 'institution:ownership', universe: 'PROFESSIONAL_CLUB', name: 'Ownership Institution', teamIds: [f.target.id] })
    const board = createGovernanceBody({ id: 'body:ownership-board', institutionId: institution.id, kind: 'BOARD', name: 'Board' })
    const executive = createGovernanceBody({ id: 'body:ownership-executive', institutionId: institution.id, kind: 'EXECUTIVE', name: 'Executive' })
    const authority = createGovernanceAuthorityGrant({ id: 'grant:ownership-change', fromBodyId: board.id, toBodyId: executive.id, decision: 'OWNERSHIP_CHANGE', grantedOn: parseGameDate('2029-01-01') })
    const proposer = createGovernanceDecisionParticipationGrant({ id: 'participation:propose', authorityGrantId: authority.id, bodyId: executive.id, edgeParticipant: 'DELEGATE', right: 'PROPOSE' })
    const approver = createGovernanceDecisionParticipationGrant({ id: 'participation:approve', authorityGrantId: authority.id, bodyId: board.id, edgeParticipant: 'DELEGATOR', right: 'APPROVE' })
    const decision = createGovernanceDecision({ id: 'decision:ownership', institutionId: institution.id, decisionType: 'OWNERSHIP_CHANGE', proposedByBodyId: executive.id, proposedOn: parseGameDate('2030-01-01'), subject: { kind: 'ORGANIZATIONAL', institutionId: institution.id } })
    const governanceEvents = [
      createGovernanceDecisionEvent({ id: 'governance-event:proposed', decisionId: decision.id, kind: 'PROPOSED', bodyId: executive.id, effectiveOn: parseGameDate('2030-01-01'), authorityGrantIds: [authority.id] }),
      createGovernanceDecisionEvent({ id: 'governance-event:approved', decisionId: decision.id, kind: 'APPROVED', bodyId: board.id, effectiveOn: parseGameDate('2030-01-02'), authorityGrantIds: [authority.id] }),
    ]
    const tx = transaction(f, { id: 'transaction:governed', governanceDecisionId: decision.id })
    const world = updateGameWorld(f.world, {
      governanceInstitutions: [institution], governanceBodies: [board, executive], governanceAuthorityGrants: [authority], governanceDecisionParticipationGrants: [proposer, approver], governanceDecisions: [decision], governanceDecisionEvents: governanceEvents,
      organizationOwnership: [createOrganizationOwnership({ id: 'ownership:governed', organizationId: f.target.organizationId, owner: { kind: 'PERSON', personId: f.people[0]!.id }, ownershipPercentage: 100, validFrom: '2020-01-01', validTo: null })],
      organizationOwnershipTransactions: [tx], organizationOwnershipTransactionEvents: [proposedEvent('event:governed-proposed', tx.id)],
    })
    const approvedWorld = updateGameWorld(world, { organizationOwnershipTransactionEvents: [proposedEvent('event:governed-proposed', tx.id), createOrganizationOwnershipTransactionEvent({ id: 'event:governed-approved', transactionId: tx.id, kind: 'APPROVED', effectiveOn: '2030-01-03', governanceDecisionId: decision.id })] })
    const executed = executeOrganizationOwnershipTransaction(approvedWorld, tx.id, parseGameDate('2030-01-04'))
    expect(getActiveOrganizationOwnership(executed, f.target.organizationId, parseGameDate('2030-01-04')).map((row) => row.ownershipPercentage)).toEqual([20, 80])

    const rejectedGovernanceEvents = [
      governanceEvents[0]!,
      createGovernanceDecisionEvent({ id: 'governance-event:rejected', decisionId: decision.id, kind: 'REJECTED', bodyId: board.id, effectiveOn: parseGameDate('2030-01-02'), authorityGrantIds: [authority.id] }),
    ]
    expect(() => updateGameWorld(f.world, {
      governanceInstitutions: [institution], governanceBodies: [board, executive], governanceAuthorityGrants: [authority], governanceDecisionParticipationGrants: [proposer, approver], governanceDecisions: [decision], governanceDecisionEvents: rejectedGovernanceEvents,
      organizationOwnership: [createOrganizationOwnership({ id: 'ownership:rejected-governance', organizationId: f.target.organizationId, owner: { kind: 'PERSON', personId: f.people[0]!.id }, ownershipPercentage: 100, validFrom: '2020-01-01', validTo: null })],
      organizationOwnershipTransactions: [tx], organizationOwnershipTransactionEvents: [proposedEvent('event:rejected-governance-proposed', tx.id), createOrganizationOwnershipTransactionEvent({ id: 'event:rejected-governance-approved', transactionId: tx.id, kind: 'APPROVED', effectiveOn: '2030-01-03', governanceDecisionId: decision.id })],
    })).toThrow(/lacks linked Governance approval/)
    expect(() => updateGameWorld(f.world, { organizationOwnershipTransactions: [createOrganizationOwnershipTransaction({ ...tx, governanceDecisionId: 'decision:missing' })], organizationOwnershipTransactionEvents: [proposedEvent('event:missing-proposed', 'transaction:governed')] })).toThrow(/Governance decision/)
    const wrongType = createGovernanceDecision({ ...decision, id: 'decision:wrong-type', decisionType: 'STRATEGIC_PLAN', subject: { kind: 'ORGANIZATIONAL', institutionId: institution.id } })
    expect(() => updateGameWorld(f.world, { governanceInstitutions: [institution], governanceBodies: [board, executive], governanceAuthorityGrants: [authority], governanceDecisionParticipationGrants: [proposer, approver], governanceDecisions: [wrongType], governanceDecisionEvents: [governanceEvents[0]!.id === 'governance-event:proposed' ? { ...governanceEvents[0]!, decisionId: wrongType.id } : governanceEvents[1]!], organizationOwnershipTransactions: [createOrganizationOwnershipTransaction({ ...tx, governanceDecisionId: wrongType.id })], organizationOwnershipTransactionEvents: [proposedEvent('event:wrong-proposed', tx.id)] })).toThrow(/OWNERSHIP_CHANGE/)
  })
})
