import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { injuryIdFromString } from '@/domain/ids'
import { createGameWorld, isPlayerAvailable } from './index'

describe('injury availability', () => {
  it('is derived from injury dates and preserves roster membership', () => {
    const world=createNewGame(); const player=Object.values(world.players)[0]!; const injured=createGameWorld({...world,countries:Object.values(world.countries),coaches:Object.values(world.coaches),players:Object.values(world.players),teams:Object.values(world.teams),competitions:Object.values(world.competitions),seasons:Object.values(world.seasons),games:Object.values(world.games),matchStatLogs:Object.values(world.matchStatLogsByGameId),seasonHistory:Object.values(world.seasonHistoryBySeasonId),injuries:[{id:injuryIdFromString('injury-test'),playerId:player.id,kind:'ankleSprain',severity:'minor',injuredOn:world.currentDate,expectedReturnDate:addDays(world.currentDate,3)}]})
    expect(isPlayerAvailable(injured,player.id)).toBe(false); expect(isPlayerAvailable(injured,player.id,addDays(world.currentDate,3))).toBe(true); expect(Object.values(injured.teams).some(team=>team.rosterPlayerIds.includes(player.id))).toBe(true)
  })
})
