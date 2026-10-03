import type { OrganizationId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import type { ScoutingTerritory, ScoutingTerritoryAssignment } from '@/domain/scouting'
import type { ScoutingTerritoryCoverage } from '@/engine/scouting/ScoutingTerritoryOperations'
import type { GameWorld } from '@/domain/world'
import { createScoutingTerritoryAssignment as createTerritoryOperation, endScoutingTerritoryAssignment as endTerritoryOperation, getScoutingTerritoryCoverage as deriveTerritoryCoverage } from '@/engine/scouting/ScoutingTerritoryOperations'

export type { ScoutingTerritoryCoverage } from '@/engine/scouting/ScoutingTerritoryOperations'

export function createScoutingTerritoryAssignment(world: GameWorld, input: { readonly requestingTeamId: TeamId; readonly scoutStaffId: StaffPersonId; readonly territory: ScoutingTerritory }): GameWorld {
  return createTerritoryOperation(world, input)
}

export function endScoutingTerritoryAssignment(world: GameWorld, assignmentId: string): GameWorld {
  return endTerritoryOperation(world, assignmentId)
}

export function getScoutingTerritoryAssignments(world: GameWorld, teamId: TeamId): readonly ScoutingTerritoryAssignment[] {
  return Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.requestingTeamId === teamId).sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
}

export function getOrganizationPlayerAwareness(world: GameWorld, organizationId: OrganizationId, playerId?: PlayerId) {
  return Object.values(world.organizationPlayerAwarenessById).filter((item) => item.organizationId === organizationId && (playerId === undefined || item.playerId === playerId)).sort((a, b) => a.discoveredAt.localeCompare(b.discoveredAt) || a.playerId.localeCompare(b.playerId))
}

export function getScoutingTerritoryCoverage(world: GameWorld, organizationId: OrganizationId, territory: ScoutingTerritory): ScoutingTerritoryCoverage {
  return deriveTerritoryCoverage(world, organizationId, territory)
}
