import type { GameDate } from '@/domain/date'
import { deriveGovernanceDecisionStatus, deriveGovernanceRequestStatus, isGovernanceRequestOverdue, resolveGovernanceDecisionRights, sortGovernanceRequestEvents, type GovernanceDecision, type GovernanceDecisionEvent, type GovernanceDecisionEventKind, type GovernanceDecisionStatus, type GovernanceDecisionType, type GovernanceRequest, type GovernanceRequestEvent, type GovernanceRequestEventKind } from '@/domain/governance'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

import { governanceDecisionTypeHasEventCommand } from './BoardGovernanceCommands'

/**
 * MX0.7 — the club-scoped application read boundary over canonical Board + Governance truth.
 *
 * Everything here is a pure projection of the canonical governance collections (institutions,
 * bodies, appointments, authority grants, participation grants, decisions, decision events,
 * requests, request events). Nothing is persisted, no right or status is re-derived with a rule of
 * its own — `resolveGovernanceDecisionRights` and `deriveGovernanceDecisionStatus` are the canonical
 * authorities — and a missing canonical fact is reported as missing instead of being invented.
 */

export interface GovernanceBodyRow {
  readonly bodyId: string
  readonly kind: string
  readonly name: string
  readonly userAppointed: boolean
  readonly roles: readonly string[]
}

export interface GovernanceDecisionEventRow {
  readonly eventId: string
  readonly kind: GovernanceDecisionEventKind
  readonly bodyId: string
  readonly bodyName: string
  readonly effectiveOn: GameDate
  readonly authorityGrantIds: readonly string[]
}

export interface GovernanceDecisionRow {
  readonly decisionId: string
  readonly decisionType: GovernanceDecisionType
  readonly institutionId: string
  readonly status: GovernanceDecisionStatus | undefined
  readonly proposedOn: GameDate
  readonly subjectKind: GovernanceDecision['subject']['kind']
  readonly subjectReferenceId: string | null
  /** Manager-facing subject resolved from canonically referenced entities, or the raw canonical reference when nothing resolvable exists. */
  readonly subjectLabel: string
  readonly proposerBodyIds: readonly string[]
  readonly approverBodyIds: readonly string[]
  readonly vetoBodyIds: readonly string[]
  readonly executorBodyIds: readonly string[]
  readonly approvedBodyIds: readonly string[]
  readonly missingApproverBodyIds: readonly string[]
  /** Approver bodies the user coach is actively appointed to and that have not approved yet. */
  readonly userApproverBodyIds: readonly string[]
  /** Executor bodies the user coach is actively appointed to, when the type has a canonical execution command. */
  readonly userExecutorBodyIds: readonly string[]
  readonly userOwned: boolean
  /** A canonical application command records this decision type's events (`governanceDecisionTypeHasEventCommand`). */
  readonly eventCommandAvailable: boolean
  readonly executableType: boolean
  readonly events: readonly GovernanceDecisionEventRow[]
}

export interface GovernanceRequestEventRow {
  readonly eventId: string
  readonly kind: GovernanceRequestEventKind
  readonly effectiveOn: GameDate
  readonly actorLabel: string
}

export interface GovernanceRequestRow {
  readonly requestId: string
  readonly institutionId: string
  readonly category: string
  readonly summary: string
  readonly status: GovernanceRequestEventKind | undefined
  readonly issuedOn: GameDate | null
  readonly dueOn: GameDate | null
  readonly overdue: boolean
  readonly origin: GovernanceRequest['origin']['kind']
  readonly issuerLabel: string
  readonly recipientLabel: string
  readonly addressedToUser: boolean
  /** Canonical response command existence: today the domain records request events but exposes no app command, so this is always false (BS gap). */
  readonly responseCommandAvailable: boolean
  readonly events: readonly GovernanceRequestEventRow[]
}

export interface GovernanceHistoryRow {
  readonly historyId: string
  readonly source: 'DECISION' | 'REQUEST'
  readonly kind: string
  readonly effectiveOn: GameDate
  readonly subjectLabel: string
  readonly actorLabel: string
}

export interface ClubGovernanceModel {
  readonly teamId: TeamId
  readonly institutionIds: readonly string[]
  readonly bodies: readonly GovernanceBodyRow[]
  readonly decisions: readonly GovernanceDecisionRow[]
  readonly pendingDecisions: readonly GovernanceDecisionRow[]
  readonly requests: readonly GovernanceRequestRow[]
  readonly attentionRequests: readonly GovernanceRequestRow[]
  readonly history: readonly GovernanceHistoryRow[]
}

