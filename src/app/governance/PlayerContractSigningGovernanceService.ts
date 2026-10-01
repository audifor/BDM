import type { GameDate } from '@/domain/date'
import {
  createGovernanceDecision,
  createGovernanceDecisionEvent,
  deriveGovernanceDecisionStatus,
  resolveGovernanceDecisionEventAuthorityGrantIds,
  resolveGovernanceDecisionRights,
  validateGovernanceDecisionLifecycle,
  type GovernanceActor,
  type GovernanceDecision,
  type GovernanceDecisionEvent,
  type GovernanceDecisionEventKind,
  type GovernanceInstitution,
} from '@/domain/governance'
import { negotiationOfferActor, type ContractNegotiation, type NegotiationRole } from '@/domain/market'
import type { TeamId } from '@/domain/ids'
import { canTeamAffordAdditionalSalary, isPlayerFreeAgent, updateGameWorld, type GameWorld } from '@/domain/world'
import type { Team } from '@/domain/team'
import { completeAcceptedFreeAgentSigning, type FreeAgentSigningResult } from '@/app/marketIntelligence/FreeAgentSigningService'
import { resolveSigningExecutionAuthority } from '@/engine/market'

export type PlayerContractSigningWorkflowStatus =
  | 'PROPOSED'
  | 'APPROVED'
  | 'REQUIRES_APPROVAL'
  | 'REJECTED'
  | 'VETOED'
  | 'WITHDRAWN'
  | 'SIGNED'
  | 'ALREADY_SIGNED'
  | 'NOT_ACCEPTED'
  | 'STALE'
  | 'PLAYER_UNAVAILABLE'
  | 'FINANCIAL_BLOCK'
  | 'NO_AUTHORITY'
  | 'UNKNOWN'
  | 'BLOCKED'

export interface PlayerContractSigningWorkflowResult {
  readonly status: PlayerContractSigningWorkflowStatus
  readonly world: GameWorld
  readonly negotiationId?: string
  readonly decision?: GovernanceDecision
  readonly decisionStatus?: ReturnType<typeof deriveGovernanceDecisionStatus>
  readonly requiredApproverBodyIds?: readonly string[]
  readonly approvedBodyIds?: readonly string[]
  readonly signing?: FreeAgentSigningResult
  readonly reason?: string
}

export interface PlayerContractSigningReadiness {
  readonly negotiationId: string
  readonly acceptedTerms?: { readonly salary: number; readonly years: number; readonly role?: NegotiationRole; readonly agentFee?: number }
  readonly playerAvailable: boolean
  readonly payrollAffordable: boolean
  readonly executionOwner: 'USER' | 'STAFF' | 'NO_EXECUTION_OWNER' | 'BLOCKED'
  readonly governanceDecisionId?: string
  readonly proposerBodyId?: string
  readonly requiredApproverBodyIds: readonly string[]
  readonly approvedBodyIds: readonly string[]
  readonly executorBodyIds: readonly string[]
  readonly status: PlayerContractSigningWorkflowStatus
  readonly blocker?: string
}

export interface EnsurePlayerContractSigningDecisionInput {
  readonly teamId: TeamId
  readonly negotiationId: string
  readonly expectedProposalId: string
  /** Must be the actual active appointee starting the workflow. */
  readonly initiator: GovernanceActor
  /** Required only when the initiator is appointed to multiple eligible proposer bodies. */
  readonly proposerBodyId?: string
}

