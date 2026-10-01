import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { recordPlayerContractSigningDecisionEvent } from '@/app/governance/PlayerContractSigningGovernanceService'
import { createRetentionNegotiation, retentionNegotiationIdFor } from '@/domain/contract/ContractRetentionNegotiation'
import { getPlayerContractStatus } from '@/domain/contract'
import { addYears } from '@/domain/date'
import { createOrganizationFinancialProfile, getContractFinancialSchedule } from '@/domain/finance'
import { staffPersonIdFromString } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { updateGameWorld } from '@/domain/world'
import { reconcileExpiredPlayerContracts } from '@/engine/market/ContractLifecycle'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import type { RetentionTermSet } from '@/domain/contract/ContractRetentionNegotiation'
import { executeAcceptedRetentionAgreement } from './RetentionSigningService'
import { executeContractRelease } from '@/app/market/ContractReleaseService'

function fixture(extraTerms: Partial<RetentionTermSet> = {}) {
  const base = createNewGame()
  const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
  const playerId = team.rosterPlayerIds[0]!
  const predecessor = Object.values(base.contractsById).find((item) => item.playerId === playerId && item.teamId === team.id)!
  const terms = { salary: predecessor.compensation.annualSalary, years: 1, guarantees: [{ year: 1, guaranteedAmount: predecessor.compensation.annualSalary }], ...extraTerms }
  const id = retentionNegotiationIdFor(team.id, playerId, predecessor.id, 'retention-signing-open')
  const negotiation = createRetentionNegotiation({ id, openingActionId: 'retention-signing-open', teamId: team.id, organizationId: team.organizationId, playerId, predecessorContractId: predecessor.id, openedOn: base.currentDate, openedByCoachId: team.coachId!, status: 'ACCEPTED', acceptedTerms: terms, rounds: [] })
  const institution = { id: 'institution:retention-signing-test', universe: 'PROFESSIONAL_CLUB' as const, name: 'Retention governance', teamIds: [team.id] }
  const proposer = staffPersonIdFromString('staff:retention-signing-proposer')
  const approver = staffPersonIdFromString('staff:retention-signing-approver')
  const staff = (id: typeof proposer, lastName: string) => ({ id, identity: { firstName: 'Signing', lastName }, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as unknown as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> } })
  const grants = [
    { id: 'authority:retention-owner-executive', fromBodyId: 'body:retention-owner', toBodyId: 'body:retention-executive', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: base.currentDate },
    { id: 'authority:retention-owner-board', fromBodyId: 'body:retention-owner', toBodyId: 'body:retention-board', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: base.currentDate },
  ]
  const world = updateGameWorld(base, {
    retentionNegotiations: [negotiation],
    governanceInstitutions: [institution],
    governanceBodies: [
      { id: 'body:retention-owner', institutionId: institution.id, kind: 'OWNERSHIP', name: 'Owner' },
      { id: 'body:retention-executive', institutionId: institution.id, kind: 'EXECUTIVE', name: 'Executive' },
      { id: 'body:retention-board', institutionId: institution.id, kind: 'BOARD', name: 'Board' },
    ],
    governanceAppointments: [
      { id: 'appointment:retention-proposer', bodyId: 'body:retention-executive', actor: { kind: 'COACH', id: base.userCoachId }, role: 'CEO', startedOn: base.currentDate },
      { id: 'appointment:retention-approver', bodyId: 'body:retention-board', actor: { kind: 'STAFF', id: approver }, role: 'BOARD_MEMBER', startedOn: base.currentDate },
    ],
    governanceAuthorityGrants: grants,
    governanceDecisionParticipationGrants: [
      { id: 'right:retention-propose', authorityGrantId: grants[0]!.id, bodyId: 'body:retention-executive', edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
      { id: 'right:retention-execute', authorityGrantId: grants[0]!.id, bodyId: 'body:retention-executive', edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const },
      { id: 'right:retention-approve', authorityGrantId: grants[1]!.id, bodyId: 'body:retention-board', edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const },
    ],
    staffPeople: [...Object.values(base.staffPeopleById), staff(proposer, 'Proposer'), staff(approver, 'Approver')],
  })
  return { world, team, negotiation, predecessor, approver }
}

