import type { Season } from '@/domain/season'
import type { GameWorld } from '@/domain/world'

/** The prototype creates one Season; its selection stays outside UI components. */
export function getCurrentSeason(world: GameWorld): Season {
  const season = world.seasons[world.currentSeasonId]
  if (season === undefined) {
    throw new Error('GameWorld has no Season')
  }

  return season
}
