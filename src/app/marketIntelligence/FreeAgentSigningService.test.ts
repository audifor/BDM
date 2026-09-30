import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createOrganizationFinancialProfile } from '@/domain/finance'
import { addDays, addYears } from '@/domain/date'
import { contractIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import type { ContractNegotiation, NegotiationRole } from '@/domain/market'
import { createPlayerContract } from '@/domain/contract'
import { clearPlayerFromLineup } from '@/domain/tactics'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { deserializeGameWorldV3, serializeGameWorldV3 } from '@/save/GameWorldSaveV3'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { completeAcceptedFreeAgentSigning, completeAiAcceptedFreeAgentSignings } from './FreeAgentSigningService'

function fixture(input: { readonly status?: 'OPEN' | 'ACCEPTED'; readonly role?: NegotiationRole; readonly agentFee?: number; readonly teamId?: string } = {}) {
  const base = createNewGame()
  const team = input.teamId === undefined
    ? Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
    : base.teams[input.teamId as keyof typeof base.teams]!
  const playerId = team.rosterPlayerIds[0]!
  const player = base.players[playerId]!
  const baseContracts = Object.values(base.contractsById).map((contract) => contract.playerId === player.id
    ? { ...contract, termination: { terminatedOn: base.currentDate, reason: 'released' as const } }
    : contract)
  const negotiation: ContractNegotiation = {
    id: 'negotiation:bs10d-g:test',
    organizationId: team.organizationId,
    teamId: team.id,
    playerId: player.id,
    sourceProposalId: 'proposal:bs10d-g:test',
    status: input.status ?? 'ACCEPTED',
    salary: 1_234_567,
    years: 3,
    ...(input.role === undefined ? {} : { role: input.role }),
    ...(input.agentFee === undefined ? {} : { agentFee: input.agentFee }),
    round: 1,
  }
  const world = updateGameWorld(base, {
    negotiations: [negotiation],
    teamFinances: Object.values(base.teamFinancesByTeamId).map((finances) => finances.teamId === team.id ? { ...finances, playerSalaryBudget: 1_000_000_000 } : finances),
    contracts: baseContracts,
    teams: Object.values(base.teams).map((item) => item.id === team.id ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => id !== player.id) } : item),
    lineupsByTeamId: Object.fromEntries(Object.entries(base.lineupsByTeamId).map(([id, lineup]) => [id, clearPlayerFromLineup(lineup, player.id)])),
  })
  return { world, team, player, negotiation }
}

