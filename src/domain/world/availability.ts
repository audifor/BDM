import type { GameDate } from '@/domain/date'
import { isInjuryActive, type InjuryRecord } from '@/domain/injury'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'
import { getTeamRoster } from './queries'
const injuriesByPlayer = new WeakMap<GameWorld['injuriesById'], ReadonlyMap<PlayerId, readonly InjuryRecord[]>>()
/** Historical source records remain canonical; this lookup is rebuilt only when the collection changes. */
export function getInjuriesForPlayer(world: GameWorld, playerId: PlayerId): readonly InjuryRecord[] {
  let index = injuriesByPlayer.get(world.injuriesById)
  if (index === undefined) {
    const records = new Map<PlayerId, InjuryRecord[]>()
    for (const injury of Object.values(world.injuriesById)) {
      const playerRecords = records.get(injury.playerId) ?? []
      playerRecords.push(injury)
      records.set(injury.playerId, playerRecords)
    }
    index = records
    injuriesByPlayer.set(world.injuriesById, index)
  }
  return index.get(playerId) ?? []
}
export function getActiveInjuryForPlayer(world: GameWorld, playerId: PlayerId, onDate: GameDate = world.currentDate): InjuryRecord | undefined {
  return getInjuriesForPlayer(world, playerId).find(injury => isInjuryActive(injury, onDate))
}
export const getCurrentPlayerInjury = (world: GameWorld, playerId: PlayerId): InjuryRecord | undefined => getActiveInjuryForPlayer(world, playerId, world.currentDate)
export function isPlayerAvailable(world:GameWorld,playerId:PlayerId,onDate:GameDate=world.currentDate):boolean{return getActiveInjuryForPlayer(world,playerId,onDate)===undefined}
export function getAvailableRosterPlayers(world:GameWorld,teamId:TeamId,onDate:GameDate=world.currentDate){return getTeamRoster(world,teamId).filter((player)=>isPlayerAvailable(world,player.id,onDate))}
