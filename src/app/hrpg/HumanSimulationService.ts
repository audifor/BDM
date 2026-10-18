import type { HumanSituation, HumanSource } from '@/domain/hrpg/HumanSimulation'
import { humanActorPersonId } from '@/domain/hrpg/validateHumanSimulationWorld'
import { type GameWorld } from '@/domain/world'
import {
  availableHumanActions, ingestHumanSources, progressHumanSituations, queryHumanContinuity, queryHumanSituations, resolveHumanAction, shareHumanClaim,
  type HumanAction, type HumanCommandResult, type HumanRule, type HumanRuntime,
} from '@/engine/hrpg/HumanSimulationEngine'
import { chooseStaffHumanResponse } from '@/engine/staff/StaffCareerAutonomyEngine'
import { acceptCoachJobOffer, declineCoachJobOffer } from '@/app/coachCareer/CoachCareerService'
import { declineStaffCareerRequest } from '@/app/staffCareerAutonomy/StaffCareerAutonomyService'
import {
  decideOpeningDebt, getPendingOpeningDebtDecision, decideFirstStaffMeeting, getPendingFirstStaffMeeting,
  decideStaffRequestFollowUp, getPendingStaffRequestFollowUp, decideStaffPoliticalLobby, getPendingStaffPoliticalLobby,
  decidePlayerTrainingFeedback, getPendingPlayerTrainingFeedback, postponeStaffPromise, getStaffPromise, promiseStaffCareerRequest,
} from '@/app/coachLife'
import { canHumansCommunicate, collectHumanSources, readHumanFact } from './HumanSources'
import { isEligibleStaffPromise } from '@/app/coachLife/StaffProfessionalCommitment'

const action = (id: string, label: string, effect: HumanAction['effect'] = 'authority'): HumanAction => ({ id, label, effect })
const reflect = action('reflect', 'Consider what happened', 'reflect')
const discuss = action('discuss', 'Discuss the situation', 'discuss')
const ignore = action('ignore', 'Take no action', 'ignore')
const legacy = (topic: string, actions: readonly HumanAction[]): HumanRule => ({ id: topic, topics: [topic], actions, actors: 'first', cadence: 'source' })

/** Content composes facts + actions; adding a category does not add a new pipeline. */
export const HUMAN_RULES: readonly HumanRule[] = [
  legacy('openingDebt', [action('extraPayment', 'Make a voluntary payment'), action('reduceLifestyle', 'Reduce living expenses')]),
  legacy('firstStaffMeeting', [action('seekInput', 'Ask for input'), action('setDirection', 'Set your direction')]),
  legacy('staffRequestFollowUp', [action('acknowledgeImpact', 'Acknowledge the impact'), action('maintainDecision', 'Maintain the decision')]),
  legacy('staffPromise', [action('postpone', 'Request a single extension')]),
  legacy('staffPoliticalLobby', [action('hearArgument', 'Hear the argument'), action('standFirm', 'Stand firm')]),
  legacy('playerTrainingFeedback', [action('recognizeWork', 'Recognize the work'), action('setHigherStandard', 'Set a higher standard')]),
  { id: 'professionalContext', topics: ['careerRequest', 'politicalAction', 'rememberedCommitment'],
    actions: [reflect, discuss, ignore], actors: 'all', cadence: 'month', timeoutDays: 14, reviewAfterDays: 7 },
  { id: 'sportingContext', topics: ['matchCompleted', 'trainingCompleted', 'playerContract'],
    actions: [reflect, ignore], actors: 'all', cadence: 'month', timeoutDays: 14, reviewAfterDays: 7 },
  { id: 'personalContext', topics: ['personalFinance', 'governanceAction'],
    actions: [reflect, ignore], actors: 'all', cadence: 'month', timeoutDays: 30, reviewAfterDays: 7 },
  { id: 'reportedInformation', topics: ['reportedInformation'],
    actions: [reflect, ignore], actors: 'first', cadence: 'month', timeoutDays: 14, reviewAfterDays: 7 },
  { id: 'careerOffer', topics: ['careerOffer'], actions: [action('acceptOffer', 'Accept the offer'), action('declineOffer', 'Decline the offer')],
    actors: 'first', cadence: 'source' },
  { id: 'staffRequestDecision', topics: ['careerRequest'], actions: [action('promise', 'Commit to reviewing the request within fourteen days'), action('declineRequest', 'Decline the request')],
    actors: 'all', cadence: 'source' },
]

function legacyPending(world: GameWorld, situation: HumanSituation): boolean {
  const id = situation.source.id
  const item = world.inboxItemsById[id]
  if (!item || item.status === 'archived' || item.coachId !== world.userCoachId) return false
  switch (String(item.context.lifeScenario)) {
    case 'openingDebt': return getPendingOpeningDebtDecision(world)?.id === id
    case 'firstStaffMeeting': return getPendingFirstStaffMeeting(world)?.inboxId === id
    case 'staffRequestFollowUp': return getPendingStaffRequestFollowUp(world, String(item.context.requestId))?.inboxId === id
    case 'staffPoliticalLobby': return getPendingStaffPoliticalLobby(world, String(item.context.politicalActionId))?.inboxId === id
    case 'playerTrainingFeedback': return getPendingPlayerTrainingFeedback(world)?.inboxId === id
    case 'staffPromise': return getStaffPromise(world, String(item.context.requestId)) !== null
    default: return false
  }
}

