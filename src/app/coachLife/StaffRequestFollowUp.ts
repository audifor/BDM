import { addYears } from '@/domain/date'
import type { CoachId, StaffPersonId, TeamId } from '@/domain/ids'
import { addInboxItem, applyMoraleEventToWorld, applyRelationshipEventsToWorld, archiveInboxItem, updateGameWorld, type GameWorld } from '@/domain/world'
import { recordMemory } from '@/engine/memory/MemoryEngine'

export type StaffRequestFollowUpChoice = 'acknowledgeImpact' | 'maintainDecision'
export type StaffRequestFollowUpResult =
  | { readonly status: 'APPLIED'; readonly world: GameWorld; readonly choice: StaffRequestFollowUpChoice }
  | { readonly status: 'BLOCKED'; readonly world: GameWorld; readonly reason: 'NOT_USER_COACH' | 'NO_PENDING_FOLLOW_UP' | 'STAFF_NO_LONGER_PRESENT' | 'INVALID_CHOICE' | 'SIMULATION_BUSY' }

export interface PendingStaffRequestFollowUp {
  readonly inboxId: string
  readonly staffId: StaffPersonId
  readonly requestId: string
  readonly teamId: TeamId
  readonly openedOn: string
  readonly requestKind: string
}

export function staffRequestFollowUpInboxId(coachId: CoachId, requestId: string): string {
  return `inbox:bs19c:staff-request-follow-up:${coachId}:${requestId}`
}
function sourceKey(coachId: CoachId, requestId: string): string {
  return `bs19c:staff-request-follow-up:${coachId}:${requestId}`
}

/** Follows a *real, already declined* career request from an employed assistant.
 * It does not create a request, promise, promotion or forced conflict.
 * The request remains DECLINED even if a later conversation repairs trust.
 */
export function queueStaffRequestFollowUp(world: GameWorld, requestId: string): GameWorld {
  const request = world.staffCareerRequestsById[requestId]
  const coachId = world.userCoachId
  if (request?.status !== 'DECLINED' || request.resolvedOn === undefined ||
    world.coachRpgProfilesByCoachId[coachId]?.creatorOrigin === undefined) return world
  if (request.kind !== 'MORE_RESPONSIBILITY' && request.kind !== 'PROMOTION') return world
  const eligible = eligibleRequestAssistant(world, coachId, request.staffId, request.teamId)
  if (!eligible) return world
  return addInboxItem(world, {
    id: staffRequestFollowUpInboxId(coachId, request.id), coachId,
    gameDate: world.currentDate, category: 'career', priority: 'normal', status: 'unread',
    title: 'Follow up on a declined staff request',
    body: `${eligible.staff.identity.firstName} ${eligible.staff.identity.lastName} requested professional progression. You declined the request. You can discuss its impact without changing the earlier decision.`,
    context: { lifeScenario: 'staffRequestFollowUp', requestId: request.id, staffId: request.staffId,
      teamId: request.teamId, requestKind: request.kind, scenarioVersion: 1 },
  })
}

function eligibleRequestAssistant(world: GameWorld, coachId: CoachId, staffId: StaffPersonId, teamId: TeamId) {
  if (world.teams[teamId]?.coachId !== coachId) return null
  const assignment = Object.values(world.teamStaffAssignmentsById).find(item =>
    item.teamId === teamId && item.staffPersonId === staffId && item.role === 'assistantCoach')
  const staff = world.staffPeopleById[staffId]
  const employment = world.staffEmploymentByStaffId[staffId]
  if (!assignment || !staff || employment?.status !== 'employed' || employment.teamId !== teamId ||
    staff.personId === world.coaches[coachId]?.personId) return null
  return { staff }
}

export function getPendingStaffRequestFollowUp(world: GameWorld, requestId: string): PendingStaffRequestFollowUp | null {
  const coachId = world.userCoachId
  const request = world.staffCareerRequestsById[requestId]
  const inbox = world.inboxItemsById[staffRequestFollowUpInboxId(coachId, requestId)]
  if (request?.status !== 'DECLINED' || request.resolvedOn === undefined || inbox?.status === 'archived' ||
    inbox === undefined || inbox.coachId !== coachId || inbox.context.lifeScenario !== 'staffRequestFollowUp' ||
    inbox.context.requestId !== requestId || inbox.context.staffId !== request.staffId ||
    inbox.context.teamId !== request.teamId || eligibleRequestAssistant(world, coachId, request.staffId, request.teamId) === null) return null
  return { inboxId: inbox.id, staffId: request.staffId, requestId, teamId: request.teamId,
    requestKind: request.kind, openedOn: inbox.gameDate }
}

/** Resolves one contextual conversation. Trust recovery is incremental; neither
 * staff's professional request nor existing StaffConflict is silently overridden.
 * Both participants remember their own perspective, with durable source evidence.
 */