/** The one decision type with a canonical execution command today (`executeGovernanceCoachFiringDecision`). */
export const GOVERNANCE_EXECUTABLE_DECISION_TYPES: readonly GovernanceDecisionType[] = ['COACH_FIRING']

export function governanceDecisionTypeIsExecutable(decisionType: GovernanceDecisionType): boolean {
  return GOVERNANCE_EXECUTABLE_DECISION_TYPES.includes(decisionType)
}

function coachLabel(world: GameWorld, coachId: string): string {
  const coach = Object.values(world.coaches).find((candidate) => candidate.id === coachId)
  return coach === undefined ? coachId : `${coach.firstName} ${coach.lastName}`.trim()
}

function staffLabel(world: GameWorld, staffPersonId: string): string {
  const staff = world.staffPeopleById[staffPersonId as keyof typeof world.staffPeopleById]
  return staff === undefined ? staffPersonId : `${staff.identity.firstName} ${staff.identity.lastName}`.trim()
}

export function governanceBodyLabel(world: GameWorld, bodyId: string): string {
  return world.governanceBodiesById[bodyId as keyof typeof world.governanceBodiesById]?.name ?? bodyId
}

/** Party labels use canonical person/body names; an unknown id stays verbatim rather than being described. */
export function governancePartyLabel(world: GameWorld, party: import('@/domain/governance').GovernanceInteractionParty): string {
  if (party.kind === 'BODY') return governanceBodyLabel(world, party.bodyId)
  if (party.kind === 'APPOINTMENT') return `${party.appointmentId} (appointment)`
  return party.actor.kind === 'COACH' ? coachLabel(world, party.actor.id) : staffLabel(world, party.actor.id)
}

/**
 * Resolves a decision subject to a real entity label using only canonical state. Generic subjects
 * carry canonical reference ids published by the owning services (a contract negotiation id, a
 * `retention:` negotiation id or a `trade-commitment:` reference), which are resolved back to the
 * negotiation they name; anything unresolvable is shown raw instead of being guessed.
 */
export function governanceSubjectLabel(world: GameWorld, decision: GovernanceDecision): string {
  const subject = decision.subject
  switch (subject.kind) {
    case 'COACH':
      return `Head coach · ${coachLabel(world, subject.coachId)}`
    case 'EXECUTIVE':
      return `Executive · ${staffLabel(world, subject.staffId)}`
    case 'BUDGET':
      return subject.scope === 'TEAM' ? `Team budget · ${world.teams[subject.referenceId as TeamId]?.name ?? subject.referenceId}` : `Institution budget · ${subject.referenceId}`
    case 'FACILITY':
      return `Facility · ${world.facilitiesById[subject.facilityId as keyof typeof world.facilitiesById]?.canonicalName ?? subject.facilityId}`
    case 'ORGANIZATIONAL':
      return subject.bodyId === undefined ? `Organization · ${subject.institutionId}` : `Organization · ${governanceBodyLabel(world, subject.bodyId)}`
    case 'GENERIC':
      return genericSubjectLabel(world, decision.decisionType, subject.referenceId)
  }
}

function genericSubjectLabel(world: GameWorld, decisionType: GovernanceDecisionType, referenceId: string): string {
  if (referenceId.startsWith('retention:')) {
    const negotiation = world.retentionNegotiationsById[referenceId.slice('retention:'.length) as keyof typeof world.retentionNegotiationsById]
    if (negotiation !== undefined) return `Retention agreement · ${playerName(world, negotiation.playerId)}`
    return `Retention agreement · ${referenceId}`
  }
  if (referenceId.startsWith('trade-commitment:')) {
    const negotiationId = decodeURIComponent(referenceId.split(':')[1] ?? '')
    const negotiation = world.tradeNegotiationsById[negotiationId as keyof typeof world.tradeNegotiationsById]
    if (negotiation !== undefined) return `Trade commitment · ${negotiation.participantTeamIds.map((teamId) => world.teams[teamId]?.name ?? teamId).join(' ⇄ ')}`
    return `Trade commitment · ${referenceId}`
  }
  const negotiation = world.negotiationsById[referenceId as keyof typeof world.negotiationsById]
  if (negotiation !== undefined) return `${decisionType === 'PLAYER_CONTRACT_SIGNING' ? 'Player signing' : 'Negotiation'} · ${playerName(world, negotiation.playerId)} (${negotiation.salary} × ${negotiation.years}y)`
  return referenceId
}

