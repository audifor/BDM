import type { GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import { createGovernanceDecision, createGovernanceDecisionEvent, deriveGovernanceDecisionStatus, resolveGovernanceDecisionEventAuthorityGrantIds, resolveGovernanceDecisionRights, validateGovernanceDecisionLifecycle, type GovernanceActor, type GovernanceDecision, type GovernanceDecisionEvent, type GovernanceDecisionEventKind } from '@/domain/governance'
import { getResponsibility, getStaffAssignment, getStaffPerson, updateGameWorld, type GameWorld } from '@/domain/world'
import { validateResponsibilityAssignment } from '@/domain/responsibility'
import { executeTrade, getTradeWindowStatus, resolveSharedTradeSeasonAuthority, tradeWindowBlocker, validateTrade } from '@/engine/trade'
import { reviewMaterialRosterChanges } from '@/app/gmPlanning'
import { createTradeNegotiation, createTradeRecord, type TradeNegotiation } from '@/domain/trade'

export type TradeCommitmentStatus = 'READY_TO_EXECUTE' | 'REQUIRES_APPROVAL' | 'NO_EXECUTION_OWNER' | 'WINDOW_CLOSED' | 'STALE_PACKAGE' | 'FINANCIAL_BLOCK' | 'ASSET_CONFLICT' | 'BLOCKED' | 'EXECUTED' | 'ALREADY_EXECUTED' | 'CONFLICT' | 'NO_AUTHORITY' | 'PROPOSED' | 'APPROVED' | 'VETOED' | 'REJECTED'
export interface TradeParticipantReadiness {
  readonly teamId: TeamId
  readonly operationalExecutor?: { readonly kind: 'USER' } | { readonly kind: 'STAFF'; readonly staffPersonId: string }
  readonly governanceDecisionId?: string
  readonly proposer?: string
  readonly requiredApprovals: readonly string[]
  readonly completedApprovals: readonly string[]
  readonly governanceExecutor?: string
  readonly status: TradeCommitmentStatus
  readonly blockers: readonly string[]
}
export interface TradeCommitmentReadiness {
  readonly negotiationId: string
  readonly revisionId: string
  readonly status: TradeCommitmentStatus
  readonly participants: readonly TradeParticipantReadiness[]
  readonly blockers: readonly string[]
}
export interface TradeCommitmentResult { readonly status: TradeCommitmentStatus; readonly world: GameWorld; readonly decision?: GovernanceDecision; readonly readiness?: TradeCommitmentReadiness; readonly reasons: readonly string[] }

const decisionRef = (negotiationId: string, revisionId: string, teamId: TeamId) => `trade-commitment:${encodeURIComponent(negotiationId)}:${encodeURIComponent(revisionId)}:${encodeURIComponent(teamId)}`
const decisionId = (institutionId: string, negotiationId: string, revisionId: string, teamId: TeamId) => `governance:PLAYER_TRADE_COMMITMENT:${encodeURIComponent(institutionId)}:${encodeURIComponent(negotiationId)}:${encodeURIComponent(revisionId)}:${encodeURIComponent(teamId)}`

const TRADE_WINDOW_REASONS: readonly string[] = ['TRADE_WINDOW_CLOSED', 'TRADE_WINDOW_NOT_OPEN', 'TRADE_WINDOW_NOT_CONFIGURED']
/** `WINDOW_CLOSED` groups every window state that does not currently permit a commitment. */
const windowClosed = (reasons: readonly string[]) => reasons.some((reason) => TRADE_WINDOW_REASONS.includes(reason))

export function startUserTradeCommitment(world: GameWorld, input: { readonly negotiationId: string; readonly expectedRevisionId: string; readonly teamId: TeamId; readonly proposerBodyId?: string }): TradeCommitmentResult {
  const team = world.teams[input.teamId]
  if (team?.coachId !== world.userCoachId) return result('NO_AUTHORITY', world, 'TEAM_IS_NOT_USER_CONTROLLED')
  return ensureTradeCommitmentDecision(world, { ...input, initiator: { kind: 'COACH', id: world.userCoachId } })
}

export function ensureTradeCommitmentDecision(world: GameWorld, input: { readonly negotiationId: string; readonly expectedRevisionId: string; readonly teamId: TeamId; readonly initiator: GovernanceActor; readonly proposerBodyId?: string }): TradeCommitmentResult {
  const checked = checkAgreedRevision(world, input.negotiationId, input.expectedRevisionId)
  if ('failure' in checked) return checked.failure
  const { negotiation, revision } = checked
  if (!negotiation.participantTeamIds.includes(input.teamId)) return result('CONFLICT', world, 'TEAM_NOT_IN_NEGOTIATION')
  const packageBlockers = tradeBlockers(world, negotiation, revision)
  if (packageBlockers.length > 0) return result(windowClosed(packageBlockers) ? 'WINDOW_CLOSED' : 'STALE_PACKAGE', world, ...packageBlockers)
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(input.teamId))
  if (institutions.length !== 1) return result('NO_AUTHORITY', world, 'PARTICIPANT_GOVERNANCE_INSTITUTION_NOT_UNIQUE')
  const institution = institutions[0]!
  const id = decisionId(institution.id, negotiation.id, revision.id, input.teamId)
  const ref = decisionRef(negotiation.id, revision.id, input.teamId)
  const matching = Object.values(world.governanceDecisionsById).filter((item) => item.decisionType === 'PLAYER_TRADE_COMMITMENT' && item.institutionId === institution.id && item.subject.kind === 'GENERIC' && item.subject.referenceId === ref)
  if (matching.length > 1 || (world.governanceDecisionsById[id] !== undefined && !matching.includes(world.governanceDecisionsById[id]!))) return result('BLOCKED', world, 'COMMITMENT_DECISION_IDENTITY_CONFLICT')
  if (matching.length === 1) return readinessResult(world, negotiation, matching[0]!)
  const graph = governanceGraph(world)
  const rights = resolveGovernanceDecisionRights({ ...graph, decisionType: 'PLAYER_TRADE_COMMITMENT', institutionId: institution.id, asOfDate: world.currentDate })
  if (rights.proposerBodyIds.length === 0 || rights.approverBodyIds.length === 0) return result('NO_AUTHORITY', world, 'GOVERNANCE_PROPOSER_OR_APPROVER_RIGHTS_UNMAPPED')
  const proposer = resolveAppointedBody(world, input.initiator, rights.proposerBodyIds, institution.id, input.proposerBodyId)
  if (proposer === undefined) return result('NO_AUTHORITY', world, 'INITIATOR_HAS_NO_ACTIVE_PROPOSER_APPOINTMENT')
  const evidence = authorityIds(world, 'PROPOSED', proposer, institution.id, world.currentDate)
  if (evidence.length === 0) return result('NO_AUTHORITY', world, 'PROPOSER_AUTHORITY_EVIDENCE_MISSING')
  const decision = createGovernanceDecision({ id, institutionId: institution.id, decisionType: 'PLAYER_TRADE_COMMITMENT', proposedByBodyId: proposer, proposedOn: world.currentDate, subject: { kind: 'GENERIC', referenceId: ref } })
  const event = createGovernanceDecisionEvent({ id: eventId(id, world.currentDate, 'PROPOSED', proposer), decisionId: id, kind: 'PROPOSED', bodyId: proposer, effectiveOn: world.currentDate, authorityGrantIds: evidence })
  const next = updateGameWorld(world, { governanceDecisions: [...Object.values(world.governanceDecisionsById), decision], governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), event] })
  return readinessResult(next, negotiation, decision)
}

