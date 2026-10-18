import type { CoachId, StaffPersonId, TeamId } from '@/domain/ids'
import { addYears } from '@/domain/date'
import { addInboxItem, applyMoraleEventToWorld, applyRelationshipEventsToWorld, archiveInboxItem, updateGameWorld, type GameWorld } from '@/domain/world'
import { recordMemory } from '@/engine/memory/MemoryEngine'

export type StaffMeetingChoice = 'seekInput' | 'setDirection'
export type StaffMeetingDecisionResult =
  | { readonly status: 'APPLIED'; readonly world: GameWorld; readonly choice: StaffMeetingChoice }
  | { readonly status: 'BLOCKED'; readonly world: GameWorld; readonly reason: 'NO_ACTIVE_MEETING' | 'NOT_USER_COACH' | 'STAFF_NOT_ASSIGNED' | 'INVALID_CHOICE' | 'SIMULATION_BUSY' }

export interface PendingStaffMeeting {
  readonly inboxId: string
  readonly assistantStaffId: StaffPersonId
  readonly assistantName: string
  readonly teamId: TeamId
  readonly openedOn: string
}

export function firstStaffMeetingInboxId(coachId: CoachId, staffId: StaffPersonId): string {
  return `inbox:bs19c:first-staff-meeting:${coachId}:${staffId}`
}
function meetingEventId(coachId: CoachId, staffId: StaffPersonId): string {
  return `bs19c:first-staff-meeting:${coachId}:${staffId}`
}

function eligibleAssistant(world: GameWorld, coachId: CoachId) {
  const team = Object.values(world.teams).find(item => item.coachId === coachId)
  if (team === undefined || world.coachEmploymentByCoachId[coachId]?.status !== 'employed') return undefined
  const assignment = Object.values(world.teamStaffAssignmentsById)
    .filter(item => item.teamId === team.id && item.role === 'assistantCoach')
    .sort((a, b) => a.staffPersonId.localeCompare(b.staffPersonId))[0]
  if (assignment === undefined) return undefined
  const staff = world.staffPeopleById[assignment.staffPersonId]
  const employment = world.staffEmploymentByStaffId[assignment.staffPersonId]
  if (staff === undefined || staff.personId === world.coaches[coachId]?.personId
    || employment?.status !== 'employed' || employment.teamId !== team.id) return undefined
  return { team, staff }
}

/** A sourced assistant who actually works under the newly hired coach may initiate a
 * first professional meeting. An unstaffed club gets no imaginary relationship. No
 * deadline or blocking breakpoint is invented; the player can ignore the opportunity.
 */
export function queueFirstStaffMeeting(world: GameWorld): GameWorld {
  const coachId = world.userCoachId
  if (world.coachRpgProfilesByCoachId[coachId]?.creatorOrigin === undefined) return world
  const eligible = eligibleAssistant(world, coachId)
  if (eligible === undefined) return world
  const { team, staff } = eligible
  const inboxId = firstStaffMeetingInboxId(coachId, staff.id)
  return addInboxItem(world, {
    id: inboxId, coachId, gameDate: world.currentDate,
    category: 'career', priority: 'normal', status: 'unread',
    title: 'Meet the existing assistant coach',
    body: `${staff.identity.firstName} ${staff.identity.lastName} is part of your coaching staff. Decide how to begin working together.`,
    context: { lifeScenario: 'firstStaffMeeting', assistantStaffId: staff.id, teamId: team.id, scenarioVersion: 1 },
  })
}

export function getPendingFirstStaffMeeting(world: GameWorld): PendingStaffMeeting | null {
  const coachId = world.userCoachId
  const eligible = eligibleAssistant(world, coachId)
  if (eligible === undefined) return null
  const { team, staff } = eligible
  const inbox = world.inboxItemsById[firstStaffMeetingInboxId(coachId, staff.id)]
  if (inbox === undefined || inbox.status === 'archived' || inbox.coachId !== coachId
    || inbox.context.lifeScenario !== 'firstStaffMeeting' || inbox.context.teamId !== team.id
    || inbox.context.assistantStaffId !== staff.id) return null
  return { inboxId: inbox.id, assistantStaffId: staff.id, assistantName: `${staff.identity.firstName} ${staff.identity.lastName}`,
    teamId: team.id, openedOn: inbox.gameDate }
}

/** A committed, player-authorized meeting changes two directional relationships, two
 * perspectives of morale and two memories. For full PERSON50 profiles the authentic
 * TEAM_MEETING observation updates the existing 75-event evolution journal. All IDs
 * are stable and events are once-only across Save V4 reload and repeated commands.
 */
