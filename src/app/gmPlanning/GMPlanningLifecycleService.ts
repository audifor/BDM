import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { reviewAiClubStrategies, reviewClubStrategy } from '@/engine/clubStrategy/ClubStrategyEngine'
import { reviewGMPlanWorkflows, type ReviewGMPlanWorkflowsResult } from './GMPlanWorkflowService'

export type GMPlanningCheckpointTrigger = 'INITIAL_SETUP' | 'PRESEASON' | 'MATERIAL_ROSTER_CHANGE' | 'MAJOR_INJURY' | 'CONTRACT_CHANGE' | 'EXPLICIT_REVIEW'

export interface ReviewClubManagementPlanningResult extends ReviewGMPlanWorkflowsResult {
  readonly teamId: TeamId
  readonly trigger: GMPlanningCheckpointTrigger
}

/** Composes the existing strategy, plan and workflow authorities at one explicit club checkpoint. */
export function reviewClubManagementPlanning(world: GameWorld, teamId: TeamId, trigger: GMPlanningCheckpointTrigger): ReviewClubManagementPlanningResult {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Unknown Team ${teamId}`)
  if (team.coachId === undefined) return { kind: 'AI_PLANNED_WORKFLOW', teamId, trigger, decisions: [], world }

  const strategyTrigger = trigger === 'INITIAL_SETUP' || trigger === 'PRESEASON'
    ? 'PRESEASON'
    : trigger === 'MATERIAL_ROSTER_CHANGE'
      ? 'MAJOR_ROSTER_CHANGE'
      : trigger === 'CONTRACT_CHANGE'
        ? 'CONTRACT_CHANGE'
        : 'SCHEDULED'
  const strategyReviewed = reviewClubStrategy(world, teamId, { trigger: strategyTrigger })
  const planTrigger = trigger === 'INITIAL_SETUP' ? 'ROUTINE_REVIEW'
    : trigger === 'PRESEASON' ? 'EXPLICIT_REEVALUATION'
      : trigger === 'MATERIAL_ROSTER_CHANGE' ? 'MATERIAL_ROSTER_CHANGE'
        : trigger === 'MAJOR_INJURY' ? 'MAJOR_INJURY'
        : trigger === 'CONTRACT_CHANGE' ? 'CONTRACT_CHANGE'
          : 'EXPLICIT_REEVALUATION'
  const result = reviewGMPlanWorkflows(strategyReviewed, teamId, planTrigger)
  return { ...result, teamId, trigger }
}

/** Final career-construction checkpoint. AI clubs are initialized in stable TeamId order. */
export function initializeAiClubManagementPlanning(world: GameWorld): GameWorld {
  const strategyReviewed = reviewAiClubStrategies(world, 'PRESEASON')
  return Object.values(strategyReviewed.teams)
    .filter((team) => team.coachId !== undefined && team.coachId !== strategyReviewed.userCoachId)
    .sort((left, right) => left.id.localeCompare(right.id))
    .reduce((current, team) => reviewGMPlanWorkflows(current, team.id, 'ROUTINE_REVIEW').world, strategyReviewed)
}

/** Rechecks only clubs whose canonical roster actually changed between two application states. */
export function reviewMaterialRosterChanges(before: GameWorld, after: GameWorld): GameWorld {
  const changedTeamIds = Object.values(after.teams)
    .filter((team) => team.coachId !== undefined && before.teams[team.id] !== undefined && before.teams[team.id]!.rosterPlayerIds.join('|') !== team.rosterPlayerIds.join('|'))
    .map((team) => team.id)
    .sort((left, right) => left.localeCompare(right))
  return changedTeamIds.reduce((current, teamId) => reviewClubManagementPlanning(current, teamId, 'MATERIAL_ROSTER_CHANGE').world, after)
}

/** The Injury domain's existing `serious` severity is its 22–60 day recovery band. */
export function reviewMajorInjuryChanges(before: GameWorld, after: GameWorld): GameWorld {
  const injuredTeamIds = [...new Set(Object.values(after.injuriesById)
    .filter((injury) => injury.severity === 'serious' && before.injuriesById[injury.id] === undefined)
    .flatMap((injury) => Object.values(after.teams).filter((team) => team.rosterPlayerIds.includes(injury.playerId)).map((team) => team.id)))].sort((left, right) => left.localeCompare(right))
  return injuredTeamIds.reduce((current, teamId) => reviewClubManagementPlanning(current, teamId, 'MAJOR_INJURY').world, after)
}