export function recordTradeCommitmentEvent(world: GameWorld, input: { readonly decisionId: string; readonly kind: 'APPROVED' | 'REJECTED' | 'VETOED'; readonly actor: GovernanceActor; readonly bodyId: string }): TradeCommitmentResult {
  const decision = world.governanceDecisionsById[input.decisionId]
  if (decision?.decisionType !== 'PLAYER_TRADE_COMMITMENT' || decision.subject.kind !== 'GENERIC') return result('CONFLICT', world, 'TRADE_COMMITMENT_DECISION_NOT_FOUND')
  const matched = findNegotiationBySubject(world, decision.subject.referenceId)
  if (matched === undefined || matched.negotiation.status !== 'AGREED' || matched.negotiation.currentRevisionId !== matched.revision.id) return result('STALE_PACKAGE', world, 'AGREED_REVISION_IS_NOT_CURRENT')
  const teamIds = Object.values(world.governanceInstitutionsById).find((institution) => institution.id === decision.institutionId)?.teamIds.filter((teamId) => matched.negotiation.participantTeamIds.includes(teamId) && decision.subject.kind === 'GENERIC' && decision.subject.referenceId.endsWith(`:${encodeURIComponent(teamId)}`)) ?? []
  if (teamIds.length !== 1 || decision.subject.referenceId !== decisionRef(matched.negotiation.id, matched.revision.id, teamIds[0]!)) return result('CONFLICT', world, 'DECISION_INSTITUTION_IS_NOT_A_UNIQUE_PARTICIPANT')
  const events = eventsFor(world, decision.id)
  if (!events.some((event) => event.kind === 'PROPOSED')) return result('BLOCKED', world, 'GOVERNANCE_PROPOSAL_EVENT_MISSING')
  try { validateGovernanceDecisionLifecycle(events) } catch { return result('BLOCKED', world, 'GOVERNANCE_DECISION_LIFECYCLE_INVALID') }
  if (!events.some((event) => event.kind === 'PROPOSED' && event.bodyId === decision.proposedByBodyId)) return result('BLOCKED', world, 'GOVERNANCE_PROPOSAL_EVENT_MISSING')
  const graph = governanceGraph(world)
  const rightsAtProposal = resolveGovernanceDecisionRights({ ...graph, decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: decision.proposedOn })
  const currentRights = resolveGovernanceDecisionRights({ ...graph, decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: world.currentDate })
  const allowed = input.kind === 'APPROVED' || input.kind === 'REJECTED' ? rightsAtProposal.approverBodyIds : currentRights.vetoBodyIds
  if (!allowed.includes(input.bodyId) || !isAppointee(world, input.actor, input.bodyId, decision.institutionId, world.currentDate)) return result('NO_AUTHORITY', world, 'ACTOR_LACKS_CURRENT_GOVERNANCE_RIGHT')
  const currentStatus = deriveGovernanceDecisionStatus(events, rightsAtProposal.approverBodyIds)
  if (['REJECTED', 'VETOED', 'WITHDRAWN', 'EXECUTED'].includes(currentStatus ?? '')) return result(currentStatus as TradeCommitmentStatus, world, 'GOVERNANCE_DECISION_IS_TERMINAL')
  if (events.some((event) => event.kind === input.kind && event.bodyId === input.bodyId)) return readinessResult(world, matched.negotiation, decision)
  const authorityGrantIds = authorityIds(world, input.kind, input.bodyId, decision.institutionId, world.currentDate)
  if (authorityGrantIds.length === 0) return result('NO_AUTHORITY', world, 'GOVERNANCE_EVENT_AUTHORITY_EVIDENCE_MISSING')
  const event = createGovernanceDecisionEvent({ id: eventId(decision.id, world.currentDate, input.kind, input.bodyId), decisionId: decision.id, kind: input.kind, bodyId: input.bodyId, effectiveOn: world.currentDate, authorityGrantIds })
  const next = updateGameWorld(world, { governanceDecisionEvents: [...Object.values(world.governanceDecisionEventsById), event] })
  const readiness = assessTradeCommitmentReadiness(next, matched.negotiation.id, matched.revision.id)
  if (input.kind === 'APPROVED' && readiness.status === 'READY_TO_EXECUTE') return completeAgreedTrade(next, { negotiationId: matched.negotiation.id, expectedRevisionId: matched.revision.id })
  return { status: input.kind === 'VETOED' ? 'VETOED' : input.kind === 'REJECTED' ? 'REJECTED' : readiness.status, world: next, decision, readiness, reasons: readiness.blockers }
}

