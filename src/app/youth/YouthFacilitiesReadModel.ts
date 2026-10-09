import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { resolveClubFacilityAuthority } from '@/app/facilities/ClubFacilitiesReadModel'
import { facilityNameAt } from '@/domain/facilities'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities'
import { sportingFacilityContextForTeamAt } from '@/integration/facilitiesSporting'

/** Read-only BS15 pathway context. It neither authorizes intake nor executes Training. */
export function buildYouthFacilitiesContext(world: GameWorld, managerTeamId: TeamId) {
  const organizationId = world.teams[managerTeamId]?.organizationId
  if (organizationId === undefined) return []
  return Object.values(world.teamPathwayRelationsById)
    .filter(relation => relation.organizationId === organizationId && relation.role === 'youth')
    .sort((a, b) => a.teamId.localeCompare(b.teamId))
    .map(relation => {
      const team = world.teams[relation.teamId]!
      const authority = resolveClubFacilityAuthority(world, team.id)
      const facilities = authority.facilityIds.map(facilityId => {
        const facility = world.facilitiesById[facilityId]!
        return {
          facilityId, name: facilityNameAt(Object.values(world.facilityNameRecordsById), facilityId, world.currentDate, facility.canonicalName),
          placeName: world.placesById[facility.placeId]?.name ?? null,
          // Keep Organization and Team entitlements visibly distinct, including their dates.
          rights: Object.values(world.facilityUsageRightsById).filter(right => right.facilityId === facilityId && (right.teamId === team.id || right.organizationId === organizationId)).sort((a, b) => a.id.localeCompare(b.id)),
          components: Object.values(world.facilityComponentsById).filter(component => component.facilityId === facilityId).sort((a, b) => a.id.localeCompare(b.id)).map(component => ({
            componentId: component.id, type: component.type,
            physical: componentPhysicalAvailabilityAt(world, component.id, world.currentDate, team.id),
          })),
        }
      })
      return {
        teamId: team.id, teamName: team.name, category: relation.category ?? null, date: world.currentDate,
        facilities, sporting: sportingFacilityContextForTeamAt(world, team.id, world.currentDate),
        // Persisted owner evidence only: never predict a session using another requirement registry.
        trainingAttempts: Object.values(world.scheduledTrainingSessionsById).filter(session => session.teamId === team.id && session.physicalAttempt !== undefined).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
      }
    })
}