/** Creates or reuses the one exact per-negotiation signing decision. */
export function ensurePlayerContractSigningDecision(
  world: GameWorld,
  input: EnsurePlayerContractSigningDecisionInput,
): PlayerContractSigningWorkflowResult {
  const checked = validateAcceptedNegotiation(world, input)
  if ('failure' in checked) return checked.failure
  const { negotiation, team, institution } = checked
  const decisionId = playerContractSigningDecisionId(institution.id, negotiation.id)
  const existing = world.governanceDecisionsById[decisionId]
  const exactExisting = Object.values(world.governanceDecisionsById).filter((decision) => decision.institutionId === institution.id
    && decision.decisionType === 'PLAYER_CONTRACT_SIGNING'
    && decision.subject.kind === 'GENERIC' && decision.subject.referenceId === negotiation.id)
  if (exactExisting.length > 1 || (existing !== undefined && (existing.decisionType !== 'PLAYER_CONTRACT_SIGNING'
    || existing.institutionId !== institution.id || existing.subject.kind !== 'GENERIC' || existing.subject.referenceId !== negotiation.id))) {
    return workflow('BLOCKED', world, existing, 'SIGNING_DECISION_IDENTITY_CONFLICT')
  }
  if (exactExisting.length === 1) {
    const decision = exactExisting[0]!
    const events = eventsForDecision(world, decision.id)
    try { validateGovernanceDecisionLifecycle(events) } catch { return workflow('BLOCKED', world, decision, 'SIGNING_DECISION_LIFECYCLE_INVALID') }
    if (!events.some((event) => event.kind === 'PROPOSED' && event.bodyId === decision.proposedByBodyId)) {
      return workflow('BLOCKED', world, decision, 'SIGNING_DECISION_PROPOSAL_EVENT_MISSING')
    }
    const requiredApprovers = proposalRights(world, decision).approverBodyIds
    const approved = approvedBodies(events, requiredApprovers)
    const status = deriveGovernanceDecisionStatus(events, requiredApprovers)
    return workflow(workflowStatusForDecision(status), world, decision, status === 'REJECTED' || status === 'VETOED' || status === 'WITHDRAWN' ? `SIGNING_DECISION_${status}` : 'SIGNING_DECISION_ALREADY_EXISTS', requiredApprovers, approved)
  }

  const rights = resolveGovernanceDecisionRights({ ...governanceGraph(world), decisionType: 'PLAYER_CONTRACT_SIGNING', institutionId: institution.id, asOfDate: world.currentDate })
  if (rights.proposerBodyIds.length === 0 || rights.approverBodyIds.length === 0) return workflow('UNKNOWN', world, undefined, 'SIGNING_PROPOSER_OR_APPROVER_AUTHORITY_UNMAPPED', rights.approverBodyIds)
  const proposerBodyId = resolveAppointedAuthorizedBody(world, input.initiator, rights.proposerBodyIds, institution.id, input.proposerBodyId)
  if (proposerBodyId === undefined) return workflow('NO_AUTHORITY', world, undefined, 'INITIATOR_HAS_NO_UNAMBIGUOUS_ACTIVE_PROPOSER_APPOINTMENT', rights.approverBodyIds)
  const grantIds = eventGrantIds(world, 'PROPOSED', proposerBodyId, institution.id, world.currentDate)
  if (grantIds.length === 0) return workflow('NO_AUTHORITY', world, undefined, 'PROPOSER_EVENT_AUTHORITY_EVIDENCE_UNAVAILABLE', rights.approverBodyIds)

  const decision = createGovernanceDecision({
    id: decisionId,
    institutionId: institution.id,
    decisionType: 'PLAYER_CONTRACT_SIGNING',
    proposedByBodyId: proposerBodyId,
    proposedOn: world.currentDate,
    subject: { kind: 'GENERIC', referenceId: negotiation.id },
  })
  const proposed = createGovernanceDecisionEvent({
    id: decisionEventId(decision.id, world.currentDate, 'PROPOSED', proposerBodyId),
    decisionId: decision.id,
    kind: 'PROPOSED',
    bodyId: proposerBodyId,
    effectiveOn: world.currentDate,
    authorityGrantIds: grantIds,
  })
  const next = updateGameWorld(world, {
    governanceDecisions: [...Object.values(world.governanceDecisionsById), decision],
    governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), proposed],
  })
  return workflow('PROPOSED', next, decision, 'SIGNING_DECISION_PROPOSED', rights.approverBodyIds, [])
}