export function assessTradeCommitmentReadiness(world: GameWorld, negotiationId: string, expectedRevisionId: string): TradeCommitmentReadiness {
  const checked = checkAgreedRevision(world, negotiationId, expectedRevisionId)
  if ('failure' in checked) return { negotiationId, revisionId: expectedRevisionId, status: checked.failure.status, participants: [], blockers: checked.failure.reasons }
  const { negotiation, revision } = checked
  const base = tradeBlockers(world, negotiation, revision)
  const participants = negotiation.participantTeamIds.map((teamId) => participantReadiness(world, negotiation, revision.id, teamId))
  const blockers = [...base, ...participants.flatMap((participant) => participant.blockers.map((reason) => `${teamIdLabel(participant.teamId)}:${reason}`))]
  const status: TradeCommitmentStatus = windowClosed(base) ? 'WINDOW_CLOSED'
    : base.includes('CASH_SETTLEMENT_UNAVAILABLE') ? 'BLOCKED'
      : base.some((reason) => reason.includes('CHANGED') || reason.includes('NOT_OWNED') || reason.includes('NOT_ON_TEAM')) ? 'ASSET_CONFLICT'
        : base.some((reason) => reason.includes('SALARY') || reason.includes('FINANCIAL')) ? 'FINANCIAL_BLOCK'
          : participants.some((item) => item.status === 'NO_EXECUTION_OWNER') ? 'NO_EXECUTION_OWNER'
            : participants.some((item) => item.status === 'REQUIRES_APPROVAL') ? 'REQUIRES_APPROVAL'
              : blockers.length === 0 ? 'READY_TO_EXECUTE' : 'BLOCKED'
  return { negotiationId, revisionId: revision.id, status, participants, blockers }
}

