import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { initializeBoardState } from '@/engine/board'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

describe('Board persistence',()=>{it('round-trips board state and legacy saves default safely',()=>{const base=createGameWorld(createValidGameWorldInput());const team=Object.values(base.teams).find((item)=>item.coachId!==undefined)!;const board=initializeBoardState(base,team.id);const save=serializeGameWorldV1(board,'2032-10-01T00:00:00.000Z');expect(deserializeGameWorldV1(save).boardStatesByTeamId).toEqual(board.boardStatesByTeamId);const legacy={...save,payload:{...save.payload}};delete (legacy.payload as {boardStates?:unknown}).boardStates;expect(deserializeGameWorldV1(legacy).boardStatesByTeamId).toEqual({})})})