/** Reuses PLAYER_CONTRACT_SIGNING authority for an exact accepted retention agreement. */
export function ensureRetentionPlayerContractSigningDecision(
  world: GameWorld,
  input: { readonly teamId: TeamId; readonly retentionNegotiationId: string; readonly initiator: GovernanceActor; readonly proposerBodyId?: string },
): PlayerContractSigningWorkflowResult {
  const negotiation = world.retentionNegotiationsById[input.retentionNegotiationId]
  const team = world.teams[input.teamId]
  const predecessor = negotiation === undefined ? undefined : world.contractsById[negotiation.predecessorContractId]
  if (negotiation === undefined || team === undefined || negotiation.teamId !== team.id || negotiation.organizationId !== team.organizationId
    || negotiation.status !== 'ACCEPTED' || negotiation.acceptedTerms === undefined || negotiation.execution !== undefined
    || predecessor === undefined || predecessor.playerId !== negotiation.playerId || predecessor.teamId !== team.id) {
    return { ...workflow('STALE', world, undefined, 'RETENTION_AGREEMENT_OR_PREDECESSOR_CHANGED'), negotiationId: input.retentionNegotiationId }
  }
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(team.id))
  if (institutions.length !== 1) return { ...workflow('UNKNOWN', world, undefined, institutions.length === 0 ? 'GOVERNANCE_INSTITUTION_UNAVAILABLE' : 'GOVERNANCE_INSTITUTION_AMBIGUOUS'), negotiationId: input.retentionNegotiationId }
  const institution = institutions[0]!
  const subjectReferenceId = `retention:${negotiation.id}`
  const decisionId = playerContractSigningDecisionId(institution.id, subjectReferenceId)
  const existing = world.governanceDecisionsById[decisionId]
  const matches = Object.values(world.governanceDecisionsById).filter((item) => item.institutionId === institution.id && item.decisionType === 'PLAYER_CONTRACT_SIGNING' && item.subject.kind === 'GENERIC' && item.subject.referenceId === subjectReferenceId)
  if (matches.length > 1 || (existing !== undefined && (existing.decisionType !== 'PLAYER_CONTRACT_SIGNING' || existing.institutionId !== institution.id || existing.subject.kind !== 'GENERIC' || existing.subject.referenceId !== subjectReferenceId))) return { ...workflow('BLOCKED', world, existing, 'SIGNING_DECISION_IDENTITY_CONFLICT'), negotiationId: negotiation.id }
  if (matches.length === 1) {
    const decision = matches[0]!
    const events = eventsForDecision(world, decision.id)
    try { validateGovernanceDecisionLifecycle(events) } catch { return { ...workflow('BLOCKED', world, decision, 'SIGNING_DECISION_LIFECYCLE_INVALID'), negotiationId: negotiation.id } }
    const required = proposalRights(world, decision).approverBodyIds
    const approved = approvedBodies(events, required)
    const status = deriveGovernanceDecisionStatus(events, required)
    return { ...workflow(workflowStatusForDecision(status), world, decision, 'SIGNING_DECISION_ALREADY_EXISTS', required, approved), negotiationId: negotiation.id }
  }
  const rights = resolveGovernanceDecisionRights({ ...governanceGraph(world), decisionType: 'PLAYER_CONTRACT_SIGNING', institutionId: institution.id, asOfDate: world.currentDate })
  if (rights.proposerBodyIds.length === 0 || rights.approverBodyIds.length === 0) return { ...workflow('UNKNOWN', world, undefined, 'SIGNING_PROPOSER_OR_APPROVER_AUTHORITY_UNMAPPED', rights.approverBodyIds), negotiationId: negotiation.id }
  const proposer = resolveAppointedAuthorizedBody(world, input.initiator, rights.proposerBodyIds, institution.id, input.proposerBodyId)
  if (proposer === undefined) return { ...workflow('NO_AUTHORITY', world, undefined, 'INITIATOR_HAS_NO_UNAMBIGUOUS_ACTIVE_PROPOSER_APPOINTMENT', rights.approverBodyIds), negotiationId: negotiation.id }
  const grants = eventGrantIds(world, 'PROPOSED', proposer, institution.id, world.currentDate)
  if (grants.length === 0) return { ...workflow('NO_AUTHORITY', world, undefined, 'PROPOSER_EVENT_AUTHORITY_EVIDENCE_UNAVAILABLE', rights.approverBodyIds), negotiationId: negotiation.id }
  const decision = createGovernanceDecision({ id: decisionId, institutionId: institution.id, decisionType: 'PLAYER_CONTRACT_SIGNING', proposedByBodyId: proposer, proposedOn: world.currentDate, subject: { kind: 'GENERIC', referenceId: subjectReferenceId } })
  const proposed = createGovernanceDecisionEvent({ id: decisionEventId(decision.id, world.currentDate, 'PROPOSED', proposer), decisionId: decision.id, kind: 'PROPOSED', bodyId: proposer, effectiveOn: world.currentDate, authorityGrantIds: grants })
  const next = updateGameWorld(world, { governanceDecisions: [...Object.values(world.governanceDecisionsById), decision], governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), proposed] })
  return { ...workflow('PROPOSED', next, decision, 'SIGNING_DECISION_PROPOSED', rights.approverBodyIds, []), negotiationId: negotiation.id }
}

/** User initiation is an explicit request; it never implies approval or final signature. */
export function startUserPlayerContractSigning(
  world: GameWorld,
  input: Omit<EnsurePlayerContractSigningDecisionInput, 'initiator'> & { readonly proposerBodyId?: string },
): PlayerContractSigningWorkflowResult {
  const team = world.teams[input.teamId]
  if (team?.coachId !== world.userCoachId) return workflow('NO_AUTHORITY', world, undefined, 'TEAM_IS_NOT_USER_CONTROLLED')
  return ensurePlayerContractSigningDecision(world, { ...input, initiator: { kind: 'COACH', id: world.userCoachId } })
}

export interface RecordPlayerContractSigningDecisionEventInput {
  readonly decisionId: string
  readonly kind: 'APPROVED' | 'REJECTED' | 'VETOED' | 'WITHDRAWN'
  readonly actor: GovernanceActor
  readonly bodyId: string
}

