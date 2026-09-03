import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createStaffHumanEvent } from '@/domain/staffHumanState'
import { staffConflictTriggerFromHumanEvent } from './StaffConflictTriggerRegistry'

function fixture() {
  const world = createNewGame(); const staff = Object.values(world.staffPeopleById)[0]!; const coach = Object.values(world.coaches)[0]!; const teamId = Object.values(world.teams)[0]!.id
  return { world, staffId: staff.id, coachId: coach.id, teamId }
}
function event(staffId: string, actorKind: 'USER_COACH' | 'OTHER_STAFF' | 'EXECUTIVE', actorId: string) {
  return createStaffHumanEvent({ id: `event:${actorKind}:${actorId}`, kind: 'importantRecommendationRejected', staffId: staffId as never, contextId: 'context:test' as never, occurredOn: '2032-10-01' as never, importance: 'IMPORTANT', sourceEventId: 'source:test', attribution: { actorKind, actorId }, payload: {} })
}
describe('StaffConflictTriggerRegistry actor resolution', () => {
  it('resolves real Staff, real user Coach, and Staff-backed EXECUTIVE actors only', () => { const value = fixture(); const otherStaffId = Object.values(value.world.staffPeopleById).find((person) => person.id !== value.staffId)!.id; expect(staffConflictTriggerFromHumanEvent(value.world, event(value.staffId, 'OTHER_STAFF', otherStaffId), value.teamId)).toBeDefined(); expect(staffConflictTriggerFromHumanEvent(value.world, event(value.staffId, 'USER_COACH', value.coachId), value.teamId)).toBeDefined(); expect(staffConflictTriggerFromHumanEvent(value.world, event(value.staffId, 'EXECUTIVE', otherStaffId), value.teamId)).toBeDefined() })
  it('fails closed for unknown and non-represented executive actors', () => { const value = fixture(); expect(staffConflictTriggerFromHumanEvent(value.world, event(value.staffId, 'OTHER_STAFF', 'unknown-actor'), value.teamId)).toBeUndefined(); expect(staffConflictTriggerFromHumanEvent(value.world, event(value.staffId, 'EXECUTIVE', value.coachId), value.teamId)).toBeUndefined() })
})
