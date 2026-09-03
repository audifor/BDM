import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { updateGameWorld } from '@/domain/world'
import { applyStaffConflictTrigger, progressStaffConflicts } from './StaffConflictEngine'

function fixture() { const world = createNewGame(); const team = getUserTeam(world)!; const staff = Object.values(world.teamStaffAssignmentsById).filter((item) => item.teamId === team.id).slice(0, 2).map((item) => item.staffPersonId); return { world, team, first: staff[0]!, second: staff[1]! } }
function trigger(world: ReturnType<typeof fixture>, pressure = 80) { return { id: 'trigger:conflict:one', occurredOn: world.world.currentDate, scopeKey: world.team.id as string, teamId: world.team.id as string, subjectActorId: world.first as string, counterpartActorId: world.second as string, type: 'PROFESSIONAL_METHOD' as const, cause: 'recommendationRejected' as const, basePressure: pressure, sourceKind: 'test' } }
describe('StaffConflictEngine', () => {
  it('does not create a conflict from a low trigger in a healthy relationship', () => { const value = fixture(); expect(Object.keys(applyStaffConflictTrigger(value.world, trigger(value, 30)).staffConflictsById)).toHaveLength(0) })
  it('creates one sparse episode, groups related triggers, and is idempotent', () => { const value = fixture(); const first = applyStaffConflictTrigger(value.world, trigger(value)); const grouped = applyStaffConflictTrigger(first, { ...trigger(value), id: 'trigger:conflict:two', cause: 'methodDisagreement' }); const replay = applyStaffConflictTrigger(grouped, { ...trigger(value), id: 'trigger:conflict:two', cause: 'methodDisagreement' }); expect(Object.keys(grouped.staffConflictsById)).toHaveLength(1); expect(replay).toBe(grouped) })
  it('only changes professional relationship facets and never personalCloseness', () => { const value = fixture(); const next = applyStaffConflictTrigger(value.world, trigger(value)); expect(next.relationshipsByKey[`${value.first}->${value.second}`]!.dimensions!.personalCloseness).toBe(0) })
  it('does not progress resolved episodes', () => { const value = fixture(); const created = applyStaffConflictTrigger(value.world, trigger(value)); const conflict = Object.values(created.staffConflictsById)[0]!; const resolved = updateGameWorld(created, { staffConflicts: [{ ...conflict, status: 'RESOLVED', stage: 'RESOLVED', resolvedOn: created.currentDate, resolution: { type: 'FADED', resolvedOn: created.currentDate } }] }); expect(progressStaffConflicts(resolved).staffConflictsById[conflict.id]).toEqual(resolved.staffConflictsById[conflict.id]) })
})