/** Records one real appointed actor's Governance event. AI signing retries only after a real approval. */
export function recordPlayerContractSigningDecisionEvent(
  world: GameWorld,
  input: RecordPlayerContractSigningDecisionEventInput,
): PlayerContractSigningWorkflowResult {
  const decision = world.governanceDecisionsById[input.decisionId]
  if (decision === undefined || decision.decisionType !== 'PLAYER_CONTRACT_SIGNING' || decision.subject.kind !== 'GENERIC') {
    return workflow('STALE', world, decision, 'SIGNING_DECISION_NOT_FOUND')
  }
  if (decision.subject.referenceId.startsWith('retention:')) return recordRetentionSigningDecisionEvent(world, decision, input)
  const negotiation = world.negotiationsById[decision.subject.referenceId]
  if (negotiation === undefined || !('salary' in negotiation) || negotiation.status === 'SIGNED') {
    return workflow(negotiation?.status === 'SIGNED' ? 'ALREADY_SIGNED' : 'STALE', world, decision, 'SIGNING_NEGOTIATION_NOT_PENDING')
  }
  if (negotiation.status !== 'ACCEPTED') return workflow('NOT_ACCEPTED', world, decision, 'SIGNING_NEGOTIATION_NOT_ACCEPTED')
  if (negotiation.teamId === undefined || negotiation.sourceProposalId === undefined || negotiation.sourceProposalId.trim() === '') return workflow('STALE', world, decision, 'SIGNING_NEGOTIATION_IDENTITY_UNAVAILABLE')
  const signingTeam = world.teams[negotiation.teamId]
  const institutions = signingTeam === undefined ? [] : Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(signingTeam.id))
  if (signingTeam === undefined || signingTeam.organizationId !== negotiation.organizationId || institutions.length !== 1 || institutions[0]!.id !== decision.institutionId) {
    return workflow('STALE', world, decision, 'SIGNING_DECISION_INSTITUTION_OR_TEAM_CHANGED')
  }
  const events = eventsForDecision(world, decision.id)
  try { validateGovernanceDecisionLifecycle(events) } catch { return workflow('BLOCKED', world, decision, 'SIGNING_DECISION_LIFECYCLE_INVALID') }
  if (!events.some((event) => event.kind === 'PROPOSED' && event.bodyId === decision.proposedByBodyId)) return workflow('BLOCKED', world, decision, 'SIGNING_DECISION_PROPOSAL_EVENT_MISSING')
  const rightsAtProposal = proposalRights(world, decision)
  const currentRights = resolveGovernanceDecisionRights({ ...governanceGraph(world), decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: world.currentDate })
  const eventRight = input.kind === 'APPROVED' || input.kind === 'REJECTED' ? 'APPROVE' : input.kind === 'VETOED' ? 'VETO' : 'PROPOSE'
  const eligibleBodies = eventRight === 'APPROVE' ? rightsAtProposal.approverBodyIds
    : eventRight === 'VETO' ? currentRights.vetoBodyIds
      : rightsAtProposal.proposerBodyIds
  const institution = world.governanceInstitutionsById[decision.institutionId]
  if (institution === undefined || !eligibleBodies.includes(input.bodyId)
    || !isActiveAppointee(world, input.actor, input.bodyId, institution.id, world.currentDate)) {
    return workflow('NO_AUTHORITY', world, decision, 'ACTOR_IS_NOT_AN_ACTIVE_APPOINTEE_WITH_REQUIRED_DECISION_RIGHT', rightsAtProposal.approverBodyIds, approvedBodies(events, rightsAtProposal.approverBodyIds))
  }
  const status = deriveGovernanceDecisionStatus(events, rightsAtProposal.approverBodyIds)
  if (status === 'REJECTED' || status === 'VETOED' || status === 'WITHDRAWN' || status === 'EXECUTED') {
    return workflow(workflowStatusForDecision(status), world, decision, `SIGNING_DECISION_${status}`, rightsAtProposal.approverBodyIds, approvedBodies(events, rightsAtProposal.approverBodyIds))
  }
  if (status === 'APPROVED' && (input.kind === 'REJECTED' || input.kind === 'WITHDRAWN')) {
    return workflow('BLOCKED', world, decision, `INVALID_${input.kind}_AFTER_APPROVAL`, rightsAtProposal.approverBodyIds, approvedBodies(events, rightsAtProposal.approverBodyIds))
  }
  if (input.kind === 'APPROVED' && events.some((event) => event.kind === 'APPROVED' && event.bodyId === input.bodyId)) {
    return workflow(approvalsComplete(events, rightsAtProposal.approverBodyIds) ? 'APPROVED' : 'REQUIRES_APPROVAL', world, decision, 'APPROVAL_ALREADY_RECORDED', rightsAtProposal.approverBodyIds, approvedBodies(events, rightsAtProposal.approverBodyIds))
  }

  const grantIds = eventGrantIds(world, input.kind, input.bodyId, decision.institutionId, world.currentDate)
  if (grantIds.length === 0) return workflow('NO_AUTHORITY', world, decision, 'GOVERNANCE_EVENT_AUTHORITY_EVIDENCE_UNAVAILABLE', rightsAtProposal.approverBodyIds, approvedBodies(events, rightsAtProposal.approverBodyIds))
  const event = createGovernanceDecisionEvent({
    id: decisionEventId(decision.id, world.currentDate, input.kind, input.bodyId),
    decisionId: decision.id,
    kind: input.kind,
    bodyId: input.bodyId,
    effectiveOn: world.currentDate,
    authorityGrantIds: grantIds,
  })
  const updated = updateGameWorld(world, { governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), event] })
  const updatedEvents = eventsForDecision(updated, decision.id)
  const updatedStatus = deriveGovernanceDecisionStatus(updatedEvents, rightsAtProposal.approverBodyIds)
  const required = rightsAtProposal.approverBodyIds
  const approved = approvedBodies(updatedEvents, required)
  if (updatedStatus === 'REJECTED' || updatedStatus === 'VETOED' || updatedStatus === 'WITHDRAWN') {
    return workflow(workflowStatusForDecision(updatedStatus), updated, decision, `SIGNING_DECISION_${updatedStatus}`, required, approved)
  }
  if (!approvalsComplete(updatedEvents, required)) return workflow('REQUIRES_APPROVAL', updated, decision, 'SIGNING_DECISION_APPROVALS_INCOMPLETE', required, approved)

  const team = world.teams[negotiation.teamId!]
  if (team?.coachId === undefined || team.coachId === world.userCoachId) {
    return workflow('APPROVED', updated, decision, 'APPROVED_AWAITING_EXPLICIT_USER_SIGNING', required, approved)
  }
  const signing = completeAcceptedFreeAgentSigning(updated, { teamId: team.id, negotiationId: negotiation.id, expectedProposalId: negotiation.sourceProposalId ?? '' })
  return workflow(signing.status === 'SIGNED' ? 'SIGNED' : signing.status === 'ALREADY_SIGNED' ? 'ALREADY_SIGNED' : signing.status === 'REQUIRES_APPROVAL' ? 'REQUIRES_APPROVAL' : signing.status === 'UNKNOWN' ? 'UNKNOWN' : signing.status === 'NO_EXECUTION_OWNER' ? 'NO_AUTHORITY' : signing.status === 'STALE' ? 'STALE' : signing.status === 'PLAYER_UNAVAILABLE' || signing.status === 'CONFLICT' ? 'PLAYER_UNAVAILABLE' : signing.status === 'FINANCIAL_BLOCK' || signing.status === 'FEE_ACCOUNTING_UNAVAILABLE' ? 'FINANCIAL_BLOCK' : 'BLOCKED', signing.status === 'SIGNED' ? signing.world : updated, decision, signing.reason ?? 'AI_SIGNING_RETRY_AFTER_APPROVAL', required, approved, signing)
}