export function completeAgreedTrade(world: GameWorld, input: { readonly negotiationId: string; readonly expectedRevisionId: string }): TradeCommitmentResult {
  const negotiation = world.tradeNegotiationsById[input.negotiationId]
  if (negotiation?.status === 'EXECUTED') return negotiation.currentRevisionId === input.expectedRevisionId
    ? { status: 'ALREADY_EXECUTED', world, reasons: [] }
    : result('CONFLICT', world, 'EXECUTED_REVISION_DOES_NOT_MATCH')
  const readiness = assessTradeCommitmentReadiness(world, input.negotiationId, input.expectedRevisionId)
  if (readiness.status !== 'READY_TO_EXECUTE') return { status: readiness.status, world, readiness, reasons: readiness.blockers }
  const checked = checkAgreedRevision(world, input.negotiationId, input.expectedRevisionId)
  if ('failure' in checked) return checked.failure
  const { negotiation: agreed, revision } = checked
  const proposal = { id: `agreed-trade:${encodeURIComponent(agreed.id)}:${encodeURIComponent(revision.id)}`, ecosystemId: agreed.ecosystemId, seasonId: agreed.seasonId, participantTeamIds: agreed.participantTeamIds, movements: revision.movements, ...(revision.exceptionUses === undefined ? {} : { exceptionUses: revision.exceptionUses }), ...(revision.retainedSalary === undefined ? {} : { retainedSalary: revision.retainedSalary }) }
  try {
    const execution = executeTrade(world, proposal)
    if (!execution.validation.allowed || execution.world === world) return result('BLOCKED', world, ...execution.validation.globalReasons, ...execution.validation.teamResults.flatMap((item) => item.reasons))
    const decisionIds = Object.fromEntries(agreed.participantTeamIds.map((teamId) => [teamId, decisionFor(world, agreed.id, revision.id, teamId)?.id ?? '']))
    if (Object.values(decisionIds).some((id) => id === '')) return result('BLOCKED', world, 'PARTICIPANT_COMMITMENT_DECISION_MISSING')
    const tradeRecord = Object.values(execution.world.tradeHistoryById).find((item) => item.proposalId === proposal.id)
    if (tradeRecord === undefined) return result('BLOCKED', world, 'TRADE_ENGINE_DID_NOT_CREATE_RECORD')
    const linkedRecord = createTradeRecord({ ...tradeRecord, negotiationId: agreed.id, revisionId: revision.id, governanceDecisionIdsByTeamId: decisionIds })
    const completed = createTradeNegotiation({ ...agreed, status: 'EXECUTED', completedOn: world.currentDate, tradeRecordId: linkedRecord.id, governanceDecisionIdsByTeamId: decisionIds })
    const governanceEvents: GovernanceDecisionEvent[] = []
    for (const teamId of agreed.participantTeamIds) {
      const decision = world.governanceDecisionsById[decisionIds[teamId]!]!
      const executor = participantReadiness(world, agreed, revision.id, teamId).governanceExecutor
      if (executor === undefined) return result('NO_AUTHORITY', world, `GOVERNANCE_EXECUTOR_MISSING:${teamId}`)
      const authorityGrantIds = authorityIds(world, 'EXECUTED', executor, decision.institutionId, world.currentDate)
      if (authorityGrantIds.length === 0) return result('NO_AUTHORITY', world, `GOVERNANCE_EXECUTOR_EVIDENCE_MISSING:${teamId}`)
      governanceEvents.push(createGovernanceDecisionEvent({ id: eventId(decision.id, world.currentDate, 'EXECUTED', executor), decisionId: decision.id, kind: 'EXECUTED', bodyId: executor, effectiveOn: world.currentDate, authorityGrantIds }))
    }
    const final = updateGameWorld(execution.world, {
      tradeHistory: [...Object.values(execution.world.tradeHistoryById).filter((item) => item.id !== tradeRecord.id), linkedRecord],
      tradeNegotiations: [...Object.values(execution.world.tradeNegotiationsById).filter((item) => item.id !== agreed.id), completed],
      governanceDecisionEvents: [...Object.values(execution.world.governanceDecisionEventsById), ...governanceEvents],
    })
    const planned = reviewMaterialRosterChanges(world, final)
    return { status: 'EXECUTED', world: planned, reasons: [] }
  } catch (error) {
    return result('BLOCKED', world, `ATOMIC_TRADE_COMMIT_FAILED:${(error as Error).message}`)
  }
}

