import { FACILITY_COMPONENT_CAPABILITIES, componentTypeSupportsCapability } from '@/domain/facilities/FacilityComponentCapability'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { facilityNameAt } from '@/domain/facilities'
import { attemptRecruitingFacilityDemonstration } from '@/engine/recruiting/RecruitingFacilityDemonstration'

/** Current options only; historical results belong to the visit, never this projection. */
export function recruitingFacilityOptions(world: GameWorld, teamId: TeamId) {
  return Object.values(world.facilityComponentsById).sort((a, b) => a.id.localeCompare(b.id)).flatMap(component =>
    FACILITY_COMPONENT_CAPABILITIES.filter(capability => componentTypeSupportsCapability(component.type, capability)).map(capability => {
      const facility = world.facilitiesById[component.facilityId]!
      const selection = { componentId: component.id, capability }
      return {
        key: `${component.id}|${capability}`, selection,
        name: `${facilityNameAt(Object.values(world.facilityNameRecordsById), facility.id, world.currentDate, facility.canonicalName)} / ${component.type} / ${capability}`,
        preview: attemptRecruitingFacilityDemonstration(world, teamId, selection),
      }
    }))
}
