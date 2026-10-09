import { getPlayerContractStatus } from '@/domain/contract'
import { GameWorldValidationError, withSingleWorldValidation, type GameWorld, type WorldValidationMode } from '@/domain/world'
import { assertCollegeRosterPermanentEligibility } from '@/engine/eligibility/CollegeEligibilityLifecycle'

/** One final publication boundary; semantic guards are equally strict in both modes. */
export function withDailyWorldValidation(world: GameWorld, execute: (world: GameWorld) => GameWorld, mode: WorldValidationMode = 'incremental'): GameWorld {
  const result = withSingleWorldValidation(world, execute, { validationMode: mode })
  if (result === world) return world
  const owners = new Map(Object.values(result.teams).flatMap(team => team.rosterPlayerIds.map(id => [id, team.id] as const)))
  for (const team of Object.values(result.teams)) for (const id of team.rosterPlayerIds) {
    if (result.players[id]?.careerEnd !== undefined) throw new GameWorldValidationError(`Retired Player ${id} remains rostered`)
  }
  for (const contract of Object.values(result.contractsById)) {
    const status = getPlayerContractStatus(contract, result.currentDate)
    if (!['active', 'scheduled'].includes(status)) continue
    if (result.players[contract.playerId]?.careerEnd !== undefined) throw new GameWorldValidationError(`Retired Player ${contract.playerId} retains contract ${contract.id}`)
    if (status === 'active' && owners.get(contract.playerId) !== contract.teamId) throw new GameWorldValidationError(`Active contract ${contract.id} has invalid roster ownership`)
  }
  for (const right of Object.values(result.playerRightsById)) if (right.status === 'active' && result.players[right.playerId]?.careerEnd !== undefined) throw new GameWorldValidationError(`Retired Player ${right.playerId} retains active rights`)
  for (const enrollment of Object.values(result.playerEnrollmentsById)) if (enrollment.status === 'active' && result.players[enrollment.playerId]?.careerEnd !== undefined) throw new GameWorldValidationError(`Retired Player ${enrollment.playerId} remains enrolled`)
  assertCollegeRosterPermanentEligibility(result)
  return result
}
