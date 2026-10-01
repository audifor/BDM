import { describe, expect, it } from 'vitest'
import { completeAcceptedFreeAgentSigning } from '@/app/marketIntelligence/FreeAgentSigningService'
import { createNewGame } from '@/app/game'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { clearPlayerFromLineup } from '@/domain/tactics'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { updateGameWorld } from '@/domain/world'
import type { ContractNegotiation } from '@/domain/market'
import { assessPlayerContractSigningReadiness, ensureAiAcceptedPlayerContractSigningDecisions, playerContractSigningDecisionId, recordPlayerContractSigningDecisionEvent, startUserPlayerContractSigning } from './PlayerContractSigningGovernanceService'
import { evaluateSimulationBreakpoints } from '@/app/game/SimulationBreakpoints'

function fixture(kind: 'USER' | 'AI' = 'USER', options: { readonly status?: 'ACCEPTED' | 'OPEN' } = {}) {
  const base = createNewGame()
  const team = Object.values(base.teams).find((item) => kind === 'USER' ? item.coachId === base.userCoachId : item.coachId !== undefined && item.coachId !== base.userCoachId)!
  const player = base.players[team.rosterPlayerIds[0]!]!
  const baseContracts = Object.values(base.contractsById).map((contract) => contract.playerId === player.id
    ? { ...contract, termination: { terminatedOn: base.currentDate, reason: 'released' as const } }
    : contract)
  const proposerStaffId = staffPersonIdFromString(`staff:bs10d-h:${kind.toLowerCase()}:proposer`)
  const approverStaffId = staffPersonIdFromString(`staff:bs10d-h:${kind.toLowerCase()}:approver`)
  const proposerStaff = staff(proposerStaffId)
  const approverStaff = staff(approverStaffId)
  const negotiation: ContractNegotiation = {
    id: `negotiation:bs10d-h:${kind.toLowerCase()}`,
    organizationId: team.organizationId,
    teamId: team.id,
    playerId: player.id,
    sourceProposalId: `proposal:bs10d-h:${kind.toLowerCase()}`,
    offerResponsibleActor: kind === 'AI' ? { kind: 'STAFF', staffPersonId: proposerStaffId } : { kind: 'USER' },
    status: options.status ?? 'ACCEPTED',
    salary: 1_234_567,
    years: 2,
    round: 1,
  }
  const institution = { id: `institution:bs10d-h:${kind.toLowerCase()}`, universe: 'PROFESSIONAL_CLUB' as const, name: 'Signing club', teamIds: [team.id] }
  const grants = [
    { id: `authority:${kind}:owner-executive`, fromBodyId: 'body:owner', toBodyId: 'body:executive', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: base.currentDate },
    { id: `authority:${kind}:owner-board`, fromBodyId: 'body:owner', toBodyId: 'body:board', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: base.currentDate },
  ]
  const participation = [
    { id: `right:${kind}:propose`, authorityGrantId: grants[0]!.id, bodyId: 'body:executive', edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
    { id: `right:${kind}:execute`, authorityGrantId: grants[0]!.id, bodyId: 'body:executive', edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const },
    { id: `right:${kind}:approve`, authorityGrantId: grants[1]!.id, bodyId: 'body:board', edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const },
  ]
  const appointments = [
    { id: `appointment:${kind}:proposer`, bodyId: 'body:executive', actor: kind === 'USER' ? { kind: 'COACH' as const, id: base.userCoachId } : { kind: 'STAFF' as const, id: proposerStaffId }, role: 'CEO' as const, startedOn: base.currentDate },
    { id: `appointment:${kind}:approver`, bodyId: 'body:board', actor: { kind: 'STAFF' as const, id: approverStaffId }, role: 'BOARD_MEMBER' as const, startedOn: base.currentDate },
  ]
  const assignmentId = teamStaffAssignmentIdFromString(`assignment:bs10d-h:${kind.toLowerCase()}:proposer`)
  const world = updateGameWorld(base, {
    negotiations: [negotiation],
    contracts: baseContracts,
    teams: Object.values(base.teams).map((item) => item.id === team.id ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => id !== player.id) } : item),
    lineupsByTeamId: Object.fromEntries(Object.entries(base.lineupsByTeamId).map(([id, lineup]) => [id, clearPlayerFromLineup(lineup, player.id)])),
    teamFinances: Object.values(base.teamFinancesByTeamId).map((finances) => finances.teamId === team.id ? { ...finances, playerSalaryBudget: 1_000_000_000 } : finances),
    staffPeople: [...Object.values(base.staffPeopleById), proposerStaff, approverStaff],
    governanceInstitutions: [institution],
    governanceBodies: [
      { id: 'body:owner', institutionId: institution.id, kind: 'OWNERSHIP', name: 'Owner' },
      { id: 'body:executive', institutionId: institution.id, kind: 'EXECUTIVE', name: 'Executive' },
      { id: 'body:board', institutionId: institution.id, kind: 'BOARD', name: 'Board' },
    ],
    governanceAppointments: appointments,
    governanceAuthorityGrants: grants,
    governanceDecisionParticipationGrants: participation,
    ...(kind === 'AI' ? {
      teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), { id: assignmentId, staffPersonId: proposerStaffId, teamId: team.id, role: 'generalManager' as const, assignedOn: base.currentDate }],
      responsibilities: [...Object.values(base.responsibilitiesById).filter((item) => item.id !== responsibilityIdForTeam(team.id, 'executePlayerContractSigning')), { id: responsibilityIdForTeam(team.id, 'executePlayerContractSigning'), teamId: team.id, kind: 'executePlayerContractSigning' as const, mode: 'delegated' as const, holderStaffId: proposerStaffId }],
    } : {}),
  })
  return { world, team, negotiation, institution, proposerStaffId, approverStaffId }
}

