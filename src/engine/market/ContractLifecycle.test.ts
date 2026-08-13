import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addYears } from '@/domain/date'
import { getFreeAgents, getPlayerRosterTeamId, getPlayerTransactions } from '@/domain/world'
import { reconcileExpiredPlayerContracts } from './ContractLifecycle'
describe('ContractLifecycle',()=>{it('removes an expired contracted player once and makes them a free agent',()=>{const world=createNewGame();const contract=Object.values(world.contractsById)[0]!;const date=addYears(contract.term.expiresOn,1);const next=reconcileExpiredPlayerContracts(world,date);expect(getPlayerRosterTeamId(next,contract.playerId)).toBeUndefined();expect(getFreeAgents(next,date).some(p=>p.id===contract.playerId)).toBe(true);expect(getPlayerTransactions(next,contract.playerId)).toHaveLength(1);expect(reconcileExpiredPlayerContracts(next,date)).toEqual(next)})})
