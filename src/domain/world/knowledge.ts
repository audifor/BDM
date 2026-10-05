import type { OrganizationId, PlayerId } from '@/domain/ids'
import type { OrganizationKnowledge } from '@/domain/knowledge'
import type { GameWorld } from './GameWorld'
export function getOrganizationKnowledge(world: GameWorld, organizationId: OrganizationId, playerId: PlayerId): OrganizationKnowledge | undefined {
  return world.organizationKnowledge.find((knowledge) => knowledge.organizationId === organizationId && knowledge.subjectPlayerId === playerId)
}
