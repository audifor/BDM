import { compareGameDates } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getScheduledGamesToday, type CalendarDayLifecycleResult, type DailyLifecycleDiagnostic } from '@/engine/calendar'
import { createPreMatchMediaOpportunity } from '@/engine/media'
import { getUserTeam } from '@/engine/calendar'

import { createMatchSeed, simulateAndApplyGame, type MatchSeedFactory } from './playUserGame'
import { evaluateSimulationBreakpoints, type SimulationBreakpointResult } from './SimulationBreakpoints'

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
export function simulateRemainingGamesToday(world: GameWorld, createSeed: MatchSeedFactory = createMatchSeed, allowedRequiredReasons: readonly string[] = ['userGame']): GameWorld {
  assertSimulationMayAdvance(world, allowedRequiredReasons)
  return getScheduledGamesToday(world).reduce(
    (updatedWorld, game) => simulateAndApplyGame(updatedWorld, game, createSeed()),
    world,
  )
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
  if (unhandled !== undefined) return { status: 'BREAKPOINT_PREVENTED', world, phases: Object.freeze(phases), diagnostics: Object.freeze(phases.flatMap((phase) => phase.diagnostics)), breakpointBefore, seasonPointerChanged: false }

  let current = world
  let activePhaseId = 'MATCH_RESOLUTION'
  try {
    const matches = getScheduledGamesToday(current)
    const matchStart = performance.now()
    current = simulateRemainingGamesToday(current, createSeed, allowedRequiredReasons)
    phases.push({ phaseId: 'MATCH_RESOLUTION', order: phases.length + 1, date: world.currentDate, ran: matches.length > 0, worldChanged: current !== world, diagnostics: [], summary: matches.length === 0 ? 'No scheduled games required resolution.' : `Resolved ${matches.length} scheduled game(s) through the existing match application boundary.`, elapsedMs: Math.round((performance.now() - matchStart) * 100) / 100 })

    activePhaseId = 'CALENDAR_LIFECYCLE'
    const calendar: CalendarDayLifecycleResult = advanceDayWithTrace(current)
    if (calendar.status === 'FAILED') {
      phases.push(...calendar.phases.map((phase, index) => ({ ...phase, order: phases.length + index + 1 })))
      return {
        status: 'FAILED', world, phases: Object.freeze(phases), diagnostics: Object.freeze(phases.flatMap((phase) => phase.diagnostics)),
        breakpointBefore, seasonPointerChanged: false,
        ...(calendar.failure === undefined ? {} : { failure: { kind: calendar.failure.kind, phaseId: calendar.failure.phaseId, message: calendar.failure.message } }),
      }
    }
    current = calendar.world
    phases.push(...calendar.phases.map((phase, index) => ({ ...phase, order: phases.length + index + 1 })))

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
      seasonPointerChanged: calendar.seasonPointerChanged,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const phaseId = error !== null && typeof error === 'object' && 'phaseId' in error ? String(error.phaseId) : activePhaseId
    const kind = error !== null && typeof error === 'object' && 'kind' in error ? error.kind : error instanceof RangeError || error instanceof TypeError ? 'INVARIANT_VIOLATION' : 'TECHNICAL_FAILURE'
    const diagnostic = { code: String(kind), message }
    phases.push({ phaseId, order: phases.length + 1, date: world.currentDate, ran: true, worldChanged: false, diagnostics: [diagnostic], summary: message })
    return { status: 'FAILED', world, phases: Object.freeze(phases), diagnostics: Object.freeze(phases.flatMap((phase) => phase.diagnostics)), breakpointBefore, seasonPointerChanged: false, failure: { kind: kind === 'INVARIANT_VIOLATION' ? kind : 'TECHNICAL_FAILURE', phaseId, message } }
  }
}