function recordRetentionSigningDecisionEvent(world: GameWorld, decision: GovernanceDecision, input: RecordPlayerContractSigningDecisionEventInput): PlayerContractSigningWorkflowResult {
  const negotiationId = decision.subject.kind === 'GENERIC' ? decision.subject.referenceId.slice('retention:'.length) : ''
  const negotiation = world.retentionNegotiationsById[negotiationId]
  if (negotiation === undefined || negotiation.status !== 'ACCEPTED' || negotiation.execution !== undefined) return workflow('STALE', world, decision, 'RETENTION_AGREEMENT_NOT_PENDING')
  const team = world.teams[negotiation.teamId]
  const institutions = team === undefined ? [] : Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(team.id))
  if (team === undefined || team.organizationId !== negotiation.organizationId || institutions.length !== 1 || institutions[0]!.id !== decision.institutionId) return workflow('STALE', world, decision, 'SIGNING_DECISION_INSTITUTION_OR_TEAM_CHANGED')
  const events = eventsForDecision(world, decision.id)
  try { validateGovernanceDecisionLifecycle(events) } catch { return workflow('BLOCKED', world, decision, 'SIGNING_DECISION_LIFECYCLE_INVALID') }
  if (!events.some((event) => event.kind === 'PROPOSED' && event.bodyId === decision.proposedByBodyId)) return workflow('BLOCKED', world, decision, 'SIGNING_DECISION_PROPOSAL_EVENT_MISSING')
  const atProposal = proposalRights(world, decision)
  const current = resolveGovernanceDecisionRights({ ...governanceGraph(world), decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: world.currentDate })
  const eventRight = input.kind === 'APPROVED' || input.kind === 'REJECTED' ? 'APPROVE' : input.kind === 'VETOED' ? 'VETO' : 'PROPOSE'
  const eligible = eventRight === 'APPROVE' ? atProposal.approverBodyIds : eventRight === 'VETO' ? current.vetoBodyIds : atProposal.proposerBodyIds
  if (!eligible.includes(input.bodyId) || !isActiveAppointee(world, input.actor, input.bodyId, decision.institutionId, world.currentDate)) return workflow('NO_AUTHORITY', world, decision, 'ACTOR_IS_NOT_AN_ACTIVE_APPOINTEE_WITH_REQUIRED_DECISION_RIGHT', atProposal.approverBodyIds, approvedBodies(events, atProposal.approverBodyIds))
  const status = deriveGovernanceDecisionStatus(events, atProposal.approverBodyIds)
  if (status === 'REJECTED' || status === 'VETOED' || status === 'WITHDRAWN' || status === 'EXECUTED') return workflow(workflowStatusForDecision(status), world, decision, `SIGNING_DECISION_${status}`, atProposal.approverBodyIds, approvedBodies(events, atProposal.approverBodyIds))
  if (status === 'APPROVED' && (input.kind === 'REJECTED' || input.kind === 'WITHDRAWN')) return workflow('BLOCKED', world, decision, `INVALID_${input.kind}_AFTER_APPROVAL`, atProposal.approverBodyIds, approvedBodies(events, atProposal.approverBodyIds))
  if (input.kind === 'APPROVED' && events.some((event) => event.kind === 'APPROVED' && event.bodyId === input.bodyId)) return workflow(approvalsComplete(events, atProposal.approverBodyIds) ? 'APPROVED' : 'REQUIRES_APPROVAL', world, decision, 'APPROVAL_ALREADY_RECORDED', atProposal.approverBodyIds, approvedBodies(events, atProposal.approverBodyIds))
  const grants = eventGrantIds(world, input.kind, input.bodyId, decision.institutionId, world.currentDate)
  if (grants.length === 0) return workflow('NO_AUTHORITY', world, decision, 'GOVERNANCE_EVENT_AUTHORITY_EVIDENCE_UNAVAILABLE', atProposal.approverBodyIds, approvedBodies(events, atProposal.approverBodyIds))
  const event = createGovernanceDecisionEvent({ id: decisionEventId(decision.id, world.currentDate, input.kind, input.bodyId), decisionId: decision.id, kind: input.kind, bodyId: input.bodyId, effectiveOn: world.currentDate, authorityGrantIds: grants })
  const next = updateGameWorld(world, { governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), event] })
  const nextEvents = eventsForDecision(next, decision.id)
  const nextStatus = deriveGovernanceDecisionStatus(nextEvents, atProposal.approverBodyIds)
  return workflow(workflowStatusForDecision(nextStatus), next, decision, `SIGNING_DECISION_${nextStatus}`, atProposal.approverBodyIds, approvedBodies(nextEvents, atProposal.approverBodyIds))
}

