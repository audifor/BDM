import { addDays, addYears, parseGameDate, type GameDate } from '@/domain/date'
import type { CoachId, StaffPersonId, TeamId } from '@/domain/ids'
import { applyStaffConflictTrigger } from '@/engine/staff/StaffConflictEngine'
import { addInboxItem, applyMoraleEventToWorld, applyRelationshipEventsToWorld, archiveInboxItem, updateGameWorld, type GameWorld } from '@/domain/world'
import { recordMemory } from '@/engine/memory/MemoryEngine'

export type StaffPromiseOutcome = 'FULFILLED' | 'BROKEN' | 'CANCELLED'
export type StaffPromiseResult =
  | { readonly status: 'APPLIED'; readonly world: GameWorld }
  | { readonly status: 'BLOCKED'; readonly world: GameWorld; readonly reason: 'NO_REAL_REQUEST' | 'NOT_USER_COACH' | 'NOT_ELIGIBLE' | 'ALREADY_PROMISED' | 'NOT_PENDING' | 'INVALID_DATE' | 'EXTENSION_ALREADY_USED' | 'SIMULATION_BUSY' }

export interface ActiveStaffPromise {
  readonly requestId: string
  readonly staffId: StaffPersonId
  readonly teamId: TeamId
  readonly coachId: CoachId
  readonly committedOn: GameDate
  readonly dueOn: GameDate
  readonly postponed: boolean
}
const source = (coachId: CoachId, requestId: string) => `bs19c:staff-promise:${coachId}:${requestId}`
const memoryId = (coachId: CoachId, requestId: string, phase: string, actor: 'coach' | 'staff') =>
  `memory:${source(coachId, requestId)}:${phase}:${actor}`
export const staffPromiseInboxId = (coachId: CoachId, requestId: string): string =>
  `inbox:${source(coachId, requestId)}`

/** A promise is explicitly spoken by the user and backed by a genuine OPEN StaffCareerRequest.
 * Both witnesses record it in existing Memory, including the calendar obligation.
 * StaffCareerRequest stays the unique authority for a real promotion/delegation.
 */
export function promiseStaffCareerRequest(world: GameWorld, requestId: string, daysAhead: 7 | 14 | 30): StaffPromiseResult {
  const coachId = world.userCoachId
  const request = world.staffCareerRequestsById[requestId]
  if (request === undefined || request.status !== 'OPEN' || !['MORE_RESPONSIBILITY', 'PROMOTION'].includes(request.kind)) {
    return { status: 'BLOCKED', world, reason: 'NO_REAL_REQUEST' }
  }
  if (!eligible(world, coachId, request.staffId, request.teamId)) return { status: 'BLOCKED', world, reason: 'NOT_ELIGIBLE' }
  if (getStaffPromise(world, requestId) !== null || world.memoriesById[memoryId(coachId, requestId, 'created', 'coach')] !== undefined) {
    return { status: 'BLOCKED', world, reason: 'ALREADY_PROMISED' }
  }
  if (daysAhead !== 7 && daysAhead !== 14 && daysAhead !== 30) return { status: 'BLOCKED', world, reason: 'INVALID_DATE' }
  const dueOn = addDays(world.currentDate, daysAhead)
  let next = recordBoth(world, requestId, request.staffId, request.teamId, 'created',
    { commitment: 'staffCareerRequest', dueOn, daysAhead, requestKind: request.kind },
    'opportunity', 'opportunity', 22, 30)
  next = addInboxItem(next, {
    id: staffPromiseInboxId(coachId, requestId), coachId, gameDate: world.currentDate,
    category: 'career', priority: 'normal', status: 'unread',
    title: 'Your professional commitment to staff',
    body: 'You promised to resolve an existing staff career request by the agreed date. The real assignment or promotion still needs to be completed.',
    context: { lifeScenario: 'staffPromise', requestId, staffId: request.staffId, teamId: request.teamId, dueOn, scenarioVersion: 1 },
  })
  return { status: 'APPLIED', world: next }
}