function participantReadiness(world: GameWorld, negotiation: TradeNegotiation, revisionId: string, teamId: TeamId): TradeParticipantReadiness {
  const blockers: string[] = []
  const operational = resolveOperationalExecutor(world, teamId)
  if ('reason' in operational) blockers.push(operational.reason)
  const decision = decisionFor(world, negotiation.id, revisionId, teamId)
  if (decision === undefined) blockers.push('COMMITMENT_DECISION_MISSING')
  let required: readonly string[] = [], approved: readonly string[] = [], executor: string | undefined
  if (decision !== undefined) {
    const events = eventsFor(world, decision.id)
    const rights = resolveGovernanceDecisionRights({ ...governanceGraph(world), decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: decision.proposedOn })
    required = rights.approverBodyIds
    approved = [...new Set(events.filter((event) => event.kind === 'APPROVED').map((event) => event.bodyId))].filter((bodyId) => required.includes(bodyId))
    if (events.some((event) => event.kind === 'VETOED')) blockers.push('GOVERNANCE_VETOED')
    if (events.some((event) => event.kind === 'REJECTED')) blockers.push('GOVERNANCE_REJECTED')
    if (!events.some((event) => event.kind === 'PROPOSED' && event.bodyId === decision.proposedByBodyId)) blockers.push('GOVERNANCE_PROPOSAL_MISSING')
    if (required.length === 0 || required.some((bodyId) => !approved.includes(bodyId))) blockers.push('GOVERNANCE_APPROVALS_INCOMPLETE')
    const current = resolveGovernanceDecisionRights({ ...governanceGraph(world), decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: world.currentDate })
    executor = current.executorBodyIds.find((bodyId) => Object.values(world.governanceAppointmentsById).some((appointment) => appointment.bodyId === bodyId && appointment.startedOn <= world.currentDate && (appointment.endedOn === undefined || appointment.endedOn >= world.currentDate)))
    if (executor === undefined) blockers.push('GOVERNANCE_EXECUTOR_MISSING')
  }
  const terminal = blockers.includes('GOVERNANCE_VETOED') ? 'VETOED' : blockers.includes('GOVERNANCE_REJECTED') ? 'REJECTED' : blockers.some((item) => item.includes('EXECUTION_OWNER')) ? 'NO_EXECUTION_OWNER' : blockers.includes('GOVERNANCE_APPROVALS_INCOMPLETE') ? 'REQUIRES_APPROVAL' : blockers.length === 0 ? 'READY_TO_EXECUTE' : 'BLOCKED'
  return { teamId, ...('owner' in operational ? { operationalExecutor: operational.owner } : {}), ...(decision === undefined ? {} : { governanceDecisionId: decision.id, proposer: decision.proposedByBodyId }), requiredApprovals: required, completedApprovals: approved, ...(executor === undefined ? {} : { governanceExecutor: executor }), status: terminal, blockers }
}

