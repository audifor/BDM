import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { organizationIdForTeam } from '@/domain/ids'
import { getMarketKnowledge } from '@/domain/market'
import { initializeMarketAgents, receiveMarketSignal } from './MarketEngine'

describe('Wave 4 market core',()=>{
  it('creates deterministic agencies, shared agent portfolios, and sparse market knowledge',()=>{const first=initializeMarketAgents(createNewGame()),second=initializeMarketAgents(createNewGame());expect(first.agenciesById).toEqual(second.agenciesById);expect(first.agentsById).toEqual(second.agentsById);expect(first.playerRepresentations).toEqual(second.playerRepresentations);expect(Object.keys(first.agentsById).length).toBeLessThan(Object.keys(first.players).length);expect(first.marketKnowledge).toEqual([])})
  it('updates only the contacted organization market knowledge without reading market reality',()=>{const world=initializeMarketAgents(createNewGame()),team=Object.values(world.teams)[0]!,player=Object.values(world.players)[0]!,organizationId=organizationIdForTeam(team.id),before=world.marketKnowledge.length;const next=receiveMarketSignal(world,{id:'signal:1',organizationId,playerId:player.id,source:'AGENT',occurredOn:world.currentDate,reliability:.8,availability:'OPEN',expectedSalary:900_000});expect(next.marketKnowledge).toHaveLength(before+1);expect(getMarketKnowledge(next.marketKnowledge,organizationId,player.id)).toMatchObject({availability:'OPEN',expectedSalary:900_000});expect(next.marketRealityByPlayerId[player.id]).toEqual(world.marketRealityByPlayerId[player.id])})
})