export function getStaffPromise(world: GameWorld, requestId: string): ActiveStaffPromise | null {
  const coachId = world.userCoachId
  const request = world.staffCareerRequestsById[requestId]
  const created = world.memoriesById[memoryId(coachId, requestId, 'created', 'coach')]
  if (request === undefined || created === undefined ||
    world.memoriesById[memoryId(coachId, requestId, 'fulfilled', 'coach')] ||
    world.memoriesById[memoryId(coachId, requestId, 'broken', 'coach')] ||
    world.memoriesById[memoryId(coachId, requestId, 'cancelled', 'coach')]) return null
  const due = created.context.dueOn
  if (typeof due !== 'string') return null
  const extended = world.memoriesById[memoryId(coachId, requestId, 'extended', 'coach')]
  const extensionDue = extended?.context.dueOn
  if (extensionDue !== undefined && typeof extensionDue !== 'string') return null
  const dueOn = parseGameDate(extensionDue ?? due)
  return { requestId, staffId: request.staffId, teamId: request.teamId, coachId,
    committedOn: created.occurredOn, dueOn, postponed: extended !== undefined }
}

export function getActiveStaffPromises(world: GameWorld): readonly ActiveStaffPromise[] {
  return Object.keys(world.staffCareerRequestsById).sort().map(id => getStaffPromise(world, id))
    .filter((promise): promise is ActiveStaffPromise => promise !== null)
}

export function postponeStaffPromise(world: GameWorld, requestId: string): StaffPromiseResult {
  const promise = getStaffPromise(world, requestId)
  if (!promise) return { status: 'BLOCKED', world, reason: 'NOT_PENDING' }
  if (promise.postponed) return { status: 'BLOCKED', world, reason: 'EXTENSION_ALREADY_USED' }
  if (world.currentDate > promise.dueOn || world.staffCareerRequestsById[requestId]?.status !== 'OPEN' ||
    !eligible(world, promise.coachId, promise.staffId, promise.teamId)) {
    return { status: 'BLOCKED', world, reason: 'NOT_ELIGIBLE' }
  }
  const dueOn = addDays(promise.dueOn, 7)
  let next = recordBoth(world, requestId, promise.staffId, promise.teamId, 'extended',
    { commitment: 'staffCareerRequest', priorDueOn: promise.dueOn, dueOn, extensionDays: 7 },
    'opportunity', 'opportunity', -8, -16)
  const inbox = next.inboxItemsById[staffPromiseInboxId(promise.coachId, requestId)]
  // The dated memory remains the authority; keep its Inbox projection accurate too.
  if (inbox !== undefined && inbox.status !== 'archived') {
    next = updateGameWorld(next, { inboxItemsById: {
      ...next.inboxItemsById, [inbox.id]: {
        ...inbox, body: 'You agreed a single seven-day extension of the real staff request. Fulfil the commitment before the revised date.',
        context: { ...inbox.context, dueOn, postponed: true },
      },
    } })
  }
  return { status: 'APPLIED', world: next }
}

/** An actual request resolution, never the promise alone, proves fulfillment.
 * A declined request or a late OPEN request is a broken promise. A voluntarily
 * withdrawn request, or an independently departed staff member, cancels without blame.
 */
