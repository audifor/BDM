import { useState } from 'react'
import { describeTransferGovernance, evaluateTransferFee } from '@/app/transfer'
import type { PlayerId, TeamId } from '@/domain/ids'
import { currentClubRound, currentPlayerRound, type PlayerTransferNegotiation } from '@/domain/transfer'
import type { GameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { CustomOfferForm } from './CustomOfferForm'
import { MarketViabilityPanel } from './MarketViabilityPanel'
import { buildMarketViability } from './marketViability'
import './market-viability.css'

const playerName = (world: GameWorld, playerId: PlayerId): string => {
  const player = world.players[playerId]
  return player === undefined ? 'Jugador' : `${player.firstName} ${player.lastName}`
}

const CLUB_TEXT = {
  AWAITING_CLUB_RESPONSE: 'Esperando la respuesta del club (llega mañana)',
  CLUB_COUNTERED: 'El club contraoferta',
  CLUB_AGREED: 'Acuerdo entre clubes',
  CLUB_REJECTED: 'El club rechaza la propuesta',
  WITHDRAWN: 'Retirada',
} as const
const PLAYER_TEXT = {
  NOT_STARTED: 'Pendiente de negociar con el jugador',
  AWAITING_PLAYER_RESPONSE: 'Esperando la respuesta del jugador (llega mañana)',
  PLAYER_COUNTERED: 'El jugador contraoferta',
  PLAYER_AGREED: 'Acuerdo con el jugador',
  PLAYER_REJECTED: 'El jugador rechaza las condiciones',
} as const
const GOVERNANCE_TEXT = {
  NOT_REQUESTED: 'Sin solicitar', PROPOSED: 'Solicitada: el consejo decide en el siguiente día', REVIEW_STARTED: 'En revisión', APPROVED: 'Autorizada',
  REJECTED: 'Denegada por el consejo', VETOED: 'Vetada', WITHDRAWN: 'Retirada', EXECUTED: 'Ejecutada',
} as const
const CLOSE_TEXT = {
  CLUB_REJECTED: 'Cerrada: el club vendedor rechazó la propuesta', WITHDRAWN_BY_BUYER: 'Cerrada: retirada por tu club', PLAYER_REJECTED: 'Cerrada: el jugador rechazó las condiciones',
  PLAYER_UNAVAILABLE: 'Cerrada: el jugador ya no está disponible con ese contrato', GOVERNANCE_REJECTED: 'Cerrada: el consejo denegó la autorización',
} as const

/**
 * The negotiated transfers of the manager's club, stage by stage, inside Market → Operaciones: owner club, known contractual
 * situation, compensation asked and agreed, offer on the table, the club's and the player's answers, pending authorizations,
 * economic viability and final state. Every button is a real command of the store; nothing here decides anything.
 */
export function TransferOperationsSection({ world, teamId }: { readonly world: GameWorld; readonly teamId: TeamId }) {
  const transfers = Object.values(world.playerTransferNegotiationsById).filter((item) => item.buyerTeamId === teamId)
    .sort((a, b) => b.openedOn.localeCompare(a.openedOn) || b.id.localeCompare(a.id))
  if (transfers.length === 0) return null
  return <section className="market-transfers" aria-label="Traspasos entre clubes" data-testid="market-transfers">
    <header className="market-negotiations__head"><strong>TRASPASOS ENTRE CLUBES</strong><span>{transfers.length} registrados</span></header>
    {transfers.map((transfer) => <TransferEntry key={transfer.id} world={world} teamId={teamId} transfer={transfer} />)}
  </section>
}

function TransferEntry({ world, teamId, transfer }: { readonly world: GameWorld; readonly teamId: TeamId; readonly transfer: PlayerTransferNegotiation }) {
  const store = useGameStore.getState
  const [revisedFee, setRevisedFee] = useState('')
  const seller = world.teams[transfer.sellerTeamId]
  const clubRound = currentClubRound(transfer)
  const playerRound = currentPlayerRound(transfer)
  const governance = describeTransferGovernance(world, transfer)
  const open = transfer.status === 'IN_PROGRESS'
  const counterFee = clubRound?.response?.counterFee
  const revisedValid = revisedFee !== '' && Number.isSafeInteger(Number(revisedFee)) && Number(revisedFee) >= 1
  const agreedTerms = transfer.agreedTerms
  const feeDecision = open && transfer.agreedFee !== undefined ? evaluateTransferFee(world, teamId, transfer.agreedFee, transfer.id) : undefined
  const stateLabel = transfer.status === 'EXECUTED' ? 'Completada' : transfer.status === 'CLOSED' ? CLOSE_TEXT[transfer.closeReason!] : transfer.clubStatus !== 'CLUB_AGREED' ? CLUB_TEXT[transfer.clubStatus] : PLAYER_TEXT[transfer.playerStatus]

  return <article className="market-transfers__entry" data-transfer-id={transfer.id} data-transfer-status={transfer.status}>
    <details className="market-negotiations__details" open={open}>
      <summary><span className="market-negotiations__person">{playerName(world, transfer.playerId)}</span><span>Traspaso desde {seller?.name ?? transfer.sellerTeamId}</span><span data-testid="transfer-state">{stateLabel}</span></summary>
      <div className="market-negotiations__body">
        <ol className="market-transfers__stages" aria-label="Etapas del traspaso">
          <li className={transfer.clubStatus === 'CLUB_AGREED' ? 'is-done' : ''}>1 · Club vendedor: <b>{CLUB_TEXT[transfer.clubStatus]}</b></li>
          <li className={transfer.playerStatus === 'PLAYER_AGREED' ? 'is-done' : ''}>2 · Jugador: <b>{PLAYER_TEXT[transfer.playerStatus]}</b></li>
          <li className={governance.status === 'APPROVED' || transfer.status === 'EXECUTED' ? 'is-done' : ''}>3 · Autorización del consejo: <b>{transfer.status === 'EXECUTED' ? 'Ejecutada' : GOVERNANCE_TEXT[governance.status]}</b></li>
          <li className={transfer.status === 'EXECUTED' ? 'is-done' : ''}>4 · Ejecución: <b>{transfer.status === 'EXECUTED' ? `Completada el ${transfer.execution!.executedOn}` : 'Pendiente'}</b></li>
        </ol>
        <p>Compensaciones propuestas: {transfer.clubRounds.map((round) => `${formatMoney(round.fee)}${round.response === undefined ? ' (sin respuesta)' : round.response.outcome === 'ACCEPTED' ? ' (aceptada)' : round.response.outcome === 'COUNTERED' ? ` (contraoferta ${formatMoney(round.response.counterFee!)})` : ' (rechazada)'}`).join(' → ')}</p>
        {transfer.agreedFee !== undefined ? <p data-testid="transfer-agreed-fee">Compensación acordada entre clubes: <b>{formatMoney(transfer.agreedFee)}</b> (una sola vez; no es salario ni comisión del agente)</p> : null}
        {playerRound !== undefined ? <p>Ofertas al jugador: {transfer.playerRounds.map((round) => `${formatMoney(round.terms.salary)} × ${round.terms.years}${round.response === undefined ? ' (sin respuesta)' : round.response.outcome === 'ACCEPTED' ? ' (aceptada)' : round.response.outcome === 'COUNTERED' ? ` (contraoferta ${formatMoney(round.response.counterTerms!.salary)} × ${round.response.counterTerms!.years})` : ' (rechazada)'}`).join(' → ')}</p> : null}

        {open && transfer.clubStatus === 'CLUB_COUNTERED' && counterFee !== undefined ? <div className="market-transfers__actions">
          <p>El club pide <b>{formatMoney(counterFee)}</b>.</p>
          <button type="button" onClick={() => store().respondTransferClubCounter(teamId, transfer.id, { kind: 'ACCEPT_COUNTER' })}>Aceptar la compensación del club</button>
          <label>Revisar mi propuesta<input aria-label={`Compensación revisada ${transfer.id}`} type="number" min="1" step="1" value={revisedFee} onChange={(event) => setRevisedFee(event.target.value)} /></label>
          <button type="button" disabled={!revisedValid} onClick={() => { store().respondTransferClubCounter(teamId, transfer.id, { kind: 'REVISE', fee: Number(revisedFee) }); setRevisedFee('') }}>Enviar propuesta revisada</button>
          <button type="button" onClick={() => store().respondTransferClubCounter(teamId, transfer.id, { kind: 'DECLINE' })}>Rechazar y retirar</button>
        </div> : null}

        {open && transfer.clubStatus === 'CLUB_AGREED' && transfer.playerStatus === 'NOT_STARTED' ? <CustomOfferForm world={world} teamId={teamId} negotiationId={transfer.id}
          submitLabel="Presentar oferta al jugador" onSubmit={(terms) => store().proposeTransferPlayerTerms(teamId, transfer.id, terms)} /> : null}

        {open && transfer.playerStatus === 'PLAYER_COUNTERED' && playerRound?.response?.counterTerms !== undefined ? <div className="market-transfers__actions">
          <p>El jugador pide <b>{formatMoney(playerRound.response.counterTerms.salary)}</b> × {playerRound.response.counterTerms.years} año(s).</p>
          <button type="button" onClick={() => store().respondTransferPlayerCounter(teamId, transfer.id, { kind: 'ACCEPT_COUNTER' })}>Aceptar la contraoferta del jugador</button>
          <CustomOfferForm world={world} teamId={teamId} negotiationId={`${transfer.id}:revision`} defaultSalary={playerRound.response.counterTerms.salary} defaultYears={playerRound.response.counterTerms.years}
            submitLabel="Enviar oferta revisada" onSubmit={(terms) => store().respondTransferPlayerCounter(teamId, transfer.id, { kind: 'REVISE', terms })} />
          <button type="button" onClick={() => store().respondTransferPlayerCounter(teamId, transfer.id, { kind: 'DECLINE' })}>Rechazar y retirar</button>
        </div> : null}

        {open && transfer.playerStatus === 'PLAYER_AGREED' && agreedTerms !== undefined ? <div className="market-transfers__actions">
          <p data-testid="transfer-agreed-terms">Condiciones acordadas con el jugador: <b>{formatMoney(agreedTerms.salary)}</b> × {agreedTerms.years} año(s){agreedTerms.role === undefined ? '' : ` · rol prometido ${agreedTerms.role}`}</p>
          <MarketViabilityPanel viability={buildMarketViability(world, teamId, { annualSalary: agreedTerms.salary, years: agreedTerms.years })} label="Viabilidad económica del salario" />
          <p className={feeDecision?.allowed === true ? 'market-transfers__ok' : 'market-transfers__warning'}>Compensación: {feeDecision?.allowed === true ? 'Finance la autoriza (autorización propia + tesorería)' : `Finance no la autoriza ahora (${feeDecision?.reason ?? 'sin datos'})`}</p>
          <p data-testid="transfer-governance">Autorización: {GOVERNANCE_TEXT[governance.status]}{governance.pendingBodyNames.length > 0 && governance.status !== 'NOT_REQUESTED' ? ` · pendiente: ${governance.pendingBodyNames.join(', ')}` : ''}</p>
          {governance.status === 'NOT_REQUESTED' ? governance.userProposerBodyIds.map((bodyId) => <button key={bodyId} type="button" onClick={() => store().startTransferGovernance(teamId, transfer.id, bodyId)}>Solicitar autorización ({world.governanceBodiesById[bodyId]?.name ?? bodyId})</button>) : null}
          {governance.decision !== undefined ? governance.userApproverBodyIds.map((bodyId) => <button key={bodyId} type="button" onClick={() => store().recordFreeAgentSigningDecision(governance.decision!.id, 'APPROVED', bodyId)}>Aprobar ({world.governanceBodiesById[bodyId]?.name ?? bodyId})</button>) : null}
          {governance.decision !== undefined && ['PROPOSED', 'REVIEW_STARTED', 'APPROVED'].includes(governance.status) ? <button type="button" onClick={() => store().recordFreeAgentSigningDecision(governance.decision!.id, 'WITHDRAWN', governance.decision!.proposedByBodyId)}>Retirar la solicitud de autorización</button> : null}
          {governance.status === 'APPROVED' ? <button type="button" onClick={() => store().completeTransfer(teamId, transfer.id)}>Completar traspaso</button> : null}
        </div> : null}

        {transfer.status === 'EXECUTED' ? <p data-testid="transfer-executed">Completado el {transfer.execution!.executedOn}: contrato nuevo {transfer.execution!.buyerContractId} · compensación {formatMoney(transfer.agreedFee!)} pagada al club vendedor (movimientos {transfer.execution!.financeFactIds.length} en Finance) · la plantilla ya lo incluye.</p> : null}
        {open ? <button type="button" onClick={() => store().withdrawTransfer(teamId, transfer.id)}>Retirar la operación</button> : null}
      </div>
    </details>
  </article>
}
