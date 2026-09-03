import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { createStaffConflict } from '@/domain/staffConflict'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

function worldWithConflict() { const world = createNewGame(); const team = getUserTeam(world)!; const [first, second] = Object.values(world.teamStaffAssignmentsById).filter((item) => item.teamId === team.id).map((item) => item.staffPersonId); const conflict = createStaffConflict({ id: 'staff-conflict:persistence', scopeKey: team.id, teamId: team.id, type: 'AUTHORITY', primaryCause: 'autonomyDeficit', startedOn: world.currentDate, lastEvaluatedOn: world.currentDate, status: 'ACTIVE', stage: 'ACTIVE', severity: 'SERIOUS', participants: [{ actorId: first!, role: 'PRIMARY', joinedOn: world.currentDate, state: { grievance: 70, willingnessToCompromise: 30, perceivedFairness: 25, emotionalInvestment: 75 } }, { actorId: second!, role: 'SECONDARY', joinedOn: world.currentDate, state: { grievance: 55, willingnessToCompromise: 45, perceivedFairness: 35, emotionalInvestment: 60 } }], sourceTriggerIds: ['trigger:persistence'] }); return updateGameWorld(world, { staffConflicts: [conflict] }) }
describe('StaffConflict persistence', () => {
  it('round-trips additive conflict state and legacy missing field stays empty', () => { const world = worldWithConflict(); const saved = serializeGameWorldV1(world, '2032-10-01T00:00:00.000Z'); expect(deserializeGameWorldV1(JSON.parse(JSON.stringify(saved))).staffConflictsById).toEqual(world.staffConflictsById); const payload = { ...saved.payload } as Record<string, unknown>; delete payload.staffConflicts; expect(deserializeGameWorldV1({ ...saved, payload }).staffConflictsById).toEqual({}) })
})
