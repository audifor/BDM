import {
  createGovernanceRequestEvent,
  deriveGovernanceRequestStatus,
  sortGovernanceRequestEvents,
  type GovernanceRequestEventKind,
} from '@/domain/governance'
import type { TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/**
 * BS18-P0: respond to a request explicitly addressed to the user's coach.
 *
 * The canonical request event lifecycle is the sole source of truth. A response
 * never fabricates meeting attendance, a Board vote, budget authority, a signed
 * commitment or fulfillment evidence. BODY/APPOINTMENT requests remain read-only
 * until their representation/authority rules are explicitly agreed.
 */
export type ClubGovernanceRequestResponse = 'ACKNOWLEDGED' | 'ACCEPTED' | 'DECLINED'
export type ClubGovernanceRequestResponseReason =
  | 'UNKNOWN_TEAM'
  | 'SIMULATION_BUSY'
  | 'NOT_USER_TEAM'
  | 'REQUEST_NOT_FOUND'
  | 'NOT_CLUB_REQUEST'
  | 'NOT_REQUEST_RECIPIENT'
  | 'REQUEST_ALREADY_RESOLVED'
  | 'INVALID_REQUEST_TRANSITION'
  | 'REQUEST_EVENT_IN_FUTURE'
  | 'RESPONSE_EVENT_ID_COLLISION'

export interface ClubGovernanceRequestResponseResult {
  readonly status: 'APPLIED' | 'BLOCKED'
  readonly world: GameWorld
  readonly requestId: string
  readonly requestStatus: GovernanceRequestEventKind | undefined
  readonly reasons: readonly ClubGovernanceRequestResponseReason[]
}

function blocked(
  world: GameWorld,
  requestId: string,
  reason: ClubGovernanceRequestResponseReason,
  status?: GovernanceRequestEventKind,
): ClubGovernanceRequestResponseResult {
  return { status: 'BLOCKED', world, requestId, requestStatus: status, reasons: [reason] }
}

export function respondToClubGovernanceRequest(
  world: GameWorld,
  input: { readonly teamId: TeamId; readonly requestId: string; readonly kind: ClubGovernanceRequestResponse },
): ClubGovernanceRequestResponseResult {
  if (world.teams[input.teamId] === undefined) return blocked(world, input.requestId, 'UNKNOWN_TEAM')
  if (world.teams[input.teamId]!.coachId !== world.userCoachId) return blocked(world, input.requestId, 'NOT_USER_TEAM')

  const request = world.governanceRequestsById[input.requestId]
  if (request === undefined) return blocked(world, input.requestId, 'REQUEST_NOT_FOUND')

  const institution = world.governanceInstitutionsById[request.institutionId]
  if (institution === undefined || !institution.teamIds.includes(input.teamId)) {
    return blocked(world, input.requestId, 'NOT_CLUB_REQUEST')
  }

  // Do not turn possession of a club into authority to act for an institution,
  // its board or a staff member. Only the named user coach can respond here.
  if (request.recipient.kind !== 'ACTOR' || request.recipient.actor.kind !== 'COACH' || request.recipient.actor.id !== world.userCoachId) {
    return blocked(world, input.requestId, 'NOT_REQUEST_RECIPIENT')
  }

  const events = sortGovernanceRequestEvents(
    Object.values(world.governanceRequestEventsById).filter((event) => event.requestId === request.id),
  )
  const requestStatus = deriveGovernanceRequestStatus(events)
  if (requestStatus === 'DECLINED' || requestStatus === 'WITHDRAWN' || requestStatus === 'FULFILLED' || requestStatus === 'ACCEPTED') {
    return blocked(world, input.requestId, 'REQUEST_ALREADY_RESOLVED', requestStatus)
  }
  if (requestStatus !== 'ISSUED' && requestStatus !== 'ACKNOWLEDGED') {
    return blocked(world, input.requestId, 'INVALID_REQUEST_TRANSITION', requestStatus)
  }
  if (requestStatus === 'ACKNOWLEDGED' && input.kind === 'ACKNOWLEDGED') {
    return blocked(world, input.requestId, 'INVALID_REQUEST_TRANSITION', requestStatus)
  }
  if (events.at(-1)!.effectiveOn > world.currentDate) {
    return blocked(world, input.requestId, 'REQUEST_EVENT_IN_FUTURE', requestStatus)
  }

  // The canonical lifecycle sorts by (effectiveOn, eventId). Appending to the
  // last same-day id makes multiple responses on the same date strictly ordered,
  // without a new sequence field or a separate Governance lifecycle.
  const lastSameDay = events.filter((event) => event.effectiveOn === world.currentDate).at(-1)
  const eventId = `${lastSameDay?.id ?? `${request.id}:reply:${world.currentDate}`}:bs18:${input.kind.toLowerCase()}`
  if (world.governanceRequestEventsById[eventId] !== undefined) {
    return blocked(world, input.requestId, 'RESPONSE_EVENT_ID_COLLISION', requestStatus)
  }
  const response = createGovernanceRequestEvent({
    id: eventId,
    requestId: request.id,
    kind: input.kind,
    effectiveOn: world.currentDate,
    actor: request.recipient,
  })
  const updated = updateGameWorld(world, {
    governanceRequestEvents: [...Object.values(world.governanceRequestEventsById), response],
  })
  return { status: 'APPLIED', world: updated, requestId: request.id, requestStatus: input.kind, reasons: [] }
}