/** AI checkpoint supplied with only agreements newly moved to ACCEPTED; no daily polling. */
export function ensureAiAcceptedPlayerContractSigningDecisions(world: GameWorld, negotiationIds: readonly string[]): {
  readonly world: GameWorld
  readonly results: readonly PlayerContractSigningWorkflowResult[]
} {
  let current = world
  const results: PlayerContractSigningWorkflowResult[] = []
  for (const negotiationId of [...new Set(negotiationIds)].sort((a, b) => a.localeCompare(b))) {
    const negotiation = current.negotiationsById[negotiationId]
    const team = negotiation?.teamId === undefined ? undefined : current.teams[negotiation.teamId]
    if (negotiation?.status !== 'ACCEPTED' || team?.coachId === undefined || team.coachId === current.userCoachId) continue
    const offerActor = negotiationOfferActor(negotiation)
    if (offerActor?.kind !== 'STAFF') {
      results.push({ ...workflow('NO_AUTHORITY', current, undefined, 'AI_OFFER_HAS_NO_CANONICAL_STAFF_PROPOSER'), negotiationId })
      continue
    }
    const initiated = ensurePlayerContractSigningDecision(current, {
      teamId: team.id,
      negotiationId,
      expectedProposalId: negotiation.sourceProposalId ?? '',
      initiator: { kind: 'STAFF', id: offerActor.staffPersonId },
    })
    results.push({ ...initiated, negotiationId })
    current = initiated.world
  }
  return { world: current, results: Object.freeze(results) }
}

/** Read-only explanation of current exact-agreement signing readiness. */
export function assessPlayerContractSigningReadiness(world: GameWorld, teamId: TeamId, negotiationId: string): PlayerContractSigningReadiness {
  const negotiation = world.negotiationsById[negotiationId]
  const team = world.teams[teamId]
  const player = negotiation === undefined ? undefined : world.players[negotiation.playerId]
  const accepted = negotiation !== undefined && 'salary' in negotiation && negotiation.status === 'ACCEPTED'
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(teamId))
  const institution = institutions.length === 1 ? institutions[0] : undefined
  const decision = institution === undefined ? undefined : Object.values(world.governanceDecisionsById).find((item) => item.institutionId === institution.id
    && item.decisionType === 'PLAYER_CONTRACT_SIGNING' && item.subject.kind === 'GENERIC' && item.subject.referenceId === negotiationId)
  const proposalResolution = decision === undefined || institution === undefined ? undefined : proposalRights(world, decision)
  const currentRights = institution === undefined ? undefined : resolveGovernanceDecisionRights({ ...governanceGraph(world), decisionType: 'PLAYER_CONTRACT_SIGNING', institutionId: institution.id, asOfDate: world.currentDate })
  const events = decision === undefined ? [] : eventsForDecision(world, decision.id)
  const required = proposalResolution?.approverBodyIds ?? []
  const approved = approvedBodies(events, required)
  const executorRights = currentRights?.executorBodyIds ?? []
  const execution = team === undefined ? undefined : resolveSigningExecutionOwner(world, team.id)
  const available = player !== undefined && isPlayerFreeAgent(world, player.id, world.currentDate)
  const affordable = negotiation !== undefined && 'salary' in negotiation && negotiation.salary !== undefined && team !== undefined && canTeamAffordAdditionalSalary(world, team.id, negotiation.salary, world.currentDate)
  const decisionStatus = decision === undefined ? undefined : deriveGovernanceDecisionStatus(events, required)
  const workflowStatus = workflowStatusForDecision(decisionStatus)
  let status: PlayerContractSigningWorkflowStatus = !accepted ? negotiation?.status === 'SIGNED' ? 'ALREADY_SIGNED' : 'NOT_ACCEPTED' : 'REQUIRES_APPROVAL'
  let blocker: string | undefined = !accepted ? 'NEGOTIATION_NOT_ACCEPTED' : undefined
  if (accepted && (team === undefined || negotiation?.teamId !== teamId || negotiation.organizationId !== team.organizationId || negotiation.sourceProposalId === undefined || negotiation.sourceProposalId.trim() === '')) { status = 'STALE'; blocker = 'NEGOTIATION_TEAM_OR_PROPOSAL_CHANGED' }
  else if (accepted && institutions.length !== 1) { status = 'UNKNOWN'; blocker = institutions.length === 0 ? 'GOVERNANCE_INSTITUTION_UNAVAILABLE' : 'GOVERNANCE_INSTITUTION_AMBIGUOUS' }
  else if (accepted && currentRights !== undefined && (currentRights.proposerBodyIds.length === 0 || currentRights.approverBodyIds.length === 0)) { status = 'UNKNOWN'; blocker = 'SIGNING_PROPOSER_OR_APPROVER_AUTHORITY_UNMAPPED' }
  else if (decisionStatus === 'REJECTED' || decisionStatus === 'VETOED' || decisionStatus === 'WITHDRAWN') { status = workflowStatus; blocker = `SIGNING_DECISION_${decisionStatus}` }
  else if (accepted && !available) { status = 'PLAYER_UNAVAILABLE'; blocker = 'PLAYER_NOT_FREE_AGENT' }
  else if (accepted && !affordable) { status = 'FINANCIAL_BLOCK'; blocker = 'CURRENT_PAYROLL_CANNOT_AFFORD_ACCEPTED_SALARY' }
  else if (accepted && (execution === 'NO_EXECUTION_OWNER' || execution === 'BLOCKED')) { status = execution === 'NO_EXECUTION_OWNER' ? 'NO_AUTHORITY' : 'BLOCKED'; blocker = 'NO_SIGNING_EXECUTION_OWNER' }
  else if (accepted && decision === undefined) { status = 'REQUIRES_APPROVAL'; blocker = 'SIGNING_DECISION_NOT_PROPOSED' }
  else if (decision !== undefined && approvalsComplete(events, required) && executorRights.length === 0) { status = 'BLOCKED'; blocker = 'SIGNING_GOVERNANCE_EXECUTOR_UNAVAILABLE' }
  else if (decision !== undefined && approvalsComplete(events, required)) { status = 'APPROVED'; blocker = team?.coachId === world.userCoachId ? 'APPROVED_AWAITING_EXPLICIT_USER_SIGNING' : undefined }
  else if (decision !== undefined) { status = 'REQUIRES_APPROVAL'; blocker = 'SIGNING_DECISION_APPROVALS_INCOMPLETE' }
  return {
    negotiationId,
    ...(accepted && negotiation !== undefined && 'salary' in negotiation ? { acceptedTerms: { salary: negotiation.salary, years: negotiation.years, ...(negotiation.role === undefined ? {} : { role: negotiation.role }), ...(negotiation.agentFee === undefined ? {} : { agentFee: negotiation.agentFee }) } } : {}),
    playerAvailable: available,
    payrollAffordable: affordable,
    executionOwner: execution ?? 'BLOCKED',
    ...(decision === undefined ? {} : { governanceDecisionId: decision.id }),
    ...(decision === undefined ? {} : { proposerBodyId: decision.proposedByBodyId }),
    requiredApproverBodyIds: required,
    approvedBodyIds: approved,
    executorBodyIds: executorRights,
    status,
    ...(blocker === undefined ? {} : { blocker }),
  }
}

