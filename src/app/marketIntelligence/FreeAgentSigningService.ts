import { addYears } from '@/domain/date'
import { createPlayerContract, getPlayerContractStatus } from '@/domain/contract'
import { createFinancialCommitment, createMoney } from '@/domain/finance'
import { contractIdFromString, financialCommitmentIdFromString, playerTransactionIdFromString, type TeamId } from '@/domain/ids'
import { createGovernanceDecisionEvent, deriveGovernanceDecisionStatus, resolveGovernanceDecisionEventAuthorityGrantIds, resolveGovernanceDecisionRights, validateGovernanceDecisionLifecycle } from '@/domain/governance'
import type { ContractNegotiation } from '@/domain/market'
import { getPlayerRosterTeamId, isPlayerFreeAgent, canTeamAffordAdditionalSalary, updateGameWorld, type GameWorld } from '@/domain/world'
import { resolveSigningExecutionAuthority } from '@/engine/market'
import { reviewClubManagementPlanning } from '@/app/gmPlanning'

export type FreeAgentSigningStatus =
  | 'SIGNED'
  | 'ALREADY_SIGNED'
  | 'NOT_ACCEPTED'
  | 'STALE'
  | 'PLAYER_UNAVAILABLE'
  | 'CONFLICT'
  | 'FINANCIAL_BLOCK'
  | 'NO_EXECUTION_OWNER'
  | 'REQUIRES_APPROVAL'
  | 'BLOCKED'
  | 'UNKNOWN'
  | 'FEE_ACCOUNTING_UNAVAILABLE'

export interface FreeAgentSigningResult {
  readonly status: FreeAgentSigningStatus
  readonly world: GameWorld
  readonly negotiation?: ContractNegotiation
  readonly contractId?: string
  readonly reason?: string
}

export interface AiFreeAgentSigningCheckpointResult {
  readonly world: GameWorld
  readonly results: readonly FreeAgentSigningResult[]
}

