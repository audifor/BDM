import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { reconcileExpiredPlayerContracts } from '@/engine/market'
import { executeEligibleTraining, recoverCareerFatigueForDay } from '@/engine/training/TrainingEngine'
import { executeScheduledTrainingSessions } from '@/engine/training/ScheduledTrainingEngine'
import { openDraft, progressDraftAi } from '@/engine/draft'
import { arriveSignedRecruits, generateRecruitingPool, progressAiRecruiting, resolveRecruitingCommitments } from '@/engine/recruiting'
import { progressAiAcademicSupport, resolveAcademicTerm } from '@/engine/academic'
import { progressAiNil, progressNilLifecycle } from '@/engine/nil'
import { progressAiBoosters } from '@/engine/boosters'
import { progressEnforcement } from '@/engine/enforcement'
import { processCoachFinancesForMonth } from '@/engine/coachFinances'
import { decayMemoriesForMonth } from '@/engine/memory'
import { progressScoutingAssignments } from '@/engine/scouting'

/** Advances only the simulation date, leaving game resolution to other services. */
export function advanceDay(world: GameWorld): GameWorld {
  const advanced = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
  const maintained = progressAcademicTerms(progressRecruiting(executeScheduledTrainingSessions(executeEligibleTraining(reconcileExpiredPlayerContracts(recoverCareerFatigueForDay(advanced), advanced.currentDate)))))
  const withNil = maintained.currentDate.slice(-2) === '01' ? progressAiNil(progressNilLifecycle(maintained)) : progressNilLifecycle(maintained)
  const withBoosters = withNil.currentDate.slice(-2) === '01' ? decayMemoriesForMonth(processCoachFinancesForMonth(progressAiBoosters(withNil))) : withNil
  const enforced = progressScoutingAssignments(progressEnforcement(withBoosters))
  return Object.values(enforced.draftsById).reduce((current, draft) => {
    const opened = openDraft(current, draft.id)
    return opened.draftsById[draft.id]?.status === 'inProgress' ? progressDraftAi(opened, draft.id) : opened
  }, enforced)
}
function progressAcademicTerms(world: GameWorld): GameWorld { if(world.currentDate.slice(5) !== '01-01' && world.currentDate.slice(5) !== '07-01') return world; const term=`academic:${world.currentDate.slice(0, 4)}:${world.currentDate.slice(5, 7)}`; return resolveAcademicTerm(progressAiAcademicSupport(world,term),term) }

function progressRecruiting(world: GameWorld): GameWorld {
  let next = world
  for (const cycle of Object.values(world.recruitingCyclesById)) {
    const status = next.currentDate < cycle.opensOn ? 'scheduled' : next.currentDate < cycle.signingOn ? 'open' : next.currentDate <= cycle.closesOn ? 'signing' : 'completed'
    if (cycle.status !== status) next = updateGameWorld(next, { recruitingCycles: Object.values(next.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, status } : item) })
    if (status === 'open' || status === 'signing') {
      next = generateRecruitingPool(next, cycle.id)
      if (next.currentDate.slice(-2) === '01' || cycle.status !== status) next = progressAiRecruiting(next, cycle.id)
      next = resolveRecruitingCommitments(next, cycle.id)
    }
  }
  return arriveSignedRecruits(next)
}
