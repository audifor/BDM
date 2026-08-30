import { classifyDailyLoad, createScheduledTrainingSession, createUserTrainingModule, isPositionEligible, trainingDefinitionById, type DailyLoadStatus, type ScheduledTrainingSession, type TrainingDefinition, type TrainingIntensity, type UserTrainingModule } from '@/domain/training'
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
 * Resolves a training module id — a built-in catalog definition id, or a user-created module id —
 * to its underlying base TrainingDefinition and the intensity that should be used to execute it.
 * This is the single resolution path shared by individual assignment, Team planner scheduling,
 * and any other module-consuming flow, so built-in and user-created modules always execute
 * through one canonical engine rather than parallel authorities.
 */
export function resolveTrainingModule(world: GameWorld, moduleId: string): { readonly definition: TrainingDefinition; readonly intensity: TrainingIntensity; readonly scope: TrainingDefinition['scope'] } {
  const userModule = world.userTrainingModulesById[moduleId]
  const definitionId = userModule?.baseDefinitionId ?? moduleId
  const definition = trainingDefinitionById(definitionId)
  return { definition, intensity: userModule?.intensity ?? definition.defaultIntensity, scope: userModule?.scope ?? definition.scope }
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
  const { definition, intensity, scope } = resolveTrainingModule(world, input.moduleId)
  if (scope === 'team') throw new RangeError('Cannot assign a team-only module to individual training')
  const player = world.players[input.playerId]
  if (player !== undefined && !isPositionEligible(definition, player.basketball.primaryPosition)) {
    throw new RangeError(`Player position ${player.basketball.primaryPosition} is not eligible for ${definition.name}`)
  }
  const session: ScheduledTrainingSession = createScheduledTrainingSession({
    id: input.sessionId,
    teamId: input.teamId,
    date: input.date,
    startTime: input.startTime,
    durationMinutes: definition.durationMinutes,
    scope: 'individual',
    playerId: input.playerId,
    definitionId: definition.id,
    intensity,
  })
  return scheduleTrainingSession(world, session)
}

/**
 * Schedules a team training session from a training module id (built-in catalog definition id, or a
 * user-created team-scoped module id). Used by the Team planner so user-created team modules execute
 * through the exact same canonical scheduling/execution path as built-in definitions.
 */
export function scheduleTeamModuleSession(
  world: GameWorld,
  input: { readonly teamId: TeamId; readonly moduleId: string; readonly date: GameWorld['currentDate']; readonly startTime: string; readonly durationMinutes: number; readonly sessionId: string },
): GameWorld {
  const { definition, intensity, scope } = resolveTrainingModule(world, input.moduleId)
  if (scope === 'individual') throw new RangeError('Cannot schedule an individual-only module as a team session')
  const session: ScheduledTrainingSession = createScheduledTrainingSession({
    id: input.sessionId,
    teamId: input.teamId,
    date: input.date,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    scope: 'team',
    definitionId: definition.id,
    intensity,
  })
  return scheduleTrainingSession(world, session)
}

/** Real day-level load classification for a team/date, derived from actually scheduled sessions. */
export function dailyLoadStatusForTeam(world: GameWorld, teamId: TeamId, date: GameWorld['currentDate']): DailyLoadStatus {
  return classifyDailyLoad(dailyScheduledLoad(world, teamId, date))
}
