import { withDailyWorldValidation } from './DailyWorldValidation'
import type { DevelopmentStimulusEvent } from '@/domain/development/DevelopmentStimulusEvent'
import type { SimulationResolutionContext } from '@/app/worldSim/SimulationResolutionPolicy'
import { compareGameDates } from '@/domain/date'
import { updateGameWorld, withSingleWorldValidation, type GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getScheduledGamesToday, type CalendarDayLifecycleResult, type DailyLifecycleDiagnostic } from '@/engine/calendar'
import { createPreMatchMediaOpportunity } from '@/engine/media'
import { getUserTeam } from '@/engine/calendar'

import { createMatchSeed, simulateAndApplyGame, type MatchSeedFactory } from './playUserGame'
import { evaluateSimulationBreakpoints, type SimulationBreakpointResult } from './SimulationBreakpoints'
import { repairWorldAtLifecycleBoundary } from '@/app/repair'
import type { WorldRepairReport } from '@/domain/repair'
import { reviewMajorInjuryChanges, reviewMaterialRosterChanges } from '@/app/gmPlanning'
import { progressAiNegotiationCounterResponses, submitAiOffersAfterPositiveContactResponses } from '@/app/marketIntelligence'
import { ensureAiAcceptedPlayerContractSigningDecisions, type PlayerContractSigningWorkflowResult } from '@/app/governance'
import { executeAcceptedRetentionAgreement, type RetentionSigningResult } from '@/app/contractRetention/RetentionSigningService'

export class SimulationAdvanceBlockedError extends Error {
  constructor(readonly decision: SimulationBreakpointResult) {
    super(decision.breakpoint?.diagnostic ?? 'Simulation cannot advance in the current state')
    this.name = 'SimulationAdvanceBlockedError'
  }
}

export type WorldDayAdvanceStatus = 'COMPLETED' | 'BREAKPOINT_PREVENTED' | 'BREAKPOINT_AFTER_PROCESSING' | 'FAILED'
export interface WorldDayAdvancePhase {
  readonly phaseId: string
  readonly order: number
  readonly date: GameWorld['currentDate']
  readonly ran: boolean
  readonly worldChanged: boolean
  readonly diagnostics: readonly DailyLifecycleDiagnostic[]
  readonly summary: string
  readonly elapsedMs?: number
}
export interface WorldDayAdvanceResult {
  readonly status: WorldDayAdvanceStatus
  readonly world: GameWorld
  readonly phases: readonly WorldDayAdvancePhase[]
  readonly diagnostics: readonly DailyLifecycleDiagnostic[]
  readonly breakpointBefore: SimulationBreakpointResult
  readonly breakpointAfter?: SimulationBreakpointResult
  readonly repairReports: readonly WorldRepairReport[]
  readonly seasonPointerChanged: boolean
  readonly failure?: { readonly kind: 'INVARIANT_VIOLATION' | 'TECHNICAL_FAILURE'; readonly phaseId: string; readonly message: string }
}
export type WorldDayAdvanceObserver = (result: WorldDayAdvanceResult) => void

/** Direct day commands may explicitly quick-sim today's user game; all other reasons need resolution first. */
export function assertSimulationMayAdvance(world: GameWorld, allowedRequiredReasons: readonly string[] = ['userGame']): SimulationBreakpointResult {
  const decision = evaluateSimulationBreakpoints(world)
  const unhandled = decision.candidates.find((candidate) =>
    (candidate.level === 'ACTION_REQUIRED' || candidate.level === 'BLOCKING') && !allowedRequiredReasons.includes(candidate.reason),
  )
  if (unhandled !== undefined) throw new SimulationAdvanceBlockedError({ ...decision, breakpoint: unhandled, level: unhandled.level, mayAdvance: false })
  return decision.mayAdvance ? decision : { ...decision, mayAdvance: true }
}

