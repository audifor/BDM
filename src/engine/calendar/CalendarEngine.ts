import { progressCollegeEligibilityExits } from '@/engine/eligibility/CollegeEligibilityLifecycle'
import { addDays, compareGameDates } from '@/domain/date'
import { annualDevelopmentCycleId, hasAppliedAnnualDevelopmentCycle, markAnnualDevelopmentCycleApplied, updateGameWorld, withSingleWorldValidation, type GameWorld } from '@/domain/world'
import { applyOffseasonDevelopment } from '@/engine/development'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'
import { progressFormalOfferResponses, progressNegotiationContactResponses, reconcileExpiredPlayerContracts } from '@/engine/market'
import { recoverCareerFatigueForDay } from '@/engine/training/TrainingEngine'
import { executeScheduledTrainingSessionsWithEvidence } from '@/engine/training/ScheduledTrainingEngine'
import { progressAiTrainingPlanning } from '@/engine/training/TrainingPlanning'
import { isStaffWeeklyCheckpoint } from '@/engine/staff'
import { openDraft, progressDraftAi, progressDraftProspectAdvisories } from '@/engine/draft'
import { arriveSignedRecruits, generateRecruitingPool, progressAiRecruiting, progressRecruitingAdvisories, resolveRecruitingCommitments, signCommittedRecruit } from '@/engine/recruiting'
import { progressAiAcademicSupport, resolveAcademicTerm } from '@/engine/academic'
import { progressAiNil, progressNilLifecycle } from '@/engine/nil'
import { progressAiBoosters } from '@/engine/boosters'
import { progressEnforcement } from '@/engine/enforcement'
import { ensureNcaaSportBudgets, progressStaffActivitySanctions } from '@/engine/enforcement/EnforcementRemedies'
import { progressInstitutionBenefitsReporting, rolloverInstitutionBenefitsCaps } from '@/engine/eligibility/CollegeCompensationEngine'
import { runCollegeRosterContinuationAndTransferAI } from '@/engine/eligibility/CollegeTransferAI'
import { ensureCollegeRulesetContinuity } from '@/engine/eligibility/EligibilityEngine'
import { processCoachFinancesForMonth } from '@/engine/coachFinances'
import { decayMemoriesForMonth } from '@/engine/memory'
import { progressAdvisoryScoutingReports, progressAiScoutingOperations, progressDelegatedScouting, progressRecruitmentFocuses, progressScoutingAssignments, progressScoutingTerritoryAssignments } from '@/engine/scouting'
import { progressOppositionScoutingReports } from '@/engine/tactics/OppositionScoutingReportEngine'
import { progressMedicalAdvisories } from '@/engine/injury'
import { progressAiMedicalLifecycle } from '@/engine/injury/AiMedicalLifecycle'
import { progressRehabilitationSetbacks } from '@/engine/injury/Rehabilitation'
import { progressBasketballOperationsAdvisories } from '@/engine/roster'
import { progressStaffCareerAutonomyAppraisal, progressStaffHumanState } from '@/engine/staff/StaffHumanStatePipeline'
import { progressStaffCultureAndCohesion } from '@/engine/staff/StaffCultureCohesionPipeline'
import { progressStaffConflicts } from '@/engine/staff/StaffConflictEngine'
import { progressStaffPoliticalCases } from '@/engine/staff/StaffPoliticalCaseEngine'
import { progressStaffAutonomousOfferDecisions, progressStaffAutonomousResignations, progressStaffCareerMarketAgency } from '@/app/staffCareerAutonomy'
import { advanceFacilitiesConditionFromHistory } from '@/engine/facilities'
import { expireStaleRetentionNegotiations } from '@/engine/contractRetention/ContractRetentionEngine'
import { progressAiRetentionNegotiationsWithEvidence, type AiRetentionDecisionEvidence } from '@/engine/contractRetention/AiRetentionEngine'
import { progressPlayerCareerEnds } from '@/engine/career/PlayerCareerLifecycle'
import { progressAnnualTalentSupply } from '@/engine/world/AnnualTalentSupply'
import { progressAiProfessionalPathways } from '@/engine/career/AiProfessionalPathways'