function staff(id: ReturnType<typeof staffPersonIdFromString>) {
  return {
    id,
    identity: { firstName: 'Governance', lastName: id.endsWith('approver') ? 'Approver' : 'Proposer' },
    professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as unknown as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> },
  }
}

describe('PLAYER_CONTRACT_SIGNING Governance workflow', () => {
  it('creates one idempotent decision for the exact accepted agreement under the actual appointed proposer', () => {
    const setup = fixture()
    const started = startUserPlayerContractSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(started.status).toBe('PROPOSED')
    expect(started.decision).toMatchObject({ id: playerContractSigningDecisionId(setup.institution.id, setup.negotiation.id), decisionType: 'PLAYER_CONTRACT_SIGNING', proposedByBodyId: 'body:executive', subject: { kind: 'GENERIC', referenceId: setup.negotiation.id } })
    expect(Object.values(started.world.governanceDecisionEventsById).filter((event) => event.decisionId === started.decision!.id)).toEqual([expect.objectContaining({ kind: 'PROPOSED', bodyId: 'body:executive' })])
    const retry = startUserPlayerContractSigning(started.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(retry.status).toBe('REQUIRES_APPROVAL')
    expect(retry.decision?.id).toBe(started.decision?.id)
    expect(Object.values(retry.world.governanceDecisionsById).filter((decision) => decision.decisionType === 'PLAYER_CONTRACT_SIGNING')).toHaveLength(1)
  })

  it.each(['OPEN', 'COUNTERED', 'REJECTED', 'WITHDRAWN'] as const)('does not create a signing decision for %s negotiations', (status) => {
    const setup = fixture('USER', { status: status === 'OPEN' ? 'OPEN' : 'ACCEPTED' })
    const world = status === 'COUNTERED' || status === 'REJECTED' || status === 'WITHDRAWN'
      ? updateGameWorld(setup.world, { negotiations: [{ ...setup.negotiation, status, round: 2 }] as ContractNegotiation[] })
      : setup.world
    const result = startUserPlayerContractSigning(world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(result.status).toBe('NOT_ACCEPTED')
    expect(Object.keys(result.world.governanceDecisionsById)).toHaveLength(Object.keys(world.governanceDecisionsById).length)
  })

  it('requires an active appointed proposer and never converts budget authority or job titles into proposal rights', () => {
    const setup = fixture()
    const noAppointment = updateGameWorld(setup.world, { governanceAppointments: [] })
    const result = startUserPlayerContractSigning(noAppointment, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(result.status).toBe('NO_AUTHORITY')
    expect(Object.keys(result.world.governanceDecisionsById)).toHaveLength(Object.keys(noAppointment.governanceDecisionsById).length)
    const noSigningRights = updateGameWorld(setup.world, { governanceAuthorityGrants: Object.values(setup.world.governanceAuthorityGrantsById).map((grant) => ({ ...grant, decision: 'PLAYER_BUDGET' as const })), governanceDecisionParticipationGrants: Object.values(setup.world.governanceDecisionParticipationGrantsById) })
    expect(startUserPlayerContractSigning(noSigningRights, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! }).status).toBe('UNKNOWN')
  })

  it('does not auto-approve for the user and keeps approval and final execution separate', () => {
    const setup = fixture()
    const withTwoRequiredApprovers = updateGameWorld(setup.world, { governanceDecisionParticipationGrants: [...Object.values(setup.world.governanceDecisionParticipationGrantsById), { id: 'right:executive-approve', authorityGrantId: 'authority:USER:owner-executive', bodyId: 'body:executive', edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const }] })
    const proposed = startUserPlayerContractSigning(withTwoRequiredApprovers, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    const firstApproval = recordPlayerContractSigningDecisionEvent(proposed.world, { decisionId: proposed.decision!.id, kind: 'APPROVED', actor: { kind: 'COACH', id: setup.world.userCoachId }, bodyId: 'body:executive' })
    expect(firstApproval.status).toBe('REQUIRES_APPROVAL')
    expect(firstApproval.requiredApproverBodyIds).toEqual(['body:board', 'body:executive'])
    expect(firstApproval.approvedBodyIds).toEqual(['body:executive'])
    const approval = recordPlayerContractSigningDecisionEvent(firstApproval.world, { decisionId: proposed.decision!.id, kind: 'APPROVED', actor: { kind: 'STAFF', id: setup.approverStaffId }, bodyId: 'body:board' })
    expect(approval.status).toBe('APPROVED')
    expect(approval.signing).toBeUndefined()
    expect(approval.world.negotiationsById[setup.negotiation.id]!.status).toBe('ACCEPTED')
    expect(Object.values(approval.world.governanceDecisionEventsById).some((event) => event.decisionId === proposed.decision!.id && event.kind === 'EXECUTED')).toBe(false)
    const signed = completeAcceptedFreeAgentSigning(approval.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    expect(signed.status).toBe('SIGNED')
  })

  it('retries an AI signing immediately on the real final approval without inventing approvals', () => {
    const setup = fixture('AI')
    const proposed = ensureAiAcceptedPlayerContractSigningDecisions(setup.world, [setup.negotiation.id])
    expect(proposed.results[0]!.status).toBe('PROPOSED')
    expect(Object.values(proposed.world.governanceDecisionEventsById).filter((event) => event.decisionId === proposed.results[0]!.decision!.id).map((event) => event.kind)).toEqual(['PROPOSED'])
    const approved = recordPlayerContractSigningDecisionEvent(proposed.world, { decisionId: proposed.results[0]!.decision!.id, kind: 'APPROVED', actor: { kind: 'STAFF', id: setup.approverStaffId }, bodyId: 'body:board' })
    expect(approved.status).toBe('SIGNED')
    expect(approved.signing?.status).toBe('SIGNED')
    expect(approved.world.negotiationsById[setup.negotiation.id]!.status).toBe('SIGNED')
    expect(Object.values(approved.world.governanceDecisionEventsById).filter((event) => event.decisionId === proposed.results[0]!.decision!.id && event.kind === 'EXECUTED')).toHaveLength(1)
  })

  it('preserves rejection, veto, and ACCEPTED terms without signing', () => {
    const setup = fixture()
    const proposed = startUserPlayerContractSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    const rejected = recordPlayerContractSigningDecisionEvent(proposed.world, { decisionId: proposed.decision!.id, kind: 'REJECTED', actor: { kind: 'STAFF', id: setup.approverStaffId }, bodyId: 'body:board' })
    expect(rejected.status).toBe('REJECTED')
    expect(rejected.world.negotiationsById[setup.negotiation.id]).toEqual(setup.negotiation)
    expect(Object.values(rejected.world.governanceDecisionEventsById).some((event) => event.kind === 'EXECUTED')).toBe(false)
    expect(completeAcceptedFreeAgentSigning(rejected.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! }).status).toBe('BLOCKED')

    const vetoAuthority = updateGameWorld(setup.world, {
      governanceAppointments: [...Object.values(setup.world.governanceAppointmentsById), { id: 'appointment:USER:veto', bodyId: 'body:owner', actor: { kind: 'COACH', id: setup.world.userCoachId }, role: 'OWNER', startedOn: setup.world.currentDate }],
      governanceDecisionParticipationGrants: [...Object.values(setup.world.governanceDecisionParticipationGrantsById), { id: 'right:USER:veto', authorityGrantId: 'authority:USER:owner-board', bodyId: 'body:owner', edgeParticipant: 'DELEGATOR' as const, right: 'VETO' as const }],
    })
    const vetoProposed = startUserPlayerContractSigning(vetoAuthority, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    const vetoed = recordPlayerContractSigningDecisionEvent(vetoProposed.world, { decisionId: vetoProposed.decision!.id, kind: 'VETOED', actor: { kind: 'COACH', id: setup.world.userCoachId }, bodyId: 'body:owner' })
    expect(vetoed.status).toBe('VETOED')
    expect(vetoed.world.negotiationsById[setup.negotiation.id]).toEqual(setup.negotiation)
    expect(Object.values(vetoed.world.governanceDecisionEventsById).some((event) => event.kind === 'EXECUTED')).toBe(false)
    expect(completeAcceptedFreeAgentSigning(vetoed.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! }).status).toBe('BLOCKED')
  })

  it('reports readiness and truthful nonblocking breakpoint detail', () => {
    const setup = fixture()
    const proposed = startUserPlayerContractSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
    const evaluation = evaluateSimulationBreakpoints(proposed.world)
    const breakpoint = evaluation.candidates.find((candidate) => candidate.reason === 'marketNegotiation' && candidate.sourceId === setup.negotiation.id)
    expect(breakpoint).toMatchObject({ level: 'IMPORTANT' })
    expect(breakpoint?.diagnostic).toContain(proposed.decision!.id)
    expect(breakpoint?.diagnostic).toContain('body:board')
    const readiness = assessPlayerContractSigningReadiness(proposed.world, setup.team.id, setup.negotiation.id)
    expect(readiness).toMatchObject({ acceptedTerms: { salary: setup.negotiation.salary, years: setup.negotiation.years }, playerAvailable: true, payrollAffordable: true, executionOwner: 'USER', governanceDecisionId: proposed.decision!.id, proposerBodyId: 'body:executive', requiredApproverBodyIds: ['body:board'], approvedBodyIds: [], status: 'REQUIRES_APPROVAL' })
    const approved = recordPlayerContractSigningDecisionEvent(proposed.world, { decisionId: proposed.decision!.id, kind: 'APPROVED', actor: { kind: 'STAFF', id: setup.approverStaffId }, bodyId: 'body:board' })
    const approvedBreakpoint = evaluateSimulationBreakpoints(approved.world).candidates.find((candidate) => candidate.reason === 'marketNegotiation' && candidate.sourceId === setup.negotiation.id)
    expect(approvedBreakpoint).toMatchObject({ level: 'IMPORTANT' })
    expect(approvedBreakpoint?.diagnostic).toContain('user must still explicitly confirm signing')
    expect(evaluateSimulationBreakpoints(approved.world).candidates.some((candidate) => candidate.reason === 'marketNegotiation' && candidate.level === 'ACTION_REQUIRED')).toBe(false)
  })

  it('does not create a fake AI proposer when offer actor has no matching appointment', () => {
    const setup = fixture('AI')
    const world = updateGameWorld(setup.world, { governanceAppointments: Object.values(setup.world.governanceAppointmentsById).filter((appointment) => appointment.actor.id !== setup.proposerStaffId) })
    const result = ensureAiAcceptedPlayerContractSigningDecisions(world, [setup.negotiation.id])
    expect(result.results[0]!.status).toBe('NO_AUTHORITY')
    expect(result.world.governanceDecisionsById).toEqual(world.governanceDecisionsById)
  })

  it('does not scan or mutate unrelated previously accepted AI negotiations', () => {
    const setup = fixture('AI')
    const checkpoint = ensureAiAcceptedPlayerContractSigningDecisions(setup.world, [])
    expect(checkpoint.results).toEqual([])
    expect(checkpoint.world).toBe(setup.world)
    expect(Object.keys(checkpoint.world.governanceDecisionsById)).toHaveLength(Object.keys(setup.world.governanceDecisionsById).length)
  })

  it('leaves approval history intact when current availability blocks the AI retry', () => {
    const setup = fixture('AI')
    const proposed = ensureAiAcceptedPlayerContractSigningDecisions(setup.world, [setup.negotiation.id])
    const unavailable = updateGameWorld(proposed.world, { teams: Object.values(proposed.world.teams).map((team) => team.id === setup.team.id ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, setup.negotiation.playerId] } : team) })
    const approved = recordPlayerContractSigningDecisionEvent(unavailable, { decisionId: proposed.results[0]!.decision!.id, kind: 'APPROVED', actor: { kind: 'STAFF', id: setup.approverStaffId }, bodyId: 'body:board' })
    expect(approved.status).toBe('PLAYER_UNAVAILABLE')
    expect(approved.world.negotiationsById[setup.negotiation.id]!.status).toBe('ACCEPTED')
    expect(Object.values(approved.world.governanceDecisionEventsById).some((event) => event.decisionId === proposed.results[0]!.decision!.id && event.kind === 'EXECUTED')).toBe(false)
  })

  it('leaves approval history intact when current payroll blocks the AI retry', () => {
    const setup = fixture('AI')
    const proposed = ensureAiAcceptedPlayerContractSigningDecisions(setup.world, [setup.negotiation.id])
    const poor = updateGameWorld(proposed.world, { teamFinances: Object.values(proposed.world.teamFinancesByTeamId).map((finances) => finances.teamId === setup.team.id ? { ...finances, playerSalaryBudget: 1 } : finances) })
    const approved = recordPlayerContractSigningDecisionEvent(poor, { decisionId: proposed.results[0]!.decision!.id, kind: 'APPROVED', actor: { kind: 'STAFF', id: setup.approverStaffId }, bodyId: 'body:board' })
    expect(approved.status).toBe('FINANCIAL_BLOCK')
    expect(approved.world.negotiationsById[setup.negotiation.id]!.status).toBe('ACCEPTED')
    expect(Object.values(approved.world.governanceDecisionEventsById).some((event) => event.decisionId === proposed.results[0]!.decision!.id && event.kind === 'EXECUTED')).toBe(false)
  })
})
