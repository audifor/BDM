import type { GameId, TeamId } from '@/domain/ids'
import { gamePlanKey, resolveEffectiveTacticalPlan, type TeamGamePlan, type TeamRotationIntent, type TeamTacticalInstructions } from '@/domain/tactics'
import { updateGameWorld, type GameWorld } from '@/domain/world'

export function getTacticalDesignerState(world:GameWorld,teamId:TeamId){return world.tacticalPlansByTeamId[teamId]?.instructions}
export function setTacticalInstruction(world:GameWorld,teamId:TeamId,instructions:TeamTacticalInstructions):GameWorld{return updateGameWorld(world,{tacticalPlansByTeamId:{...world.tacticalPlansByTeamId,[teamId]:{teamId,instructions}}})}
export function getRotationPlan(world:GameWorld,teamId:TeamId){return world.rotationPlansByTeamId[teamId]}
export function updateRotationPlan(world:GameWorld,plan:TeamRotationIntent):GameWorld{return updateGameWorld(world,{rotationPlansByTeamId:{...world.rotationPlansByTeamId,[plan.teamId]:plan}})}
export function getGamePlan(world:GameWorld,gameId:GameId,teamId:TeamId){return world.gamePlansByKey[gamePlanKey(gameId,teamId)]}
export function updateGamePlan(world:GameWorld,plan:TeamGamePlan):GameWorld{return updateGameWorld(world,{gamePlansByKey:{...world.gamePlansByKey,[gamePlanKey(plan.gameId,plan.teamId)]:plan}})}
export function clearGamePlanOverride(world:GameWorld,gameId:GameId,teamId:TeamId):GameWorld{const plans={...world.gamePlansByKey};delete plans[gamePlanKey(gameId,teamId)];return updateGameWorld(world,{gamePlansByKey:plans})}
export function getEffectiveTacticalPlan(world:GameWorld,gameId:GameId,teamId:TeamId){const base=world.tacticalPlansByTeamId[teamId];if(!base)throw new Error(`Unknown team: ${teamId}`);return resolveEffectiveTacticalPlan(base.instructions,getGamePlan(world,gameId,teamId))}