export function playerContractSigningDecisionId(institutionId: string, negotiationId: string): string {
  return `decision:player-contract-signing:${encodeURIComponent(institutionId)}:${encodeURIComponent(negotiationId)}`
}

function validateAcceptedNegotiation(world: GameWorld, input: Pick<EnsurePlayerContractSigningDecisionInput, 'teamId' | 'negotiationId' | 'expectedProposalId'>):
  | { readonly negotiation: Extract<ContractNegotiation, { readonly salary: number }>; readonly team: Team; readonly institution: GovernanceInstitution }
  | { readonly failure: PlayerContractSigningWorkflowResult } {
  const negotiation = world.negotiationsById[input.negotiationId]
  const team = world.teams[input.teamId]
  if (negotiation === undefined || team === undefined || negotiation.teamId !== input.teamId || negotiation.organizationId !== team.organizationId
    || negotiation.sourceProposalId === undefined || negotiation.sourceProposalId.trim() === '' || negotiation.sourceProposalId !== input.expectedProposalId) {
    return { failure: workflow('STALE', world, undefined, 'NEGOTIATION_TEAM_OR_PROPOSAL_CHANGED') }
  }
  if (negotiation.status !== 'ACCEPTED' || !('salary' in negotiation)) return { failure: workflow(negotiation.status === 'SIGNED' ? 'ALREADY_SIGNED' : 'NOT_ACCEPTED', world, undefined, 'NEGOTIATION_NOT_ACCEPTED') }
  if (!world.players[negotiation.playerId] || !isPlayerFreeAgent(world, negotiation.playerId, world.currentDate)) {
    return { failure: workflow('PLAYER_UNAVAILABLE', world, undefined, 'PLAYER_NOT_FREE_AGENT') }
  }
  if (!canTeamAffordAdditionalSalary(world, team.id, negotiation.salary, world.currentDate)) return { failure: workflow('FINANCIAL_BLOCK', world, undefined, 'CURRENT_PAYROLL_CANNOT_AFFORD_ACCEPTED_SALARY') }
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(team.id))
  if (institutions.length !== 1 || !institutions[0]!.teamIds.includes(team.id)) {
    return { failure: workflow('UNKNOWN', world, undefined, institutions.length === 0 ? 'GOVERNANCE_INSTITUTION_UNAVAILABLE' : 'GOVERNANCE_INSTITUTION_AMBIGUOUS') }
  }
  return { negotiation, team, institution: institutions[0]! }
}

