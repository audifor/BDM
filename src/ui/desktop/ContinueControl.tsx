import { getContinueStopReason, getNextKnownEvent, type ContinueResult, type SimulateUntilResult, type WorldDayAdvanceResult } from '@/app/game'
import type { GameDate } from '@/domain/date'
import type { GameId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { BdmButton } from '@/ui/components/designSystem'
import { formatPrototypeDate } from '@/ui/formatters'
import { useState } from 'react'
import { SimulateUntilDateControl } from './SimulateUntilDateControl'

export function ContinueControl({ world, onAdvanceDay, onContinue, onOpenPendingGame, onStartNextSeason, onSimulateUntilDate }: { readonly world: GameWorld; readonly onAdvanceDay: () => WorldDayAdvanceResult | void; readonly onContinue: () => ContinueResult; readonly onOpenPendingGame: (gameId: GameId) => void; readonly onStartNextSeason: () => void; readonly onSimulateUntilDate: (date: GameDate) => SimulateUntilResult }) {
  const [isAdvancing, setIsAdvancing] = useState(false); const [lastResult, setLastResult] = useState<ContinueResult | null>(null); const [advanceMessage, setAdvanceMessage] = useState<string | null>(null)
  const next = getNextKnownEvent(world)
  const opponent = next === undefined ? undefined : world.teams[next.opponentTeamId]?.name
  const interruption = getContinueStopReason(world)
  const pendingGameId = interruption?.type === 'userGame' ? interruption.gameId : undefined
  const stoppedForGame = pendingGameId !== undefined
  const seasonComplete = interruption?.type === 'seasonComplete'
  const visualState = stoppedForGame ? 'game' : seasonComplete ? 'complete' : 'continue'

  return <section aria-label="Career time controls" className="desktop-continue-control" data-state={visualState}>
    <BdmButton className="desktop-continue-control__primary" loading={isAdvancing} onClick={() => { if (pendingGameId !== undefined) { onOpenPendingGame(pendingGameId); return }; if (seasonComplete) { onStartNextSeason(); return }; setIsAdvancing(true); setAdvanceMessage(null); try { setLastResult(onContinue()) } catch (error) { setAdvanceMessage(error instanceof Error ? error.message : String(error)) } finally { setIsAdvancing(false) } }} size="large" trailingIcon="▶">{isAdvancing ? `Procesando ${formatPrototypeDate(world.currentDate)}...` : stoppedForGame ? 'PARTIDO' : seasonComplete ? 'NUEVA TEMPORADA' : 'CONTINUAR'}</BdmButton>
    {stoppedForGame && <p className="desktop-continue-control__status">Partido pendiente · {formatPrototypeDate(world.currentDate)}{opponent === undefined ? '' : ` · vs ${opponent}`}</p>}
    {seasonComplete && <p className="desktop-continue-control__status">Temporada finalizada · {formatPrototypeDate(world.currentDate)}</p>}
    {!stoppedForGame && !seasonComplete && next !== undefined && <p className="desktop-continue-control__next">Próximo partido · {formatPrototypeDate(next.date)}{opponent === undefined ? '' : ` · vs ${opponent}`}</p>}
    {!stoppedForGame && !seasonComplete && next === undefined && <p className="desktop-continue-control__next">No hay próximo partido programado</p>}
    {advanceMessage !== null ? <p aria-live="assertive" className="desktop-continue-control__status" role="alert">No se avanzó la fecha: {advanceMessage}</p> : null}
    <BdmButton className="desktop-continue-control__secondary" onClick={() => { setAdvanceMessage(null); setLastResult(null); const result = onAdvanceDay(); if (result?.status === 'BREAKPOINT_PREVENTED') setAdvanceMessage(result.breakpointBefore.breakpoint?.diagnostic ?? 'Una decisión pendiente impide avanzar.'); else if (result?.status === 'FAILED') setAdvanceMessage(`${result.failure?.phaseId ?? 'Lifecycle'}: ${result.failure?.message ?? 'fallo técnico'}`); else if (result?.status === 'BREAKPOINT_AFTER_PROCESSING') setAdvanceMessage(result.diagnostics[0]?.message ?? 'La fecha avanzó con una alerta de simulación.') }} size="compact" variant="ghost">Avanzar 1 día</BdmButton>
    <SimulateUntilDateControl onSimulateUntilDate={onSimulateUntilDate} world={world} />
  </section>
}
