import { getFreeAgentMarketTerms, signFreeAgent } from './MarketService'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { organizationIdForTeam } from '@/domain/ids'
import { canTeamAffordAdditionalSalary, getFreeAgents, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import type { TeamId } from '@/domain/ids'
export interface AiRosterMaintenanceResult{readonly world:GameWorld;readonly unresolvedTeamIds:readonly TeamId[]}
export interface AiFreeAgentCandidate { readonly playerId: import('@/domain/ids').PlayerId; readonly annualSalary:number; readonly priorityScore:number; readonly desirability:number }
export function freeAgentDesirability(priorityScore:number,annualSalary:number):number{return priorityScore-annualSalary/100_000}
/** Bounded market ranking: talent is knowledge-derived while asking price stays objective. */
export function rankAiFreeAgentCandidates(world:GameWorld,teamId:TeamId):readonly AiFreeAgentCandidate[]{const organizationId=organizationIdForTeam(teamId),policy=world.organizationEvaluationPoliciesById[organizationId];return getFreeAgents(world).map(player=>{const terms=getFreeAgentMarketTerms(world,player.id),value=deriveOrganizationPlayerValuation({organizationId,playerId:player.id,knowledge:world.organizationKnowledge,currentDate:world.currentDate,context:'FREE_AGENCY',publicPosition:player.basketball.primaryPosition,policy});return{playerId:player.id,annualSalary:terms.annualSalary,priorityScore:value.priorityScore,desirability:freeAgentDesirability(value.priorityScore,terms.annualSalary)}}).sort((a,b)=>b.desirability-a.desirability||a.annualSalary-b.annualSalary||a.playerId.localeCompare(b.playerId))}
/** Bootstrap offseason safeguard: Teams are processed by TeamId and sign only until five rostered players. */
export function maintainAiTeamMinimumRosters(world:GameWorld):AiRosterMaintenanceResult{const userId=getUserTeam(world)?.id;let current=world;const unresolved:TeamId[]=[];for(const team of Object.values(current.teams).filter(t=>t.id!==userId).sort((a,b)=>a.id.localeCompare(b.id))){while(current.teams[team.id]!.rosterPlayerIds.length<5){const candidate=rankAiFreeAgentCandidates(current,team.id).find(item=>canTeamAffordAdditionalSalary(current,team.id,item.annualSalary));if(!candidate)break;current=signFreeAgent(current,team.id,candidate.playerId)}if(current.teams[team.id]!.rosterPlayerIds.length<5)unresolved.push(team.id)}return{world:current,unresolvedTeamIds:unresolved}}
