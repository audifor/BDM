import type { GameDate } from '@/domain/date'
import { getPlayerContractStatus, type PlayerContract } from '@/domain/contract'
import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'
export function getPlayerContracts(world:GameWorld,playerId:PlayerId):readonly PlayerContract[]{return Object.values(world.contractsById).filter(c=>c.playerId===playerId).sort((a,b)=>b.term.startsOn.localeCompare(a.term.startsOn)||a.id.localeCompare(b.id))}
export function getActivePlayerContract(world:GameWorld,playerId:PlayerId,onDate:GameDate=world.currentDate):PlayerContract|undefined{return getPlayerContracts(world,playerId).find(c=>getPlayerContractStatus(c,onDate)==='active')}
export const getCurrentPlayerContract=(world:GameWorld,playerId:PlayerId)=>getActivePlayerContract(world,playerId,world.currentDate)
