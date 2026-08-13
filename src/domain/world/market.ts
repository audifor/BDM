import { getPlayerContractStatus } from '@/domain/contract'
import type { GameDate } from '@/domain/date'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'
export function getPlayerRosterTeamId(world:GameWorld,playerId:PlayerId):TeamId|undefined{return Object.values(world.teams).find(team=>team.rosterPlayerIds.includes(playerId))?.id}
export function isPlayerFreeAgent(world:GameWorld,playerId:PlayerId,onDate:GameDate=world.currentDate):boolean{return getPlayerRosterTeamId(world,playerId)===undefined&&!Object.values(world.contractsById).some(c=>c.playerId===playerId&&['active','scheduled'].includes(getPlayerContractStatus(c,onDate)))}
export function getFreeAgents(world:GameWorld,onDate:GameDate=world.currentDate){return Object.values(world.players).filter(p=>isPlayerFreeAgent(world,p.id,onDate)).sort((a,b)=>a.basketball.primaryPosition.localeCompare(b.basketball.primaryPosition)||a.lastName.localeCompare(b.lastName)||a.id.localeCompare(b.id))}
export function getPlayerTransactions(world:GameWorld,playerId:PlayerId){return Object.values(world.playerTransactionsById).filter(t=>t.playerId===playerId).sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn)||a.id.localeCompare(b.id))}
