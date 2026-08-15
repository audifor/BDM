import type { GameWorld } from '@/domain/world'
import type { GameId, PlayerId, TeamId } from '@/domain/ids'
import type { MatchSimulation } from '@/engine/match'

export type ActionAvailability =
  | { readonly kind: 'enabled' }
  | { readonly kind: 'disabled'; readonly reason: string }

/** Real application context only. Routes and UI surfaces are intentionally excluded. */
export interface EntityActionEnvironment {
  readonly world: GameWorld
  readonly controlledTeamId?: TeamId
  readonly activeMatchSession?: {
    readonly gameId: GameId
    replacementCandidates(teamId: TeamId, playerOutId: PlayerId): readonly PlayerId[]
    applySubstitution(teamId: TeamId, playerOutId: PlayerId, playerInId: PlayerId): MatchSimulation
  }
  readonly permissions?: readonly string[]
}

export const actionEnabled = (): ActionAvailability => ({ kind: 'enabled' })

export function actionDisabled(reason: string): ActionAvailability {
  if (reason.trim().length === 0) throw new TypeError('Disabled action reason must be non-empty')
  return { kind: 'disabled', reason }
}
