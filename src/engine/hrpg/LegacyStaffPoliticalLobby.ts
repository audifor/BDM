import { addYears } from '@/domain/date'
import type { CoachId, StaffPersonId } from '@/domain/ids'
import { addInboxItem, applyMoraleEventToWorld, applyRelationshipEventsToWorld, archiveInboxItem, updateGameWorld, type GameWorld } from '@/domain/world'
import { recordMemory } from '@/engine/memory/MemoryEngine'
import type { StaffPoliticalAction } from '@/domain/staffPolitics'

export type StaffLobbyChoice = 'hearArgument' | 'standFirm'
export type StaffLobbyDecision =
  | { readonly status: 'APPLIED'; readonly world: GameWorld; readonly choice: StaffLobbyChoice }
  | { readonly status: 'BLOCKED'; readonly world: GameWorld; readonly reason: 'NOT_USER_COACH' | 'NOT_PENDING' | 'NO_REAL_LOBBY' | 'STAFF_LEFT' | 'INVALID_CHOICE' | 'SIMULATION_BUSY' }

export interface PendingStaffLobby {
  readonly actionId: string
  readonly inboxId: string
  readonly actorId: StaffPersonId
  readonly subjectId: StaffPersonId
  readonly stance: 'SUPPORT' | 'OPPOSE'
  readonly openedOn: string
  readonly requestId: string
}

export function politicalLobbyInboxId(actionId: string): string { return `inbox:bs19c:staff-lobby:${actionId}` }
const origin = (actionId: string) => `bs19c:staff-lobby:${actionId}`

/** Only an existing, committed StaffPoliticalAction can put an autonomous political
 * approach in front of the user. No invented rumors, factions, lobbying or promises.
 * The original StaffCareerRequest retains its professional authority.
 */
export function queueVerifiedStaffLobbies(world: GameWorld, actions: readonly StaffPoliticalAction[]): GameWorld {
  if (world.coachRpgProfilesByCoachId[world.userCoachId]?.creatorOrigin === undefined) return world
  let next = world
  for (const action of actions) {
    const committed = world.staffPoliticalActionsById[action.id]
    // A caller's candidate list is only a hint: all claims must agree with the
    // already-validated immutable StaffPoliticalAction stored in GameWorld.
    if (!committed || committed.caseId !== action.caseId || committed.kind !== action.kind ||
      committed.stance !== action.stance || committed.teamId !== action.teamId ||
      committed.target?.kind !== action.target?.kind || committed.target?.id !== action.target?.id ||
      committed.actorIds.join('|') !== action.actorIds.join('|') || !validLobbySource(world, committed)) continue
    const politicalCase = world.staffPoliticalCasesById[committed.caseId]!
    const actor = world.staffPeopleById[committed.actorIds[0]!]!
    next = addInboxItem(next, {
      id: politicalLobbyInboxId(action.id), coachId: world.userCoachId, gameDate: action.performedOn,
      category: 'career', priority: 'normal', status: 'unread',
      title: 'A colleague is lobbying about a staff request',
      body: `${actor.identity.firstName} ${actor.identity.lastName} has approached you ${action.stance === 'SUPPORT' ? 'in support of' : 'against'} a colleague's actual career request.`,
      context: { lifeScenario: 'staffPoliticalLobby', politicalActionId: action.id, politicalCaseId: politicalCase.id,
        sourceRequestId: politicalCase.sourceId, actorId: actor.id, subjectId: politicalCase.subjectStaffId!,
        stance: action.stance, scenarioVersion: 1 },
    })
  }
  return next
}

function validLobbySource(world: GameWorld, action: StaffPoliticalAction): boolean {
  const politicalCase = world.staffPoliticalCasesById[action.caseId]
  if (action.kind !== 'LOBBY' || (action.stance !== 'SUPPORT' && action.stance !== 'OPPOSE') ||
    action.target?.kind !== 'COACH' || action.target.id !== world.userCoachId ||
    world.staffPoliticalActionsById[action.id] === undefined || politicalCase === undefined ||
    politicalCase.status !== 'OPEN' || politicalCase.sourceKind !== 'CAREER_REQUEST' ||
    politicalCase.teamId !== action.teamId || !politicalCase.subjectStaffId ||
    world.staffCareerRequestsById[politicalCase.sourceId]?.status !== 'OPEN' ||
    world.staffCareerRequestsById[politicalCase.sourceId]?.staffId !== politicalCase.subjectStaffId ||
    world.teams[action.teamId]?.coachId !== world.userCoachId || action.actorIds.length !== 1) return false
  const actorId = action.actorIds[0]!
  const employment = world.staffEmploymentByStaffId[actorId]
  return actorId !== politicalCase.subjectStaffId && actorId in world.staffPeopleById &&
    employment?.status === 'employed' && employment.teamId === action.teamId &&
    Object.values(world.teamStaffAssignmentsById).some(a => a.staffPersonId === actorId && a.teamId === action.teamId)
}

export function getPendingStaffPoliticalLobby(world: GameWorld, actionId: string): PendingStaffLobby | null {
  const action = world.staffPoliticalActionsById[actionId]
  const item = world.inboxItemsById[politicalLobbyInboxId(actionId)]
  if (action === undefined || item === undefined || item.status === 'archived' ||
    item.coachId !== world.userCoachId || item.context.lifeScenario !== 'staffPoliticalLobby' ||
    item.context.politicalActionId !== actionId || !validLobbySource(world, action)) return null
  const politicalCase = world.staffPoliticalCasesById[action.caseId]!
  return { actionId, inboxId: item.id, actorId: action.actorIds[0]!, subjectId: politicalCase.subjectStaffId!,
    stance: action.stance as 'SUPPORT' | 'OPPOSE', requestId: politicalCase.sourceId, openedOn: item.gameDate }
}

