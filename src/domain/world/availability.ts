import type { GameDate } from '@/domain/date'
import { isInjuryActive, type InjuryRecord } from '@/domain/injury'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'
import { injuriesByPlayer } from './collectionIndexes'
import { getTeamRoster } from './queries'
/** Historical source records remain canonical; the shared index follows collection identity. */
export function getInjuriesForPlayer(world: GameWorld, playerId: PlayerId): readonly InjuryRecord[] {
  return injuriesByPlayer(world.injuriesById).get(playerId) ?? []
}
export function getActiveInjuryForPlayer(world:GameWorld,playerId:PlayerId,onDate:GameDate=world.currentDate):InjuryRecord|undefined{return (injuriesByPlayer(world.injuriesById).get(playerId)??[]).find((injury)=>isInjuryActive(injury,onDate))} // WSR2.1: the player's injuries, same first match
export const getCurrentPlayerInjury = (world: GameWorld, playerId: PlayerId): InjuryRecord | undefined => getActiveInjuryForPlayer(world, playerId, world.currentDate)
export function isPlayerAvailable(world:GameWorld,playerId:PlayerId,onDate:GameDate=world.currentDate):boolean{return getActiveInjuryForPlayer(world,playerId,onDate)===undefined}
export function getAvailableRosterPlayers(world:GameWorld,teamId:TeamId,onDate:GameDate=world.currentDate){return getTeamRoster(world,teamId).filter((player)=>isPlayerAvailable(world,player.id,onDate))}
