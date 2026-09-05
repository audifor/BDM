import { addDays, type GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import { trainingDefinitionById, type TrainingFocus } from '@/domain/training'
import type { GameWorld } from '@/domain/world'
import { canTeamTrainOnDate } from './TrainingEngine'
import { scheduleTeamModuleSession } from './TrainingModuleEngine'

/** Stable catalog module used when the planner fills a week from the team's current focus. */
export function automaticTeamTrainingDefinitionId(focus: TrainingFocus): string {
  switch (focus) {
    case 'balanced':
      return 'teamCohesion'
    case 'shooting':
      return 'threePoint'
    case 'finishing':
      return 'rimFinishing'
    case 'playmaking':
      return 'passing'
    case 'perimeterDefense':
      return 'perimeterDefense'
    case 'interiorDefense':
      return 'interiorDefense'
    case 'rebounding':
      return 'defensiveRebounding'
    case 'athleticism':
      return 'conditioning'
  }
}

function hasScheduledTeamSession(world: GameWorld, teamId: TeamId, date: GameDate): boolean {
  return Object.values(world.scheduledTrainingSessionsById).some(
    (session) =>
      session.teamId === teamId &&
      session.date === date &&
      session.scope === 'team' &&
      session.status === 'scheduled',
  )
}

/**
 * Fills future, non-match days of the given Monday-Sunday week with one team session
 * using the team's current plan intensity and focus. Existing team sessions are left intact.
 * Match days use the same `canTeamTrainOnDate` rule as the rest of training.
 */
export function scheduleAutomaticTeamTrainingWeek(
  world: GameWorld,
  input: { readonly teamId: TeamId; readonly weekStart: GameDate },
): GameWorld {
  const plan = world.trainingPlansByTeamId[input.teamId]
  if (plan === undefined) throw new RangeError(`Unknown team training plan: ${input.teamId}`)
  const definitionId = automaticTeamTrainingDefinitionId(plan.focus)
  const definition = trainingDefinitionById(definitionId)
  let next = world
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(input.weekStart, offset)
    if (date <= next.currentDate) continue
    if (!canTeamTrainOnDate(next, input.teamId, date)) continue
    if (hasScheduledTeamSession(next, input.teamId, date)) continue
    next = scheduleTeamModuleSession(next, {
      teamId: input.teamId,
      moduleId: definitionId,
      date,
      startTime: '09:00',
      durationMinutes: definition.durationMinutes,
      sessionId: `auto:${input.teamId}:${date}`,
      intensity: plan.intensity,
    })
  }
  return next
}