function playerName(world: GameWorld, playerId: string): string {
  const player = world.players[playerId as keyof typeof world.players]
  return player === undefined ? playerId : `${player.firstName} ${player.lastName}`.trim()
}

function activeUserBodyIds(world: GameWorld, asOf: GameDate): readonly string[] {
  return Object.values(world.governanceAppointmentsById)
    .filter((appointment) => appointment.actor.kind === 'COACH' && appointment.actor.id === world.userCoachId && appointment.startedOn <= asOf && (appointment.endedOn === undefined || appointment.endedOn >= asOf))
    .map((appointment) => appointment.bodyId)
}

function decisionEventRows(world: GameWorld, events: readonly GovernanceDecisionEvent[]): readonly GovernanceDecisionEventRow[] {
  return [...events]
    .sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn) || a.id.localeCompare(b.id))
    .map((event) => Object.freeze({ eventId: event.id, kind: event.kind, bodyId: event.bodyId, bodyName: governanceBodyLabel(world, event.bodyId), effectiveOn: event.effectiveOn, authorityGrantIds: event.authorityGrantIds }))
}

export function buildClubGovernanceModel(world: GameWorld, teamId: TeamId): ClubGovernanceModel {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Unknown team: ${teamId}`)
  const asOf = world.currentDate
  const userBodyIds = new Set(activeUserBodyIds(world, asOf))
  const institutions = Object.values(world.governanceInstitutionsById).filter((institution) => institution.teamIds.includes(teamId))
  const institutionIds = new Set(institutions.map((institution) => institution.id))
  const bodies = Object.values(world.governanceBodiesById).filter((body) => institutionIds.has(body.institutionId))
  const appointments = Object.values(world.governanceAppointmentsById)

  const bodyRows: GovernanceBodyRow[] = bodies.map((body) =>
    Object.freeze({
      bodyId: body.id,
      kind: body.kind,
      name: body.name,
      userAppointed: userBodyIds.has(body.id),
      roles: Object.freeze(
        appointments
          .filter((appointment) => appointment.bodyId === body.id && appointment.actor.kind === 'COACH' && appointment.actor.id === world.userCoachId)
          .map((appointment) => appointment.role),
      ),
    }),
  )

  const decisionRows: GovernanceDecisionRow[] = Object.values(world.governanceDecisionsById)
    .filter((decision) => institutionIds.has(decision.institutionId))
    .map((decision) => {
      const events = Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decision.id)
      const rights = resolveGovernanceDecisionRights({
        decisionType: decision.decisionType,
        institutionId: decision.institutionId,
        asOfDate: decision.proposedOn,
        bodies,
        authorityGrants: Object.values(world.governanceAuthorityGrantsById),
        participationGrants: Object.values(world.governanceDecisionParticipationGrantsById),
      })
      const approvedBodyIds = events.filter((event) => event.kind === 'APPROVED').map((event) => event.bodyId)
      const missingApproverBodyIds = rights.approverBodyIds.filter((bodyId) => !approvedBodyIds.includes(bodyId))
      return Object.freeze({
        decisionId: decision.id,
        decisionType: decision.decisionType,
        institutionId: decision.institutionId,
        status: deriveGovernanceDecisionStatus(events, rights.approverBodyIds),
        proposedOn: decision.proposedOn,
        subjectKind: decision.subject.kind,
        subjectReferenceId: decision.subject.kind === 'GENERIC' ? decision.subject.referenceId : null,
        subjectLabel: governanceSubjectLabel(world, decision),
        proposerBodyIds: rights.proposerBodyIds,
        approverBodyIds: rights.approverBodyIds,
        vetoBodyIds: rights.vetoBodyIds,
        executorBodyIds: rights.executorBodyIds,
        approvedBodyIds: Object.freeze(approvedBodyIds),
        missingApproverBodyIds: Object.freeze(missingApproverBodyIds),
        userApproverBodyIds: Object.freeze(missingApproverBodyIds.filter((bodyId) => userBodyIds.has(bodyId))),
        userExecutorBodyIds: Object.freeze(governanceDecisionTypeIsExecutable(decision.decisionType) ? rights.executorBodyIds.filter((bodyId) => userBodyIds.has(bodyId)) : []),
        userOwned: rights.proposerBodyIds.some((bodyId) => userBodyIds.has(bodyId)) || rights.approverBodyIds.some((bodyId) => userBodyIds.has(bodyId)) || rights.vetoBodyIds.some((bodyId) => userBodyIds.has(bodyId)) || rights.executorBodyIds.some((bodyId) => userBodyIds.has(bodyId)),
        eventCommandAvailable: governanceDecisionTypeHasEventCommand(decision.decisionType),
        executableType: governanceDecisionTypeIsExecutable(decision.decisionType),
        events: decisionEventRows(world, events),
      })
    })
    .sort((a, b) => b.proposedOn.localeCompare(a.proposedOn) || a.decisionId.localeCompare(b.decisionId))

  const requestRows: GovernanceRequestRow[] = Object.values(world.governanceRequestsById)
    .filter((request) => institutionIds.has(request.institutionId))
    .map((request) => {
      const events = Object.values(world.governanceRequestEventsById).filter((event) => event.requestId === request.id)
      const issued = sortGovernanceRequestEvents(events)[0]
      const recipientIsUser = request.recipient.kind === 'ACTOR' && request.recipient.actor.kind === 'COACH' && request.recipient.actor.id === world.userCoachId
      return Object.freeze({
        requestId: request.id,
        institutionId: request.institutionId,
        category: request.category,
        summary: request.summary,
        status: deriveGovernanceRequestStatus(events),
        issuedOn: issued?.effectiveOn ?? null,
        dueOn: request.dueOn ?? null,
        overdue: isGovernanceRequestOverdue(request, events, asOf),
        origin: request.origin.kind,
        issuerLabel: governancePartyLabel(world, request.issuer),
        recipientLabel: governancePartyLabel(world, request.recipient),
        addressedToUser: recipientIsUser,
        // The domain records request events, but no application command records one today.
        responseCommandAvailable: false,
        events: Object.freeze(
          [...sortGovernanceRequestEvents(events)].map((event) => Object.freeze({ eventId: event.id, kind: event.kind, effectiveOn: event.effectiveOn, actorLabel: governancePartyLabel(world, event.actor) })),
        ),
      })
    })
    .sort((a, b) => a.requestId.localeCompare(b.requestId))

  const history: GovernanceHistoryRow[] = [
    ...decisionRows.flatMap((decision) =>
      decision.events.map((event) =>
        Object.freeze({ historyId: `decision:${event.eventId}`, source: 'DECISION' as const, kind: event.kind, effectiveOn: event.effectiveOn, subjectLabel: decision.subjectLabel, actorLabel: event.bodyName }),
      ),
    ),
    ...requestRows.flatMap((request) =>
      request.events.map((event) =>
        Object.freeze({ historyId: `request:${event.eventId}`, source: 'REQUEST' as const, kind: event.kind, effectiveOn: event.effectiveOn, subjectLabel: request.summary, actorLabel: event.actorLabel }),
      ),
    ),
  ].sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn) || a.historyId.localeCompare(b.historyId))

  const terminal: readonly GovernanceDecisionStatus[] = ['REJECTED', 'VETOED', 'WITHDRAWN', 'EXECUTED']
  const requestTerminal: readonly GovernanceRequestEventKind[] = ['DECLINED', 'WITHDRAWN', 'FULFILLED']

  return Object.freeze({
    teamId,
    institutionIds: Object.freeze([...institutionIds].sort()),
    bodies: Object.freeze(bodyRows.sort((a, b) => a.bodyId.localeCompare(b.bodyId))),
    decisions: Object.freeze(decisionRows),
    pendingDecisions: Object.freeze(decisionRows.filter((decision) => decision.status === undefined || !terminal.includes(decision.status))),
    requests: Object.freeze(requestRows),
    attentionRequests: Object.freeze(requestRows.filter((request) => request.addressedToUser && (request.status === undefined || !requestTerminal.includes(request.status)))),
    history: Object.freeze(history),
  })
}

export function governanceDecisionById(model: ClubGovernanceModel, decisionId: string | undefined): GovernanceDecisionRow | undefined {
  return decisionId === undefined ? undefined : model.decisions.find((decision) => decision.decisionId === decisionId)
}

export function governanceRequestById(model: ClubGovernanceModel, requestId: string | undefined): GovernanceRequestRow | undefined {
  return requestId === undefined ? undefined : model.requests.find((request) => request.requestId === requestId)
}
