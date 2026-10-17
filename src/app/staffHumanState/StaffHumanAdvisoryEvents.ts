import { applyMoraleEventToWorld, type GameWorld } from '@/domain/world'
import { hasFullSemanticPersonality } from '@/domain/personality'
import type { DelegationOutcome, ResponsibilityKind } from '@/domain/responsibility'
import { createStaffHumanEvent, type StaffHumanEventAttribution } from '@/domain/staffHumanState'
import { applyStaffHumanEvent } from '@/engine/staff/StaffHumanReactionEngine'
import { detectRecommendationPattern } from './StaffHumanAdvisoryPattern'

/**
 * Wave 5A §16 — hooked from `StaffRecommendationService`'s `acceptStaffRecommendation`/
 * `dismissStaffRecommendation`. Preserves the Wave 4C3 canon exactly:
 *  - ACCEPTABLE + ACCEPT  -> `recommendationAccepted`/`importantRecommendationAccepted`
 *  - ACCEPTABLE + DISMISS -> `actionableRecommendationRejected`/`importantRecommendationRejected`
 *  - INFORMATIONAL + DISMISS -> NOTHING. No event, no frustration, no relationship penalty, no
 *    pattern contribution. Closing an informational report is never a professional rejection.
 */
export function emitAdvisoryAcceptedEvent(world: GameWorld, outcome: DelegationOutcome, important: boolean): GameWorld {
  return emitAdvisoryEvent(world, outcome, important ? 'importantRecommendationAccepted' : 'recommendationAccepted', important ? 'IMPORTANT' : 'MEANINGFUL')
}

export function emitAdvisoryRejectedEvent(world: GameWorld, outcome: DelegationOutcome, hasCanonicalAcceptanceSeam: (kind: ResponsibilityKind) => boolean, important: boolean): GameWorld {
  if (!hasCanonicalAcceptanceSeam(outcome.kind)) return world // INFORMATIONAL dismiss — §16 hard rule, never a rejection event
  const withRejection = emitAdvisoryEvent(world, outcome, important ? 'importantRecommendationRejected' : 'actionableRecommendationRejected', important ? 'IMPORTANT' : 'MEANINGFUL')
  return detectRecommendationPattern(withRejection, outcome.staffId)
}

function emitAdvisoryEvent(world: GameWorld, outcome: DelegationOutcome, kind: 'recommendationAccepted' | 'importantRecommendationAccepted' | 'actionableRecommendationRejected' | 'importantRecommendationRejected', importance: 'MEANINGFUL' | 'IMPORTANT'): GameWorld {
  const context = mostRecentContextFor(world, outcome.staffId)
  if (context === undefined) return world
  const attribution = resolveAdvisoryAttribution(world)
  const sourceEventId = `delegation-outcome:${outcome.id}`
  const event = createStaffHumanEvent({
    id: `event:${sourceEventId}:${kind}`,
    kind,
    staffId: outcome.staffId,
    contextId: context.id,
    occurredOn: world.currentDate,
    importance,
    sourceEventId,
    attribution,
    payload: { responsibilityKind: outcome.kind, qualityScore: outcome.qualityScore },
  })
  const result = applyStaffHumanEvent(world, context, event)
  // Only a truly recorded, new StaffHumanReactionRecord can generate PERSON
  // evidence. A repeated advisory, informational dismissal or legacy 8-score
  // profile must leave the existing game behavior untouched.
  if (result.reaction === undefined) return result.world
  const staff = result.world.staffPeopleById[outcome.staffId]
  const personality = result.world.personalitiesByPersonId[outcome.staffId]
  if (staff === undefined || personality === undefined || !hasFullSemanticPersonality(personality)) return result.world
  const root = staff.personId === undefined ? undefined : result.world.personsById[staff.personId]
  if ((root?.dateOfBirth ?? staff.identity.dateOfBirth) === undefined) return result.world
  if (result.world.moraleByPersonId[outcome.staffId] === undefined) return result.world
  const rejected = kind === 'actionableRecommendationRejected' || kind === 'importantRecommendationRejected'
  return applyMoraleEventToWorld(result.world, {
    id: `person:observed-advisory:${result.reaction.id}`,
    personId: outcome.staffId,
    gameDate: event.occurredOn,
    source: 'professionalInteraction',
    delta: (rejected ? -1 : 1) * (importance === 'IMPORTANT' ? 50 : 25),
    context: {
      personalityEventKind: rejected ? 'RECOMMENDATION_REJECTED' : 'RECOMMENDATION_ACCEPTED',
      sourceEventId,
      staffHumanReactionId: result.reaction.id,
    },
  })
}

function mostRecentContextFor(world: GameWorld, staffId: string) {
  return Object.values(world.staffHumanContextsById)
    .filter((context) => context.staffId === staffId && context.endedOn === undefined)
    .sort((a, b) => b.startedOn.localeCompare(a.startedOn))[0]
}

/** The user (head coach seat) is the decision-maker for Advisory accept/dismiss in the current UI — same rationale as the Responsibility integration. */
function resolveAdvisoryAttribution(world: GameWorld): StaffHumanEventAttribution {
  return { actorKind: 'USER_COACH', actorId: world.userCoachId }
}
