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

/**
 * Explicit-acceptance-only application boundary for a Wave 3 `OppositionScoutingReport`
 * (docs/STAFF_SYSTEM_V2.md §10). Never auto-applied — this is the ONLY function that copies a
 * report's recommendations into the existing `TeamGamePlan.tacticalOverride`, and only when the
 * caller (a real user/app acceptance action) explicitly invokes it. Copies only fields that map
 * cleanly onto the existing model:
 * - `recommendedPaceAdjustment` -> `tacticalOverride.pace`
 * - `recommendedDefensiveEmphasis: 'interior'` -> `tacticalOverride.defense.interior` bumped up one bounded level
 * - `recommendedDefensiveEmphasis: 'perimeter'` -> `tacticalOverride.defense.perimeter` bumped up one bounded level
 * Preserves every other existing override field (`shotProfile`, `featuredPlayerId`, `matchups`,
 * `rotationOverride`) untouched. `flaggedPlayerIds` are NOT written into `featuredPlayerId` or a
 * fabricated matchup — they remain advisory-only information until a valid existing matchup
 * workflow explicitly maps them (out of Wave 3 scope). Touches only `gamePlansByKey` — never
 * rotation, `MatchSession`, resolved sporting history, or in-match RNG.
 */
export function acceptOppositionScoutingReport(world: GameWorld, reportId: string): GameWorld {
  const report = world.oppositionScoutingReportsById[reportId]
  if (report === undefined) throw new Error(`Unknown opposition scouting report: ${reportId}`)
  const existingPlan = getGamePlan(world, report.gameId, report.teamId)
  const existingOverride = existingPlan?.tacticalOverride
  const defenseOverride = report.recommendedDefensiveEmphasis === undefined
    ? existingOverride?.defense
    : {
        interior: existingOverride?.defense?.interior ?? 0,
        perimeter: existingOverride?.defense?.perimeter ?? 0,
        [report.recommendedDefensiveEmphasis]: clampTacticalLevel((existingOverride?.defense?.[report.recommendedDefensiveEmphasis] ?? 0) + 1),
      }
  const tacticalOverride = {
    ...existingOverride,
    ...(report.recommendedPaceAdjustment === undefined ? {} : { pace: report.recommendedPaceAdjustment }),
    ...(defenseOverride === undefined ? {} : { defense: defenseOverride }),
  }
  const plan: TeamGamePlan = { ...existingPlan, gameId: report.gameId, teamId: report.teamId, ...(Object.keys(tacticalOverride).length === 0 ? {} : { tacticalOverride }) }
  return updateGamePlan(world, plan)
}

function clampTacticalLevel(value: number): -2 | -1 | 0 | 1 | 2 {
  return Math.max(-2, Math.min(2, value)) as -2 | -1 | 0 | 1 | 2
}