function authorityAvailable(world: GameWorld, situation: HumanSituation, action: HumanAction): boolean {
  // User commands cannot impersonate an AI coach to circumvent professional permissions.
  if (situation.actor.kind !== 'coach' || situation.actor.id !== world.userCoachId) return false
  if (situation.source.kind === 'lifeInbox') {
    if (!legacyPending(world, situation)) return false
    const scenario = world.inboxItemsById[situation.source.id]?.context.lifeScenario
    if (!HUMAN_RULES.find(rule => rule.id === scenario)?.actions.some(a => a.id === action.id)) return false
    if (scenario === 'openingDebt') {
      const finance = world.coachFinancesByCoachId[world.userCoachId]!
      const debt = finance.debts.find(d => d.id === `bs19b:starting-debt:${world.userCoachId}`)
      if (debt?.status !== 'active') return false
      if (action.id === 'extraPayment') return debt.principalRemaining > 0 && finance.cash >= Math.min(500, debt.principalRemaining)
    }
    if (action.id === 'postpone') {
      const promise = getStaffPromise(world, String(world.inboxItemsById[situation.source.id]?.context.requestId))
      return !!promise && !promise.postponed && world.currentDate <= promise.dueOn && world.staffCareerRequestsById[promise.requestId]?.status === 'OPEN' &&
        isEligibleStaffPromise(world, promise.coachId, promise.staffId, promise.teamId)
    }
    return true
  }
  if (situation.source.kind === 'coachOffer') {
    if (action.id !== 'acceptOffer' && action.id !== 'declineOffer') return false
    const offer = world.coachJobOffersById[situation.source.id as never]
    return offer?.coachId === world.userCoachId && offer.status === 'pending' &&
      world.coachJobOpeningsById[offer.jobOpeningId]?.status === 'open' && !world.teams[offer.teamId]?.coachId &&
      Object.values(world.coachJobCandidaciesById).some(c => c.jobOpeningId === offer.jobOpeningId && c.coachId === offer.coachId && c.status === 'offered')
  }
  if (situation.source.kind === 'staffRequest') {
    if (action.id !== 'promise' && action.id !== 'declineRequest') return false
    const request = world.staffCareerRequestsById[situation.source.id]
    if (!request || request.status !== 'OPEN' || world.teams[request.teamId]?.coachId !== world.userCoachId ||
      world.staffEmploymentByStaffId[request.staffId]?.teamId !== request.teamId) return false
    return action.id !== 'promise' || (['MORE_RESPONSIBILITY', 'PROMOTION'].includes(request.kind) && !getStaffPromise(world, request.id) &&
      isEligibleStaffPromise(world, world.userCoachId, request.staffId, request.teamId) &&
      !world.memoriesById[`memory:bs19c:staff-promise:${world.userCoachId}:${request.id}:created:coach`])
  }
  return false
}

function executeAuthority(world: GameWorld, situation: HumanSituation, actionId: string): GameWorld | undefined {
  const item = world.inboxItemsById[situation.source.id]
  const c = item?.context ?? {}
  let result: { readonly status: string; readonly world: GameWorld } | undefined
  switch (String(item?.context.lifeScenario)) {
    case 'openingDebt': result = decideOpeningDebt(world, actionId as Parameters<typeof decideOpeningDebt>[1]); break
    case 'firstStaffMeeting': result = decideFirstStaffMeeting(world, String(c.assistantStaffId) as never, actionId as Parameters<typeof decideFirstStaffMeeting>[2]); break
    case 'staffRequestFollowUp': result = decideStaffRequestFollowUp(world, String(c.requestId), actionId as Parameters<typeof decideStaffRequestFollowUp>[2]); break
    case 'staffPromise': result = postponeStaffPromise(world, String(c.requestId)); break
    case 'staffPoliticalLobby': result = decideStaffPoliticalLobby(world, String(c.politicalActionId), actionId as Parameters<typeof decideStaffPoliticalLobby>[2]); break
    case 'playerTrainingFeedback': result = decidePlayerTrainingFeedback(world, actionId as Parameters<typeof decidePlayerTrainingFeedback>[1]); break
  }
  if (situation.source.kind === 'coachOffer') {
    if (actionId === 'acceptOffer') return acceptCoachJobOffer(world, situation.source.id)
    if (actionId === 'declineOffer') return declineCoachJobOffer(world, situation.source.id)
  }
  if (situation.source.kind === 'staffRequest') {
    if (actionId === 'declineRequest') return declineStaffCareerRequest(world, situation.source.id)
    if (actionId === 'promise') result = promiseStaffCareerRequest(world, situation.source.id, 14)
  }
  return result?.status === 'APPLIED' ? result.world : undefined
}

