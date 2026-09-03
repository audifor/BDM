import { setTeamResponsibility } from '@/app/staffResponsibilities'
import { promoteStaffWithinTeam, reassignStaffWithinTeam, resignStaffFromTeam } from '@/app/staffCareer'
import { acceptStaffJobOffer, declineStaffJobOffer, getOpenStaffJobs, identifyStaffCandidate } from '@/app/staffCareer'
import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'
import { assessStaffCareerOpportunity, decideStaffAutonomousOffer, STAFF_CAREER_AUTONOMY_TUNING } from '@/engine/staff/StaffCareerAutonomyEngine'
import { recordMemory } from '@/engine/memory'

export function declineStaffCareerRequest(world: GameWorld, requestId: string): GameWorld {
  const request = requireOpenRequest(world, requestId)
  const resolved = resolveRequest(world, requestId, 'DECLINED')
  return recordMemory(resolved, { id: `memory:staff-career-request-declined:${request.id}`, owner: { kind: 'staff', id: request.staffId }, type: 'opportunity', occurredOn: world.currentDate, entityRefs: [{ kind: 'team', id: request.teamId }, { kind: 'coach', id: world.userCoachId }], sourceId: request.id, semanticKey: `staff-career-request-declined:${request.id}`, importance: request.kind === 'PROMOTION' || request.kind === 'RELEASE' ? 'important' : 'notable', valence: -35, intensity: 50, decayPerMonth: 1, permanent: false, tags: ['staff', 'career', 'request', 'declined'], context: { requestId: request.id, kind: request.kind, teamId: request.teamId }, relationshipImpact: { targetPersonId: world.userCoachId, delta: -4 } })
}

export function withdrawStaffCareerRequest(world: GameWorld, requestId: string): GameWorld {
  requireOpenRequest(world, requestId)
  return resolveRequest(world, requestId, 'WITHDRAWN')
}

/** Delegates each real mutation to its existing application authority, then marks the request resolved. */
export function grantStaffCareerRequest(world: GameWorld, requestId: string): GameWorld {
  const request = requireOpenRequest(world, requestId)
  // Resolve before ending the context: resignation deliberately withdraws only still-open requests.
  if (request.kind === 'RELEASE') return resignStaffFromTeam(resolveRequest(world, requestId, 'GRANTED'), request.staffId)
  let next = world
  if (request.kind === 'MORE_RESPONSIBILITY') next = setTeamResponsibility(next, { teamId: request.teamId, kind: request.targetResponsibilityKind!, mode: 'delegated', holderStaffId: request.staffId })
  else if (request.kind === 'PROMOTION') next = promoteStaffWithinTeam(next, { staffId: request.staffId, newRoleId: request.targetRoleId!, reason: 'promoted' })
  else if (request.kind === 'ROLE_CHANGE') next = reassignStaffWithinTeam(next, { staffId: request.staffId, newRoleId: request.targetRoleId! })
  // CONTRACT_DISCUSSION deliberately records acknowledgement only: Contract Negotiation V2 remains out of scope.
  return resolveRequest(next, requestId, 'GRANTED')
}

/**
 * The Staff-side weekly market boundary. It considers only real open roles, creates at most one
 * self-initiated candidacy, and never progresses an interview or makes an offer on the employer's
 * behalf. Employer-side processing remains in StaffCareerService.
 */
export function progressStaffCareerMarketAgency(world: GameWorld): GameWorld {
  let next = world
  const openings = getOpenStaffJobs(world)
  for (const state of Object.values(world.staffCareerAutonomyByContextId).sort((a, b) => a.contextId.localeCompare(b.contextId))) {
    if (state.primaryIntent !== 'EXPLORE_MARKET' || state.intensity < STAFF_CAREER_AUTONOMY_TUNING.marketIntensity) continue
    if (Object.values(next.staffJobCandidaciesById).some((item) => item.staffId === state.staffId && ['identified', 'interviewing', 'offered'].includes(item.status))) continue
    const opening = openings
      .map((item) => ({ item, assessment: assessStaffCareerOpportunity(next, state.staffId, state, item) }))
      .filter((item) => item.assessment.eligible)
      .sort((left, right) => right.assessment.score - left.assessment.score || left.item.id.localeCompare(right.item.id))[0]?.item
    if (opening === undefined) continue
    next = identifyStaffCandidate(next, { openingId: opening.id, staffId: state.staffId, id: `staff-candidacy:autonomy:${state.contextId}:${opening.id}`, origin: 'staffApplied' }).world
  }
  return next
}

/** Resolves only real pending offers through the canonical acceptance/decline service. */
export function progressStaffAutonomousOfferDecisions(world: GameWorld): GameWorld {
  let next = world
  for (const offer of Object.values(world.staffJobOffersById).filter((item) => item.status === 'pending').sort((a, b) => a.id.localeCompare(b.id))) {
    const state = Object.values(next.staffCareerAutonomyByContextId).find((item) => item.staffId === offer.staffId && next.staffHumanContextsById[item.contextId]?.endedOn === undefined)
    if (state === undefined) continue
    next = decideStaffAutonomousOffer(next, offer.staffId, state, offer) === 'ACCEPT' ? acceptStaffJobOffer(next, offer.id) : declineStaffJobOffer(next, offer.id)
  }
  return next
}

/** A last resort only: no pending market process or open request, severe persistent exit intent. */
export function progressStaffAutonomousResignations(world: GameWorld): GameWorld {
  let next = world
  for (const state of Object.values(world.staffCareerAutonomyByContextId).sort((a, b) => a.contextId.localeCompare(b.contextId))) {
    if (state.primaryIntent !== 'EXIT_NOW' || state.intensity < STAFF_CAREER_AUTONOMY_TUNING.resignationIntensity || daysSince(state.intentSince, world.currentDate) < STAFF_CAREER_AUTONOMY_TUNING.minimumIntentAgeDays) continue
    const hasProcess = Object.values(next.staffCareerRequestsById).some((item) => item.contextId === state.contextId && item.status === 'OPEN') || Object.values(next.staffJobCandidaciesById).some((item) => item.staffId === state.staffId && ['identified', 'interviewing', 'offered'].includes(item.status)) || Object.values(next.staffJobOffersById).some((item) => item.staffId === state.staffId && item.status === 'pending')
    if (!hasProcess) next = resignStaffFromTeam(next, state.staffId)
  }
  return next
}

function daysSince(from: string, to: string): number { return Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000)) }

function requireOpenRequest(world: GameWorld, requestId: string) {
  const request = world.staffCareerRequestsById[requestId]
  if (request === undefined || request.status !== 'OPEN') throw new Error('Staff career request is not open')
  return request
}

function resolveRequest(world: GameWorld, requestId: string, status: 'GRANTED' | 'DECLINED' | 'WITHDRAWN'): GameWorld {
  const request = world.staffCareerRequestsById[requestId]
  if (request === undefined || request.status !== 'OPEN') throw new Error('Staff career request is not open')
  return updateGameWorld(world, { staffCareerRequests: Object.values(world.staffCareerRequestsById).map((item) => item.id === requestId ? { ...item, status, resolvedOn: world.currentDate } : item) })
}