/** Resolves every remaining game today without changing the calendar date. */
export function simulateRemainingGamesToday(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame'], repairReports: WorldRepairReport[] = [], context: SimulationResolutionContext = {}): GameWorld {
  assertSimulationMayAdvance(world, allowedRequiredReasons)
  return withSingleWorldValidation(world, initial => {
    const pendingEvidence: DevelopmentStimulusEvent[] = []
    const resolved = getScheduledGamesToday(initial).reduce(
      (updatedWorld, game) => simulateAndApplyGame(updatedWorld, game, createSeed(), repairReports, context, pendingEvidence), initial,
    )
    return pendingEvidence.length === 0 ? resolved : updateGameWorld(resolved, { developmentStimulusEventAdditions: pendingEvidence })
  })
}

/** Resolves today's pending games, then advances the game calendar by one day. */
export function advanceGameDay(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame'], observe?: WorldDayAdvanceObserver, context: SimulationResolutionContext = {}): GameWorld {
  const result = advanceGameDayWithResult(world, createSeed, allowedRequiredReasons, context)
  observe?.(result)
  if (result.status === 'BREAKPOINT_PREVENTED') throw new SimulationAdvanceBlockedError(result.breakpointBefore)
  if (result.status === 'FAILED') throw new Error(result.failure?.message ?? 'World day lifecycle failed')
  return result.world
}

/** Validate and publish the complete day atomically, retaining all per-update append guards. */
export function advanceGameDayWithResult(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame'], context: SimulationResolutionContext = {}): WorldDayAdvanceResult {
  let result: WorldDayAdvanceResult | undefined
  let validationStarted = 0
  try {
    withDailyWorldValidation(world, initial => {
      result = executeGameDayWithResult(initial, createSeed, allowedRequiredReasons, context)
      validationStarted = performance.now()
      return result.world
    }, context.dailyValidationMode ?? 'incremental')
    if (result!.status === 'FAILED' || result!.status === 'BREAKPOINT_PREVENTED') return result!
    const publication: WorldDayAdvancePhase = { phaseId: 'DAY_PUBLICATION', order: 0, date: result!.world.currentDate, ran: true, worldChanged: false, diagnostics: [], summary: 'Validated complete world day', elapsedMs: performance.now() - validationStarted }
    const phases = [...result!.phases]
    const completeIndex = phases.findIndex(phase => phase.phaseId === 'DAY_COMPLETE')
    phases.splice(completeIndex < 0 ? phases.length : completeIndex, 0, publication)
    return { ...result!, phases: phases.map((phase, index) => ({ ...phase, order: index + 1 })) }
  } catch (error) {
    if (result === undefined) throw error
    const message = error instanceof Error ? error.message : String(error)
    const diagnostic = { code: 'INVARIANT_VIOLATION', message }
    const phases = result.phases.filter(phase => phase.phaseId !== 'DAY_COMPLETE')
    phases.push({ phaseId: 'DAY_PUBLICATION', order: phases.length + 1, date: world.currentDate, ran: true, worldChanged: false, diagnostics: [diagnostic], summary: `Day publication failed: ${message}` })
    return { ...result, status: 'FAILED', world, phases, diagnostics: [...result.diagnostics, diagnostic], seasonPointerChanged: false, failure: { kind: 'INVARIANT_VIOLATION', phaseId: 'DAY_PUBLICATION', message } }
  }
}

