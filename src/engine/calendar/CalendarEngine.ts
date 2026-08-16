import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { reconcileExpiredPlayerContracts } from '@/engine/market'
import { executeEligibleTraining, recoverCareerFatigueForDay } from '@/engine/training/TrainingEngine'
import { openDraft, progressDraftAi } from '@/engine/draft'

/** Advances only the simulation date, leaving game resolution to other services. */
export function advanceDay(world: GameWorld): GameWorld {
  const advanced = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
  const maintained = executeEligibleTraining(reconcileExpiredPlayerContracts(recoverCareerFatigueForDay(advanced), advanced.currentDate))
  return Object.values(maintained.draftsById).reduce((current, draft) => {
    const opened = openDraft(current, draft.id)
    return opened.draftsById[draft.id]?.status === 'inProgress' ? progressDraftAi(opened, draft.id) : opened
  }, maintained)
}
