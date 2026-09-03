import type { StaffHumanEvent, StaffHumanEventKind } from '@/domain/staffHumanState'
import type { StaffConflictPrimaryCause, StaffConflictType, StaffConflictTrigger } from '@/domain/staffConflict'
import type { GameWorld } from '@/domain/world'
export const STAFF_HUMAN_EVENT_CONFLICT_MAPPING: Readonly<Partial<Record<StaffHumanEventKind, { readonly type: StaffConflictType; readonly cause: StaffConflictPrimaryCause }>>> = {
  responsibilityRemoved: { type: 'RESPONSIBILITY', cause: 'responsibilityRemoved' }, responsibilityModeReduced: { type: 'AUTHORITY', cause: 'responsibilityReduced' }, responsibilityReassignedAway: { type: 'RESPONSIBILITY', cause: 'responsibilityReassigned' }, responsibilityScopeReduced: { type: 'RESPONSIBILITY', cause: 'responsibilityReduced' }, actionableRecommendationRejected: { type: 'PROFESSIONAL_METHOD', cause: 'recommendationRejected' }, importantRecommendationRejected: { type: 'PROFESSIONAL_METHOD', cause: 'recommendationRejected' }, recommendationPatternNegative: { type: 'RECOGNITION', cause: 'repeatedProfessionalDisregard' }, staffRoleReduced: { type: 'ROLE', cause: 'roleReduced' },
}
export function staffConflictTriggerFromHumanEvent(world: GameWorld, event: StaffHumanEvent, scopeKey: string): StaffConflictTrigger | undefined {
  const mapping = STAFF_HUMAN_EVENT_CONFLICT_MAPPING[event.kind]; const actorId = event.attribution.actorId
  if (mapping === undefined || actorId === undefined || !resolvesProfessionalActor(world, actorId, event.attribution.actorKind)) return undefined
  return { id: `staff-conflict-trigger:${event.id}`, occurredOn: event.occurredOn, scopeKey, teamId: scopeKey, subjectActorId: event.staffId, counterpartActorId: actorId, type: mapping.type, cause: mapping.cause, basePressure: event.importance === 'CRITICAL' ? 78 : event.importance === 'IMPORTANT' ? 68 : 55, sourceKind: 'staffHumanEvent', sourceId: event.sourceEventId, context: { humanEventKind: event.kind } }
}
/** Fail closed: only actor kinds backed by the corresponding canonical collection are interpersonal. */
export function resolvesProfessionalActor(world: GameWorld, actorId: string, actorKind: StaffHumanEvent['attribution']['actorKind']): boolean {
  return actorKind === 'OTHER_STAFF' ? world.staffPeopleById[actorId as never] !== undefined
    : actorKind === 'USER_COACH' ? world.coaches[actorId as never] !== undefined
      : actorKind === 'EXECUTIVE' ? world.staffPeopleById[actorId as never] !== undefined : false
}
