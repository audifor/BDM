import { addDays } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { reconcileExpiredPlayerContracts } from '@/engine/market'
import { recoverCareerFatigueForDay } from '@/engine/training/TrainingEngine'
import { executeScheduledTrainingSessions } from '@/engine/training/ScheduledTrainingEngine'
import { openDraft, progressDraftAi, progressDraftProspectAdvisories } from '@/engine/draft'
import { arriveSignedRecruits, generateRecruitingPool, progressAiRecruiting, progressRecruitingAdvisories, resolveRecruitingCommitments } from '@/engine/recruiting'
import { progressAiAcademicSupport, resolveAcademicTerm } from '@/engine/academic'
import { progressAiNil, progressNilLifecycle } from '@/engine/nil'
import { progressAiBoosters } from '@/engine/boosters'
import { progressEnforcement } from '@/engine/enforcement'
import { processCoachFinancesForMonth } from '@/engine/coachFinances'
import { decayMemoriesForMonth } from '@/engine/memory'
import { progressAdvisoryScoutingReports, progressDelegatedScouting, progressScoutingAssignments } from '@/engine/scouting'
import { progressOppositionScoutingReports } from '@/engine/tactics/OppositionScoutingReportEngine'
import { progressMedicalAdvisories } from '@/engine/injury'

/**
 * Advances only the simulation date, leaving game resolution to other services.
 * `executeScheduledTrainingSessions` is the sole automatic training authority: legacy
 * `TeamTrainingPlan`/`IndividualTrainingPlan` + `executeTeamTraining`/`executeEligibleTraining`
 * remain for save compatibility, defaults, and selectors, but are no longer auto-applied here
 * to avoid a team/player receiving two independent training workloads on the same day.
 *
 * Wave 3 (docs/STAFF_SYSTEM_V2.md §13): bounded delegated/advisory Scouting requests and
 * pre-match opposition-prep artifacts are created BEFORE `progressScoutingAssignments()` runs,
 * so any request they create can be picked up by the same checkpoint's assignment progression —
 * `progressScoutingAssignments()`/`requestScouting()` remain the sole Scouting execution
 * authority; `progressDelegatedScouting`/`progressAdvisoryScoutingReports`/
 * `progressOppositionScoutingReports` only ever decide WHICH bounded requests to create.
 */
export function advanceDay(world: GameWorld): GameWorld {
  const advanced = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
  const maintained = progressAcademicTerms(progressRecruiting(executeScheduledTrainingSessions(reconcileExpiredPlayerContracts(recoverCareerFatigueForDay(advanced), advanced.currentDate))))
  const withNil = maintained.currentDate.slice(-2) === '01' ? progressAiNil(progressNilLifecycle(maintained)) : progressNilLifecycle(maintained)
  const withBoosters = withNil.currentDate.slice(-2) === '01' ? decayMemoriesForMonth(processCoachFinancesForMonth(progressAiBoosters(withNil))) : withNil
  const staffScoutingRequests = progressOppositionScoutingReports(progressAdvisoryScoutingReports(progressDelegatedScouting(progressEnforcement(withBoosters))))
  const withMedicalAdvisories = progressMedicalAdvisories(staffScoutingRequests)
  const enforced = progressScoutingAssignments(withMedicalAdvisories)
  return Object.values(enforced.draftsById).reduce((current, draft) => {
    const opened = openDraft(current, draft.id)
    if (opened.draftsById[draft.id]?.status !== 'inProgress') return opened
    return progressDraftAi(progressDraftProspectAdvisories(opened, draft.id), draft.id)
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
      next = progressRecruitingAdvisories(next, cycle.id)
      next = resolveRecruitingCommitments(next, cycle.id)
    }
  }
  return arriveSignedRecruits(next)
}