export function settleStaffPromise(world: GameWorld, requestId: string): GameWorld {
  const promise = getStaffPromise(world, requestId)
  if (!promise) return world
  const request = world.staffCareerRequestsById[requestId]
  if (!request) return world
  let outcome: StaffPromiseOutcome | undefined
  if (request.status === 'GRANTED') outcome = world.currentDate <= promise.dueOn ? 'FULFILLED' : 'BROKEN'
  else if (request.status === 'DECLINED') outcome = 'BROKEN'
  else if (request.status === 'WITHDRAWN' || request.status === 'SUPERSEDED' ||
    !eligible(world, promise.coachId, promise.staffId, promise.teamId)) outcome = 'CANCELLED'
  else if (request.status === 'OPEN' && world.currentDate > promise.dueOn) outcome = 'BROKEN'
  if (!outcome) return world
  const phase = outcome.toLowerCase()
  let next = recordBoth(world, requestId, promise.staffId, promise.teamId, phase,
    { commitment: 'staffCareerRequest', dueOn: promise.dueOn, requestStatus: request.status, outcome },
    outcome === 'BROKEN' ? 'betrayal' : 'trust', outcome === 'BROKEN' ? 'betrayal' : 'support',
    outcome === 'FULFILLED' ? 32 : outcome === 'BROKEN' ? -42 : 0,
    outcome === 'FULFILLED' ? 45 : outcome === 'BROKEN' ? -70 : 0)
  if (outcome !== 'CANCELLED') {
    const kept = outcome === 'FULFILLED'
    next = applyRelationshipEventsToWorld(next, [
      { sourceId: promise.staffId, targetId: promise.coachId, event: {
        id: `relationship:${source(promise.coachId, requestId)}:${phase}:staff`,
        gameDate: world.currentDate, source: 'professionalInteraction', delta: kept ? 10 : -13,
        dimensionDeltas: kept
          ? { trust: 9, reliability: 12, perceivedSupport: 8, professionalRespect: 5 }
          : { trust: -15, reliability: -18, perceivedSupport: -10, professionalRespect: -6 },
        context: { requestId, promiseOutcome: outcome, dueOn: promise.dueOn },
      } },
      { sourceId: promise.coachId, targetId: promise.staffId, event: {
        id: `relationship:${source(promise.coachId, requestId)}:${phase}:coach`,
        gameDate: world.currentDate, source: 'professionalInteraction', delta: kept ? 5 : -5,
        dimensionDeltas: kept ? { trust: 5, collaboration: 5 } : { trust: -6, collaboration: -5 },
        context: { requestId, promiseOutcome: outcome, dueOn: promise.dueOn },
      } },
    ])
    const staff = next.staffPeopleById[promise.staffId]
    const birth = staff?.personId === undefined ? undefined : next.personsById[staff.personId]?.dateOfBirth
    const dateOfBirth = birth ?? staff?.identity.dateOfBirth
    next = applyMoraleEventToWorld(next, {
      id: `morale:${source(promise.coachId, requestId)}:${phase}:staff`, personId: promise.staffId,
      gameDate: world.currentDate, source: 'professionalInteraction', delta: kept ? 8 : -12,
      context: { ...(dateOfBirth && addYears(dateOfBirth, 15) <= world.currentDate
        ? { personalityEventKind: kept ? 'TRUST_REBUILT' : 'TRUST_BREACH' } : {}),
        requestId, promiseOutcome: outcome, dueOn: promise.dueOn },
    })
    if (!kept) {
      next = applyStaffConflictTrigger(next, {
        id: `trigger:${source(promise.coachId, requestId)}:broken`,
        occurredOn: world.currentDate, scopeKey: promise.teamId, teamId: promise.teamId,
        subjectActorId: promise.staffId, counterpartActorId: promise.coachId,
        type: 'RECOGNITION', cause: 'recognitionDeficit', basePressure: 64,
        sourceKind: 'staffPromiseBroken', sourceId: requestId,
        context: { dueOn: promise.dueOn, requestStatus: request.status },
      })
    }
  }
  return archiveInboxItem(next, staffPromiseInboxId(promise.coachId, requestId))
}

/**
 * P5. An overdue obligation remains BROKEN forever in the historical record.
 * If the real, still-open request is later GRANTED via StaffCareer's existing
 * authority, that *new fact* permits partial repair, not retroactive fulfillment.
 * Neither personal conversation nor passing time can grant the request.
 */