describe('BS11D1 retention signing', () => {
  it('requires Governance, creates one scheduled successor after approval, and is idempotent', () => {
    const setup = fixture()
    const pending = executeAcceptedRetentionAgreement(setup.world, setup.negotiation.id)
    expect(pending.status).toBe('GOVERNANCE_REQUIRED')
    expect(pending.world.contractsById).toEqual(setup.world.contractsById)
    const decision = Object.values(pending.world.governanceDecisionsById).find((item) => item.subject.kind === 'GENERIC' && item.subject.referenceId === `retention:${setup.negotiation.id}`)!
    const approved = recordPlayerContractSigningDecisionEvent(pending.world, { decisionId: decision.id, kind: 'APPROVED', actor: { kind: 'STAFF', id: setup.approver }, bodyId: 'body:retention-board' })
    expect(approved.status).toBe('APPROVED')
    const signed = executeAcceptedRetentionAgreement(approved.world, setup.negotiation.id)
    expect(signed.status, signed.reason).toBe('SIGNED')
    const successor = signed.world.contractsById[signed.contractId!]!
    expect(successor).toMatchObject({ predecessorContractId: setup.predecessor.id, term: { startsOn: setup.predecessor.term.expiresOn }, compensation: { annualSalary: setup.negotiation.acceptedTerms!.salary } })
    expect(successor.term.expiresOn).toBe(addYears(setup.predecessor.term.expiresOn, 1))
    expect(getPlayerContractStatus(successor, signed.world.currentDate)).toBe('scheduled')
    expect(successor.compensation.years?.[0]).toMatchObject({ cashSalary: setup.negotiation.acceptedTerms!.salary, guaranteedAmount: setup.negotiation.acceptedTerms!.salary, capTreatment: { policy: 'NOT_APPLICABLE' } })
    expect(signed.world.contractsById[setup.predecessor.id]).toEqual(setup.predecessor)
    expect(signed.world.retentionNegotiationsById[setup.negotiation.id]?.execution).toMatchObject({ status: 'SIGNED', contractId: successor.id })
    expect(getContractFinancialSchedule(signed.world, { organizationId: setup.team.organizationId, contractId: successor.id, currencyCode: 'EUR' })).toContainEqual(expect.objectContaining({ amount: { currencyCode: 'EUR', minorUnits: setup.negotiation.acceptedTerms!.salary }, compensationStatus: 'GUARANTEED', effectiveOn: successor.term.startsOn }))
    const atActivation = reconcileExpiredPlayerContracts(signed.world, successor.term.startsOn)
    expect(getPlayerContractStatus(successor, successor.term.startsOn)).toBe('active')
    expect(atActivation.teams[setup.team.id]!.rosterPlayerIds).toContain(successor.playerId)
    expect(Object.values(atActivation.playerTransactionsById).some((transaction) => transaction.playerId === successor.playerId && transaction.kind === 'contractExpired')).toBe(false)
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(signed.world, signed.world.currentDate))))
    expect(restored.contractsById[successor.id]?.predecessorContractId).toBe(setup.predecessor.id)
    expect(restored.retentionNegotiationsById[setup.negotiation.id]?.execution).toEqual(signed.world.retentionNegotiationsById[setup.negotiation.id]?.execution)
    expect(executeAcceptedRetentionAgreement(signed.world, setup.negotiation.id)).toMatchObject({ status: 'ALREADY_SIGNED', world: signed.world })
  })

  it('keeps signed Governance and RolePromise history valid when a pre-activation successor chain is released', () => {
    const setup = fixture({ role: 'STARTER' })
    const pending = executeAcceptedRetentionAgreement(setup.world, setup.negotiation.id)
    const decision = Object.values(pending.world.governanceDecisionsById).find((item) => item.subject.kind === 'GENERIC' && item.subject.referenceId === `retention:${setup.negotiation.id}`)!
    const approved = recordPlayerContractSigningDecisionEvent(pending.world, { decisionId: decision.id, kind: 'APPROVED', actor: { kind: 'STAFF', id: setup.approver }, bodyId: 'body:retention-board' })
    const signed = executeAcceptedRetentionAgreement(approved.world, setup.negotiation.id)
    expect(signed.status).toBe('SIGNED')
    if (signed.status !== 'SIGNED') return

    const released = executeContractRelease(signed.world, setup.team.id, setup.negotiation.playerId)
    expect(released.status).toBe('RELEASED')
    if (released.status !== 'RELEASED') return
    expect(released.world.retentionNegotiationsById[setup.negotiation.id]!.execution?.status).toBe('SIGNED')
    expect(released.world.rolePromisesById[`role-promise:signed-retention:${setup.negotiation.id}`]!.status).toBe('BROKEN')
    expect(Object.values(released.world.governanceDecisionEventsById).some((event) => event.decisionId === decision.id && event.kind === 'EXECUTED')).toBe(true)
  })

  it('fails closed on accepted unsupported options without changing the world', () => {
    const setup = fixture({ options: [{ year: 1, type: 'PLAYER', decisionAuthority: 'PLAYER' }] })
    const result = executeAcceptedRetentionAgreement(setup.world, setup.negotiation.id)
    expect(result.status).toBe('UNSUPPORTED_BINDING_TERM')
    expect(result.world).toBe(setup.world)
    expect(Object.values(result.world.contractsById)).toHaveLength(Object.values(setup.world.contractsById).length)
  })

  it('does not propose Governance for a non-accepted negotiation', () => {
    const setup = fixture()
    const open = updateGameWorld(setup.world, { retentionNegotiations: [{ ...setup.negotiation, status: 'OPEN', acceptedTerms: undefined, currentTerms: { salary: setup.negotiation.acceptedTerms!.salary, years: 1 } }] })
    expect(executeAcceptedRetentionAgreement(open, setup.negotiation.id)).toMatchObject({ status: 'NOT_ACCEPTED', world: open })
  })

  it('leaves a denied Governance decision unsigned and unchanged', () => {
    const setup = fixture()
    const pending = executeAcceptedRetentionAgreement(setup.world, setup.negotiation.id)
    const decision = Object.values(pending.world.governanceDecisionsById).find((item) => item.subject.kind === 'GENERIC' && item.subject.referenceId === `retention:${setup.negotiation.id}`)!
    const denied = recordPlayerContractSigningDecisionEvent(pending.world, { decisionId: decision.id, kind: 'REJECTED', actor: { kind: 'STAFF', id: setup.approver }, bodyId: 'body:retention-board' })
    const result = executeAcceptedRetentionAgreement(denied.world, setup.negotiation.id)
    expect(result).toMatchObject({ status: 'GOVERNANCE_DENIED', world: denied.world })
    expect(result.world.contractsById).toEqual(setup.world.contractsById)
  })

  it('records an accepted club agent fee as a separate Finance commitment', () => {
    const setup = fixture({ agentFee: 2_500, agentFeePayer: 'CLUB' })
    const funded = updateGameWorld(setup.world, { organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId: setup.team.organizationId, baseCurrencyCode: 'EUR' })] })
    const pending = executeAcceptedRetentionAgreement(funded, setup.negotiation.id)
    const decision = Object.values(pending.world.governanceDecisionsById).find((item) => item.subject.kind === 'GENERIC' && item.subject.referenceId === `retention:${setup.negotiation.id}`)!
    const approved = recordPlayerContractSigningDecisionEvent(pending.world, { decisionId: decision.id, kind: 'APPROVED', actor: { kind: 'STAFF', id: setup.approver }, bodyId: 'body:retention-board' })
    const signed = executeAcceptedRetentionAgreement(approved.world, setup.negotiation.id)
    expect(signed.status).toBe('SIGNED')
    expect(Object.values(signed.world.financialCommitmentsById).filter((item) => item.provenance.kind === 'PLAYER_AGENT_FEE' && item.provenance.id === `retention:${setup.negotiation.id}`)).toHaveLength(1)
  })
})
