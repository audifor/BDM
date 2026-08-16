import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { reconcileExpiredPlayerContracts } from '@/engine/market'
import { executeEligibleTraining, recoverCareerFatigueForDay } from '@/engine/training/TrainingEngine'

/** Advances only the simulation date, leaving game resolution to other services. */
export function advanceDay(world: GameWorld): GameWorld {
  const advanced = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
  return executeEligibleTraining(reconcileExpiredPlayerContracts(recoverCareerFatigueForDay(advanced), advanced.currentDate))
}