export function getPendingStaffPoliticalLobbies(world: GameWorld): readonly PendingStaffLobby[] {
  return Object.values(world.inboxItemsById)
    .filter(item => item.context.lifeScenario === 'staffPoliticalLobby' && item.status !== 'archived')
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.id.localeCompare(b.id))
    .map(item => getPendingStaffPoliticalLobby(world, String(item.context.politicalActionId)))
    .filter((item): item is PendingStaffLobby => item !== null)
}

/** Player responds to a *real* staff lobbying approach. The coach may listen or
 * remain firm; neither option grants/refuses the professional request or forces
 * anyone else to support a faction. Outcomes use existing relationships and Memory.
 */
export function decideStaffPoliticalLobby(world: GameWorld, actionId: string, choice: StaffLobbyChoice,
  coachId: CoachId = world.userCoachId): StaffLobbyDecision {
  if (coachId !== world.userCoachId) return { status: 'BLOCKED', world, reason: 'NOT_USER_COACH' }
  if (choice !== 'hearArgument' && choice !== 'standFirm') return { status: 'BLOCKED', world, reason: 'INVALID_CHOICE' }
  const pending = getPendingStaffPoliticalLobby(world, actionId)
  if (!pending || world.memoriesById[`memory:${origin(actionId)}:coach`] !== undefined) {
    return { status: 'BLOCKED', world, reason: 'NOT_PENDING' }
  }
  if (world.staffEmploymentByStaffId[pending.actorId]?.status !== 'employed') {
    return { status: 'BLOCKED', world, reason: 'STAFF_LEFT' }
  }
  const listened = choice === 'hearArgument'
  let next = applyRelationshipEventsToWorld(world, [
    { sourceId: pending.actorId, targetId: coachId, event: {
      id: `relationship:${origin(actionId)}:actor`, gameDate: world.currentDate, source: 'professionalInteraction',
      delta: listened ? 6 : -6, dimensionDeltas: listened
        ? { trust: 5, communicationQuality: 7, perceivedSupport: 4, professionalRespect: 3 }
        : { trust: -6, communicationQuality: -6, perceivedSupport: -5, professionalRespect: -2 },
      context: { politicalActionId: actionId, sourceRequestId: pending.requestId, choice, stance: pending.stance },
    } },
    { sourceId: coachId, targetId: pending.actorId, event: {
      id: `relationship:${origin(actionId)}:coach`, gameDate: world.currentDate, source: 'professionalInteraction',
      delta: listened ? 3 : -2, dimensionDeltas: listened
        ? { communicationQuality: 4, collaboration: 3, professionalRespect: 2 }
        : { communicationQuality: -3, collaboration: -2 },
      context: { politicalActionId: actionId, sourceRequestId: pending.requestId, choice, stance: pending.stance },
    } },
  ])
  next = recordMemory(next, {
    id: `memory:${origin(actionId)}:coach`, owner: { kind: 'coach', id: coachId },
    type: listened ? 'opportunity' : 'conflict', occurredOn: world.currentDate,
    entityRefs: [{ kind: 'staff', id: pending.actorId }, { kind: 'staff', id: pending.subjectId }],
    sourceId: actionId, semanticKey: `politicalLobby:${actionId}:coach`,
    importance: 'notable', valence: listened ? 15 : -10, intensity: 55, decayPerMonth: 2,
    permanent: false, tags: ['staff', 'politics', 'lobby', 'conversation'],
    context: { choice, politicalActionId: actionId, sourceRequestId: pending.requestId },
  })
  next = recordMemory(next, {
    id: `memory:${origin(actionId)}:actor`, owner: { kind: 'staff', id: pending.actorId },
    type: listened ? 'support' : 'conflict', occurredOn: world.currentDate,
    entityRefs: [{ kind: 'coach', id: coachId }, { kind: 'staff', id: pending.subjectId }],
    sourceId: actionId, semanticKey: `politicalLobby:${actionId}:actor`,
    importance: 'notable', valence: listened ? 25 : -30, intensity: 65, decayPerMonth: 2,
    permanent: false, tags: ['staff', 'politics', 'lobby', 'conversation'],
    context: { choice, politicalActionId: actionId, sourceRequestId: pending.requestId },
  })
  next = applyMoraleEventToWorld(next, {
    id: `morale:${origin(actionId)}:coach`, personId: coachId, gameDate: world.currentDate,
    source: 'professionalInteraction', delta: listened ? 3 : -1,
    context: { personalityEventKind: 'TEAM_MEETING', politicalActionId: actionId, choice },
  })
  const staff = next.staffPeopleById[pending.actorId]!
  const dob = (staff.personId === undefined ? undefined : next.personsById[staff.personId]?.dateOfBirth)
    ?? staff.identity.dateOfBirth
  next = applyMoraleEventToWorld(next, {
    id: `morale:${origin(actionId)}:actor`, personId: pending.actorId, gameDate: world.currentDate,
    source: 'professionalInteraction', delta: listened ? 5 : -5,
    context: { ...(dob && addYears(dob, 15) <= world.currentDate ? { personalityEventKind: 'TEAM_MEETING' } : {}),
      politicalActionId: actionId, choice },
  })
  const coach = next.coaches[coachId]!
  if (next.personalitiesByPersonId[coachId] !== undefined) {
    next = updateGameWorld(next, { personalitiesByPersonId: {
      ...next.personalitiesByPersonId, [coach.staffProfileId]: next.personalitiesByPersonId[coachId]!,
    } })
  }
  return { status: 'APPLIED', world: archiveInboxItem(next, pending.inboxId), choice }
}
