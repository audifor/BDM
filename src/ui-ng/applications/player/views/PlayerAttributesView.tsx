import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { PlayerCourtsideAttributes } from '@/ui-ng/applications/player/views/PlayerCourtsideAttributes'
import { PlayerOpponentAttributes } from '@/ui-ng/applications/player/views/PlayerOpponentAttributes'

/**
 * PLAYER Attributes renders a single Courtside experience:
 * - own roster: canonical 80-value manager board
 * - external players: knowledge-authorized scouting projection
 * No raw Player Truth crosses from the first branch to the second.
 */
export function PlayerAttributesView() {
  const { model } = usePlayerWorkspace()
  if (model === null) return null
  if (model.knowledgeAccess.kind !== 'own-roster') return <PlayerOpponentAttributes />

  return <div className="pac-workspace" data-ng-region="player-attributes">
    <PlayerCourtsideAttributes />
  </div>
}