/** Executes one application day boundary and returns transient lifecycle evidence. */
function executeGameDayWithResult(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame'], context: SimulationResolutionContext = {}): WorldDayAdvanceResult {
  const phases: WorldDayAdvancePhase[] = []
  const initialBreakpoint = evaluateSimulationBreakpoints(world)
  const validationTime = performance.now()
  const unhandled = initialBreakpoint.candidates.find((candidate) =>
    (candidate.level === 'ACTION_REQUIRED' || candidate.level === 'BLOCKING') && !allowedRequiredReasons.includes(candidate.reason),
  )
  const breakpointBefore = unhandled === undefined
    ? initialBreakpoint.mayAdvance ? initialBreakpoint : { ...initialBreakpoint, mayAdvance: true }
    : { ...initialBreakpoint, breakpoint: unhandled, level: unhandled.level, mayAdvance: false }
  phases.push({
    phaseId: 'PRE_ADVANCE_VALIDATION', order: 1, date: world.currentDate, ran: true, worldChanged: false,
    diagnostics: unhandled === undefined ? [] : [{ code: 'SIMULATION_BREAKPOINT', message: unhandled.diagnostic, sourceId: unhandled.sourceId }],
    summary: unhandled === undefined ? 'BS2 permits this day transition.' : `Execution stopped before mutation: ${unhandled.diagnostic}`,
    elapsedMs: Math.round((performance.now() - validationTime) * 100) / 100,
  })
  if (unhandled !== undefined) return { status: 'BREAKPOINT_PREVENTED', world, phases: Object.freeze(phases), diagnostics: Object.freeze(phases.flatMap((phase) => phase.diagnostics)), breakpointBefore, repairReports: Object.freeze([]), seasonPointerChanged: false }

  let current = world
  const repairReports: WorldRepairReport[] = []
  let activePhaseId = 'MATCH_RESOLUTION'
  try {
    activePhaseId = 'PRE_MATCH_SELF_HEALING'
    const preMatchRepairStart = performance.now()
    const scheduledTeams = [...new Set(getScheduledGamesToday(current).flatMap((game) => [game.homeTeamId, game.awayTeamId]))].sort((a, b) => a.localeCompare(b))
    const preMatchRepair = scheduledTeams.length === 0 ? undefined : repairWorldAtLifecycleBoundary(current, scheduledTeams)
    if (preMatchRepair !== undefined) {
      current = preMatchRepair.world
      repairReports.push(...preMatchRepair.reports)
      phases.push({ phaseId: activePhaseId, order: phases.length + 1, date: current.currentDate, ran: true, worldChanged: current !== world, diagnostics: repairDiagnostics(preMatchRepair.reports), summary: preMatchRepair.reports.length === 0 ? 'No roster or contract repair was needed for today’s scheduled teams.' : `Evaluated ${preMatchRepair.reports.length} repair report(s) for today’s scheduled teams.`, elapsedMs: Math.round((performance.now() - preMatchRepairStart) * 100) / 100 })
      const unresolvedIntegrity = preMatchRepair.reports.find((report) => report.classification === 'UNRECOVERABLE' && report.sourceDomain === 'MARKET_ROSTER_CONTRACT')
      if (unresolvedIntegrity !== undefined) throw Object.assign(new Error(unresolvedIntegrity.diagnostics[0]?.message ?? 'Roster/contract integrity could not be reconciled.'), { phaseId: activePhaseId, kind: 'INVARIANT_VIOLATION' as const })
    }

    const matches = getScheduledGamesToday(current)
    const matchStart = performance.now()
    const lineupReports: WorldRepairReport[] = []
    current = simulateRemainingGamesToday(current, createSeed, allowedRequiredReasons, lineupReports, context)
    current = reviewMajorInjuryChanges(world, current)
    repairReports.push(...lineupReports)
    phases.push({ phaseId: 'MATCH_RESOLUTION', order: phases.length + 1, date: world.currentDate, ran: matches.length > 0, worldChanged: current !== world, diagnostics: [], summary: matches.length === 0 ? 'No scheduled games required resolution.' : `Resolved ${matches.length} scheduled game(s) through the existing match application boundary.`, elapsedMs: Math.round((performance.now() - matchStart) * 100) / 100 })
    if (lineupReports.length > 0) phases.push({ phaseId: 'MATCH_LINEUP_REPAIR', order: phases.length + 1, date: world.currentDate, ran: true, worldChanged: false, diagnostics: repairDiagnostics(lineupReports), summary: `Resolved ${lineupReports.length} transient match lineup report(s).` })

    activePhaseId = 'CALENDAR_LIFECYCLE'
    const beforeCalendar = current
    const calendar: CalendarDayLifecycleResult = advanceDayWithTrace(current)
    if (calendar.status === 'FAILED') {
      phases.push(...calendar.phases.map((phase, index) => ({ ...phase, order: phases.length + index + 1 })))
      return {
        status: 'FAILED', world, phases: Object.freeze(phases), diagnostics: Object.freeze(phases.flatMap((phase) => phase.diagnostics)),
        breakpointBefore, repairReports: Object.freeze(repairReports), seasonPointerChanged: false,
        ...(calendar.failure === undefined ? {} : { failure: { kind: calendar.failure.kind, phaseId: calendar.failure.phaseId, message: calendar.failure.message } }),
      }
    }
    current = calendar.world
    phases.push(...calendar.phases.map((phase, index) => ({ ...phase, order: phases.length + index + 1 })))

    const calendarAcceptedIds = newlyAcceptedNegotiationIds(beforeCalendar, current)
    const calendarSigning = ensureAiAcceptedPlayerContractSigningDecisions(current, calendarAcceptedIds)
    current = calendarSigning.world
    phases.push(signingGovernanceCheckpointPhase('AI_ACCEPTED_SIGNING_GOVERNANCE', phases.length + 1, current, calendarAcceptedIds.length, calendarSigning.results))
    const calendarAcceptedRetentionIds = newlyAcceptedRetentionNegotiationIds(beforeCalendar, current)
    const retentionSigningResults: RetentionSigningResult[] = []
    for (const negotiationId of calendarAcceptedRetentionIds) {
      const result = executeAcceptedRetentionAgreement(current, negotiationId)
      retentionSigningResults.push(result)
      current = result.world
    }
    phases.push(retentionSigningCheckpointPhase(current, phases.length + 1, calendarAcceptedRetentionIds.length, retentionSigningResults))

    activePhaseId = 'AI_FORMAL_FREE_AGENT_OFFERS'
    const offerCheckpoint = submitAiOffersAfterPositiveContactResponses(current)
    current = offerCheckpoint.world
    const submittedOffers = offerCheckpoint.results.filter((result) => result.status === 'SUBMITTED')
    phases.push({
      phaseId: activePhaseId,
      order: phases.length + 1,
      date: current.currentDate,
      ran: offerCheckpoint.results.length > 0,
      worldChanged: current !== calendar.world,
      diagnostics: submittedOffers.map((result) => ({ code: 'AI_FREE_AGENT_OFFER_SUBMITTED', message: 'AI submitted one nonbinding formal free-agent offer.', sourceId: result.negotiation?.id })),
      summary: offerCheckpoint.results.length === 0
        ? 'No AI positive contact response was recorded today.'
        : `Checked ${offerCheckpoint.results.length} newly positive AI contact(s); submitted ${submittedOffers.length} offer(s).`,
    })

    activePhaseId = 'AI_FORMAL_NEGOTIATION_RESPONSES'
    const counterCheckpoint = progressAiNegotiationCounterResponses(current)
    current = counterCheckpoint.world
    const appliedCounterActions = counterCheckpoint.results.filter((result) => result.status === 'APPLIED')
    phases.push({
      phaseId: activePhaseId,
      order: phases.length + 1,
      date: current.currentDate,
      ran: counterCheckpoint.results.length > 0,
      worldChanged: current !== offerCheckpoint.world,
      diagnostics: appliedCounterActions.map((result) => ({
        code: result.negotiation?.status === 'ACCEPTED' ? 'AI_ACCEPTED_NEGOTIATION_COUNTER' : 'AI_DECLINED_NEGOTIATION_COUNTER',
        message: result.negotiation?.status === 'ACCEPTED'
          ? 'AI accepted the observed counter terms for a current affordable target.'
          : 'AI declined counter terms that no longer fit the current target or payroll.',
        sourceId: result.negotiation?.id,
      })),
      summary: counterCheckpoint.results.length === 0
        ? 'No AI counter required a current club response.'
        : `Resolved ${appliedCounterActions.length} AI counter decision(s).`,
    })

    const counterAcceptedIds = counterCheckpoint.results.filter((result) => result.status === 'APPLIED' && result.negotiation?.status === 'ACCEPTED').map((result) => result.negotiation!.id)
    const counterSigning = ensureAiAcceptedPlayerContractSigningDecisions(current, counterAcceptedIds)
    current = counterSigning.world
    phases.push(signingGovernanceCheckpointPhase('AI_ACCEPTED_COUNTER_SIGNING_GOVERNANCE', phases.length + 1, current, counterAcceptedIds.length, counterSigning.results))

    activePhaseId = 'POST_TRANSITION_SELF_HEALING'
    const eligibilityBoundary = beforeCalendar.academicProfilesById !== current.academicProfilesById || beforeCalendar.eligibilityRestrictionsById !== current.eligibilityRestrictionsById || beforeCalendar.eligibilityProfilesById !== current.eligibilityProfilesById || current.currentDate.slice(5) === '09-01'
    const collegeTeams = eligibilityBoundary ? new Set(Object.values(current.competitions).filter(item => current.ecosystems[item.ecosystemId]?.kind === 'ncaaLike').flatMap(item => item.participantTeamIds)) : new Set<string>()
    const changedTeamIds = Object.values(beforeCalendar.teams).filter((team) => collegeTeams.has(team.id) || team.rosterPlayerIds.join('|') !== current.teams[team.id]?.rosterPlayerIds.join('|')).map((team) => team.id).sort((a, b) => a.localeCompare(b))
    if (changedTeamIds.length > 0) {
      const repairStart = performance.now()
      const postTransitionRepair = repairWorldAtLifecycleBoundary(current, changedTeamIds)
      current = postTransitionRepair.world
      repairReports.push(...postTransitionRepair.reports)
      phases.push({ phaseId: activePhaseId, order: phases.length + 1, date: current.currentDate, ran: true, worldChanged: postTransitionRepair.world !== beforeCalendar, diagnostics: repairDiagnostics(postTransitionRepair.reports), summary: postTransitionRepair.reports.length === 0 ? 'Roster transitions left no minimum-roster or contract-integrity repair pending.' : `Evaluated ${postTransitionRepair.reports.length} repair report(s) after roster transitions.`, elapsedMs: Math.round((performance.now() - repairStart) * 100) / 100 })
      const unresolvedIntegrity = postTransitionRepair.reports.find((report) => report.classification === 'UNRECOVERABLE' && report.sourceDomain === 'MARKET_ROSTER_CONTRACT')
      if (unresolvedIntegrity !== undefined) throw Object.assign(new Error(unresolvedIntegrity.diagnostics[0]?.message ?? 'Roster/contract integrity could not be reconciled.'), { phaseId: activePhaseId, kind: 'INVARIANT_VIOLATION' as const })
      const beforePlanning = current
      current = reviewMaterialRosterChanges(beforeCalendar, current)
      phases.push({ phaseId: 'GM_PLANNING_CHECKPOINT', order: phases.length + 1, date: current.currentDate, ran: true, worldChanged: current !== beforePlanning, diagnostics: [], summary: `Rechecked club planning after completed roster changes for ${changedTeamIds.length} affected club(s).` })
    }

    activePhaseId = 'SCHEDULE_INTEGRITY'
    const integrityStart = performance.now()
    const integrityFailure = Object.values(current.games).sort((a, b) => a.id.localeCompare(b.id)).find((game) => game.status === 'scheduled' && compareGameDates(game.date, current.currentDate) < 0)
    if (integrityFailure !== undefined) throw Object.assign(new Error(`Scheduled Game ${integrityFailure.id} is in the past after the day transition`), { phaseId: 'SCHEDULE_INTEGRITY', kind: 'INVARIANT_VIOLATION' as const })
    phases.push({ phaseId: 'SCHEDULE_INTEGRITY', order: phases.length + 1, date: current.currentDate, ran: true, worldChanged: false, diagnostics: [], summary: 'No scheduled game remains in the past after the day transition.', elapsedMs: Math.round((performance.now() - integrityStart) * 100) / 100 })

    activePhaseId = 'PRE_MATCH_MEDIA'
    const mediaStart = performance.now()
    const userTeam = getUserTeam(current)
    const userGame = userTeam === undefined ? undefined : getScheduledGamesToday(current).find((game) => game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id)
    const beforeMedia = current
    current = userGame === undefined ? current : createPreMatchMediaOpportunity(current, userGame.id)
    phases.push({ phaseId: 'PRE_MATCH_MEDIA', order: phases.length + 1, date: current.currentDate, ran: userGame !== undefined, worldChanged: current !== beforeMedia, diagnostics: [], summary: userGame === undefined ? 'No user match today; no pre-match media opportunity was created.' : `Applied the existing pre-match media lifecycle for game ${userGame.id}.`, elapsedMs: Math.round((performance.now() - mediaStart) * 100) / 100 })

    activePhaseId = 'BREAKPOINT_EVALUATION'
    const afterStart = performance.now()
    const breakpointAfter = evaluateSimulationBreakpoints(current)
    const attention = breakpointAfter.candidates.filter((candidate) => candidate.level === 'ACTION_REQUIRED' || candidate.level === 'BLOCKING')
    const afterDiagnostics = attention.map((candidate) => ({ code: 'BREAKPOINT_AFTER_PROCESSING', message: candidate.diagnostic, sourceId: candidate.sourceId }))
    phases.push({ phaseId: 'BREAKPOINT_EVALUATION', order: phases.length + 1, date: current.currentDate, ran: true, worldChanged: false, diagnostics: afterDiagnostics, summary: attention.length === 0 ? 'No action-required or blocking breakpoint appeared after processing.' : `${attention.length} action-required or blocking breakpoint(s) are present for the next transition.`, elapsedMs: Math.round((performance.now() - afterStart) * 100) / 100 })
    phases.push({ phaseId: 'DAY_COMPLETE', order: phases.length + 1, date: current.currentDate, ran: true, worldChanged: false, diagnostics: [], summary: 'Daily lifecycle completed.' })
    return {
      status: attention.length === 0 ? 'COMPLETED' : 'BREAKPOINT_AFTER_PROCESSING', world: current, phases: Object.freeze(phases),
      diagnostics: Object.freeze(phases.flatMap((phase) => phase.diagnostics)), breakpointBefore, breakpointAfter,
      repairReports: Object.freeze(repairReports), seasonPointerChanged: calendar.seasonPointerChanged,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const phaseId = error !== null && typeof error === 'object' && 'phaseId' in error ? String(error.phaseId) : activePhaseId
    const kind = error !== null && typeof error === 'object' && 'kind' in error ? error.kind : error instanceof RangeError || error instanceof TypeError ? 'INVARIANT_VIOLATION' : 'TECHNICAL_FAILURE'
    const diagnostic = { code: String(kind), message }
    phases.push({ phaseId, order: phases.length + 1, date: world.currentDate, ran: true, worldChanged: false, diagnostics: [diagnostic], summary: message })
    return { status: 'FAILED', world, phases: Object.freeze(phases), diagnostics: Object.freeze(phases.flatMap((phase) => phase.diagnostics)), breakpointBefore, repairReports: Object.freeze(repairReports), seasonPointerChanged: false, failure: { kind: kind === 'INVARIANT_VIOLATION' ? kind : 'TECHNICAL_FAILURE', phaseId, message } }
  }
}

function newlyAcceptedNegotiationIds(previous: GameWorld, next: GameWorld): readonly string[] {
  return Object.values(next.negotiationsById)
    .filter((negotiation) => negotiation.status === 'ACCEPTED'
      && previous.negotiationsById[negotiation.id]?.status !== 'ACCEPTED'
      && negotiation.teamId !== undefined
      && next.teams[negotiation.teamId]?.coachId !== undefined
      && next.teams[negotiation.teamId]?.coachId !== next.userCoachId)
    .map((negotiation) => negotiation.id)
    .sort((left, right) => left.localeCompare(right))
}

function newlyAcceptedRetentionNegotiationIds(previous: GameWorld, next: GameWorld): readonly string[] {
  return Object.values(next.retentionNegotiationsById)
    .filter((negotiation) => negotiation.status === 'ACCEPTED' && negotiation.execution === undefined
      && previous.retentionNegotiationsById[negotiation.id]?.status !== 'ACCEPTED'
      && next.teams[negotiation.teamId]?.coachId !== undefined && next.teams[negotiation.teamId]?.coachId !== next.userCoachId)
    .map((negotiation) => negotiation.id)
    .sort((left, right) => left.localeCompare(right))
}

function retentionSigningCheckpointPhase(world: GameWorld, order: number, acceptedCount: number, results: readonly RetentionSigningResult[]): WorldDayAdvancePhase {
  const proposed = results.filter((result) => result.status === 'GOVERNANCE_REQUIRED')
  return {
    phaseId: 'AI_ACCEPTED_RETENTION_SIGNING_GOVERNANCE', order, date: world.currentDate, ran: acceptedCount > 0, worldChanged: proposed.length > 0,
    diagnostics: results.map((result) => ({ code: `AI_RETENTION_SIGNING_${result.status}`, message: result.reason ?? `Retention signing reached ${result.status}.`, sourceId: result.governanceDecisionId ?? result.negotiationId })),
    summary: acceptedCount === 0 ? 'No newly accepted AI retention agreement required binding execution.' : `Processed ${acceptedCount} newly accepted AI retention agreement(s); proposed ${proposed.length} signing Governance decision(s).`,
  }
}

function signingGovernanceCheckpointPhase(
  phaseId: string,
  order: number,
  world: GameWorld,
  acceptedCount: number,
  results: readonly PlayerContractSigningWorkflowResult[],
): WorldDayAdvancePhase {
  const proposed = results.filter((result) => result.status === 'PROPOSED')
  const diagnostics = results.map((result) => ({
    code: result.status === 'PROPOSED' ? 'AI_SIGNING_DECISION_PROPOSED' : `AI_SIGNING_GOVERNANCE_${result.status}`,
    message: result.status === 'PROPOSED'
      ? 'AI initiated the exact accepted free-agent signing through an appointed Governance proposer; institutional approval remains pending.'
      : `AI signing Governance workflow did not advance: ${result.reason ?? result.status}.`,
    sourceId: result.decision?.id ?? result.negotiationId,
  }))
  return {
    phaseId,
    order,
    date: world.currentDate,
    ran: acceptedCount > 0,
    worldChanged: proposed.length > 0,
    diagnostics,
    summary: acceptedCount === 0
      ? 'No newly accepted AI negotiation required a signing Governance check.'
      : `Checked ${acceptedCount} newly accepted AI negotiation(s); proposed ${proposed.length} signing decision(s) and reported ${results.length - proposed.length} workflow blocker(s).`,
  }
}

function repairDiagnostics(reports: readonly WorldRepairReport[]) {
  return reports.flatMap((report) => report.diagnostics.length === 0
    ? [{ code: `REPAIR_${report.classification}`, message: `${report.repairKind}: ${report.actionApplied} ${report.resultingStateSummary}`, sourceId: report.targetEntity }]
    : report.diagnostics.map((diagnostic) => ({ code: diagnostic.code, message: diagnostic.message, sourceId: report.targetEntity })))
}
