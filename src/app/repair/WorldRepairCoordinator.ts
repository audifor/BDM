import type { TeamId } from '@/domain/ids'
import type { WorldRepairReport } from '@/domain/repair'
import type { GameWorld } from '@/domain/world'
import { maintainAiTeamMinimumRosters } from '@/app/market'
import { repairRosterContractIntegrity } from '@/engine/market'

export interface WorldRepairCoordinatorResult {
  readonly world: GameWorld
  readonly reports: readonly WorldRepairReport[]
  readonly unresolvedTeamIds: readonly TeamId[]
}

/** Dispatches bounded domain repairs for the teams at the current safe lifecycle boundary. */
export function repairWorldAtLifecycleBoundary(world: GameWorld, teamIds?: readonly TeamId[]): WorldRepairCoordinatorResult {
  const integrity = repairRosterContractIntegrity(world, teamIds)
  const roster = maintainAiTeamMinimumRosters(integrity.world, teamIds)
  const reports = [...integrity.reports, ...roster.reports].filter((item) => item.classification !== 'ALREADY_VALID')
  return { world: roster.world, reports: Object.freeze(reports), unresolvedTeamIds: roster.unresolvedTeamIds }
}