function withGovernance(world: ReturnType<typeof createNewGame>, negotiation: ContractNegotiation, approved: boolean) {
  const institution = { id: 'governance:signing-test', universe: 'PROFESSIONAL_CLUB' as const, name: 'Signing test club', teamIds: [negotiation.teamId!] }
  const authorities = [
    { id: 'authority:board-executive', fromBodyId: 'body:board', toBodyId: 'body:executive', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: world.currentDate },
    { id: 'authority:owner-board', fromBodyId: 'body:owner', toBodyId: 'body:board', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: world.currentDate },
  ]
  const rights = [
    { id: 'right:propose', authorityGrantId: authorities[0]!.id, bodyId: 'body:executive', edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
    { id: 'right:execute', authorityGrantId: authorities[0]!.id, bodyId: 'body:executive', edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const },
    { id: 'right:approve', authorityGrantId: authorities[1]!.id, bodyId: 'body:board', edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const },
  ]
  const decision = { id: 'decision:signing-test', institutionId: institution.id, decisionType: 'PLAYER_CONTRACT_SIGNING' as const, proposedByBodyId: 'body:executive', proposedOn: world.currentDate, subject: { kind: 'GENERIC' as const, referenceId: negotiation.id } }
  const events = [
    { id: '01:proposed', decisionId: decision.id, kind: 'PROPOSED' as const, bodyId: 'body:executive', effectiveOn: world.currentDate, authorityGrantIds: [authorities[0]!.id] },
    ...(approved ? [{ id: '02:approved', decisionId: decision.id, kind: 'APPROVED' as const, bodyId: 'body:board', effectiveOn: world.currentDate, authorityGrantIds: [authorities[1]!.id] }] : []),
  ]
  return updateGameWorld(world, {
    governanceInstitutions: [institution],
    governanceBodies: [
      { id: 'body:owner', institutionId: institution.id, kind: 'OWNERSHIP', name: 'Owner' },
      { id: 'body:board', institutionId: institution.id, kind: 'BOARD', name: 'Board' },
      { id: 'body:executive', institutionId: institution.id, kind: 'EXECUTIVE', name: 'Executive' },
    ],
    governanceAuthorityGrants: authorities,
    governanceDecisionParticipationGrants: rights,
    governanceDecisions: [decision],
    governanceDecisionEvents: events,
  })
}

describe('completeAcceptedFreeAgentSigning', () => {
  it('accepts only the canonical ACCEPTED negotiation', () => {
    const { world, team, negotiation } = fixture({ status: 'OPEN' })
    const result = completeAcceptedFreeAgentSigning(world, { teamId: team.id, negotiationId: negotiation.id, expectedProposalId: negotiation.sourceProposalId! })
    expect(result.status).toBe('NOT_ACCEPTED')
    expect(result.world).toBe(world)
  })

  it('returns approval required without signing before every required Governance approval', () => {
    const setup = fixture()
    const pending = withGovernance(setup.world, setup.negotiation, false)
    const result = completeAcceptedFreeAgentSigning(pending, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(result.status).toBe('REQUIRES_APPROVAL')
    expect(result.world).toBe(pending)
  })

  it('does not treat a missing signing mapping as approval', () => {
    const setup = fixture()
    const result = completeAcceptedFreeAgentSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(result.status).toBe('UNKNOWN')
    expect(result.world).toBe(setup.world)
  })

  it('does not accept PLAYER_BUDGET authority for a binding signing', () => {
    const setup = fixture()
    const institution = { id: 'governance:budget-only', universe: 'PROFESSIONAL_CLUB' as const, name: 'Budget-only club', teamIds: [setup.team.id] }
    const budgetOnly = updateGameWorld(setup.world, {
      governanceInstitutions: [institution],
      governanceBodies: [
        { id: 'body:budget-owner', institutionId: institution.id, kind: 'OWNERSHIP', name: 'Owner' },
        { id: 'body:budget-board', institutionId: institution.id, kind: 'BOARD', name: 'Budget board' },
      ],
      governanceAuthorityGrants: [{ id: 'authority:budget-only', fromBodyId: 'body:budget-owner', toBodyId: 'body:budget-board', decision: 'PLAYER_BUDGET', grantedOn: setup.world.currentDate }],
      governanceDecisionParticipationGrants: [{ id: 'right:budget-approve', authorityGrantId: 'authority:budget-only', bodyId: 'body:budget-board', edgeParticipant: 'DELEGATE', right: 'APPROVE' }],
    })
    const result = completeAcceptedFreeAgentSigning(budgetOnly, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(result.status).toBe('UNKNOWN')
    expect(result.world).toBe(budgetOnly)
  })

  it('creates exact contract dates, roster entry, transaction, decision effect and role promise atomically', () => {
    const setup = fixture({ role: 'STARTER' })
    const approved = withGovernance(setup.world, setup.negotiation, true)
    const result = completeAcceptedFreeAgentSigning(approved, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(result.status).toBe('SIGNED')
    expect(result.negotiation).toMatchObject({ status: 'SIGNED', signedOn: approved.currentDate, salary: setup.negotiation.salary, years: setup.negotiation.years, role: 'STARTER' })
    const contract = result.world.contractsById[result.contractId as never]!
    expect(contract).toMatchObject({ playerId: setup.player.id, teamId: setup.team.id, term: { startsOn: approved.currentDate, expiresOn: addYears(approved.currentDate, 3) }, compensation: { annualSalary: 1_234_567 } })
    expect(result.world.teams[setup.team.id]!.rosterPlayerIds.filter((id) => id === setup.player.id)).toHaveLength(1)
    expect(Object.values(result.world.playerTransactionsById).filter((entry) => entry.contractId === contract.id)).toHaveLength(1)
    expect(Object.values(result.world.rolePromisesById)).toEqual([expect.objectContaining({ playerId: setup.player.id, role: 'STARTER', acceptedOn: approved.currentDate, status: 'ACTIVE' })])
    expect(Object.values(result.world.governanceDecisionEventsById).filter((event) => event.decisionId === 'decision:signing-test' && event.kind === 'EXECUTED')).toHaveLength(1)
  })

  it('records an agreed agent fee as one sourced Finance commitment and never signs without fee accounting support', () => {
    const setup = fixture({ agentFee: 75_000 })
    const approved = withGovernance(setup.world, setup.negotiation, true)
    const blocked = completeAcceptedFreeAgentSigning(approved, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(blocked.status).toBe('FEE_ACCOUNTING_UNAVAILABLE')
    expect(blocked.world).toBe(approved)

    const financeReady = updateGameWorld(approved, { organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId: setup.team.organizationId, baseCurrencyCode: 'EUR' })] })
    const signed = completeAcceptedFreeAgentSigning(financeReady, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(signed.status).toBe('SIGNED')
    expect(Object.values(signed.world.financialCommitmentsById).filter((item) => item.provenance.kind === 'PLAYER_AGENT_FEE' && item.provenance.id === setup.negotiation.id)).toMatchObject([
      { amount: { currencyCode: 'EUR', minorUnits: 75_000 }, category: 'PLAYER_AGENT_FEE', startsOn: financeReady.currentDate, dueOn: financeReady.currentDate },
    ])
  })

  it('rechecks availability and current payroll, and returns unchanged state for conflicts', () => {
    const setup = fixture()
    const approved = withGovernance(setup.world, setup.negotiation, true)
    const conflictingContract = createPlayerContract({ id: contractIdFromString('contract:signing-conflict'), playerId: setup.player.id, teamId: setup.team.id, kind: 'standard', term: { startsOn: setup.world.currentDate, expiresOn: addDays(setup.world.currentDate, 30) }, compensation: { annualSalary: 100_000 } })
    const unavailable = updateGameWorld(approved, { contracts: [...Object.values(approved.contractsById), conflictingContract] })
    const unavailableResult = completeAcceptedFreeAgentSigning(unavailable, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(unavailableResult.status).toBe('CONFLICT')
    expect(unavailableResult.world).toBe(unavailable)

    const poor = updateGameWorld(approved, { teamFinances: Object.values(approved.teamFinancesByTeamId).map((value) => value.teamId === setup.team.id ? { ...value, playerSalaryBudget: 1 } : value) })
    const poorResult = completeAcceptedFreeAgentSigning(poor, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(poorResult.status).toBe('FINANCIAL_BLOCK')
    expect(poorResult.world).toBe(poor)
  })

  it('returns ALREADY_SIGNED with the unchanged world on exact retry', () => {
    const setup = fixture()
    const approved = withGovernance(setup.world, setup.negotiation, true)
    const first = completeAcceptedFreeAgentSigning(approved, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    const retry = completeAcceptedFreeAgentSigning(first.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(first.status).toBe('SIGNED')
    expect(retry.status).toBe('ALREADY_SIGNED')
    expect(retry.world).toBe(first.world)
    const staleRetry = completeAcceptedFreeAgentSigning(first.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: 'proposal:changed' })
    expect(staleRetry.status).toBe('STALE')
    expect(staleRetry.world).toBe(first.world)
  })

  it('round-trips the signed negotiation links through Save V3', () => {
    const setup = fixture({ role: 'ROTATION' })
    const approved = withGovernance(setup.world, setup.negotiation, true)
    const signed = completeAcceptedFreeAgentSigning(approved, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(signed.status).toBe('SIGNED')
    const loaded = deserializeGameWorldV3(serializeGameWorldV3(signed.world, '2032-10-01T00:00:00.000Z'))
    expect(loaded.negotiationsById[setup.negotiation.id]).toEqual(signed.negotiation)
    expect(loaded.contractsById[signed.contractId as never]).toEqual(signed.world.contractsById[signed.contractId as never])
    const currentSave = deserializeGameWorldV4(serializeGameWorldV4(signed.world, '2032-10-01T00:00:00.000Z'))
    expect(currentSave.negotiationsById[setup.negotiation.id]).toEqual(signed.negotiation)
    expect(currentSave.contractsById[signed.contractId as never]).toEqual(signed.world.contractsById[signed.contractId as never])
    expect(Object.values(currentSave.playerTransactionsById).filter((entry) => entry.kind === 'signedFreeAgent' && entry.contractId === signed.contractId)).toHaveLength(1)
  })

  it('keeps user agreements out of the AI signing checkpoint', () => {
    const setup = fixture()
    const checkpoint = completeAiAcceptedFreeAgentSignings(setup.world, [setup.negotiation.id])
    expect(checkpoint.results).toHaveLength(0)
    expect(checkpoint.world).toBe(setup.world)
  })

  it('requires signing responsibility separately from formal offer responsibility for AI clubs', () => {
    const base = createNewGame()
    const aiTeam = Object.values(base.teams).find((item) => item.coachId !== undefined && item.coachId !== base.userCoachId)!
    const setup = fixture({ teamId: aiTeam.id })
    const result = completeAiAcceptedFreeAgentSignings(setup.world, [setup.negotiation.id])
    expect(result.results).toHaveLength(1)
    expect(result.results[0]!.status).toBe('NO_EXECUTION_OWNER')
    expect(result.world).toBe(setup.world)
  })

  it('allows AI signing only with separate delegated execution ownership and approved Governance', () => {
    const base = createNewGame()
    const aiTeam = Object.values(base.teams).find((item) => item.coachId !== undefined && item.coachId !== base.userCoachId)!
    const setup = fixture({ teamId: aiTeam.id })
    const staffId = staffPersonIdFromString('staff:bs10d-g:signing-executor')
    const assignmentId = teamStaffAssignmentIdFromString('assignment:bs10d-g:signing-executor')
    const staffReady = updateGameWorld(setup.world, {
      staffPeople: [...Object.values(setup.world.staffPeopleById), {
        id: staffId,
        identity: { firstName: 'Signing', lastName: 'Executive' },
        professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as unknown as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> },
      }],
      teamStaffAssignments: [...Object.values(setup.world.teamStaffAssignmentsById), { id: assignmentId, staffPersonId: staffId, teamId: setup.team.id, role: 'generalManager', assignedOn: setup.world.currentDate }],
      responsibilities: [
        ...Object.values(setup.world.responsibilitiesById).filter((item) => item.id !== responsibilityIdForTeam(setup.team.id, 'submitPlayerContractOffer')),
        { id: responsibilityIdForTeam(setup.team.id, 'submitPlayerContractOffer'), teamId: setup.team.id, kind: 'submitPlayerContractOffer', mode: 'delegated', holderStaffId: staffId },
      ],
    })
    const offerOnly = completeAiAcceptedFreeAgentSignings(staffReady, [setup.negotiation.id])
    expect(offerOnly.results[0]!.status).toBe('NO_EXECUTION_OWNER')
    const authorityReady = updateGameWorld(staffReady, {
      responsibilities: [
        ...Object.values(staffReady.responsibilitiesById).filter((item) => item.id !== responsibilityIdForTeam(setup.team.id, 'executePlayerContractSigning')),
        { id: responsibilityIdForTeam(setup.team.id, 'executePlayerContractSigning'), teamId: setup.team.id, kind: 'executePlayerContractSigning', mode: 'delegated', holderStaffId: staffId },
      ],
    })
    const approved = withGovernance(authorityReady, setup.negotiation, true)
    const result = completeAiAcceptedFreeAgentSignings(approved, [setup.negotiation.id])
    expect(result.results[0]!.status).toBe('SIGNED')
    expect(result.world.negotiationsById[setup.negotiation.id]!.status).toBe('SIGNED')
  })

  it('creates no role promise or fee commitment when accepted optional terms are absent', () => {
    const setup = fixture()
    const approved = withGovernance(setup.world, setup.negotiation, true)
    const result = completeAcceptedFreeAgentSigning(approved, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(result.status).toBe('SIGNED')
    expect(Object.keys(result.world.rolePromisesById)).toHaveLength(Object.keys(approved.rolePromisesById).length)
    expect(Object.keys(result.world.financialCommitmentsById)).toHaveLength(Object.keys(approved.financialCommitmentsById).length)
  })
})
