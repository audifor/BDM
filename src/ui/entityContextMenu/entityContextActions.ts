import type { EntityRef } from '@/app/entityActions/EntityRef'
import type { CompetitionId, PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { EntityDestination } from '@/ui/navigation/entityNavigation'

export interface EntityContextAction {
  readonly id: 'openEntity'
  readonly label: string
  readonly destination: EntityDestination
}

/** Resolves only destinations that the current application can actually open. */
export function resolveEntityContextActions(world: GameWorld, entity: EntityRef): readonly EntityContextAction[] {
  if (entity.type === 'player') { const playerId = entity.id as PlayerId; if (world.players[playerId] !== undefined) return [{ id: 'openEntity', label: 'Open profile', destination: { type: 'player', playerId, section: 'overview' } }] }
  if (entity.type === 'team') { const teamId = entity.id as TeamId; if (world.teams[teamId] !== undefined) return [{ id: 'openEntity', label: 'Open team', destination: { type: 'team', teamId, section: 'overview' } }] }
  if (entity.type === 'competition') { const competitionId = entity.id as CompetitionId; if (world.competitions[competitionId] !== undefined) return [{ id: 'openEntity', label: 'Open competition', destination: { type: 'competition', competitionId, section: 'overview' } }] }
  return []
}
