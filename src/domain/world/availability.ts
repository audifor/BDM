import type { GameDate } from '@/domain/date'
import { isInjuryActive, type InjuryRecord } from '@/domain/injury'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'
import { getTeamRoster } from './queries'
export function getActiveInjuryForPlayer(world:GameWorld,playerId:PlayerId,onDate:GameDate=world.currentDate):InjuryRecord|undefined{return Object.values(world.injuriesById).find((injury)=>injury.playerId===playerId&&isInjuryActive(injury,onDate))}
export const getCurrentPlayerInjury = (world: GameWorld, playerId: PlayerId): InjuryRecord | undefined => getActiveInjuryForPlayer(world, playerId, world.currentDate)
export function isPlayerAvailable(world:GameWorld,playerId:PlayerId,onDate:GameDate=world.currentDate):boolean{return getActiveInjuryForPlayer(world,playerId,onDate)===undefined}
export function getAvailableRosterPlayers(world:GameWorld,teamId:TeamId,onDate:GameDate=world.currentDate){return getTeamRoster(world,teamId).filter((player)=>isPlayerAvailable(world,player.id,onDate))}