function checkAgreedRevision(world: GameWorld, negotiationId: string, revisionId: string): { negotiation: TradeNegotiation; revision: TradeNegotiation['revisions'][number] } | { failure: TradeCommitmentResult } {
  const negotiation = world.tradeNegotiationsById[negotiationId]
  if (negotiation === undefined) return { failure: result('CONFLICT', world, 'TRADE_NEGOTIATION_NOT_FOUND') }
  if (negotiation.status !== 'AGREED') return { failure: result('CONFLICT', world, 'TRADE_NEGOTIATION_NOT_AGREED') }
  if (negotiation.currentRevisionId !== revisionId) return { failure: result('STALE_PACKAGE', world, 'EXPECTED_REVISION_IS_NOT_CURRENT') }
  const revision = negotiation.revisions.find((item) => item.id === revisionId)
  if (revision === undefined) return { failure: result('STALE_PACKAGE', world, 'AGREED_REVISION_NOT_FOUND') }
  return { negotiation, revision }
}

function tradeBlockers(world: GameWorld, negotiation: TradeNegotiation, revision: TradeNegotiation['revisions'][number]): string[] {
  const proposal = { id: 'revalidation', ecosystemId: negotiation.ecosystemId, seasonId: negotiation.seasonId, participantTeamIds: negotiation.participantTeamIds, movements: revision.movements, ...(revision.exceptionUses === undefined ? {} : { exceptionUses: revision.exceptionUses }), ...(revision.retainedSalary === undefined ? {} : { retainedSalary: revision.retainedSalary }) }
  const reasons: string[] = [...validateTrade(world, proposal).globalReasons, ...validateTrade(world, proposal).teamResults.flatMap((item) => item.reasons)]
  // The agreed edition must still be the trade authority of every club in the package: a manager
  // move, promotion, or competition change invalidates stale authority even when the global season
  // pointer still names the old edition.
  const authority = resolveSharedTradeSeasonAuthority(world, negotiation.participantTeamIds)
  if (authority === undefined || authority.season.id !== negotiation.seasonId || world.teams[negotiation.participantTeamIds[0]!] === undefined || !negotiation.participantTeamIds.every((teamId) => world.teams[teamId] !== undefined && Object.values(world.competitions).some((competition) => competition.ecosystemId === negotiation.ecosystemId && competition.participantTeamIds.includes(teamId)))) reasons.push('PARTICIPANTS_OR_ECOSYSTEM_CHANGED')
  const windowBlocker = tradeWindowBlocker(getTradeWindowStatus(world, proposal))
  if (windowBlocker !== undefined) reasons.push(windowBlocker)
  for (const snapshot of revision.contractSnapshots) {
    const current = world.contractsById[snapshot.id]
    if (current === undefined || JSON.stringify(current) !== JSON.stringify(snapshot)) reasons.push('PLAYER_CONTRACT_CHANGED')
  }
  return [...new Set(reasons)]
}

function decisionFor(world: GameWorld, negotiationId: string, revisionId: string, teamId: TeamId): GovernanceDecision | undefined {
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => item.teamIds.includes(teamId))
  if (institutions.length !== 1) return undefined
  const id = decisionId(institutions[0]!.id, negotiationId, revisionId, teamId)
  const candidate = world.governanceDecisionsById[id]
  return candidate?.decisionType === 'PLAYER_TRADE_COMMITMENT' && candidate.subject.kind === 'GENERIC' && candidate.subject.referenceId === decisionRef(negotiationId, revisionId, teamId) ? candidate : undefined
}

