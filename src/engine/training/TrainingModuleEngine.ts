import { classifyDailyLoad, createScheduledTrainingSession, createUserTrainingModule, trainingDefinitionById, type DailyLoadStatus, type ScheduledTrainingSession, type UserTrainingModule } from '@/domain/training'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { PlayerId, TeamId } from '@/domain/ids'
import { dailyScheduledLoad } from './ScheduledTrainingEngine'
import { scheduleTrainingSession } from './ScheduledTrainingEngine'

export function createOrUpdateUserTrainingModule(world: GameWorld, module: UserTrainingModule): GameWorld {
  const validated = createUserTrainingModule(module)
  return updateGameWorld(world, { userTrainingModulesById: { ...world.userTrainingModulesById, [validated.id]: validated } })
}

export function deleteUserTrainingModule(world: GameWorld, moduleId: string): GameWorld {
  const modules = { ...world.userTrainingModulesById }
  delete modules[moduleId]
  return updateGameWorld(world, { userTrainingModulesById: modules })
}

/**
 * Assigns a training module (built-in catalog definition id, or a user-created module id) to a player by
 * scheduling an individual session for them on the given date/time. Runs through the same collision-checked
 * scheduling path as any other session, so built-in and user-created modules execute through one engine.
 */
export function assignTrainingModuleToPlayer(
  world: GameWorld,
  input: { readonly teamId: TeamId; readonly playerId: PlayerId; readonly moduleId: string; readonly date: GameWorld['currentDate']; readonly startTime: string; readonly sessionId: string },
): GameWorld {
  const userModule = world.userTrainingModulesById[input.moduleId]
  const definitionId = userModule?.baseDefinitionId ?? input.moduleId
  const definition = trainingDefinitionById(definitionId)
  if (definition.scope === 'team') throw new RangeError('Cannot assign a team-only definition to individual training')
  const intensity = userModule?.intensity ?? definition.defaultIntensity
  const session: ScheduledTrainingSession = createScheduledTrainingSession({
    id: input.sessionId,
    teamId: input.teamId,
    date: input.date,
    startTime: input.startTime,
    durationMinutes: definition.durationMinutes,
    scope: 'individual',
    playerId: input.playerId,
    definitionId,
    intensity,
  })
  return scheduleTrainingSession(world, session)
}

/** Real day-level load classification for a team/date, derived from actually scheduled sessions. */
export function dailyLoadStatusForTeam(world: GameWorld, teamId: TeamId, date: GameWorld['currentDate']): DailyLoadStatus {
  return classifyDailyLoad(dailyScheduledLoad(world, teamId, date))
}
