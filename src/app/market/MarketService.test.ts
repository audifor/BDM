import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getCurrentPlayerContract, getPlayerRosterTeamId, isPlayerFreeAgent } from '@/domain/world'
import { getFreeAgentMarketTerms, releasePlayer, signFreeAgent } from './MarketService'
describe('MarketService',()=>{it('releases then signs a player through canonical contracts and transactions',()=>{const world=createNewGame();const team=Object.values(world.teams)[0]!;const playerId=team.rosterPlayerIds[0]!;const released=releasePlayer(world,team.id,playerId);expect(isPlayerFreeAgent(released,playerId)).toBe(true);expect(getCurrentPlayerContract(released,playerId)).toBeUndefined();expect(getFreeAgentMarketTerms(released,playerId)).toEqual(getFreeAgentMarketTerms(released,playerId));const signed=signFreeAgent(released,team.id,playerId);expect(getPlayerRosterTeamId(signed,playerId)).toBe(team.id);expect(isPlayerFreeAgent(signed,playerId)).toBe(false)})})
