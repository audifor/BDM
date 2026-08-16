import { getUserTeam } from '@/engine/calendar'
import { makeDraftSelection, progressDraftAi } from '@/engine/draft'
import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

/** Application boundary for a user draft selection; draft rules remain in Engine. */
export function selectDraftProspect(world: GameWorld, draftId: string, playerId: PlayerId): GameWorld {
  const userTeam = getUserTeam(world)
  if (userTeam === undefined) throw new Error('User coach does not have a team')
  return progressDraftAi(makeDraftSelection(world, draftId, userTeam.id, playerId), draftId)
}