function readinessResult(world: GameWorld, negotiation: TradeNegotiation, decision: GovernanceDecision): TradeCommitmentResult {
  const readiness = assessTradeCommitmentReadiness(world, negotiation.id, negotiation.currentRevisionId)
  const participant = readiness.participants.find((item) => item.governanceDecisionId === decision.id)
  return { status: participant?.status ?? readiness.status, world, decision, readiness, reasons: participant?.blockers ?? readiness.blockers }
}
function findNegotiationBySubject(world: GameWorld, subject: string): { negotiation: TradeNegotiation; revision: TradeNegotiation['revisions'][number] } | undefined { for (const negotiation of Object.values(world.tradeNegotiationsById)) for (const revision of negotiation.revisions) if (negotiation.participantTeamIds.some((teamId) => decisionRef(negotiation.id, revision.id, teamId) === subject)) return { negotiation, revision }; return undefined }
function resolveOperationalExecutor(world: GameWorld, teamId: TeamId): { owner: { readonly kind: 'USER' } | { readonly kind: 'STAFF'; readonly staffPersonId: string } } | { reason: string } {
  const team = world.teams[teamId]
  if (team === undefined) return { reason: 'TEAM_NOT_FOUND' }
  if (team.coachId === world.userCoachId) return { owner: { kind: 'USER' } }
  const responsibility = getResponsibility(world, teamId, 'executePlayerTrade')
  if (responsibility?.mode !== 'delegated' || responsibility.holderStaffId === undefined) return { reason: 'NO_EXECUTION_OWNER' }
  const staff = getStaffPerson(world, responsibility.holderStaffId), assignment = getStaffAssignment(world, responsibility.holderStaffId)
  if (staff === undefined || assignment?.teamId !== teamId || assignment.assignedOn > world.currentDate) return { reason: 'INVALID_EXECUTION_OWNER' }
  const validation = validateResponsibilityAssignment(responsibility.kind, responsibility.mode, assignment.role, staff)
  return validation.ok ? { owner: { kind: 'STAFF', staffPersonId: staff.id } } : { reason: 'INVALID_EXECUTION_OWNER' }
}
function resolveAppointedBody(world: GameWorld, actor: GovernanceActor, eligible: readonly string[], institutionId: string, requested?: string): string | undefined {
  const candidates = Object.values(world.governanceAppointmentsById).filter((appointment) => appointment.actor.kind === actor.kind && appointment.actor.id === actor.id && eligible.includes(appointment.bodyId) && world.governanceBodiesById[appointment.bodyId]?.institutionId === institutionId && appointment.startedOn <= world.currentDate && (appointment.endedOn === undefined || appointment.endedOn >= world.currentDate)).map((appointment) => appointment.bodyId)
  const unique = [...new Set(candidates)]
  return requested === undefined ? unique.length === 1 ? unique[0] : undefined : unique.includes(requested) ? requested : undefined
}
function isAppointee(world: GameWorld, actor: GovernanceActor, bodyId: string, institutionId: string, on: GameDate): boolean { return Object.values(world.governanceAppointmentsById).some((appointment) => appointment.actor.kind === actor.kind && appointment.actor.id === actor.id && appointment.bodyId === bodyId && world.governanceBodiesById[bodyId]?.institutionId === institutionId && appointment.startedOn <= on && (appointment.endedOn === undefined || appointment.endedOn >= on)) }
function governanceGraph(world: GameWorld) { return { bodies: Object.values(world.governanceBodiesById), authorityGrants: Object.values(world.governanceAuthorityGrantsById), participationGrants: Object.values(world.governanceDecisionParticipationGrantsById) } }
function authorityIds(world: GameWorld, kind: GovernanceDecisionEventKind, bodyId: string, institutionId: string, date: GameDate): readonly string[] { return resolveGovernanceDecisionEventAuthorityGrantIds({ event: { kind, bodyId, effectiveOn: date }, decisionType: 'PLAYER_TRADE_COMMITMENT', institutionId, ...governanceGraph(world) }) }
function eventsFor(world: GameWorld, id: string): GovernanceDecisionEvent[] { return Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === id) }
function eventId(id: string, date: GameDate, kind: string, bodyId: string): string { const order: Readonly<Record<string, string>> = { PROPOSED: '00', REVIEW_STARTED: '10', APPROVED: '20', REJECTED: '30', VETOED: '40', WITHDRAWN: '50', EXECUTED: '99' }; return `event:${id}:${date}:${order[kind] ?? '80'}:${kind}:${encodeURIComponent(bodyId)}` }
function result(status: TradeCommitmentStatus, world: GameWorld, ...reasons: string[]): TradeCommitmentResult { return { status, world, reasons } }
function teamIdLabel(teamId: TeamId): string { return teamId }