export function decideStaffRequestFollowUp(world: GameWorld, requestId: string,
  choice: StaffRequestFollowUpChoice, coachId: CoachId = world.userCoachId): StaffRequestFollowUpResult {
  if (coachId !== world.userCoachId) return { status: 'BLOCKED', world, reason: 'NOT_USER_COACH' }
  if (choice !== 'acknowledgeImpact' && choice !== 'maintainDecision') return { status: 'BLOCKED', world, reason: 'INVALID_CHOICE' }
  const pending = getPendingStaffRequestFollowUp(world, requestId)
  if (!pending) return { status: 'BLOCKED', world, reason: 'NO_PENDING_FOLLOW_UP' }
  const eligible = eligibleRequestAssistant(world, coachId, pending.staffId, pending.teamId)
  if (!eligible) return { status: 'BLOCKED', world, reason: 'STAFF_NO_LONGER_PRESENT' }
  const source = sourceKey(coachId, requestId)
  if (world.memoriesById[`memory:${source}:coach`] || world.memoriesById[`memory:${source}:assistant`]) {
    return { status: 'BLOCKED', world, reason: 'NO_PENDING_FOLLOW_UP' }
  }
  const repair = choice === 'acknowledgeImpact'
  let next = applyRelationshipEventsToWorld(world, [
    { sourceId: pending.staffId, targetId: coachId, event: {
      id: `relationship:${source}:assistant`, source: 'professionalInteraction', gameDate: world.currentDate,
      delta: repair ? 5 : -4,
      dimensionDeltas: repair
        ? { trust: 4, communicationQuality: 5, perceivedSupport: 5, professionalRespect: 2 }
        : { trust: -4, communicationQuality: -5, perceivedSupport: -4 },
      context: { scenario: 'staffRequestFollowUp', requestId, choice, sourceInboxId: pending.inboxId },
    } },
    { sourceId: coachId, targetId: pending.staffId, event: {
      id: `relationship:${source}:coach`, source: 'professionalInteraction', gameDate: world.currentDate,
      delta: repair ? 3 : -1,
      dimensionDeltas: repair
        ? { communicationQuality: 4, collaboration: 3, professionalRespect: 2 }
        : { communicationQuality: -2, collaboration: -2 },
      context: { scenario: 'staffRequestFollowUp', requestId, choice, sourceInboxId: pending.inboxId },
    } },
  ])
  next = recordMemory(next, {
    id: `memory:${source}:coach`, owner: { kind: 'coach', id: coachId },
    type: repair ? 'support' : 'conflict', occurredOn: world.currentDate,
    entityRefs: [{ kind: 'staff', id: pending.staffId }, { kind: 'team', id: pending.teamId }],
    sourceId: requestId, semanticKey: `staffRequestFollowUp:coach:${requestId}`,
    importance: 'notable', valence: repair ? 25 : -10, intensity: 58, decayPerMonth: 1, permanent: false,
    tags: ['staff', 'life', 'careerRequest', 'conversation'],
    context: { choice, requestId, teamId: pending.teamId },
  })
  next = recordMemory(next, {
    id: `memory:${source}:assistant`, owner: { kind: 'staff', id: pending.staffId },
    type: repair ? 'support' : 'conflict', occurredOn: world.currentDate,
    entityRefs: [{ kind: 'coach', id: coachId }, { kind: 'team', id: pending.teamId }],
    sourceId: requestId, semanticKey: `staffRequestFollowUp:staff:${requestId}`,
    importance: 'important', valence: repair ? 22 : -30, intensity: 68, decayPerMonth: 1, permanent: false,
    tags: ['staff', 'life', 'careerRequest', 'conversation'],
    context: { choice, requestId, teamId: pending.teamId },
  })
  next = applyMoraleEventToWorld(next, {
    id: `morale:${source}:coach`, personId: coachId, gameDate: world.currentDate,
    source: 'professionalInteraction', delta: repair ? 3 : -1,
    context: { personalityEventKind: 'TEAM_MEETING', requestId, choice },
  })
  const staff = eligible.staff
  const birthDate = (staff.personId === undefined ? undefined : next.personsById[staff.personId]?.dateOfBirth)
    ?? staff.identity.dateOfBirth
  // Preserve the real meeting as morale even for historical staff without verifiable DOB.
  next = applyMoraleEventToWorld(next, {
    id: `morale:${source}:assistant`, personId: pending.staffId, gameDate: world.currentDate,
    source: 'professionalInteraction', delta: repair ? 4 : -4,
    context: { ...(birthDate !== undefined && addYears(birthDate, 15) <= world.currentDate ? { personalityEventKind: 'TEAM_MEETING' } : {}),
      requestId, choice },
  })
  const coach = next.coaches[coachId]!
  if (next.personalitiesByPersonId[coachId]) {
    next = updateGameWorld(next, { personalitiesByPersonId: {
      ...next.personalitiesByPersonId, [coach.staffProfileId]: next.personalitiesByPersonId[coachId]!,
    } })
  }
  next = archiveInboxItem(next, pending.inboxId)
  return { status: 'APPLIED', world: next, choice }
}

/** Read-only query for a future BDM display, with no separate RPG state authority. */
export function getPendingStaffRequestFollowUps(world: GameWorld): readonly PendingStaffRequestFollowUp[] {
  return Object.keys(world.staffCareerRequestsById).sort()
    .map(id => getPendingStaffRequestFollowUp(world, id))
    .filter((item): item is PendingStaffRequestFollowUp => item !== null)
}
