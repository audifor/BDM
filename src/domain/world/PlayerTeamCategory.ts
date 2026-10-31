import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'

/**
 * Team-category policy shared by professional and college transactions.
 * A mixed-sex organization may own separate men's and women's Teams: it is
 * the destination Team, never the Organization or Staff gender, that matters.
 */
export function isPlayerTeamCategoryCompatible(
  world: Pick<GameWorld, 'players' | 'teams'>,
  playerId: PlayerId,
  teamId: TeamId,
): boolean {
  const player = world.players[playerId]
  const team = world.teams[teamId]
  return player !== undefined && team !== undefined && player.gender === team.gender
}

export function requirePlayerTeamCategory(
  world: Pick<GameWorld, 'players' | 'teams'>,
  playerId: PlayerId,
  teamId: TeamId,
): void {
  if (!isPlayerTeamCategoryCompatible(world, playerId, teamId)) {
    throw new RangeError('PLAYER_TEAM_CATEGORY_MISMATCH')
  }
}
