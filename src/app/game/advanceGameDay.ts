import { compareGameDates } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getScheduledGamesToday, type CalendarDayLifecycleResult, type DailyLifecycleDiagnostic } from '@/engine/calendar'
import { createPreMatchMediaOpportunity } from '@/engine/media'
import { getUserTeam } from '@/engine/calendar'

import { createMatchSeed, type MatchSeedFactory } from './playUserGame'
import { applyDayResults, dayGamesAreIndependent, prepareDayGames, resolveDayGames, resolveDayGamesAsync, simulateDayGamesInline, type PreparedDayGame } from './matchResolution'
import type { MatchNextResult } from '@/app/matchNext/MatchNextResult'
import type { MatchSimulationRunner } from '@/app/matchNext/MatchSimulationRunner'
import { evaluateSimulationBreakpoints, type SimulationBreakpointResult } from './SimulationBreakpoints'
import { repairWorldAtLifecycleBoundary } from '@/app/repair'
import type { WorldRepairReport } from '@/domain/repair'

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
export function simulateRemainingGamesToday(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame'], repairReports: WorldRepairReport[] = []): GameWorld {
  assertSimulationMayAdvance(world, allowedRequiredReasons)
  return resolveDayGames(world, getScheduledGamesToday(world), createSeed, repairReports)
}

/** The same resolution with the simulation phase on `runner` (parallel workers in the app); identical result for the same seeds. */
export async function simulateRemainingGamesTodayAsync(world: GameWorld, runner: MatchSimulationRunner, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame'], repairReports: WorldRepairReport[] = []): Promise<GameWorld> {
  assertSimulationMayAdvance(world, allowedRequiredReasons)
  return resolveDayGamesAsync(world, getScheduledGamesToday(world), createSeed, runner, repairReports)
}

/** Resolves today's pending games, then advances the game calendar by one day. */
export function advanceGameDay(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame']): GameWorld {
  const result = advanceGameDayWithResult(world, createSeed, allowedRequiredReasons)
  if (result.status === 'BREAKPOINT_PREVENTED') throw new SimulationAdvanceBlockedError(result.breakpointBefore)
  if (result.status === 'FAILED') throw new Error(result.failure?.message ?? 'World day lifecycle failed')
  return result.world
}

/** Executes one application day boundary and returns transient lifecycle evidence. */
export function advanceGameDayWithResult(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame']): WorldDayAdvanceResult {
  const process = advanceGameDayProcess(world, createSeed, allowedRequiredReasons)
  let step = process.next()
  while (!step.done) {
    let results: MatchNextResult[]
    try {
      results = simulateDayGamesInline(step.value)
    } catch (error) {
      step = process.throw(error)
      continue
    }
    step = process.next(results)
  }
  return step.value
}

/**
 * ME-LOCK1.1: the same day boundary with the day's match simulations on `runner` (a pool of workers in the app). Everything else -
 * breakpoints, repairs, preparation, result application in schedule order, calendar, media - runs exactly as in the synchronous
 * version (it is the same process); for the same seeds the returned world is identical.
 */
export async function advanceGameDayWithResultAsync(world: GameWorld, runner: MatchSimulationRunner, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame']): Promise<WorldDayAdvanceResult> {
  const process = advanceGameDayProcess(world, createSeed, allowedRequiredReasons)
  let step = process.next()
  while (!step.done) {
    let results: MatchNextResult[]
    try {
      results = await runner.simulate(step.value.map((item) => item.setup))
    } catch (error) {
      step = process.throw(error)
      continue
    }
    step = process.next(results)
  }
  return step.value
}

/** `advanceGameDay` with the simulation phase on `runner`. */
export async function advanceGameDayAsync(world: GameWorld, runner: MatchSimulationRunner, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame']): Promise<GameWorld> {
  const result = await advanceGameDayWithResultAsync(world, runner, createSeed, allowedRequiredReasons)
  if (result.status === 'BREAKPOINT_PREVENTED') throw new SimulationAdvanceBlockedError(result.breakpointBefore)
  if (result.status === 'FAILED') throw new Error(result.failure?.message ?? 'World day lifecycle failed')
  return result.world
}

/**
 * The one day process. It yields once, with the day's prepared Games, and expects their FAST results in the same order: the only step
 * that may run elsewhere (the synchronous driver simulates inline; the asynchronous one hands the setups to a runner). A failure of
 * that step is thrown back into the process at the yield, so it ends the day as FAILED with the world untouched, as before.
 */
function* advanceGameDayProcess(world: GameWorld, createSeed: MatchSeedFactory, allowedRequiredReasons: readonly string[]): Generator<readonly PreparedDayGame[], WorldDayAdvanceResult, MatchNextResult[]> {
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
    assertSimulationMayAdvance(current, allowedRequiredReasons)
    if (dayGamesAreIndependent(matches)) {
      const prepared = prepareDayGames(current, matches, createSeed, lineupReports)
      const results: MatchNextResult[] = prepared.length === 0 ? [] : yield prepared
      current = applyDayResults(current, prepared, results)
    } else {
      current = resolveDayGames(current, matches, createSeed, lineupReports)
    }
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

    activePhaseId = 'POST_TRANSITION_SELF_HEALING'
    const changedTeamIds = Object.values(beforeCalendar.teams).filter((team) => team.rosterPlayerIds.join('|') !== current.teams[team.id]?.rosterPlayerIds.join('|')).map((team) => team.id).sort((a, b) => a.localeCompare(b))
    if (changedTeamIds.length > 0) {
      const repairStart = performance.now()
      const postTransitionRepair = repairWorldAtLifecycleBoundary(current, changedTeamIds)
      current = postTransitionRepair.world
      repairReports.push(...postTransitionRepair.reports)
      phases.push({ phaseId: activePhaseId, order: phases.length + 1, date: current.currentDate, ran: true, worldChanged: postTransitionRepair.world !== beforeCalendar, diagnostics: repairDiagnostics(postTransitionRepair.reports), summary: postTransitionRepair.reports.length === 0 ? 'Roster transitions left no minimum-roster or contract-integrity repair pending.' : `Evaluated ${postTransitionRepair.reports.length} repair report(s) after roster transitions.`, elapsedMs: Math.round((performance.now() - repairStart) * 100) / 100 })
      const unresolvedIntegrity = postTransitionRepair.reports.find((report) => report.classification === 'UNRECOVERABLE' && report.sourceDomain === 'MARKET_ROSTER_CONTRACT')
      if (unresolvedIntegrity !== undefined) throw Object.assign(new Error(unresolvedIntegrity.diagnostics[0]?.message ?? 'Roster/contract integrity could not be reconciled.'), { phaseId: activePhaseId, kind: 'INVARIANT_VIOLATION' as const })
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

function repairDiagnostics(reports: readonly WorldRepairReport[]) {
  return reports.flatMap((report) => report.diagnostics.length === 0
    ? [{ code: `REPAIR_${report.classification}`, message: `${report.repairKind}: ${report.actionApplied} ${report.resultingStateSummary}`, sourceId: report.targetEntity }]
    : report.diagnostics.map((diagnostic) => ({ code: diagnostic.code, message: diagnostic.message, sourceId: report.targetEntity })))
}
