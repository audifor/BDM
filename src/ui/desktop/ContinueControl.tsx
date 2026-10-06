import { getContinueStopReason, getNextKnownEvent, type ContinueResult, type ContinueStopReason, type SimulateUntilResult, type WorldDayAdvanceResult } from '@/app/game'
import type { GameDate } from '@/domain/date'
import type { GameId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { BdmButton } from '@/ui/components/designSystem'
import { formatPrototypeDate } from '@/ui/formatters'
import { useState } from 'react'
import { SimulateUntilDateControl } from './SimulateUntilDateControl'
import { describeContinueResult, describeContinueStopReason, describeDayAdvanceResult, describeSimulateUntilResult, type ContinueOutcomePresentation } from './continueOutcomePresentation'

export function ContinueControl({ world, onAdvanceDay, onContinue, onOpenPendingGame, onStartNextSeason, onSimulateUntilDate }: { readonly world: GameWorld; readonly onAdvanceDay: () => WorldDayAdvanceResult | void; readonly onContinue: () => ContinueResult; readonly onOpenPendingGame: (gameId: GameId) => void; readonly onStartNextSeason: () => void; readonly onSimulateUntilDate: (date: GameDate) => SimulateUntilResult }) {
  const [isAdvancing, setIsAdvancing] = useState(false); const [continueOutcome, setContinueOutcome] = useState<ContinueOutcomePresentation | null>(null); const [simulateOutcome, setSimulateOutcome] = useState<ContinueOutcomePresentation | null>(null); const [advanceOutcome, setAdvanceOutcome] = useState<ContinueOutcomePresentation | null>(null)
  const next = getNextKnownEvent(world)
  const opponent = next === undefined ? undefined : world.teams[next.opponentTeamId]?.name
  const pending = currentInterruption(world)
  const interruption = pending.reason
  const pendingGameId = interruption?.type === 'userGame' ? interruption.gameId : undefined
  const stoppedForGame = pendingGameId !== undefined
  const seasonComplete = interruption?.type === 'seasonComplete'
  const visualState = stoppedForGame ? 'game' : seasonComplete ? 'complete' : 'continue'
  const outcome = continueOutcome ?? simulateOutcome ?? advanceOutcome ?? pending.failure ?? (interruption === undefined ? null : describeContinueStopReason(interruption))

  return <section aria-label="Career time controls" className="desktop-continue-control" data-state={visualState}>
    <BdmButton className="desktop-continue-control__primary" loading={isAdvancing} onClick={() => { if (pendingGameId !== undefined) { onOpenPendingGame(pendingGameId); return }; if (seasonComplete) { onStartNextSeason(); return }; setIsAdvancing(true); setSimulateOutcome(null); setAdvanceOutcome(null); try { setContinueOutcome(describeContinueResult(onContinue())) } catch (error) { setContinueOutcome({ tone: 'failure', title: 'NO SE PUDO AVANZAR', detail: `No se avanzó la fecha. ${error instanceof Error ? error.message : String(error)}` }) } finally { setIsAdvancing(false) } }} size="large" trailingIcon="▶">{isAdvancing ? `Procesando ${formatPrototypeDate(world.currentDate)}...` : stoppedForGame ? 'PARTIDO' : seasonComplete ? 'NUEVA TEMPORADA' : 'CONTINUAR'}</BdmButton>
    {stoppedForGame && <p className="desktop-continue-control__status">Partido pendiente · {formatPrototypeDate(world.currentDate)}{opponent === undefined ? '' : ` · vs ${opponent}`}</p>}
    {seasonComplete && <p className="desktop-continue-control__status">Temporada finalizada · {formatPrototypeDate(world.currentDate)}</p>}
    {!stoppedForGame && !seasonComplete && next !== undefined && <p className="desktop-continue-control__next">Próximo partido · {formatPrototypeDate(next.date)}{opponent === undefined ? '' : ` · vs ${opponent}`}</p>}
    {!stoppedForGame && !seasonComplete && next === undefined && <p className="desktop-continue-control__next">No hay próximo partido programado</p>}
    {outcome !== null && <div aria-live="assertive" className="desktop-continue-control__outcome" data-tone={outcome.tone} role={outcome.tone === 'failure' ? 'alert' : 'status'}><strong>{outcome.title}</strong><p>{outcome.detail}</p>{outcome.route !== undefined && <p className="desktop-continue-control__outcome-route">Ruta disponible · {outcome.route}</p>}</div>}
    <BdmButton className="desktop-continue-control__secondary" onClick={() => { setContinueOutcome(null); setSimulateOutcome(null); setAdvanceOutcome(null); const result = onAdvanceDay(); if (result !== undefined && result !== null) setAdvanceOutcome(describeDayAdvanceResult(result) ?? null) }} size="compact" variant="ghost">Avanzar 1 día</BdmButton>
    <SimulateUntilDateControl onOutcome={(result) => { setContinueOutcome(null); setAdvanceOutcome(null); setSimulateOutcome(describeSimulateUntilResult(result)) }} onSimulateUntilDate={onSimulateUntilDate} world={world} />
  </section>
}

/**
 * The current canonical stop, or an explicit technical failure when the world state cannot even be evaluated
 * (e.g. a completed game without a result). Time must never stop without the player knowing why.
 */
function currentInterruption(world: GameWorld): { readonly reason?: ContinueStopReason; readonly failure?: ContinueOutcomePresentation } {
  try {
    return { reason: getContinueStopReason(world) }
  } catch (error) {
    return { failure: { tone: 'failure', title: 'NO SE PUDO EVALUAR EL ESTADO', detail: `No se pudo evaluar el estado del mundo. ${error instanceof Error ? error.message : String(error)}` } }
  }
}
