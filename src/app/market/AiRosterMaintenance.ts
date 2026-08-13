import { getFreeAgentMarketTerms, signFreeAgent } from './MarketService'
import { calculateBootstrapAbilityProxy } from '@/domain/player'
import { canTeamAffordAdditionalSalary, getFreeAgents, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import type { TeamId } from '@/domain/ids'
export interface AiRosterMaintenanceResult{readonly world:GameWorld;readonly unresolvedTeamIds:readonly TeamId[]}
/** Bootstrap offseason safeguard: Teams are processed by TeamId and sign only until five rostered players. */
export function maintainAiTeamMinimumRosters(world:GameWorld):AiRosterMaintenanceResult{const userId=getUserTeam(world)?.id;let current=world;const unresolved:TeamId[]=[];for(const team of Object.values(current.teams).filter(t=>t.id!==userId).sort((a,b)=>a.id.localeCompare(b.id))){while(current.teams[team.id]!.rosterPlayerIds.length<5){const candidate=getFreeAgents(current).map(player=>({player,terms:getFreeAgentMarketTerms(current,player.id)})).filter(({terms})=>canTeamAffordAdditionalSalary(current,team.id,terms.annualSalary)).sort((a,b)=>a.terms.annualSalary-b.terms.annualSalary||calculateBootstrapAbilityProxy(b.player.basketball.ratings)-calculateBootstrapAbilityProxy(a.player.basketball.ratings)||a.player.id.localeCompare(b.player.id))[0];if(!candidate)break;current=signFreeAgent(current,team.id,candidate.player.id)}if(current.teams[team.id]!.rosterPlayerIds.length<5)unresolved.push(team.id)}return{world:current,unresolvedTeamIds:unresolved}}
