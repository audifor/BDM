import { useMemo } from 'react'

import type { PlayerId } from '@/domain/ids'
import { useGameStore } from '@/stores/gameStore'

import {
  buildPlayerWorkspaceModel,
  defaultPlayerIdForNg,
} from './buildPlayerWorkspaceModel'
import type { PlayerWorkspaceEmptyState, PlayerWorkspaceModel } from './playerWorkspaceModel'
import { useNgPlayerSelectionStore } from '@/ui-ng/stores/ngPlayerSelectionStore'

export interface PlayerWorkspaceState {
  readonly model: PlayerWorkspaceModel | null
  readonly emptyState: PlayerWorkspaceEmptyState | null
  readonly playerId: PlayerId | null
  readonly setPlayerId: (playerId: PlayerId) => void
}

function resolvePlayerId(
  world: NonNullable<ReturnType<typeof useGameStore.getState>['world']>,
  selectedPlayerId: PlayerId | null,
  urlPlayerId: string | null,
): PlayerId | undefined {
  if (urlPlayerId !== null && world.players[urlPlayerId as PlayerId] !== undefined) {
    return urlPlayerId as PlayerId
  }
  if (selectedPlayerId !== null && world.players[selectedPlayerId] !== undefined) {
    return selectedPlayerId
  }
  return defaultPlayerIdForNg(world)
}

export function usePlayerWorkspaceModel(urlPlayerId: string | null = null): PlayerWorkspaceState {
  const world = useGameStore((state) => state.world)
  const selectedPlayerId = useNgPlayerSelectionStore((state) => state.selectedPlayerId)
  const setSelectedPlayerId = useNgPlayerSelectionStore((state) => state.setSelectedPlayerId)

  const playerId = useMemo(() => {
    if (world === null) return null
    return resolvePlayerId(world, selectedPlayerId, urlPlayerId) ?? null
  }, [selectedPlayerId, urlPlayerId, world])

  const model = useMemo(() => {
    if (world === null || playerId === null) return null
    return buildPlayerWorkspaceModel(world, playerId) ?? null
  }, [playerId, world])

  const emptyState = useMemo((): PlayerWorkspaceEmptyState | null => {
    if (world === null) {
      return {
        kind: 'no-world',
        message: 'Load or start a career to view player data.',
      }
    }
    if (playerId === null) {
      return {
        kind: 'no-player',
        message: 'No player is available in the current game state.',
      }
    }
    if (model === null) {
      return {
        kind: 'player-not-found',
        message: 'The selected player no longer exists.',
      }
    }
    return null
  }, [model, playerId, world])

  return {
    model,
    emptyState,
    playerId,
    setPlayerId: setSelectedPlayerId,
  }
}
