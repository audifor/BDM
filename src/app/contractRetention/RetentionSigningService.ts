import { addYears } from '@/domain/date'
import { createPlayerContract, getPlayerContractStatus, type ContractYearCompensation } from '@/domain/contract'
import { createFinancialCommitment, createMoney, getContractFinancialSchedule } from '@/domain/finance'
import { contractIdFromString, financialCommitmentIdFromString, type ContractId, type TeamId } from '@/domain/ids'
import { createGovernanceDecisionEvent, resolveGovernanceDecisionEventAuthorityGrantIds } from '@/domain/governance'
import { assessActiveContractRosterIntegrity } from '@/engine/market/RosterContractIntegrity'
import { hasContinuousContractSuccessor } from '@/engine/clubNeeds/ContractRosterPlanning'
import { materializeBindingContractCompensation } from '@/engine/salary'
import { resolveSigningExecutionAuthority } from '@/engine/market'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { reviewClubManagementPlanning } from '@/app/gmPlanning'
import { ensureRetentionPlayerContractSigningDecision } from '@/app/governance/PlayerContractSigningGovernanceService'
import { resolvePlayerContractSigningGovernance } from '@/app/marketIntelligence/FreeAgentSigningService'
import type { RetentionTermSet } from '@/domain/contract/ContractRetentionNegotiation'

export type RetentionSigningStatus = 'SIGNED' | 'ALREADY_SIGNED' | 'NOT_ACCEPTED' | 'INTEGRITY_INVALID' | 'PREDECESSOR_CHANGED' | 'SUCCESSOR_EXISTS' | 'RULES_UNAVAILABLE' | 'SERVICE_TIME_UNKNOWN' | 'ILLEGAL_COMPENSATION' | 'UNSUPPORTED_BINDING_TERM' | 'GOVERNANCE_REQUIRED' | 'GOVERNANCE_PENDING' | 'GOVERNANCE_DENIED' | 'FINANCE_REJECTED' | 'NO_AUTHORITY' | 'UNKNOWN'

export interface RetentionSigningResult {
  readonly status: RetentionSigningStatus
  readonly world: GameWorld
  readonly negotiationId: string
  readonly predecessorContractId?: ContractId
  readonly contractId?: ContractId
  readonly governanceDecisionId?: string
  readonly compensationStatus?: string
  readonly financeStatus?: 'ADMISSIBLE' | 'REJECTED'
  readonly successorStatus?: 'CREATED' | 'EXISTS' | 'NONE'
  readonly reason?: string
}

export function assessRetentionBindingTerms(terms: RetentionTermSet): { readonly supported: true } | { readonly supported: false; readonly reason: 'ACCEPTED_TERM_HAS_NO_BINDING_REPRESENTATION' } {
  const unsupported = (terms.options?.length ?? 0) > 0 || (terms.incentives?.length ?? 0) > 0 || (terms.clauses?.length ?? 0) > 0
    || (terms.agentFee !== undefined && terms.agentFeePayer !== 'CLUB')
  return unsupported ? { supported: false, reason: 'ACCEPTED_TERM_HAS_NO_BINDING_REPRESENTATION' } : { supported: true }
}

