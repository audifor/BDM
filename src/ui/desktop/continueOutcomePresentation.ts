import type { ContinueResult, ContinueStopReason, SimulateUntilResult, SimulateUntilStopReason, WorldDayAdvanceResult } from '@/app/game'
import { formatPrototypeDate } from '@/ui/formatters'

/**
 * Presentation-only projection of the canonical career-loop results so the player always sees why time
 * stopped. It derives text from the canonical results; it never re-evaluates breakpoints itself.
 */
export interface ContinueOutcomePresentation {
  readonly tone: 'progress' | 'attention' | 'failure'
  readonly title: string
  readonly detail: string
  readonly route?: string
}

type ContinueOutcomeResult = Pick<ContinueResult, 'daysAdvanced' | 'finalDate' | 'stopReason'>
type SimulateUntilOutcomeResult = Pick<SimulateUntilResult, 'daysAdvanced' | 'finalDate' | 'stopReason'>
type DayAdvanceOutcomeResult = Pick<WorldDayAdvanceResult, 'status' | 'diagnostics' | 'breakpointBefore' | 'failure'>

export function describeContinueStopReason(reason: ContinueStopReason): ContinueOutcomePresentation {
  switch (reason.type) {
    case 'userGame':
      return { tone: 'attention', title: 'PARTIDO PENDIENTE', detail: reason.breakpoint.diagnostic, route: reason.breakpoint.route }
    case 'mediaOpportunity':
      return { tone: 'attention', title: 'PRENSA PENDIENTE', detail: reason.breakpoint.diagnostic, route: reason.breakpoint.route }
    case 'seasonComplete':
      return { tone: 'attention', title: 'TEMPORADA FINALIZADA', detail: reason.breakpoint.diagnostic, route: reason.breakpoint.route }
    case 'breakpoint':
      return { tone: 'attention', title: 'SE REQUIERE TU ATENCIÓN', detail: reason.breakpoint.diagnostic, route: reason.breakpoint.route }
    case 'safetyLimit':
      return { tone: 'attention', title: 'LÍMITE DE SEGURIDAD', detail: 'Se alcanzó el límite de días de simulación continua antes de encontrar una interrupción.' }
    case 'noProgress':
      return { tone: 'failure', title: 'NO SE PUDO AVANZAR', detail: reason.diagnostic }
  }
}

export function describeContinueResult(result: ContinueOutcomeResult): ContinueOutcomePresentation {
  const stop = describeContinueStopReason(result.stopReason)
  const stopped = `Simulación detenida tras ${result.daysAdvanced} ${result.daysAdvanced === 1 ? 'día' : 'días'} · ${formatPrototypeDate(result.finalDate)}.`
  if (result.daysAdvanced === 0) return { ...stop, detail: `No se avanzó la fecha. ${stop.detail}` }
  return { ...stop, detail: `${stopped} ${stop.detail}` }
}

export function describeSimulateUntilResult(result: SimulateUntilOutcomeResult): ContinueOutcomePresentation {
  const reason: SimulateUntilStopReason = result.stopReason
  if (reason.type === 'arrived') return { tone: 'progress', title: 'SIMULACIÓN COMPLETADA', detail: `La fecha avanzó hasta ${formatPrototypeDate(result.finalDate)}.` }
  if (reason.type === 'unsupportedLifecycle') {
    return { tone: 'attention', title: 'COMPETICIÓN SIN LIFECYCLE', detail: `La competición ${reason.diagnostic.competitionId} no tiene lifecycle de temporadas futuras (última fecha soportada: ${formatPrototypeDate(reason.diagnostic.lastSupportedDate)}). El mundo avanzó hasta ${formatPrototypeDate(result.finalDate)}.` }
  }
  const stop = describeContinueStopReason(reason)
  return { ...stop, detail: `Simulación detenida tras ${result.daysAdvanced} ${result.daysAdvanced === 1 ? 'día' : 'días'} · ${formatPrototypeDate(result.finalDate)}. ${stop.detail}` }
}

export function describeDayAdvanceResult(result: DayAdvanceOutcomeResult): ContinueOutcomePresentation | undefined {
  if (result.status === 'COMPLETED') return undefined
  if (result.status === 'BREAKPOINT_AFTER_PROCESSING') {
    return { tone: 'attention', title: 'FECHA AVANZADA CON AVISO', detail: result.diagnostics[0]?.message ?? 'La fecha avanzó con una alerta de simulación.' }
  }
  if (result.status === 'BREAKPOINT_PREVENTED') {
    const breakpoint = result.breakpointBefore.breakpoint
    return { tone: 'attention', title: 'NO SE PUDO AVANZAR', detail: `No se avanzó la fecha. ${breakpoint?.diagnostic ?? 'Una decisión pendiente impide avanzar.'}`, ...(breakpoint?.route === undefined ? {} : { route: breakpoint.route }) }
  }
  return { tone: 'failure', title: 'NO SE PUDO AVANZAR', detail: `No se avanzó la fecha. ${result.failure?.phaseId ?? 'Lifecycle'}: ${result.failure?.message ?? 'fallo técnico'}` }
}