export function decideFirstStaffMeeting(world: GameWorld, staffId: StaffPersonId, choice: StaffMeetingChoice, coachId: CoachId = world.userCoachId): StaffMeetingDecisionResult {
  if (coachId !== world.userCoachId) return { status: 'BLOCKED', world, reason: 'NOT_USER_COACH' }
  if (choice !== 'seekInput' && choice !== 'setDirection') return { status: 'BLOCKED', world, reason: 'INVALID_CHOICE' }
  const pending = getPendingFirstStaffMeeting(world)
  if (pending === null || pending.assistantStaffId !== staffId) return { status: 'BLOCKED', world, reason: 'NO_ACTIVE_MEETING' }
  const eligible = eligibleAssistant(world, coachId)
  if (eligible === undefined || eligible.staff.id !== staffId || eligible.team.id !== pending.teamId) {
    return { status: 'BLOCKED', world, reason: 'STAFF_NOT_ASSIGNED' }
  }
  const sourceId = meetingEventId(coachId, staffId)
  if (world.memoriesById[`memory:${sourceId}:coach`] !== undefined || world.memoriesById[`memory:${sourceId}:assistant`] !== undefined) {
    return { status: 'BLOCKED', world, reason: 'NO_ACTIVE_MEETING' }
  }

  const consult = choice === 'seekInput'
  let next = applyRelationshipEventsToWorld(world, [
    { sourceId: coachId, targetId: staffId, event: {
      id: `relationship:${sourceId}:coach`, gameDate: world.currentDate, source: 'professionalInteraction',
      delta: consult ? 7 : -2,
      dimensionDeltas: consult
        ? { trust: 7, communicationQuality: 8, collaboration: 6, professionalRespect: 4 }
        : { trust: -3, collaboration: -4, professionalAlignment: -4, professionalRespect: 2 },
      context: { sourceInboxId: pending.inboxId, scenario: 'firstStaffMeeting', choice, teamId: pending.teamId },
    } },
    { sourceId: staffId, targetId: coachId, event: {
      id: `relationship:${sourceId}:assistant`, gameDate: world.currentDate, source: 'professionalInteraction',
      delta: consult ? 10 : -8,
      dimensionDeltas: consult
        ? { trust: 9, communicationQuality: 8, perceivedSupport: 8, professionalRespect: 4 }
        : { trust: -8, communicationQuality: -5, perceivedSupport: -7, professionalAlignment: -3 },
      context: { sourceInboxId: pending.inboxId, scenario: 'firstStaffMeeting', choice, teamId: pending.teamId },
    } },
  ])
  next = recordMemory(next, {
    id: `memory:${sourceId}:coach`, owner: { kind: 'coach', id: coachId }, type: consult ? 'trust' : 'opportunity',
    occurredOn: world.currentDate, entityRefs: [{ kind: 'staff', id: staffId }, { kind: 'team', id: pending.teamId }],
    sourceId: pending.inboxId, semanticKey: `life:first-staff-meeting:${staffId}`,
    importance: 'notable', valence: consult ? 25 : 5, intensity: 60, decayPerMonth: 0, permanent: true,
    tags: ['life', 'staff', 'professionalRelationship', 'meeting'],
    context: { choice, teamId: pending.teamId, staffId },
  })
  next = recordMemory(next, {
    id: `memory:${sourceId}:assistant`, owner: { kind: 'staff', id: staffId }, type: consult ? 'support' : 'conflict',
    occurredOn: world.currentDate, entityRefs: [{ kind: 'coach', id: coachId }, { kind: 'team', id: pending.teamId }],
    sourceId: pending.inboxId, semanticKey: `life:first-staff-meeting:${coachId}`,
    importance: 'notable', valence: consult ? 35 : -25, intensity: 60, decayPerMonth: 0, permanent: true,
    tags: ['life', 'staff', 'professionalRelationship', 'meeting'],
    context: { choice, teamId: pending.teamId, coachId },
  })

  // TEAM_MEETING is one of the official PERSON23I 75 witnessed experience types.
  // It is emitted only when the player actually resolves the meeting, never at queue time.
  next = applyMoraleEventToWorld(next, {
    id: `morale:${sourceId}:coach`, personId: coachId, gameDate: world.currentDate,
    source: 'professionalInteraction', delta: consult ? 6 : 2,
    context: { personalityEventKind: 'TEAM_MEETING', sourceInboxId: pending.inboxId, choice, staffId },
  })
  // Source-backed historical STAFF may lack a DOB. PERSON23I requires adult-age
  // evidence before evolving 50 dimensions; an observed meeting must not crash
  // or invent the missing birth date. Morale still records the genuine meeting.
  const staff = eligible.staff
  const birthDate = (staff.personId === undefined ? undefined : next.personsById[staff.personId]?.dateOfBirth)
    ?? staff.identity.dateOfBirth
  const ageValidated = birthDate !== undefined && addYears(birthDate, 15) <= world.currentDate
  next = applyMoraleEventToWorld(next, {
    id: `morale:${sourceId}:assistant`, personId: staffId, gameDate: world.currentDate,
    source: 'professionalInteraction', delta: consult ? 8 : -6,
    context: { ...(ageValidated ? { personalityEventKind: 'TEAM_MEETING' } : {}),
      sourceInboxId: pending.inboxId, choice, coachId },
  })
  const coach = next.coaches[coachId]!
  if (next.personalitiesByPersonId[coachId] !== undefined) {
    next = updateGameWorld(next, { personalitiesByPersonId: {
      ...next.personalitiesByPersonId, [coach.staffProfileId]: next.personalitiesByPersonId[coachId]!,
    } })
  }
  next = archiveInboxItem(next, pending.inboxId)
  return { status: 'APPLIED', world: next, choice }
}