export const HUMAN_RUNTIME: HumanRuntime = {
  rules: HUMAN_RULES, readFact: readHumanFact, canCommunicate: canHumansCommunicate, executeAuthority,
  isAvailable(world, situation, action) {
    if (action.effect === 'authority') return authorityAvailable(world, situation, action)
    if (!readHumanFact(world, situation.source)) return false
    if (action.effect !== 'discuss') return true
    const first = humanActorPersonId(world, situation.actor)
    const other = situation.participants.find(p => humanActorPersonId(world, p) !== first)
    const second = other && humanActorPersonId(world, other)
    return !!first && !!second && canHumansCommunicate(world, first, second)
  },
  chooseNpcAction(world, situation, actions) {
    // Existing career autonomy has already run in CalendarEngine. Only social
    // responses are considered here; offers/employment are never decided twice.
    return chooseStaffHumanResponse(world, situation, actions.filter(a => a.effect !== 'authority'))
  },
}

/** Initial handoff of unresolved legacy situations, without reconstructing past events. */
export function initializeHumanSimulation(world: GameWorld): GameWorld {
  const sources: HumanSource[] = Object.values(world.inboxItemsById).filter(i => i.status !== 'archived' && typeof i.context.lifeScenario === 'string')
    .map(i => ({ kind: 'lifeInbox', id: i.id }))
  sources.push(...Object.values(world.coachJobOffersById).filter(o => o.status === 'pending').map(o => ({ kind: 'coachOffer' as const, id: o.id })))
  return ingestHumanSources(world, sources, HUMAN_RUNTIME).world
}

/** The shared daily/command seam. Two finite waves admit real consequences emitted
 * by adapters, including promise memories and follow-up Inbox records. */
export function synchronizeHumanSimulation(before: GameWorld, after: GameWorld): GameWorld {
  return synchronizeHumanSimulationWithResult(before, after).world
}

export function synchronizeHumanSimulationWithResult(before: GameWorld, after: GameWorld) {
  const first = ingestHumanSources(after, collectHumanSources(before, after), HUMAN_RUNTIME)
  const progressed = progressHumanSituations(first.world, HUMAN_RUNTIME)
  const second = ingestHumanSources(progressed, collectHumanSources(after, progressed), HUMAN_RUNTIME)
  return { world: second.world, examined: first.examined + second.examined,
    admitted: first.admitted + second.admitted, suppressed: first.suppressed + second.suppressed }
}

export function getUserHumanSituations(world: GameWorld) {
  return queryHumanSituations(world, world.coaches[world.userCoachId]!.personId, HUMAN_RUNTIME)
}

export function getUserHumanContinuity(world: GameWorld) {
  return queryHumanContinuity(world, { kind: 'coach', id: world.userCoachId }, HUMAN_RUNTIME)
}

export function decideUserHumanSituation(world: GameWorld, situationId: string, actionId: string): HumanCommandResult {
  const result = resolveHumanAction(world, situationId, actionId, world.coaches[world.userCoachId]!.personId, HUMAN_RUNTIME)
  return result.status === 'APPLIED' ? { ...result, world: synchronizeHumanSimulation(world, result.world) } : result
}

/** Existing store commands remain typed compatibility adapters. The common engine
 * records their lifecycle, while the original handler supplies its exact result
 * envelope/rejection reason and remains the sole consequence authority. */
export function resolveHumanCompatibility<T extends { readonly status: 'APPLIED' | 'BLOCKED'; readonly world: GameWorld }>(
  world: GameWorld, ruleId: string, actionId: string, handler: (current: GameWorld) => T, source?: HumanSource,
): T {
  const initial = initializeHumanSimulation(world)
  const ready = source ? ingestHumanSources(initial, [source], HUMAN_RUNTIME).world : initial
  const situation = Object.values(ready.humanSimulation.situationsById).find(s => s.actor.id === world.userCoachId && s.ruleId === ruleId &&
    (!source || (s.source.id === source.id && s.source.kind === source.kind)) && availableHumanActions(ready, s, HUMAN_RUNTIME).some(a => a.id === actionId))
  if (!situation) return handler(world)
  let canonicalResult: T | undefined
  const runtime: HumanRuntime = { ...HUMAN_RUNTIME, executeAuthority(current) {
    canonicalResult = handler(current)
    return canonicalResult.status === 'APPLIED' ? canonicalResult.world : undefined
  } }
  const result = resolveHumanAction(ready, situation.id, actionId, world.coaches[world.userCoachId]!.personId, runtime)
  if (result.status === 'APPLIED' && canonicalResult) return { ...canonicalResult, world: synchronizeHumanSimulation(world, result.world) }
  return canonicalResult ?? handler(world)
}

export function shareUserHumanClaim(world: GameWorld, source: HumanSource, recipientPersonId: string, basis: 'report' | 'rumour', claim: string): HumanCommandResult {
  return shareHumanClaim(world, source, world.coaches[world.userCoachId]!.personId, recipientPersonId, basis, claim, HUMAN_RUNTIME)
}
