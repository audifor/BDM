import { addYears } from '@/domain/date'
import { createPlayerContract } from '@/domain/contract'
import { contractIdFromString, playerTransactionIdFromString, type PlayerId, type TeamId } from '@/domain/ids'
import { calculateBootstrapAbilityProxy } from '@/domain/player'
import { canTeamAffordAdditionalSalary, getPlayerRosterTeamId, isPlayerFreeAgent, updateGameWorld, type GameWorld } from '@/domain/world'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { executeContractRelease } from './ContractReleaseService'
import { reviewClubManagementPlanning } from '@/app/gmPlanning'
export interface FreeAgentMarketTerms{readonly playerId:PlayerId;readonly annualSalary:number;readonly contractYears:number}
export const calculateBootstrapSalaryBase=(ability:number)=>100_000+Math.pow(Math.max(0,ability-40),2)*1_000
export function getFreeAgentMarketTerms(world:GameWorld,playerId:PlayerId,onDate=world.currentDate):FreeAgentMarketTerms{const player=world.players[playerId];if(!player||!isPlayerFreeAgent(world,playerId,onDate))throw new Error('Player is not a free agent');const ability=calculateBootstrapAbilityProxy(player.basketball.ratings);const variance=new SeededRandomSource(hashStringToSeed(`free-agent-market-salary-v1:${world.currentSeasonId}:${playerId}`)).nextFloat(.95,1.15);return{playerId,annualSalary:Math.max(1,Math.round(calculateBootstrapSalaryBase(ability)*variance/10_000)*10_000),contractYears:new SeededRandomSource(hashStringToSeed(`free-agent-market-term-v1:${world.currentSeasonId}:${playerId}`)).nextInt(1,4)}}
export function releasePlayer(world: GameWorld, teamId: TeamId, playerId: PlayerId): GameWorld {
  const result = executeContractRelease(world, teamId, playerId)
  if (result.status === 'RELEASED' || result.status === 'ALREADY_TERMINATED') return result.world
  throw new Error(result.reason)
}
export function signFreeAgent(world:GameWorld,teamId:TeamId,playerId:PlayerId,provenance:'MARKET'|'WORLD_REPAIR'='MARKET'):GameWorld{if(!world.teams[teamId]||!isPlayerFreeAgent(world,playerId))throw new Error('Player is not a free agent');const terms=getFreeAgentMarketTerms(world,playerId);if(!canTeamAffordAdditionalSalary(world,teamId,terms.annualSalary))throw new Error('Team cannot afford salary');const ordinal=Object.values(world.contractsById).filter(c=>c.playerId===playerId&&c.term.startsOn===world.currentDate).length+1;const contract=createPlayerContract({id:contractIdFromString(`contract:${playerId}:${teamId}:${world.currentDate}:${ordinal}`),playerId,teamId,kind:'standard',term:{startsOn:world.currentDate,expiresOn:addYears(world.currentDate,terms.contractYears)},compensation:{annualSalary:terms.annualSalary}});const changed=rebuild(world,[...Object.values(world.contractsById),contract],Object.values(world.teams).map(t=>t.id===teamId?{...t,rosterPlayerIds:[...t.rosterPlayerIds,playerId]}:t),[{id:playerTransactionIdFromString(`transaction:signedFreeAgent:${contract.id}`),playerId,kind:'signedFreeAgent' as const,occurredOn:world.currentDate,toTeamId:teamId,contractId:contract.id,provenance}]);return reviewClubManagementPlanning(changed,teamId,'CONTRACT_CHANGE').world}
function rebuild(world:GameWorld,contracts:readonly any[],teams:readonly any[],transactions:readonly any[],lineupsByTeamId:GameWorld['lineupsByTeamId']=world.lineupsByTeamId):GameWorld{return updateGameWorld(world,{contracts,teams,playerTransactions:[...Object.values(world.playerTransactionsById),...transactions],lineupsByTeamId})}
