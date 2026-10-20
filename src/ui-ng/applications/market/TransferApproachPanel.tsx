import { useState } from 'react'
import { describeTransferSituation, evaluateTransferFee } from '@/app/transfer'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { marketMinorUnitsToMajor } from './marketFinancialSummary'
import './market-viability.css'

const AVAILABILITY_TEXT = { OPEN: 'Abierto a ofertas', LISTENING: 'Escucha ofertas', NOT_FOR_SALE: 'No está en venta' } as const

/**
 * Starts the purchase of a CONTRACTED player from his ficha or from the Market. He is not a free agent: the only door is his owner
 * club. This panel shows what the manager legitimately knows (owner, contract end, willingness learned so far), the compensation
 * authorization of HIS club (a different thing from the salary budget and from cash) and sends the proposal. The club's price is
 * never shown: it appears only when the club answers.
 */
export function TransferApproachPanel({ world, teamId, playerId, onProposed }: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly onProposed?: () => void
}) {
  const proposeTransfer = useGameStore((state) => state.proposeTransfer)
  const [fee, setFee] = useState('')
  const situation = describeTransferSituation(world, teamId, playerId)
  if (situation.kind !== 'CONTRACTED_ELSEWHERE') {
    return <p className="market-transfer__note" data-transfer-state={situation.kind}>
      {situation.kind === 'OWN_PLAYER' ? 'Ya pertenece a tu club.' : situation.kind === 'FREE_AGENT' ? 'Es agente libre: se contacta con él y su agente, no con un club.' : 'No hay un contrato en vigor con un club: no se puede proponer un traspaso.'}
    </p>
  }
  const authorization = situation.feeAuthorization
  const currency = authorization.currencyCode ?? 'EUR'
  const major = (minor: number | null) => minor === null ? 'Desconocido' : formatMoney(marketMinorUnitsToMajor(minor, currency))
  const feeValue = Number(fee)
  const valid = fee !== '' && Number.isSafeInteger(feeValue) && feeValue >= 1
  const decision = valid ? evaluateTransferFee(world, teamId, feeValue, 'preview') : undefined
  const active = situation.activeTransfer
  return <section className="market-transfer" aria-label="Compra a otro club" data-transfer-state="CONTRACTED_ELSEWHERE" data-owner-team={situation.ownerTeamId}>
    <header><strong>COMPRA A OTRO CLUB</strong><b className={`market-viability__verdict is-${decision === undefined ? 'unknown' : decision.allowed ? 'viable' : 'not_viable'}`}>{decision === undefined ? 'Pendiente de propuesta' : decision.allowed ? 'Viable' : 'No viable'}</b></header>
    <dl>
      <div><dt>Club propietario</dt><dd data-testid="transfer-owner">{situation.ownerClubName}</dd></div>
      <div><dt>Contrato conocido hasta</dt><dd>{situation.contractExpiresOn} · {situation.remainingYears} año(s)</dd></div>
      <div><dt>Disposición a negociar (lo que sabe tu club)</dt><dd>{situation.knownAvailability === undefined ? 'Sin información' : AVAILABILITY_TEXT[situation.knownAvailability]}</dd></div>
      <div><dt>Autorización para compensaciones</dt><dd data-testid="transfer-authorized">{major(authorization.authorizedMinorUnits)}</dd></div>
      <div><dt>Ya pagado en el periodo</dt><dd>{major(authorization.spentMinorUnits)}</dd></div>
      <div><dt>Margen realmente disponible</dt><dd data-testid="transfer-headroom">{major(authorization.headroomMinorUnits)}</dd></div>
      <div><dt>Compensación ≠ salario ≠ comisión</dt><dd>El salario se negocia después con el jugador</dd></div>
    </dl>
    {active !== undefined
      ? <p className="market-transfer__note" data-testid="transfer-active">Hay una operación en curso con {situation.ownerClubName}: sigue su estado en Mercado → Operaciones.</p>
      : <form className="market-transfer__form" onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        proposeTransfer(teamId, playerId, feeValue)
        setFee('')
        onProposed?.()
      }}>
        <label>Compensación que propones al club<input aria-label="Compensación propuesta" type="number" min="1" step="1" value={fee} placeholder="Importe total, una sola vez" onChange={(event) => setFee(event.target.value)} /></label>
        {decision !== undefined && !decision.allowed ? <small className="market-transfer__warning" role="alert">Finance no lo permite: {decision.reason}</small> : null}
        <small>El club responde mañana. Una propuesta no es un pago: no se mueve nada hasta cerrar los tres acuerdos (club, jugador y consejo).</small>
        <button type="submit" disabled={!valid || situation.blockers.length > 0}>Contactar con el club y proponer</button>
        {situation.blockers.length > 0 ? <small className="market-transfer__warning">{situation.blockers.join(' · ')}</small> : null}
      </form>}
  </section>
}
