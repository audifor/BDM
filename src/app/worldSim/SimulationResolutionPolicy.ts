import type { SimulateMatchOptions } from '@/engine/match'
import type { Game } from '@/domain/game'
import type { CompetitionId, GameId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'

export type SimulationDetail = NonNullable<SimulateMatchOptions['simulationDetail']>
/** Command-scoped preferences. Derived decisions and detail are never persisted in GameWorld. */
export interface SimulationResolutionContext {
  /** Debug/reference validation choice, independent of sporting resolution detail. */
  readonly dailyValidationMode?: 'full' | 'incremental'
  readonly forceDetail?: SimulationDetail
  readonly observedGameIds?: readonly GameId[]
  readonly followedTeamIds?: readonly TeamId[]
  readonly followedCompetitionIds?: readonly CompetitionId[]
}

/** One production authority, independent of fixture IDs, hardware and RNG. */
export function resolveSimulationDetail(world: GameWorld, game: Game, context: SimulationResolutionContext = {}): SimulationDetail {
  if (context.forceDetail !== undefined) return context.forceDetail
  const user = getUserTeam(world)
  if (user !== undefined && (game.homeTeamId === user.id || game.awayTeamId === user.id)) return 'FULL'
  if (context.observedGameIds?.includes(game.id) || Object.values(world.scoutingAssignmentsById).some(assignment => assignment.missionType === 'LIVE_GAME' && assignment.status === 'ACTIVE' && assignment.gameId === game.id)) return 'FULL'
  if (user !== undefined && world.competitions[game.competitionId]?.participantTeamIds.includes(user.id)) return 'STANDARD'
  if (context.followedCompetitionIds?.includes(game.competitionId) || context.followedTeamIds?.some(id => id === game.homeTeamId || id === game.awayTeamId)) return 'STANDARD'
  return 'BACKGROUND'
}