/** The single binding transition for accepted user and AI retention agreements. */
export function executeAcceptedRetentionAgreement(world: GameWorld, negotiationId: string): RetentionSigningResult {
  const negotiation = world.retentionNegotiationsById[negotiationId]
  if (negotiation === undefined) return result('PREDECESSOR_CHANGED', world, negotiationId, 'RETENTION_NEGOTIATION_NOT_FOUND')
  if (negotiation.execution?.status === 'SIGNED') return result('ALREADY_SIGNED', world, negotiation.id, 'RETENTION_ALREADY_SIGNED', negotiation.predecessorContractId, negotiation.execution.contractId, negotiation.execution.governanceDecisionId, 'VALID', 'ADMISSIBLE', 'EXISTS')
  if (negotiation.status !== 'ACCEPTED' || negotiation.acceptedTerms === undefined) return result('NOT_ACCEPTED', world, negotiation.id, 'RETENTION_NOT_ACCEPTED', negotiation.predecessorContractId)

  const predecessor = world.contractsById[negotiation.predecessorContractId]
  const team = world.teams[negotiation.teamId]
  const player = world.players[negotiation.playerId]
  if (predecessor === undefined || team === undefined || player === undefined || predecessor.id !== negotiation.predecessorContractId
    || predecessor.playerId !== negotiation.playerId || predecessor.teamId !== negotiation.teamId || team.organizationId !== negotiation.organizationId
    || predecessor.term.expiresOn <= world.currentDate || getPlayerContractStatus(predecessor, world.currentDate) !== 'active') {
    return result('PREDECESSOR_CHANGED', world, negotiation.id, 'EXACT_PREDECESSOR_IS_NOT_ACTIVE', negotiation.predecessorContractId)
  }
  if (assessActiveContractRosterIntegrity(world, player.id) !== 'VALID'
    || Object.values(world.contractsById).filter((item) => item.playerId === player.id && getPlayerContractStatus(item, world.currentDate) === 'active').length !== 1) {
    return result('INTEGRITY_INVALID', world, negotiation.id, 'ROSTER_CONTRACT_INTEGRITY_NOT_VALID', predecessor.id)
  }
  const linkedSuccessors = Object.values(world.contractsById).filter((item) => item.predecessorContractId === predecessor.id)
  if (linkedSuccessors.length > 0 || hasContinuousContractSuccessor(world, predecessor.id)) return result('SUCCESSOR_EXISTS', world, negotiation.id, 'BINDING_SUCCESSOR_ALREADY_EXISTS', predecessor.id, undefined, undefined, undefined, undefined, 'EXISTS')
  if (team.coachId === undefined || team.coachId !== negotiation.openedByCoachId) return result('NO_AUTHORITY', world, negotiation.id, 'RETENTION_TEAM_ORIGINATOR_IS_NO_LONGER_ACTIVE', predecessor.id)

  let expiresOn
  try { expiresOn = addYears(predecessor.term.expiresOn, negotiation.acceptedTerms.years) }
  catch { return result('ILLEGAL_COMPENSATION', world, negotiation.id, 'SUCCESSOR_TERM_DATES_INVALID', predecessor.id) }
  const applicableRules = Object.values(world.seasons)
    .filter((season) => season.startDate <= predecessor.term.expiresOn && season.endDate >= predecessor.term.expiresOn
      && (season.participantTeamIds ?? world.competitions[season.competitionId]?.participantTeamIds ?? []).includes(team.id))
    .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id))
    .map((season) => world.salaryRulesBySeasonId[season.id]).find((rules) => rules !== undefined)
  const bindingTerms = assessRetentionBindingTerms(negotiation.acceptedTerms)
  if (!bindingTerms.supported) return result('UNSUPPORTED_BINDING_TERM', world, negotiation.id, bindingTerms.reason, predecessor.id, undefined, undefined, 'UNSUPPORTED_BINDING_TERM')
  const compensation = materializeBindingContractCompensation(world, player, team, {
    salary: negotiation.acceptedTerms.salary,
    years: negotiation.acceptedTerms.years,
    ...(negotiation.acceptedTerms.guarantees === undefined ? {} : { guarantees: negotiation.acceptedTerms.guarantees }),
  }, { startsOn: predecessor.term.expiresOn, expiresOn }, applicableRules)
  if (compensation.status !== 'VALID') {
    const status = compensation.status === 'UNSUPPORTED_BINDING_TERM' ? 'UNSUPPORTED_BINDING_TERM'
      : compensation.status === 'RULES_UNAVAILABLE' || compensation.status === 'CAP_TREATMENT_UNAVAILABLE' ? 'RULES_UNAVAILABLE'
        : compensation.status === 'SERVICE_TIME_UNKNOWN' ? 'SERVICE_TIME_UNKNOWN' : 'ILLEGAL_COMPENSATION'
    return result(status, world, negotiation.id, compensation.status, predecessor.id, undefined, undefined, compensation.status)
  }

  const owner = resolveSigningExecutionAuthority(world, team.id)
  if (owner.status !== 'AUTHORIZED') return result('NO_AUTHORITY', world, negotiation.id, owner.status === 'NO_EXECUTION_OWNER' ? 'NO_SIGNING_EXECUTION_OWNER' : owner.reason, predecessor.id, undefined, undefined, 'VALID')
  let governanceWorld = world
  const knownDecision = Object.values(world.governanceDecisionsById).some((decision) => decision.decisionType === 'PLAYER_CONTRACT_SIGNING'
    && decision.subject.kind === 'GENERIC' && decision.subject.referenceId === `retention:${negotiation.id}`)
  if (!knownDecision) {
    const proposed = ensureRetentionPlayerContractSigningDecision(world, { teamId: team.id, retentionNegotiationId: negotiation.id, initiator: { kind: 'COACH', id: negotiation.openedByCoachId } })
    if (proposed.status !== 'PROPOSED') return result(proposed.status === 'NO_AUTHORITY' ? 'NO_AUTHORITY' : 'UNKNOWN', world, negotiation.id, proposed.reason, predecessor.id, undefined, proposed.decision?.id, 'VALID')
    return result('GOVERNANCE_REQUIRED', proposed.world, negotiation.id, 'SIGNING_DECISION_PROPOSED', predecessor.id, undefined, proposed.decision?.id, 'VALID')
  }
  const governance = resolvePlayerContractSigningGovernance(world, team.id, `retention:${negotiation.id}`)
  if (governance.status === 'REQUIRES_APPROVAL') return result('GOVERNANCE_PENDING', world, negotiation.id, governance.reason, predecessor.id, undefined, undefined, 'VALID')
  if (governance.status !== 'AUTHORIZED') return result(governance.status === 'BLOCKED' ? 'GOVERNANCE_DENIED' : 'UNKNOWN', world, negotiation.id, governance.reason, predecessor.id, undefined, undefined, 'VALID')
  const decision = governance.decision

  const successorId = contractIdFromString(`contract:retention-successor:${negotiation.id}`)
  if (world.contractsById[successorId] !== undefined) return result('SUCCESSOR_EXISTS', world, negotiation.id, 'SUCCESSOR_ID_ALREADY_EXISTS', predecessor.id, successorId, decision.id, 'VALID', 'ADMISSIBLE', 'EXISTS')
  const fee = negotiation.acceptedTerms.agentFeePayer === 'CLUB' && (negotiation.acceptedTerms.agentFee ?? 0) > 0
    ? createRetentionAgentFeeCommitment(world, team.id, player.id, negotiation.id, negotiation.acceptedTerms.agentFee!, world.currentDate)
    : undefined
  if (fee === null) return result('FINANCE_REJECTED', world, negotiation.id, 'AGENT_FEE_ACCOUNTING_UNAVAILABLE', predecessor.id, undefined, decision.id, 'VALID', 'REJECTED')
  const years: ContractYearCompensation[] = compensation.years.map((year) => ({
    cashSalary: year.cashSalary,
    guaranteedAmount: year.guaranteedAmount,
    ...(year.capTreatment.policy === 'NOT_APPLICABLE' ? { capTreatment: year.capTreatment } : { capHit: year.capTreatment.capHit, capTreatment: year.capTreatment }),
  }))
  const contract = createPlayerContract({ id: successorId, playerId: player.id, teamId: team.id, kind: 'standard', predecessorContractId: predecessor.id,
    term: { startsOn: predecessor.term.expiresOn, expiresOn }, compensation: { annualSalary: negotiation.acceptedTerms.salary, years } })
  const rolePromise = negotiation.acceptedTerms.role === undefined ? undefined : {
    id: `role-promise:signed-retention:${negotiation.id}`, playerId: player.id, teamOrganizationId: team.organizationId,
    role: negotiation.acceptedTerms.role, acceptedOn: world.currentDate, status: 'ACTIVE' as const,
  }
  if (rolePromise !== undefined && world.rolePromisesById[rolePromise.id] !== undefined) return result('SUCCESSOR_EXISTS', world, negotiation.id, 'ROLE_PROMISE_EFFECT_ALREADY_EXISTS', predecessor.id, undefined, decision.id, 'VALID', 'ADMISSIBLE', 'EXISTS')
  if (fee !== undefined && world.financialCommitmentsById[fee.id] !== undefined) return result('FINANCE_REJECTED', world, negotiation.id, 'AGENT_FEE_COMMITMENT_ALREADY_EXISTS', predecessor.id, undefined, decision.id, 'VALID', 'REJECTED')
  try {
    const candidate = updateGameWorld(governanceWorld, { contracts: [...Object.values(governanceWorld.contractsById), contract] })
    const profile = world.organizationFinancialProfilesById[team.organizationId]
    if (profile !== undefined) getContractFinancialSchedule(candidate, { organizationId: team.organizationId, teamId: team.id, contractId: contract.id, currencyCode: profile.baseCurrencyCode })
  } catch (error) {
    return result('FINANCE_REJECTED', world, negotiation.id, `CONTRACT_FINANCE_SCHEDULE_UNAVAILABLE:${error instanceof Error ? error.message : String(error)}`, predecessor.id, undefined, decision.id, 'VALID', 'REJECTED')
  }
  const execution = createGovernanceDecisionEvent({
    id: `governance-decision-executed:${decision.id}:zzzz:${negotiation.id}`, decisionId: decision.id, kind: 'EXECUTED',
    bodyId: governance.executorBodyId, effectiveOn: world.currentDate, authorityGrantIds: governance.executorGrantIds,
  })
  const signed = { ...negotiation, execution: { status: 'SIGNED' as const, contractId: contract.id, signedOn: world.currentDate, governanceDecisionId: decision.id } }
  governanceWorld = updateGameWorld(governanceWorld, {
    contracts: [...Object.values(governanceWorld.contractsById), contract],
    retentionNegotiations: [...Object.values(governanceWorld.retentionNegotiationsById).filter((item) => item.id !== negotiation.id), signed],
    governanceDecisionEvents: [...Object.values(governanceWorld.governanceDecisionEventsById), execution],
    ...(rolePromise === undefined ? {} : { rolePromises: [...Object.values(governanceWorld.rolePromisesById), rolePromise] }),
    ...(fee === undefined ? {} : { financialCommitments: [...Object.values(governanceWorld.financialCommitmentsById), fee] }),
  })
  const next = reviewClubManagementPlanning(governanceWorld, team.id, 'MATERIAL_ROSTER_CHANGE').world
  return result('SIGNED', next, negotiation.id, undefined, predecessor.id, contract.id, decision.id, 'VALID', 'ADMISSIBLE', 'CREATED')
}

