import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays, addYears } from '@/domain/date'
import { assignLineupSlot, createDefaultTeamLineup, getLineupAssignments } from '@/domain/tactics'
import { updateGameWorld } from '@/domain/world'
import { getFreeAgents, getPlayerRosterTeamId, getPlayerTransactions } from '@/domain/world'
import { reconcileExpiredPlayerContracts } from './ContractLifecycle'
describe('ContractLifecycle',()=>{
it('removes an expired contracted player once and makes them a free agent',()=>{const world=createNewGame();const contract=Object.values(world.contractsById)[0]!;const date=addYears(contract.term.expiresOn,1);const next=reconcileExpiredPlayerContracts(world,date);expect(getPlayerRosterTeamId(next,contract.playerId)).toBeUndefined();expect(getFreeAgents(next,date).some(p=>p.id===contract.playerId)).toBe(true);expect(getPlayerTransactions(next,contract.playerId)).toHaveLength(1);expect(reconcileExpiredPlayerContracts(next,date)).toEqual(next)})
it('clears an expired player from the saved lineup while preserving other assignments',()=>{const base=createNewGame();const contracts=Object.values(base.contractsById).sort((a,b)=>a.term.expiresOn.localeCompare(b.term.expiresOn));const contract=contracts.find((item)=>contracts.some((other)=>other.teamId===item.teamId&&other.playerId!==item.playerId&&other.term.expiresOn>item.term.expiresOn))!;const team=base.teams[contract.teamId]!;const remainingContract=contracts.find((item)=>item.teamId===team.id&&item.term.expiresOn>contract.term.expiresOn)!;const remaining=remainingContract.playerId;let lineup=createDefaultTeamLineup(team.id);lineup=assignLineupSlot(lineup,'PG',contract.playerId);lineup=assignLineupSlot(lineup,'SG',remaining);const world=updateGameWorld(base,{lineupsByTeamId:{...base.lineupsByTeamId,[team.id]:lineup}});const next=reconcileExpiredPlayerContracts(world,addDays(contract.term.expiresOn,1));const assignments=getLineupAssignments(next.lineupsByTeamId[team.id]!);expect(assignments.some((item)=>item.playerId===contract.playerId)).toBe(false);expect(assignments).toContainEqual({slot:'SG',playerId:remaining})})
})
