import { getContinueStopReason, getNextKnownEvent, type ContinueResult } from '@/app/game'
import type { GameId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { BdmButton } from '@/ui/components/designSystem'
import { formatPrototypeDate } from '@/ui/formatters'
import { useState } from 'react'

export function ContinueControl({ world, onAdvanceDay, onContinue, onOpenPendingGame }: { readonly world: GameWorld; readonly onAdvanceDay: () => void; readonly onContinue: () => ContinueResult; readonly onOpenPendingGame: (gameId: GameId) => void }) {
  const [isAdvancing, setIsAdvancing] = useState(false); const [lastResult, setLastResult] = useState<ContinueResult | null>(null)
  const next = getNextKnownEvent(world)
  const opponent = next === undefined ? undefined : world.teams[next.opponentTeamId]?.name
  const interruption = getContinueStopReason(world)
  const pendingGameId = interruption?.type === 'userGame' ? interruption.gameId : undefined
  const stoppedForGame = pendingGameId !== undefined
  const visualState = stoppedForGame ? 'game' : interruption?.type === 'seasonComplete' ? 'complete' : 'continue'

  return <section aria-label="Career time controls" className="desktop-continue-control" data-state={visualState}>
    <BdmButton className="desktop-continue-control__primary" loading={isAdvancing} onClick={() => { if (pendingGameId !== undefined) { onOpenPendingGame(pendingGameId); return }; setIsAdvancing(true); try { setLastResult(onContinue()) } finally { setIsAdvancing(false) } }} size="large" trailingIcon="▶">{isAdvancing ? `Procesando ${formatPrototypeDate(world.currentDate)}...` : stoppedForGame ? 'PARTIDO' : 'CONTINUAR'}</BdmButton>
    {stoppedForGame && <p className="desktop-continue-control__status">Partido pendiente · {formatPrototypeDate(world.currentDate)}{opponent === undefined ? '' : ` · vs ${opponent}`}</p>}
    {!stoppedForGame && next !== undefined && <p className="desktop-continue-control__next">Próximo partido · {formatPrototypeDate(next.date)}{opponent === undefined ? '' : ` · vs ${opponent}`}</p>}
    {!stoppedForGame && next === undefined && <p className="desktop-continue-control__next">No hay próximo partido programado</p>}
    <BdmButton className="desktop-continue-control__secondary" onClick={() => { onAdvanceDay(); setLastResult(null) }} size="compact" variant="ghost">Avanzar 1 día</BdmButton>
  </section>
}