function resolveAppointedAuthorizedBody(world: GameWorld, actor: GovernanceActor, eligibleBodyIds: readonly string[], institutionId: string, requestedBodyId?: string): string | undefined {
  const matches = Object.values(world.governanceAppointmentsById).filter((appointment) => appointment.actor.kind === actor.kind && appointment.actor.id === actor.id
    && eligibleBodyIds.includes(appointment.bodyId)
    && world.governanceBodiesById[appointment.bodyId]?.institutionId === institutionId
    && appointment.startedOn <= world.currentDate && (appointment.endedOn === undefined || appointment.endedOn >= world.currentDate)
    && (requestedBodyId === undefined || appointment.bodyId === requestedBodyId))
  const bodyIds = [...new Set(matches.map((appointment) => appointment.bodyId))]
  return bodyIds.length === 1 ? bodyIds[0] : undefined
}

function isActiveAppointee(world: GameWorld, actor: GovernanceActor, bodyId: string, institutionId: string, on: GameDate): boolean {
  return Object.values(world.governanceAppointmentsById).some((appointment) => appointment.actor.kind === actor.kind && appointment.actor.id === actor.id
    && appointment.bodyId === bodyId && world.governanceBodiesById[bodyId]?.institutionId === institutionId
    && appointment.startedOn <= on && (appointment.endedOn === undefined || appointment.endedOn >= on))
}

function proposalRights(world: GameWorld, decision: GovernanceDecision) {
  return resolveGovernanceDecisionRights({ ...governanceGraph(world), decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: decision.proposedOn })
}

function governanceGraph(world: GameWorld) {
  return { bodies: Object.values(world.governanceBodiesById), authorityGrants: Object.values(world.governanceAuthorityGrantsById), participationGrants: Object.values(world.governanceDecisionParticipationGrantsById) }
}

function eventGrantIds(world: GameWorld, kind: GovernanceDecisionEventKind, bodyId: string, institutionId: string, effectiveOn: GameDate): readonly string[] {
  return resolveGovernanceDecisionEventAuthorityGrantIds({ event: { kind, bodyId, effectiveOn }, decisionType: 'PLAYER_CONTRACT_SIGNING', institutionId, ...governanceGraph(world) })
}

function eventsForDecision(world: GameWorld, decisionId: string): readonly GovernanceDecisionEvent[] {
  return Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decisionId)
}

function approvedBodies(events: readonly GovernanceDecisionEvent[], requiredBodyIds: readonly string[]): readonly string[] {
  const approved = new Set(events.filter((event) => event.kind === 'APPROVED').map((event) => event.bodyId))
  return requiredBodyIds.filter((bodyId) => approved.has(bodyId))
}

function approvalsComplete(events: readonly GovernanceDecisionEvent[], requiredBodyIds: readonly string[]): boolean {
  const approved = new Set(events.filter((event) => event.kind === 'APPROVED').map((event) => event.bodyId))
  return requiredBodyIds.length > 0 && requiredBodyIds.every((bodyId) => approved.has(bodyId))
}

function decisionEventId(decisionId: string, date: GameDate, kind: GovernanceDecisionEventKind, bodyId: string): string {
  const order: Readonly<Record<GovernanceDecisionEventKind, string>> = { PROPOSED: '00', REVIEW_STARTED: '10', APPROVED: '20', REJECTED: '30', VETOED: '40', WITHDRAWN: '50', EXECUTED: '99' }
  return `event:${decisionId}:${date}:${order[kind]}:${kind}:${encodeURIComponent(bodyId)}`
}

function workflowStatusForDecision(status: ReturnType<typeof deriveGovernanceDecisionStatus>): PlayerContractSigningWorkflowStatus {
  if (status === 'REJECTED') return 'REJECTED'
  if (status === 'VETOED') return 'VETOED'
  if (status === 'WITHDRAWN') return 'WITHDRAWN'
  if (status === 'EXECUTED') return 'SIGNED'
  if (status === 'APPROVED') return 'APPROVED'
  return 'REQUIRES_APPROVAL'
}

function resolveSigningExecutionOwner(world: GameWorld, teamId: TeamId): PlayerContractSigningReadiness['executionOwner'] {
  const owner = resolveSigningExecutionAuthority(world, teamId)
  return owner.status === 'AUTHORIZED' ? owner.owner.kind : owner.status === 'NO_EXECUTION_OWNER' ? 'NO_EXECUTION_OWNER' : 'BLOCKED'
}

function workflow(
  status: PlayerContractSigningWorkflowStatus,
  world: GameWorld,
  decision: GovernanceDecision | undefined,
  reason: string,
  requiredApproverBodyIds?: readonly string[],
  approvedBodyIds?: readonly string[],
  signing?: FreeAgentSigningResult,
): PlayerContractSigningWorkflowResult {
  return { status, world, ...(decision === undefined ? {} : { decision }), ...(decision === undefined ? {} : { decisionStatus: deriveGovernanceDecisionStatus(eventsForDecision(world, decision.id), requiredApproverBodyIds) }), ...(requiredApproverBodyIds === undefined ? {} : { requiredApproverBodyIds }), ...(approvedBodyIds === undefined ? {} : { approvedBodyIds }), ...(signing === undefined ? {} : { signing }), reason }
}
