import type { GameWorld } from '@/domain/world'
import type { DelegationOutcome, ResponsibilityKind } from '@/domain/responsibility'
import { createStaffHumanEvent, SYSTEMIC_ATTRIBUTION, type StaffHumanEventAttribution } from '@/domain/staffHumanState'
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
  return applyStaffHumanEvent(world, context, event).world
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