/** Revalidates and atomically completes one exact ACCEPTED free-agent agreement. */
export function completeAcceptedFreeAgentSigning(
  world: GameWorld,
  input: { readonly teamId: TeamId; readonly negotiationId: string; readonly expectedProposalId: string },
): FreeAgentSigningResult {
  const negotiation = world.negotiationsById[input.negotiationId]
  if (negotiation === undefined) return result('STALE', world, undefined, 'NEGOTIATION_NOT_FOUND')
  const team = world.teams[input.teamId]
  if (team === undefined || negotiation.teamId !== input.teamId || negotiation.organizationId !== team.organizationId
    || negotiation.sourceProposalId === undefined || negotiation.sourceProposalId !== input.expectedProposalId) {
    return result('STALE', world, negotiation, 'NEGOTIATION_TEAM_OR_PROPOSAL_CHANGED')
  }
  if (negotiation.status === 'SIGNED') return result('ALREADY_SIGNED', world, negotiation, 'NEGOTIATION_ALREADY_SIGNED', negotiation.signedContractId)
  if (!('salary' in negotiation) || negotiation.status !== 'ACCEPTED') return result('NOT_ACCEPTED', world, negotiation, 'NEGOTIATION_NOT_ACCEPTED')
  const player = world.players[negotiation.playerId]
  if (player === undefined) return result('PLAYER_UNAVAILABLE', world, negotiation, 'PLAYER_NOT_FOUND')
  if (!isPlayerFreeAgent(world, player.id, world.currentDate)) {
    const rosterTeamId = getPlayerRosterTeamId(world, player.id)
    const contract = Object.values(world.contractsById).find((item) => item.playerId === player.id
      && ['active', 'scheduled'].includes(getPlayerContractStatus(item, world.currentDate)))
    return result('CONFLICT', world, negotiation, `PLAYER_ALREADY_COMMITTED:${rosterTeamId ?? contract?.teamId ?? 'UNKNOWN_TEAM'}`)
  }
  if (!Number.isSafeInteger(negotiation.salary) || negotiation.salary < 1 || negotiation.salary > 100_000_000
    || !Number.isSafeInteger(negotiation.years) || negotiation.years < 1
    || (negotiation.agentFee !== undefined && (!Number.isSafeInteger(negotiation.agentFee) || negotiation.agentFee < 0))) {
    return result('BLOCKED', world, negotiation, 'ACCEPTED_TERMS_INVALID')
  }
  if (!canTeamAffordAdditionalSalary(world, team.id, negotiation.salary, world.currentDate)) {
    return result('FINANCIAL_BLOCK', world, negotiation, 'CURRENT_PAYROLL_CANNOT_AFFORD_ACCEPTED_SALARY')
  }

  const owner = resolveSigningExecutionAuthority(world, team.id)
  if (owner.status === 'NO_EXECUTION_OWNER') return result('NO_EXECUTION_OWNER', world, negotiation, 'NO_DELEGATED_SIGNING_EXECUTOR')
  if (owner.status === 'BLOCKED') return result('BLOCKED', world, negotiation, owner.reason)

  const governance = resolvePlayerContractSigningGovernance(world, team.id, negotiation.id)
  if (governance.status !== 'AUTHORIZED') return result(governance.status, world, negotiation, governance.reason)

  const contractId = contractIdFromString(`contract:signed-free-agent:${negotiation.id}`)
  const transactionId = playerTransactionIdFromString(`transaction:signed-free-agent:${negotiation.id}`)
  const existingContract = world.contractsById[contractId]
  const existingTransaction = world.playerTransactionsById[transactionId]
  const rolePromiseId = `role-promise:signed-free-agent:${negotiation.id}`
  const feeCommitmentId = financialCommitmentIdFromString(`financial-commitment:player-agent-fee:${negotiation.id}`)
  if (existingContract !== undefined || existingTransaction !== undefined || world.rolePromisesById[rolePromiseId] !== undefined
    || Object.values(world.financialCommitmentsById).some((commitment) => commitment.provenance.kind === 'PLAYER_AGENT_FEE' && commitment.provenance.id === negotiation.id)) {
    return result('CONFLICT', world, negotiation, 'SIGNING_EFFECT_EXISTS_WITHOUT_SIGNED_NEGOTIATION')
  }

  let feeCommitment: ReturnType<typeof createFinancialCommitment> | undefined
  if (negotiation.agentFee !== undefined && negotiation.agentFee > 0) {
    const profile = world.organizationFinancialProfilesById[team.organizationId]
    if (profile === undefined) return result('FEE_ACCOUNTING_UNAVAILABLE', world, negotiation, 'ORGANIZATION_CURRENCY_UNAVAILABLE')
    const representation = world.playerRepresentations.find((item) => item.playerId === player.id)
    const agent = representation === undefined ? undefined : world.agentsById[representation.agentId]
    try {
      feeCommitment = createFinancialCommitment({
        id: feeCommitmentId,
        organizationId: team.organizationId,
        amount: createMoney({ currencyCode: profile.baseCurrencyCode, minorUnits: negotiation.agentFee }),
        startsOn: world.currentDate,
        dueOn: world.currentDate,
        category: 'PLAYER_AGENT_FEE',
        provenance: { kind: 'PLAYER_AGENT_FEE', id: negotiation.id },
        counterparty: { kind: 'EXTERNAL', ...(agent === undefined ? {} : { id: agent.id }), label: agent?.name ?? 'Player agent' },
        dimensions: { teamId: team.id, reference: { kind: 'CONTRACT_NEGOTIATION', id: negotiation.id } },
      })
    } catch {
      return result('FEE_ACCOUNTING_UNAVAILABLE', world, negotiation, 'AGENT_FEE_CANNOT_BE_RECORDED')
    }
  }

  let expiresOn = world.currentDate
  try {
    expiresOn = addYears(world.currentDate, negotiation.years)
  } catch {
    return result('BLOCKED', world, negotiation, 'ACCEPTED_TERM_CANNOT_FORM_VALID_CONTRACT_DATES')
  }
  const contract = createPlayerContract({
    id: contractId,
    playerId: player.id,
    teamId: team.id,
    kind: 'standard',
    term: { startsOn: world.currentDate, expiresOn },
    compensation: { annualSalary: negotiation.salary },
  })
  const transaction = {
    id: transactionId,
    playerId: player.id,
    kind: 'signedFreeAgent' as const,
    occurredOn: world.currentDate,
    toTeamId: team.id,
    contractId: contract.id,
  }
  const signed: ContractNegotiation = {
    ...negotiation,
    status: 'SIGNED',
    signedOn: world.currentDate,
    signedContractId: contract.id,
    signedTransactionId: transaction.id,
    signedGovernanceDecisionId: governance.decision.id,
    signedBy: owner.owner,
  }
  const rolePromise = negotiation.role === undefined ? undefined : {
    id: rolePromiseId,
    playerId: player.id,
    teamOrganizationId: team.organizationId,
    role: negotiation.role,
    acceptedOn: world.currentDate,
    status: 'ACTIVE' as const,
  }
  const executed = createGovernanceDecisionEvent({
    id: `governance-decision-executed:${governance.decision.id}:zzzz:${negotiation.id}`,
    decisionId: governance.decision.id,
    kind: 'EXECUTED',
    bodyId: governance.executorBodyId,
    effectiveOn: world.currentDate,
    authorityGrantIds: governance.executorGrantIds,
  })

  const changed = updateGameWorld(world, {
    contracts: [...Object.values(world.contractsById), contract],
    teams: Object.values(world.teams).map((item) => item.id === team.id ? { ...item, rosterPlayerIds: [...item.rosterPlayerIds, player.id] } : item),
    playerTransactions: [...Object.values(world.playerTransactionsById), transaction],
    negotiations: [...Object.values(world.negotiationsById).filter((item) => item.id !== negotiation.id), signed],
    ...(rolePromise === undefined ? {} : { rolePromises: [...Object.values(world.rolePromisesById), rolePromise] }),
    ...(feeCommitment === undefined ? {} : { financialCommitments: [...Object.values(world.financialCommitmentsById), feeCommitment] }),
    governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), executed],
  })
  const planned = reviewClubManagementPlanning(changed, team.id, 'MATERIAL_ROSTER_CHANGE').world
  return { status: 'SIGNED', world: planned, negotiation: signed, contractId: contract.id }
}

