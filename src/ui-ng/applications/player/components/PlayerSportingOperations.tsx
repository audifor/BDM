import { useMemo } from 'react'

import { useGameStore } from '@/stores/gameStore'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { buildPlayerSportingOperations } from '@/ui-ng/applications/player/data/playerSportingOperations'
import {
  navigateToDirectSigningPlayer,
  navigateToPlayerTrade,
  navigateToPortalPlayer,
  navigateToRecruitingPlayer,
} from '@/ui-ng/workspace/workspaceApps'

export function PlayerSportingOperations() {
  const { model } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const actions = useMemo(
    () => world === null || model === null ? [] : buildPlayerSportingOperations(world, model.identity.playerId),
    [model, world],
  )
  if (actions.length === 0 || model === null) return null

  return (
    <section aria-label="Sporting operations" className="po-cs-card po-cs-operations" data-testid="player-sporting-operations">
      <header className="po-cs-card__header"><h2>OPERACIONES</h2><span>Accion contextual</span></header>
      <div className="po-cs-operations__actions">
        {actions.map((action) => {
          const onClick = action.kind === 'direct-signing'
            ? () => navigateToDirectSigningPlayer(model.identity.playerId)
            : action.kind === 'trade'
              ? () => navigateToPlayerTrade(model.identity.playerId)
              : action.kind === 'recruiting'
                ? () => navigateToRecruitingPlayer(model.identity.playerId)
                : () => navigateToPortalPlayer(model.identity.playerId)
          return action.enabled ? (
            <button className="ng-canon__action" data-testid={`player-operation-${action.kind}`} key={action.kind} onClick={onClick} type="button">
              <strong>{action.label}</strong><small>{action.detail}</small>
            </button>
          ) : (
            <div className="ng-canon__note" data-testid={`player-operation-${action.kind}-blocked`} key={action.kind}>
              <strong>{action.label}</strong><small>{action.reason ?? action.detail}</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}