function createRetentionAgentFeeCommitment(world: GameWorld, teamId: TeamId, playerId: string, negotiationId: string, amount: number, effectiveOn: GameWorld['currentDate']): ReturnType<typeof createFinancialCommitment> | null {
  const team = world.teams[teamId]!
  const profile = world.organizationFinancialProfilesById[team.organizationId]
  if (profile === undefined) return null
  const representation = world.playerRepresentations.find((item) => item.playerId === playerId)
  const agent = representation === undefined ? undefined : world.agentsById[representation.agentId]
  try {
    return createFinancialCommitment({ id: financialCommitmentIdFromString(`financial-commitment:player-agent-fee:retention:${negotiationId}`), organizationId: team.organizationId,
      amount: createMoney({ currencyCode: profile.baseCurrencyCode, minorUnits: amount }), startsOn: effectiveOn, dueOn: effectiveOn, category: 'PLAYER_AGENT_FEE',
      provenance: { kind: 'PLAYER_AGENT_FEE', id: `retention:${negotiationId}` }, counterparty: { kind: 'EXTERNAL', ...(agent === undefined ? {} : { id: agent.id }), label: agent?.name ?? 'Player agent' },
      dimensions: { teamId, reference: { kind: 'CONTRACT_NEGOTIATION', id: `retention:${negotiationId}` } } })
  } catch { return null }
}

function result(status: RetentionSigningStatus, world: GameWorld, negotiationId: string, reason?: string, predecessorContractId?: ContractId, contractId?: ContractId, governanceDecisionId?: string, compensationStatus?: string, financeStatus?: RetentionSigningResult['financeStatus'], successorStatus?: RetentionSigningResult['successorStatus']): RetentionSigningResult {
  return { status, world, negotiationId, ...(predecessorContractId === undefined ? {} : { predecessorContractId }), ...(contractId === undefined ? {} : { contractId }), ...(governanceDecisionId === undefined ? {} : { governanceDecisionId }), ...(compensationStatus === undefined ? {} : { compensationStatus }), ...(financeStatus === undefined ? {} : { financeStatus }), ...(successorStatus === undefined ? {} : { successorStatus }), ...(reason === undefined ? {} : { reason }) }
}
