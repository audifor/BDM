import type { GameWorld } from '@/domain/world'
import { processBoardFacilityDecisions } from './FacilityBoardAi'
import { processAiFacilityManagement } from './FacilityAiManagement'
import { processFacilityServices } from './FacilityServiceCommands'

/**
 * The single daily Calendar entry point for Facilities management. Board decisions are processed here; AI club
 * management is added to this function by BS17F. It performs no work, and returns the identical world, when no
 * Facilities operation exists.
 */
export function processFacilityManagement(world: GameWorld): GameWorld {
  if (Object.keys(world.facilityEconomyRecordsById).length === 0) return world
  return processFacilityServices(processAiFacilityManagement(processBoardFacilityDecisions(world)))
}