export const DAILY_LIFECYCLE_PHASE_IDS = [
  'DATE_ADVANCE', 'ANNUAL_PLAYER_DEVELOPMENT', 'ANNUAL_TALENT_SUPPLY', 'PLAYER_CAREER_END', 'COLLEGE_ELIGIBILITY_EXITS', 'CAREER_FATIGUE_RECOVERY', 'EXPIRED_CONTRACT_RECONCILIATION', 'RETENTION_NEGOTIATION_INVALIDATION', 'AI_RETENTION_NEGOTIATIONS', 'MARKET_CONTACT_RESPONSES', 'MARKET_FORMAL_OFFER_RESPONSES', 'AI_TRAINING_PLANNING', 'TRAINING', 'RECRUITING', 'ACADEMICS',
  'NIL_LIFECYCLE', 'MONTHLY_NIL_AUTONOMY', 'MONTHLY_BOOSTER_AUTONOMY', 'COACH_FINANCE', 'MEMORY_DECAY',
  'ENFORCEMENT', 'SCOUTING_INTAKE', 'MEDICAL_AND_ROSTER_ADVISORIES', 'AI_MEDICAL_DECISIONS', 'SCOUTING_ASSIGNMENTS', 'DRAFT', 'PROFESSIONAL_PATHWAYS',
  'STAFF_HUMAN_STATE', 'STAFF_CONFLICTS', 'STAFF_CULTURE_COHESION', 'STAFF_POLITICAL_CASES', 'STAFF_APPRAISAL',
  'STAFF_CAREER_AUTONOMY', 'FACILITY_CONDITION', 'CLUB_FINANCE_V2', 'GOVERNANCE', 'EVENT_COLLECTION',
] as const
export type DailyLifecyclePhaseId = (typeof DAILY_LIFECYCLE_PHASE_IDS)[number]

export interface DailyLifecycleDiagnostic { readonly code: string; readonly message: string; readonly sourceId?: string }
export interface DailyLifecyclePhase {
  readonly phaseId: DailyLifecyclePhaseId
  readonly order: number
  readonly date: GameWorld['currentDate']
  readonly ran: boolean
  readonly worldChanged: boolean
  readonly diagnostics: readonly DailyLifecycleDiagnostic[]
  readonly summary: string
  readonly elapsedMs?: number
}
export interface CalendarDayLifecycleResult {
  readonly status: 'COMPLETED' | 'FAILED'
  readonly world: GameWorld
  readonly phases: readonly DailyLifecyclePhase[]
  readonly diagnostics: readonly DailyLifecycleDiagnostic[]
  readonly seasonPointerChanged: boolean
  readonly failure?: { readonly phaseId: DailyLifecyclePhaseId; readonly kind: 'INVARIANT_VIOLATION' | 'TECHNICAL_FAILURE'; readonly message: string }
}

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
  const result = advanceDayWithTrace(world)
  if (result.status === 'FAILED') throw new Error(result.failure?.message ?? 'Daily lifecycle failed')
  return result.world
}

