import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'

/** Long-horizon training intent, separate from factual scheduled/executed sessions. */
export type StudioIntensity = 'light' | 'normal' | 'high'
export interface TrainingMacrocycle {
  readonly id: string
  readonly name: string
  readonly startDate: string
  readonly endDate: string
  readonly objective: string
}
export interface TrainingMesocycle {
  readonly id: string
  readonly macrocycleId: string
  readonly name: string
  readonly startDate: string
  readonly endDate: string
  readonly objective: string
  readonly moduleId: string
  /** Optional reference to a saved Tactics Designer play. Tactical match effects are not inferred. */
  readonly playId?: string
  readonly intensity: StudioIntensity
}
export interface TrainingIndividualGoal {
  readonly playerId: string
  readonly targetRating: string
  readonly targetValue: number
  readonly targetDate: string
  readonly note: string
}
export interface TrainingMentoringGroup {
  readonly id: string
  readonly mentorId: string
  readonly menteeIds: readonly string[]
  readonly focus: string
  readonly createdDate: string
}
export interface TrainingStudioPlan {
  readonly teamId: string
  readonly seasonId: string
  readonly macrocycles: readonly TrainingMacrocycle[]
  readonly mesocycles: readonly TrainingMesocycle[]
  readonly individualGoals: readonly TrainingIndividualGoal[]
  readonly mentoringGroups: readonly TrainingMentoringGroup[]
}
const iso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s
const dates = (item: { startDate: string; endDate: string }, name: string) => {
  if (!iso(item.startDate) || !iso(item.endDate) || item.startDate > item.endDate) throw new RangeError(name + ': invalid date range')
}
const unique = (items: readonly { id: string }[], label: string) => {
  if (items.some(item => !item.id.trim()) || new Set(items.map(item => item.id)).size !== items.length) throw new RangeError(label + ': invalid or duplicated ids')
}
export function createTrainingStudioPlan(value: TrainingStudioPlan): TrainingStudioPlan {
  if (!value.teamId.trim() || !value.seasonId.trim()) throw new RangeError('Missing team or season')
  unique(value.macrocycles, 'Macrocycles')
  unique(value.mesocycles, 'Mesocycles')
  unique(value.mentoringGroups, 'Mentoring')
  for (const phase of value.macrocycles) { dates(phase, 'Macrocycle'); if (!phase.name.trim()) throw new RangeError('Unnamed macrocycle') }
  for (const block of value.mesocycles) {
    dates(block, 'Mesocycle')
    const parent = value.macrocycles.find(phase => phase.id === block.macrocycleId)
    if (!parent || block.startDate < parent.startDate || block.endDate > parent.endDate) throw new RangeError('Mesocycle outside macrocycle')
    if ((block.playId !== undefined && !block.playId.trim()) || !block.name.trim() || !block.moduleId.trim() || !['light','normal','high'].includes(block.intensity)) throw new RangeError('Invalid mesocycle')
  }
  for (const goal of value.individualGoals) {
    if (!goal.playerId.trim() || !goal.targetRating.trim() || !iso(goal.targetDate) || !Number.isFinite(goal.targetValue) || goal.targetValue < 0 || goal.targetValue > 100) throw new RangeError('Invalid individual development goal')
  }
  for (const group of value.mentoringGroups) {
    if (!group.mentorId.trim() || !iso(group.createdDate) || !group.focus.trim() || !group.menteeIds.length || group.menteeIds.includes(group.mentorId) || new Set(group.menteeIds).size !== group.menteeIds.length) throw new RangeError('Invalid mentoring group')
  }
  return {
    ...value,
    macrocycles: value.macrocycles.map(phase => ({ ...phase })),
    mesocycles: value.mesocycles.map(block => ({ ...block })),
    individualGoals: value.individualGoals.map(goal => ({ ...goal })),
    mentoringGroups: value.mentoringGroups.map(group => ({ ...group, menteeIds: [...group.menteeIds] })),
  }
}
export function emptyTrainingStudioPlan(teamId: string, seasonId: string): TrainingStudioPlan {
  return { teamId, seasonId, macrocycles: [], mesocycles: [], individualGoals: [], mentoringGroups: [] }
}
export function putTrainingStudioPlan(world: GameWorld, plan: TrainingStudioPlan): GameWorld {
  const validated = createTrainingStudioPlan(plan)
  if (world.teams[validated.teamId as keyof typeof world.teams] === undefined) throw new RangeError('Training Studio team does not exist')
  for (const goal of validated.individualGoals) if (!world.players[goal.playerId as keyof typeof world.players]) throw new RangeError('Unknown development player')
  for (const group of validated.mentoringGroups) {
    const ids = [group.mentorId, ...group.menteeIds]
    if (ids.some(id => !world.teams[validated.teamId as keyof typeof world.teams]?.rosterPlayerIds.some(playerId => playerId === id))) throw new RangeError('Mentoring requires team roster players')
  }
  return updateGameWorld(world, { trainingStudioPlansByTeamId: { ...world.trainingStudioPlansByTeamId, [validated.teamId]: validated } })
}