export function recordLateStaffPromiseRepair(world: GameWorld, requestId: string): GameWorld {
  const coachId = world.userCoachId
  const request = world.staffCareerRequestsById[requestId]
  const broken = world.memoriesById[memoryId(coachId, requestId, 'broken', 'staff')]
  if (request?.status !== 'GRANTED' || request.resolvedOn === undefined || broken === undefined ||
      world.memoriesById[memoryId(coachId, requestId, 'remedied', 'staff')] !== undefined ||
      broken.owner.id !== request.staffId || !eligible(world, coachId, request.staffId, request.teamId)) return world
  if (broken.occurredOn > request.resolvedOn) return world
  let next = recordBoth(world, requestId, request.staffId, request.teamId, 'remedied',
    { commitment: 'staffCareerRequest', repairedRequestId: requestId, brokenOn: broken.occurredOn,
      requestStatus: 'GRANTED', remedy: 'realDelegationOrPromotion' },
    'trust', 'support', 15, 22)
  next = applyRelationshipEventsToWorld(next, [
    { sourceId: request.staffId, targetId: coachId, event: {
      id: `relationship:${source(coachId, requestId)}:remedied:staff`,
      gameDate: world.currentDate, source: 'professionalInteraction', delta: 5,
      dimensionDeltas: { trust: 5, reliability: 7, perceivedSupport: 5, professionalRespect: 3 },
      context: { requestId, promiseRemedy: 'REAL_REQUEST_GRANTED', brokenOn: broken.occurredOn },
    } },
    { sourceId: coachId, targetId: request.staffId, event: {
      id: `relationship:${source(coachId, requestId)}:remedied:coach`,
      gameDate: world.currentDate, source: 'professionalInteraction', delta: 3,
      dimensionDeltas: { trust: 3, collaboration: 3 },
      context: { requestId, promiseRemedy: 'REAL_REQUEST_GRANTED', brokenOn: broken.occurredOn },
    } },
  ])
  const staff = next.staffPeopleById[request.staffId]
  const dob = (staff?.personId === undefined ? undefined : next.personsById[staff.personId]?.dateOfBirth) ?? staff?.identity.dateOfBirth
  next = applyMoraleEventToWorld(next, {
    id: `morale:${source(coachId, requestId)}:remedied:staff`,
    personId: request.staffId, gameDate: world.currentDate, source: 'professionalInteraction',
    delta: 5,
    context: { ...(dob && addYears(dob, 15) <= world.currentDate ? { personalityEventKind: 'TRUST_REBUILT' } : {}),
      requestId, promiseRemedy: 'REAL_REQUEST_GRANTED', brokenOn: broken.occurredOn },
  })
  // An active conflict belongs to StaffConflictEngine; progressStaffConflicts
  // may cool it over subsequent weeks, but this command cannot erase it.
  return next
}

/** Called after the actual calendar transition; never during pre-match state.
 * Past-due obligations generate consequences once without interrupting matches.
 */
export function progressStaffPromises(world: GameWorld): GameWorld {
  let next = world
  for (const promise of getActiveStaffPromises(world)) next = settleStaffPromise(next, promise.requestId)
  return next
}

export { eligible as isEligibleStaffPromise }
function eligible(world: GameWorld, coachId: CoachId, staffId: StaffPersonId, teamId: TeamId): boolean {
  const staff = world.staffPeopleById[staffId]
  const employment = world.staffEmploymentByStaffId[staffId]
  return world.teams[teamId]?.coachId === coachId && staff !== undefined &&
    staff.personId !== world.coaches[coachId]?.personId &&
    employment?.status === 'employed' && employment.teamId === teamId &&
    Object.values(world.teamStaffAssignmentsById).some(item =>
      item.teamId === teamId && item.staffPersonId === staffId && item.role === 'assistantCoach')
}

function recordBoth(world: GameWorld, requestId: string, staffId: StaffPersonId, teamId: TeamId,
  phase: string, context: Readonly<Record<string, string | number | boolean>>,
  coachType: 'opportunity' | 'trust' | 'betrayal', staffType: 'opportunity' | 'support' | 'betrayal',
  coachValence: number, staffValence: number): GameWorld {
  const coachId = world.userCoachId
  let next = recordMemory(world, {
    id: memoryId(coachId, requestId, phase, 'coach'), owner: { kind: 'coach', id: coachId },
    type: coachType, occurredOn: world.currentDate, entityRefs: [{ kind: 'staff', id: staffId }, { kind: 'team', id: teamId }],
    sourceId: requestId, semanticKey: `staffPromise:${requestId}:${phase}:coach`,
    importance: phase === 'broken' ? 'important' : 'notable', valence: coachValence, intensity: 65,
    decayPerMonth: 0, permanent: true, tags: ['staff', 'career', 'promise', phase], context,
  })
  next = recordMemory(next, {
    id: memoryId(coachId, requestId, phase, 'staff'), owner: { kind: 'staff', id: staffId },
    type: staffType, occurredOn: world.currentDate, entityRefs: [{ kind: 'coach', id: coachId }, { kind: 'team', id: teamId }],
    sourceId: requestId, semanticKey: `staffPromise:${requestId}:${phase}:staff`,
    importance: phase === 'broken' ? 'major' : 'notable', valence: staffValence, intensity: 70,
    decayPerMonth: 0, permanent: true, tags: ['staff', 'career', 'promise', phase], context,
  })
  return next
}
