import { hasFullSemanticPersonality } from '@/domain/personality'
import { applyMoraleEventToWorld, type GameWorld } from '@/domain/world'
import { staffReactionRecordIdFor, type StaffHumanEvent } from '@/domain/staffHumanState'

/** Only facts directly asserted by a certified StaffHumanReaction record.
 * We do not translate arbitrary workload, recommendations or contract rumours
 * into a fabricated coach decision / press item / life event.
 */
const OBSERVED_KIND: Partial<Record<StaffHumanEvent['kind'], string>> = {
  professionalSuccess: 'PROFESSIONAL_REVIEW',
  professionalFailure: 'PROFESSIONAL_REVIEW',
  staffRoleImproved: 'ROLE_CHANGE',
  staffRoleReduced: 'ROLE_CHANGE',
}
const EVENT_DIRECTION: Partial<Record<StaffHumanEvent['kind'], 1 | -1>> = {
  professionalSuccess: 1,
  professionalFailure: -1,
  staffRoleImproved: 1,
  staffRoleReduced: -1,
}
const MAGNITUDE: Record<StaffHumanEvent['importance'], number> = {
  ROUTINE: 10,
  MEANINGFUL: 25,
  IMPORTANT: 50,
  CRITICAL: 85,
}

/** Observed staff outcomes already recorded by the canonical Staff pipeline
 * can modify existing full-50 PERSON profiles. Saves/old 8D records unaffected.
 * Called by both single-event and batch staff paths, with provenance check.
 */
export function applyObservedStaffPersonalityEvidence(
  before: GameWorld,
  after: GameWorld,
  events: readonly StaffHumanEvent[],
): GameWorld {
  let next = after
  const processed = new Set<string>()
  for (const event of events) {
    const observedKind = OBSERVED_KIND[event.kind]
    const direction = EVENT_DIRECTION[event.kind]
    if (observedKind === undefined || direction === undefined) continue
    const id = staffReactionRecordIdFor(event.staffId, event.contextId, event.sourceEventId, event.kind)
    if (processed.has(id) || before.staffReactionRecordsById[id] !== undefined
      || next.staffReactionRecordsById[id] === undefined) continue
    processed.add(id)
    const personality = next.personalitiesByPersonId[event.staffId]
    if (personality === undefined || !hasFullSemanticPersonality(personality)) continue
    const profile = next.staffPeopleById[event.staffId]
    const birth = (profile?.personId === undefined ? undefined : next.personsById[profile.personId]?.dateOfBirth)
      ?? profile?.identity.dateOfBirth
    if (birth === undefined || event.occurredOn <= birth || event.occurredOn > next.currentDate) continue
    next = applyMoraleEventToWorld(next, {
      id: `morale:staff-human:${id}`,
      personId: event.staffId,
      gameDate: event.occurredOn,
      source: 'professionalInteraction',
      delta: direction * MAGNITUDE[event.importance],
      context: {
        personalityEventKind: observedKind,
        staffReactionRecordId: id,
      },
    })
  }
  return next
}