/** Handles only the exact newly ACCEPTED AI negotiations supplied by the caller. */
export function completeAiAcceptedFreeAgentSignings(world: GameWorld, negotiationIds: readonly string[]): AiFreeAgentSigningCheckpointResult {
  let current = world
  const results: FreeAgentSigningResult[] = []
  for (const negotiationId of [...new Set(negotiationIds)].sort()) {
    const negotiation = current.negotiationsById[negotiationId]
    const team = negotiation?.teamId === undefined ? undefined : current.teams[negotiation.teamId]
    if (negotiation?.status !== 'ACCEPTED' || !team || team.coachId === undefined || team.coachId === current.userCoachId) continue
    if (negotiation.sourceProposalId === undefined) {
      results.push(result('STALE', current, negotiation, 'ACCEPTED_NEGOTIATION_HAS_NO_PROPOSAL_ID'))
      continue
    }
    const completed = completeAcceptedFreeAgentSigning(current, { teamId: team.id, negotiationId, expectedProposalId: negotiation.sourceProposalId })
    results.push(completed)
    if (completed.status === 'SIGNED') current = completed.world
  }
  return { world: current, results: Object.freeze(results) }
}

interface SigningGovernanceAuthorization {
  readonly status: 'AUTHORIZED'
  readonly decision: GameWorld['governanceDecisionsById'][string]
  readonly executorBodyId: string
  readonly executorGrantIds: readonly string[]
}

type SigningGovernanceResult = SigningGovernanceAuthorization | { readonly status: 'REQUIRES_APPROVAL' | 'BLOCKED' | 'UNKNOWN'; readonly reason: string }