/** Runs the existing daily subsystem order and returns transient execution evidence. */
export function advanceDayWithTrace(world: GameWorld): CalendarDayLifecycleResult {
  const original = world
  const phases: DailyLifecyclePhase[] = []
  let current = world
  let failure: CalendarDayLifecycleResult['failure']
  const run = (phaseId: DailyLifecyclePhaseId, date: GameWorld['currentDate'], shouldRun: boolean, execute: (input: GameWorld) => GameWorld, skippedReason: string, diagnostics: (before: GameWorld, after: GameWorld) => readonly DailyLifecycleDiagnostic[] = () => []): void => {
    const order = phases.length + 1
    if (!shouldRun) {
      phases.push({ phaseId, order, date, ran: false, worldChanged: false, diagnostics: [{ code: 'PHASE_SKIPPED', message: skippedReason }], summary: skippedReason })
      return
    }
    const before = current
    const startedAt = performance.now()
    try {
      // WSR2: the whole world is validated once per phase that changed it (when the phase ends, before any later phase reads it),
      // not after every intermediate update inside the phase; validation never alters a world, so valid days are unchanged.
      current = withSingleWorldValidation(before, execute)
      const phaseDiagnostics = diagnostics(before, current)
      phases.push({ phaseId, order, date, ran: true, worldChanged: current !== before, diagnostics: phaseDiagnostics, summary: summarizePhase(current !== before, phaseDiagnostics), elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const kind = error instanceof RangeError || error instanceof TypeError ? 'INVARIANT_VIOLATION' : 'TECHNICAL_FAILURE'
      failure = { phaseId, kind, message }
      phases.push({ phaseId, order, date, ran: true, worldChanged: false, diagnostics: [{ code: kind, message }], summary: `Phase failed: ${message}`, elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100 })
      throw error
    }
  }

  try {
    const nextDate = addDays(world.currentDate, 1)
    run('DATE_ADVANCE', nextDate, true, (input) => ensureCollegeRulesetContinuity(migrateCurrentSeasonIfElapsed(updateGameWorld(input, { currentDate: nextDate }))), 'Always runs exactly one calendar day forward and carries supplied college policies through offseason gaps.')
    run('ANNUAL_PLAYER_DEVELOPMENT', current.currentDate, current.currentDate.slice(5) === '07-01' && !hasAppliedAnnualDevelopmentCycle(current, annualDevelopmentCycleId(current.currentDate)), progressAnnualPlayerDevelopment, 'Runs once on the annual 1 July checkpoint.')
    run('ANNUAL_TALENT_SUPPLY', current.currentDate, current.currentDate.slice(5) === '07-01', progressAnnualTalentSupply, 'Creates the deterministic simulated talent age cohort once each year.')
    run('PLAYER_CAREER_END', current.currentDate, current.currentDate.slice(5) === '07-01', progressPlayerCareerEnds, 'Ends careers beyond the structural player age limit and closes current sporting membership.')
    run('COLLEGE_ELIGIBILITY_EXITS', current.currentDate, true, progressCollegeEligibilityExits, 'Permanent college clock or participation exhaustion ends sporting program membership, preserving identity and academic history.')
    run('CAREER_FATIGUE_RECOVERY', current.currentDate, true, recoverCareerFatigueForDay, 'Career fatigue recovery runs every simulation day.')
    run('EXPIRED_CONTRACT_RECONCILIATION', current.currentDate, true, (input) => reconcileExpiredPlayerContracts(input, input.currentDate), 'Expired player contracts are reconciled every simulation day.')
    run('RETENTION_NEGOTIATION_INVALIDATION', current.currentDate, true, expireStaleRetentionNegotiations, 'Retention negotiations are invalidated when predecessor or roster context changes.')
    let aiRetentionDecisions: readonly AiRetentionDecisionEvidence[] = []
    run('AI_RETENTION_NEGOTIATIONS', current.currentDate, true, (input) => {
      const result = progressAiRetentionNegotiationsWithEvidence(input)
      aiRetentionDecisions = result.decisions
      return result.world
    }, 'Eligible AI club contract reviews may open or resolve one bounded retention negotiation.', () => aiRetentionDecisions.map((decision) => ({
      code: `AI_RETENTION_${decision.action}`,
      message: `${decision.reviewIntent ?? 'NO_INTENT'}; ${decision.reasons.join(', ')}`,
      sourceId: decision.negotiationId ?? decision.contractId,
    })))
    run('MARKET_CONTACT_RESPONSES', current.currentDate, true, progressNegotiationContactResponses, 'Due term-free contact responses are processed after contract reconciliation.')
    run('MARKET_FORMAL_OFFER_RESPONSES', current.currentDate, true, progressFormalOfferResponses, 'Due formal free-agent offer responses are processed after contact responses.')
    let aiTrainingDecisions: ReturnType<typeof progressAiTrainingPlanning>['decisions'] = []
    run('AI_TRAINING_PLANNING', current.currentDate, isStaffWeeklyCheckpoint(current.currentDate), (input) => {
      const result = progressAiTrainingPlanning(input)
      aiTrainingDecisions = result.decisions
      return result.world
    }, 'AI Training plans are reviewed on the ISO Monday checkpoint.', () => aiTrainingDecisions.map((decision) => ({
      code: `AI_TRAINING_${decision.action}`,
      message: `${decision.reason} ${decision.sessionIds.length} session(s) scheduled.`,
      sourceId: decision.sessionIds[0] ?? decision.teamId,
    })))
    let trainingConflicts: readonly string[] = []
    run('TRAINING', current.currentDate, true, (input) => {
      const result = executeScheduledTrainingSessionsWithEvidence(input)
      trainingConflicts = result.matchConflictSessionIds
      return result.world
    }, 'Scheduled Training is checked every simulation day; fixture-date conflicts are skipped.', () => trainingConflicts.map((sessionId) => ({
      code: 'TRAINING_MATCH_CONFLICT',
      message: `Scheduled session ${sessionId} was not executed because a fixture is on that date.`,
      sourceId: sessionId,
    })))
    run('RECRUITING', current.currentDate, true, progressRecruiting, 'Recruiting cycle status and due lifecycle are checked every simulation day.')
    run('ACADEMICS', current.currentDate, current.currentDate.slice(5) === '01-01' || current.currentDate.slice(5) === '07-01', progressAcademicTerms, 'Academic terms resolve on 1 January and 1 July.')
    run('NIL_LIFECYCLE', current.currentDate, true, progressNilLifecycle, 'NIL expiry and lifecycle are checked every simulation day.')
    run('MONTHLY_NIL_AUTONOMY', current.currentDate, current.currentDate.slice(-2) === '01', progressAiNil, 'NIL AI progression runs on the first day of each month.')
    run('MONTHLY_BOOSTER_AUTONOMY', current.currentDate, current.currentDate.slice(-2) === '01', progressAiBoosters, 'Booster progression runs on the first day of each month.')
    run('COACH_FINANCE', current.currentDate, current.currentDate.slice(-2) === '01', processCoachFinancesForMonth, 'Coach Finance runs once on the first day of each month.')
    run('MEMORY_DECAY', current.currentDate, current.currentDate.slice(-2) === '01', decayMemoriesForMonth, 'Memory decay runs on the first day of each month.')
    run('ENFORCEMENT', current.currentDate, true, (input) => progressStaffActivitySanctions(progressEnforcement(progressInstitutionBenefitsReporting(rolloverInstitutionBenefitsCaps(ensureNcaaSportBudgets(input))))), 'Enforcement, contest suspensions, sport budgets, benefits cap rollover and institutional reporting are checked every simulation day.')
    run('SCOUTING_INTAKE', current.currentDate, true, (input) => progressRecruitmentFocuses(progressScoutingTerritoryAssignments(progressAiScoutingOperations(progressOppositionScoutingReports(progressAdvisoryScoutingReports(progressDelegatedScouting(input)))))), 'AI Scouting departments plan on days 1, 8, 15 and 22/29; delegated reports, Recruitment Focus duration and active territory discovery are checked daily.')
    run('MEDICAL_AND_ROSTER_ADVISORIES', current.currentDate, true, (input) => progressBasketballOperationsAdvisories(progressMedicalAdvisories(progressRehabilitationSetbacks(input))), 'Rehabilitation setbacks and Medical/basketball-operations advisories are checked every simulation day.')
    let aiMedicalDecisions: ReturnType<typeof progressAiMedicalLifecycle>['decisions'] = []
    run('AI_MEDICAL_DECISIONS', current.currentDate, true, (input) => {
      const result = progressAiMedicalLifecycle(input)
      aiMedicalDecisions = result.decisions
      return result.world
    }, 'AI clubs resolve canonical medical advice and due Return-to-Play reviews after advisory processing.', () => aiMedicalDecisions.map((decision) => ({
      code: `AI_MEDICAL_${decision.action}`,
      message: `${decision.action.replaceAll('_', ' ')} for injury ${decision.injuryId}.`,
      sourceId: decision.sourceId,
    })))
    run('SCOUTING_ASSIGNMENTS', current.currentDate, true, progressScoutingAssignments, 'Scouting assignments are progressed every simulation day.')
    const rightsBeforeDraft = Object.keys(current.playerRightsById).length
    run('DRAFT', current.currentDate, true, (input) => Object.values(input.draftsById).sort((a, b) => a.id.localeCompare(b.id)).reduce((updated, draft) => {
      const opened = openDraft(updated, draft.id)
      return opened.draftsById[draft.id]?.status === 'inProgress' ? progressDraftAi(progressDraftProspectAdvisories(opened, draft.id), draft.id) : opened
    }, input), 'Drafts are opened and eligible AI picks/advisories progress every simulation day.')
    let professionalDecisions: ReturnType<typeof progressAiProfessionalPathways>['decisions'] = []
    run('PROFESSIONAL_PATHWAYS', current.currentDate, current.currentDate.slice(-2) === '01' || Object.keys(current.playerRightsById).length > rightsBeforeDraft, input => {
      const result = progressAiProfessionalPathways(input)
      professionalDecisions = result.decisions
      return result.world
    }, 'Professional pathways are evaluated after new Draft selections and at monthly unsigned-rights/undrafted follow-up.', () => professionalDecisions.map(decision => ({ code: decision.signed ? 'AI_PROFESSIONAL_SIGNED' : `AI_PROFESSIONAL_${decision.blocker ?? 'SIGNING_NOT_COMPLETED'}`, message: `${decision.playerId}: ${decision.signed ? 'signed through the canonical professional gateway' : decision.blocker}; attempted=${decision.attempted}`, sourceId: decision.rightsId ?? `${decision.draftId}:${decision.playerId}:${decision.teamId}` })))
    run('STAFF_HUMAN_STATE', current.currentDate, true, progressStaffHumanState, 'Staff human-state projection is refreshed every simulation day.')
    run('STAFF_CONFLICTS', current.currentDate, true, progressStaffConflicts, 'Staff conflicts progress every simulation day.')
    run('STAFF_CULTURE_COHESION', current.currentDate, true, progressStaffCultureAndCohesion, 'Staff culture and cohesion progress every simulation day.')
    run('STAFF_POLITICAL_CASES', current.currentDate, true, progressStaffPoliticalCases, 'Staff political cases progress every simulation day.')
    run('STAFF_APPRAISAL', current.currentDate, true, progressStaffCareerAutonomyAppraisal, 'Staff autonomy appraisals are checked every simulation day.')
    run('STAFF_CAREER_AUTONOMY', current.currentDate, true, (input) => progressStaffAutonomousResignations(progressStaffAutonomousOfferDecisions(progressStaffCareerMarketAgency(input))), 'Staff career-market autonomy runs every simulation day.')
    let facilityDiagnostics: readonly DailyLifecycleDiagnostic[] = []
    run('FACILITY_CONDITION', current.currentDate, current.currentDate.slice(-2) === '01', (input) => {
      const application = advanceFacilitiesConditionFromHistory(input, input.currentDate)
      facilityDiagnostics = [
        ...application.results.filter((result) => result.changed).map((result) => ({ code: 'FACILITY_CONDITION_CHANGED', message: `Facility component ${result.componentId} condition changed from ${result.previousCondition ?? 'unknown'} to ${result.nextCondition ?? 'unknown'}.`, sourceId: result.componentId })),
        ...application.openedNeeds.map((need) => ({ code: 'FACILITY_MAINTENANCE_NEED_OPENED', message: `Facility component ${need.componentId} opened a ${need.severity} maintenance need.`, sourceId: need.id })),
      ]
      return application.world
    }, 'Facility deterioration is evaluated on the first day of each month using elapsed time from each component condition record.', () => facilityDiagnostics)
    run('CLUB_FINANCE_V2', current.currentDate, false, (input) => input, 'Club Finance V2 has no global calendar processor: materialization requires explicit event, ledger mapping, date policy, or authorization inputs.')
    run('GOVERNANCE', current.currentDate, false, (input) => input, 'Governance meetings and decisions have dated records but no automatic calendar-resolution processor.')
    const diagnostics = phases.flatMap((phase) => phase.diagnostics)
    phases.push({ phaseId: 'EVENT_COLLECTION', order: phases.length + 1, date: current.currentDate, ran: true, worldChanged: false, diagnostics: [], summary: `Collected ${diagnostics.length} phase diagnostic(s) without persisting an event stream.` })
    return { status: 'COMPLETED', world: current, phases: Object.freeze(phases), diagnostics: Object.freeze(diagnostics), seasonPointerChanged: current.currentSeasonId !== original.currentSeasonId }
  } catch {
    return { status: 'FAILED', world: original, phases: Object.freeze(phases), diagnostics: Object.freeze(phases.flatMap((phase) => phase.diagnostics)), seasonPointerChanged: false, ...(failure === undefined ? {} : { failure }) }
  }
}

function summarizePhase(changed: boolean, diagnostics: readonly DailyLifecycleDiagnostic[]): string {
  if (diagnostics.length > 0) return diagnostics.map((diagnostic) => diagnostic.message).join(' ')
  return changed ? 'Subsystem returned an updated GameWorld.' : 'No canonical state change.'
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
    if (cycle.status !== status) {
      const capacities = { ...next.recruitingCapacityByProgramId }
      // A new annual cycle owns a fresh configured action budget, not a lifetime balance.
      if (cycle.status === 'scheduled' && (status === 'open' || status === 'signing') && next.ecosystems[cycle.ecosystemId]?.kind === 'ncaaLike') {
        const programs = new Set(Object.values(next.competitions).filter(item => item.ecosystemId === cycle.ecosystemId).flatMap(item => item.participantTeamIds))
        for (const programId of programs) {
          const reduction = Object.values(next.sanctionsById).filter(item => item.programTeamId === programId && item.kind === 'recruitingCapacityReduction' && item.status === 'active' && item.startsAt <= next.currentDate && (item.endsAt === undefined || item.endsAt >= next.currentDate)).reduce((sum, item) => sum + (item.amount ?? 0), 0)
          capacities[programId] = Math.max(0, cycle.rules.periodCapacity - reduction)
        }
      }
      next = updateGameWorld(next, { recruitingCycles: Object.values(next.recruitingCyclesById).map((item) => item.id === cycle.id ? { ...item, status } : item), recruitingCapacityByProgramId: capacities })
    }
    if (status === 'open' || status === 'signing') {
      if (status === 'open') next = runCollegeRosterContinuationAndTransferAI(next, cycle.id)
      next = generateRecruitingPool(next, cycle.id)
      if (next.currentDate.slice(-2) === '01' || cycle.status !== status) next = progressAiRecruiting(next, cycle.id)
      next = progressRecruitingAdvisories(next, cycle.id)
      next = resolveRecruitingCommitments(next, cycle.id)
      if (status === 'signing') next = progressAiRecruitingSignings(next, cycle.id)
    }
  }
  return arriveSignedRecruits(next)
}

function progressAiRecruitingSignings(world: GameWorld, cycleId: string): GameWorld {
  const cycle = world.recruitingCyclesById[cycleId]
  if (cycle === undefined || world.ecosystems[cycle.ecosystemId]?.kind !== 'ncaaLike') return world
  const userProgramTeamId = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)?.id
  return Object.values(world.recruitingCommitmentsById)
    .filter((commitment) => commitment.cycleId === cycleId && commitment.programTeamId !== userProgramTeamId)
    .reduce((current, commitment) => {
      const result = signCommittedRecruit(current, cycleId, commitment.recruitId)
      return result.ok ? result.value : current
    }, world)
}
