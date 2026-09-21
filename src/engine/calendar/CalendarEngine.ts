import { addDays, compareGameDates } from '@/domain/date'
import { annualDevelopmentCycleId, hasAppliedAnnualDevelopmentCycle, markAnnualDevelopmentCycleApplied, updateGameWorld, type GameWorld } from '@/domain/world'
import { applyOffseasonDevelopment } from '@/engine/development'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'
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
import { progressBasketballOperationsAdvisories } from '@/engine/roster'
import { progressStaffCareerAutonomyAppraisal, progressStaffHumanState } from '@/engine/staff/StaffHumanStatePipeline'
import { progressStaffCultureAndCohesion } from '@/engine/staff/StaffCultureCohesionPipeline'
import { progressStaffConflicts } from '@/engine/staff/StaffConflictEngine'
import { progressStaffPoliticalCases } from '@/engine/staff/StaffPoliticalCaseEngine'
import { progressStaffAutonomousOfferDecisions, progressStaffAutonomousResignations, progressStaffCareerMarketAgency } from '@/app/staffCareerAutonomy'

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
  const advanced = migrateCurrentSeasonIfElapsed(updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) }))
  const developed = progressAnnualPlayerDevelopment(advanced)
  const maintained = progressAcademicTerms(progressRecruiting(executeScheduledTrainingSessions(reconcileExpiredPlayerContracts(recoverCareerFatigueForDay(developed), developed.currentDate))))
  const withNil = maintained.currentDate.slice(-2) === '01' ? progressAiNil(progressNilLifecycle(maintained)) : progressNilLifecycle(maintained)
  const withBoosters = withNil.currentDate.slice(-2) === '01' ? decayMemoriesForMonth(processCoachFinancesForMonth(progressAiBoosters(withNil))) : withNil
  const staffScoutingRequests = progressOppositionScoutingReports(progressAdvisoryScoutingReports(progressDelegatedScouting(progressEnforcement(withBoosters))))
  const withMedicalAdvisories = progressBasketballOperationsAdvisories(progressMedicalAdvisories(staffScoutingRequests))
  const enforced = progressScoutingAssignments(withMedicalAdvisories)
  const withDrafts = Object.values(enforced.draftsById).reduce((current, draft) => {
    const opened = openDraft(current, draft.id)
    if (opened.draftsById[draft.id]?.status !== 'inProgress') return opened
    return progressDraftAi(progressDraftProspectAdvisories(opened, draft.id), draft.id)
  }, enforced)
  // Human State refreshes first; Career Autonomy then consumes the current weekly appraisal while
  // the application boundary alone performs canonical market transitions.
  const withHumanState = progressStaffHumanState(withDrafts)
  const withConflicts = progressStaffConflicts(withHumanState)
  const withCulture = progressStaffCultureAndCohesion(withConflicts)
  const withPoliticalCases = progressStaffPoliticalCases(withCulture)
  const withCareerAutonomy = progressStaffCareerAutonomyAppraisal(withPoliticalCases)
  return progressStaffAutonomousResignations(progressStaffAutonomousOfferDecisions(progressStaffCareerMarketAgency(withCareerAutonomy)))
}
function progressAcademicTerms(world: GameWorld): GameWorld { if(world.currentDate.slice(5) !== '01-01' && world.currentDate.slice(5) !== '07-01') return world; const term=`academic:${world.currentDate.slice(0, 4)}:${world.currentDate.slice(5, 7)}`; return resolveAcademicTerm(progressAiAcademicSupport(world,term),term) }

/**
 * `world.currentSeasonId` is a UI/gameplay-selection concern, never a clock: `startNextSeasonFor`
 * creates the next CompetitionSeason edition without ever touching it or `currentDate` (see
 * `startNextSeason.ts`). Once the world clock's `currentDate` naturally reaches that new edition's
 * `startDate` -- via this same day-by-day `advanceDay` walk, never a jump -- and the previously
 * current Season has already finished (finalized in `seasonHistoryBySeasonId`), the "current"
 * pointer simply flips to the new edition here. This is the only place `currentSeasonId` migrates
 * on its own; it never migrates eagerly inside the rollover itself.
 */
function migrateCurrentSeasonIfElapsed(world: GameWorld): GameWorld {
  const current = world.seasons[world.currentSeasonId]
  if (current === undefined) return world
  if (!isSeasonComplete(world, current.id) || getSeasonHistoryRecord(world, current.id) === undefined) return world

  const nextEdition = Object.values(world.seasons)
    .filter((season) => season.competitionId === current.competitionId && season.id !== current.id && compareGameDates(season.startDate, current.startDate) > 0)
    .sort((a, b) => compareGameDates(a.startDate, b.startDate))[0]
  if (nextEdition === undefined || compareGameDates(world.currentDate, nextEdition.startDate) < 0) return world

  return updateGameWorld(world, { currentSeasonId: nextEdition.id })
}

/**
 * WORLD-LEVEL annual player development trigger (1 July), independent of any Competition's
 * lifecycle. A player may belong to several independently-rolling competitions (a domestic
 * league, a cup, a continental competition); none of their individual season completions may
 * apply development, only this single yearly world-clock checkpoint. `annualDevelopmentCycleId`
 * plus `hasAppliedAnnualDevelopmentCycle` guarantee at most one application per calendar year no
 * matter how many times `advanceDay` runs, how many competitions complete around this date, or
 * how many times a save from this date is reloaded.
 */
function progressAnnualPlayerDevelopment(world: GameWorld): GameWorld {
  if (world.currentDate.slice(5) !== '07-01') return world
  const cycleId = annualDevelopmentCycleId(world.currentDate)
  if (hasAppliedAnnualDevelopmentCycle(world, cycleId)) return world
  const developed = applyOffseasonDevelopment(world, { fromSeasonId: world.currentSeasonId, toSeasonId: world.currentSeasonId, targetDate: world.currentDate, cycleId }).world
  return markAnnualDevelopmentCycleApplied(developed, cycleId)
}

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