export function resolvePlayerContractSigningGovernance(world: GameWorld, teamId: TeamId, subjectReferenceId: string): SigningGovernanceResult {
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(teamId))
  if (institutions.length !== 1) return { status: 'UNKNOWN', reason: institutions.length === 0 ? 'GOVERNANCE_INSTITUTION_UNAVAILABLE' : 'GOVERNANCE_INSTITUTION_AMBIGUOUS' }
  const institution = institutions[0]!
  const candidates = Object.values(world.governanceDecisionsById).filter((decision) => decision.institutionId === institution.id
    && decision.decisionType === 'PLAYER_CONTRACT_SIGNING'
    && decision.subject.kind === 'GENERIC' && decision.subject.referenceId === subjectReferenceId)
  if (candidates.length > 1) return { status: 'BLOCKED', reason: 'MULTIPLE_SIGNING_DECISIONS_FOR_NEGOTIATION' }

  const decision = candidates[0]
  const asOfDate = decision?.proposedOn ?? world.currentDate
  const rights = resolveGovernanceDecisionRights({
    decisionType: 'PLAYER_CONTRACT_SIGNING',
    institutionId: institution.id,
    asOfDate,
    bodies: Object.values(world.governanceBodiesById),
    authorityGrants: Object.values(world.governanceAuthorityGrantsById),
    participationGrants: Object.values(world.governanceDecisionParticipationGrantsById),
  })
  if (rights.proposerBodyIds.length === 0 || rights.approverBodyIds.length === 0) return { status: 'UNKNOWN', reason: 'SIGNING_GOVERNANCE_AUTHORITY_UNMAPPED' }
  if (decision === undefined) return { status: 'REQUIRES_APPROVAL', reason: 'SIGNING_GOVERNANCE_DECISION_NOT_PROPOSED' }

  const events = Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decision.id)
  validateGovernanceDecisionLifecycle(events)
  const status = deriveGovernanceDecisionStatus(events, rights.approverBodyIds)
  if (status === 'REJECTED' || status === 'VETOED' || status === 'WITHDRAWN' || status === 'EXECUTED') return { status: 'BLOCKED', reason: `SIGNING_DECISION_${status}` }
  const approvals = new Set(events.filter((event) => event.kind === 'APPROVED').map((event) => event.bodyId))
  if (rights.approverBodyIds.some((bodyId) => !approvals.has(bodyId))) return { status: 'REQUIRES_APPROVAL', reason: 'SIGNING_DECISION_APPROVALS_INCOMPLETE' }

  const executorBodyId = resolveGovernanceDecisionRights({
    decisionType: 'PLAYER_CONTRACT_SIGNING',
    institutionId: institution.id,
    asOfDate: world.currentDate,
    bodies: Object.values(world.governanceBodiesById),
    authorityGrants: Object.values(world.governanceAuthorityGrantsById),
    participationGrants: Object.values(world.governanceDecisionParticipationGrantsById),
  }).executorBodyIds[0]
  if (executorBodyId === undefined) return { status: 'BLOCKED', reason: 'SIGNING_DECISION_EXECUTOR_UNAVAILABLE' }
  const executorGrantIds = resolveGovernanceDecisionEventAuthorityGrantIds({
    event: { kind: 'EXECUTED', bodyId: executorBodyId, effectiveOn: world.currentDate },
    decisionType: 'PLAYER_CONTRACT_SIGNING',
    institutionId: institution.id,
    bodies: Object.values(world.governanceBodiesById),
    authorityGrants: Object.values(world.governanceAuthorityGrantsById),
    participationGrants: Object.values(world.governanceDecisionParticipationGrantsById),
  })
  if (executorGrantIds.length === 0) return { status: 'BLOCKED', reason: 'SIGNING_DECISION_EXECUTOR_EVIDENCE_UNAVAILABLE' }
  return { status: 'AUTHORIZED', decision, executorBodyId, executorGrantIds }
}

function result(status: FreeAgentSigningStatus, world: GameWorld, negotiation: ContractNegotiation | undefined, reason: string, contractId?: string): FreeAgentSigningResult {
  return { status, world, ...(negotiation === undefined ? {} : { negotiation }), ...(contractId === undefined ? {} : { contractId }), reason }
}
