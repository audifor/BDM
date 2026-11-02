import type { ReactNode } from 'react'
import type { ContractNegotiation, NegotiationResponsibleActor, NegotiationRole, NegotiationTermSet } from '@/domain/market'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { formatMoney } from '@/ui/formatters'
import { buildMarketViability } from './marketViability'
import { MarketViabilityPanel } from './MarketViabilityPanel'

const ROLE_LABEL: Readonly<Record<NegotiationRole, string>> = {
  STAR: 'Estrella',
  STARTER: 'Titular',
  ROTATION: 'Rotación',
  DEPTH: 'Fondo de plantilla',
}

const CLOSED_STATUSES = new Set(['SIGNED', 'CLOSED', 'WITHDRAWN', 'REJECTED', 'EXPIRED', 'DECLINED'])

function actorName(world: GameWorld, actor: NegotiationResponsibleActor | undefined): string | undefined {
  if (actor === undefined) return undefined
  if (actor.kind === 'USER') return 'Tú'
  if (actor.kind === 'ORGANIZATION') return 'El club'
  const person = world.staffPeopleById[actor.staffPersonId]
  if (person === undefined) return 'Miembro del staff'
  return `${person.identity.firstName} ${person.identity.lastName}`
}

function playerResponseLabel(outcome: string): string {
  if (outcome === 'ACCEPTED') return 'Aceptó las condiciones'
  if (outcome === 'COUNTERED') return 'Envió una contraoferta'
  return 'Rechazó la oferta'
}

function stageLabel(negotiation: ContractNegotiation, isFreeAgent: boolean): string {
  if (negotiation.status === 'CONTACTED' && negotiation.contactResponse === undefined) return 'Esperando respuesta'
  if (negotiation.status === 'CONTACTED' && negotiation.contactResponse?.outcome === 'OPEN_TO_TALKS') return 'Abierto a conversar'
  if (negotiation.status === 'CONTACTED') return 'Contacto cerrado'
  if (negotiation.status === 'CLOSED' && negotiation.contactResponse?.outcome === 'NOT_INTERESTED') return 'Contacto sin interés'
  if (negotiation.status === 'OPEN') return 'Oferta enviada'
  if (negotiation.status === 'COUNTERED') return 'Contraoferta recibida'
  if (negotiation.status === 'ACCEPTED') return 'Condiciones acordadas'
  if (negotiation.status === 'SIGNED') return 'Fichaje formalizado'
  if (negotiation.status === 'REJECTED') return 'Oferta rechazada'
  if (negotiation.status === 'WITHDRAWN') return 'Negociación retirada por el club'
  if (!isFreeAgent && (negotiation.status === 'CLOSED' || negotiation.closeReason === 'PLAYER_NO_LONGER_FREE_AGENT')) return 'Jugador ya no disponible'
  return 'Operación cerrada'
}

function situation(negotiation: ContractNegotiation, isFreeAgent: boolean): { readonly title: string; readonly detail: string } {
  if (negotiation.status === 'CONTACTED' && negotiation.contactResponse === undefined) return {
    title: 'El contacto está en seguimiento.',
    detail: 'El calendario procesará la respuesta al avanzar la carrera. No hay una fecha de respuesta registrada.',
  }
  if (negotiation.status === 'CONTACTED' && negotiation.contactResponse?.outcome === 'OPEN_TO_TALKS') return {
    title: 'Hay disposición para negociar.',
    detail: `Respuesta recibida el ${negotiation.contactResponse.respondedOn}. Puedes preparar una oferta con las condiciones conocidas por el club.`,
  }
  if (negotiation.status === 'CLOSED' && negotiation.contactResponse?.outcome === 'NOT_INTERESTED') return {
    title: 'El contacto no abrió una negociación.',
    detail: `La respuesta registrada el ${negotiation.contactResponse.respondedOn} comunicó que no hay interés. No consta otro motivo.`,
  }
  if (negotiation.status === 'CONTACTED') return {
    title: 'El contacto no abrió una negociación.',
    detail: `El mercado registró la respuesta el ${negotiation.contactResponse?.respondedOn ?? '—'}. No se comunicó otro motivo.`,
  }
  if (negotiation.status === 'OPEN') return {
    title: 'La propuesta está en manos del jugador y su representante.',
    detail: `Oferta enviada el ${negotiation.offerSubmittedOn ?? negotiation.startedOn ?? '—'}. La respuesta se resuelve con el calendario.`,
  }
  if (negotiation.status === 'COUNTERED') return {
    title: 'El jugador o su representante ha pedido otras condiciones.',
    detail: `Contraoferta recibida el ${negotiation.playerResponse?.respondedOn ?? '—'}. Compara las cifras antes de decidir.`,
  }
  if (negotiation.status === 'ACCEPTED') return {
    title: 'El jugador aceptó las condiciones deportivas.',
    detail: 'El acuerdo todavía necesita las autorizaciones que marque Finance y Governance antes de formalizar el contrato.',
  }
  if (negotiation.status === 'SIGNED') return {
    title: 'El fichaje quedó formalizado.',
    detail: `Contrato ${negotiation.signedContractId ?? 'registrado'} · firma ${negotiation.signedOn ?? 'sin fecha disponible'}.`,
  }
  if (negotiation.status === 'REJECTED') return {
    title: 'La oferta fue rechazada.',
    detail: negotiation.playerResponse === undefined ? 'No hay más explicación registrada.' : `${playerResponseLabel(negotiation.playerResponse.outcome)} el ${negotiation.playerResponse.respondedOn}.`,
  }
  if (negotiation.status === 'WITHDRAWN') return {
    title: 'El club retiró la negociación.',
    detail: `Decisión registrada el ${negotiation.clubAction?.respondedOn ?? '—'}.`,
  }
  if (!isFreeAgent && (negotiation.status === 'CLOSED' || negotiation.closeReason === 'PLAYER_NO_LONGER_FREE_AGENT')) return {
    title: 'La operación se cerró porque el jugador ya no está disponible.',
    detail: `Cierre registrado el ${negotiation.closedOn ?? '—'}.`,
  }
  return { title: 'Esta operación está cerrada.', detail: `Estado registrado: ${stageLabel(negotiation, isFreeAgent)}.` }
}

function termLine(label: string, terms: NegotiationTermSet): ReactNode {
  return <div className="market-operation-dossier__term" key={label}>
    <span>{label}</span>
    <strong>{formatMoney(terms.salary)} / {terms.years} {terms.years === 1 ? 'año' : 'años'}</strong>
    <small>Garantía total: {formatMoney(terms.salary * terms.years)}{terms.role === undefined ? '' : ` · Rol: ${ROLE_LABEL[terms.role]}`}</small>
  </div>
}

function eventOrigin(world: GameWorld, negotiation: ContractNegotiation): string {
  const origin = negotiation.playerResponse?.origin
  if (origin === 'PLAYER') return 'Respondió el jugador'
  if (origin === 'AGENT') {
    const agentId = world.playerRepresentations.find((item) => item.playerId === negotiation.playerId)?.agentId
    const agent = agentId === undefined ? undefined : world.agentsById[agentId]
    return agent === undefined ? 'Respondió la representación' : `Respondió ${agent.name}, su representante`
  }
  return 'Respuesta recibida en la negociación'
}

function historyEvents(world: GameWorld, negotiation: ContractNegotiation): readonly { readonly id: string; readonly date: string; readonly text: string }[] {
  const events: { id: string; date: string; text: string }[] = []
  if (negotiation.startedOn !== undefined) events.push({
    id: `${negotiation.id}:contact`, date: negotiation.startedOn,
    text: `Contacto iniciado por ${actorName(world, negotiation.contactResponsibleActor ?? negotiation.responsibleActor) ?? 'el club'}.`,
  })
  if (negotiation.contactResponse !== undefined) events.push({
    id: `${negotiation.id}:contact-response`, date: negotiation.contactResponse.respondedOn,
    text: negotiation.contactResponse.outcome === 'OPEN_TO_TALKS' ? 'El contacto quedó abierto a conversaciones.' : 'La respuesta comunicó que no hay interés en negociar.',
  })
  for (const round of negotiation.roundHistory ?? []) {
    if (round.submittedOn !== undefined) events.push({
      id: `${negotiation.id}:offer:${round.round}`, date: round.submittedOn,
      text: `Ronda ${round.round}: oferta de ${formatMoney(round.offer.salary)} por ${round.offer.years} ${round.offer.years === 1 ? 'año' : 'años'}${round.offer.role === undefined ? '' : ` con rol ${ROLE_LABEL[round.offer.role]}`}.`,
    })
    if (round.playerResponse !== undefined) events.push({
      id: `${negotiation.id}:response:${round.round}`, date: round.playerResponse.respondedOn,
      text: `${round.playerResponse.origin === 'AGENT' ? 'La representación' : 'El jugador'} ${round.playerResponse.outcome === 'ACCEPTED' ? 'aceptó la propuesta.' : round.playerResponse.outcome === 'COUNTERED' ? 'presentó otra propuesta.' : 'rechazó la propuesta.'}`,
    })
    if (round.clubAction !== undefined) events.push({
      id: `${negotiation.id}:club-action:${round.round}`, date: round.clubAction.respondedOn,
      text: `${actorName(world, round.clubAction.actor) ?? 'El club'} ${round.clubAction.outcome === 'ACCEPTED_COUNTER' ? 'aceptó la contraoferta.' : round.clubAction.outcome === 'DECLINED_COUNTER' ? 'rechazó la contraoferta.' : 'envió una oferta revisada.'}`,
    })
  }
  if ('salary' in negotiation && negotiation.salary !== undefined && (negotiation.roundHistory?.length ?? 0) === 0) events.push({
    id: `${negotiation.id}:legacy-offer`, date: negotiation.offerSubmittedOn ?? negotiation.startedOn ?? world.currentDate,
    text: `Oferta registrada: ${formatMoney(negotiation.salary)} por ${negotiation.years} ${negotiation.years === 1 ? 'año' : 'años'}${negotiation.role === undefined ? '' : ` con rol ${ROLE_LABEL[negotiation.role]}`}.`,
  })
  if (negotiation.status === 'SIGNED' && negotiation.signedOn !== undefined) events.push({
    id: `${negotiation.id}:signed`, date: negotiation.signedOn,
    text: `Firma completada${negotiation.signedBy === undefined ? '' : ` por ${actorName(world, negotiation.signedBy) ?? 'el club'}`}.`,
  })
  return events.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
}

export function MarketOperationDossier({ world, teamId, negotiation, isFreeAgent, viabilitySalary, viabilityYears, children }: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly negotiation: ContractNegotiation
  readonly isFreeAgent: boolean
  readonly viabilitySalary?: number
  readonly viabilityYears?: number
  readonly children: ReactNode
}) {
  const player = world.players[negotiation.playerId]
  const playerName = player === undefined ? 'Jugador no disponible' : `${player.firstName} ${player.lastName}`
  const representation = world.playerRepresentations.find((item) => item.playerId === negotiation.playerId)
  const agent = representation === undefined ? undefined : world.agentsById[representation.agentId]
  const place = world.teams[teamId]
  const clubName = place?.name ?? 'Club'
  const currentTerms: NegotiationTermSet | undefined = 'salary' in negotiation && negotiation.salary !== undefined
    ? { salary: negotiation.salary, years: negotiation.years, ...(negotiation.role === undefined ? {} : { role: negotiation.role }) }
    : undefined
  const previousTerms = negotiation.status === 'COUNTERED' ? negotiation.roundHistory?.at(-1)?.offer : undefined
  const promise = world.rolePromisesById[`role-promise:signed-free-agent:${negotiation.id}`]
  const events = historyEvents(world, negotiation)
  const currentSituation = situation(negotiation, isFreeAgent)
  const knownTerms = world.marketKnowledge.filter((item) => item.organizationId === negotiation.organizationId && item.playerId === negotiation.playerId)
    .sort((left, right) => right.assessedAt.localeCompare(left.assessedAt))[0]
  const stage = stageLabel(negotiation, isFreeAgent)
  const closed = CLOSED_STATUSES.has(negotiation.status)

  return <article className="market-operation-dossier" data-testid="market-operation-dossier" data-operation-status={negotiation.status}>
    <header className="market-operation-dossier__header">
      <div><span>OPERACIÓN DE FICHAJE · {clubName}</span><h2>{playerName}</h2><p>{currentSituation.title} {currentSituation.detail}</p></div>
      <span className={`market-operation-dossier__stage${closed ? ' is-closed' : ''}`}>{stage}</span>
    </header>

    <div className="market-operation-dossier__grid">
      <section className="market-operation-dossier__panel" aria-labelledby="market-operation-people-title">
        <h3 id="market-operation-people-title">Personas</h3>
        <dl>
          <div><dt>Jugador</dt><dd>{playerName}</dd></div>
          <div><dt>Representación</dt><dd>{agent?.name ?? 'No consta representación'}</dd></div>
          <div><dt>Contacto realizado por</dt><dd>{actorName(world, negotiation.contactResponsibleActor ?? negotiation.responsibleActor) ?? 'No consta'}</dd></div>
          {negotiation.offerResponsibleActor !== undefined && <div><dt>Oferta enviada por</dt><dd>{actorName(world, negotiation.offerResponsibleActor)}</dd></div>}
          {'clubAction' in negotiation && negotiation.clubAction !== undefined && <div><dt>Última decisión del club</dt><dd>{actorName(world, negotiation.clubAction.actor)}</dd></div>}
        </dl>
      </section>

      <section className="market-operation-dossier__panel market-operation-dossier__proposal" aria-labelledby="market-operation-proposal-title">
        <h3 id="market-operation-proposal-title">Condiciones en negociación</h3>
        {previousTerms !== undefined && <div className="market-operation-dossier__comparison">
          {termLine('Nuestra última propuesta', previousTerms)}
          {currentTerms !== undefined && termLine('Solicitud recibida', currentTerms)}
        </div>}
        {previousTerms === undefined && currentTerms !== undefined && <div className="market-operation-dossier__comparison">{termLine(negotiation.status === 'SIGNED' || negotiation.status === 'ACCEPTED' ? 'Condiciones acordadas' : 'Últimas condiciones', currentTerms)}</div>}
        {currentTerms === undefined && <p className="market-operation-dossier__empty">Aún no hay una oferta contractual. El contacto no compromete salario ni duración.</p>}
        {negotiation.playerResponse !== undefined && <p className="market-operation-dossier__response">{eventOrigin(world, negotiation)} · {playerResponseLabel(negotiation.playerResponse.outcome)} · {negotiation.playerResponse.respondedOn}</p>}
        {negotiation.status === 'CONTACTED' && negotiation.contactResponse !== undefined && <p className="market-operation-dossier__response">{negotiation.contactResponse.outcome === 'OPEN_TO_TALKS' ? 'El contacto permite presentar condiciones.' : 'La respuesta no abrió la negociación.'} · {negotiation.contactResponse.respondedOn}</p>}
        {negotiation.contactResponse?.outcome === 'OPEN_TO_TALKS' && knownTerms !== undefined && <p className="market-operation-dossier__known">Condiciones conocidas por el club: {knownTerms.expectedSalary === undefined ? 'salario sin estimación' : `${formatMoney(knownTerms.expectedSalary)} al año`} · {knownTerms.expectedYears === undefined ? 'duración sin estimación' : `${knownTerms.expectedYears} ${knownTerms.expectedYears === 1 ? 'año' : 'años'}`}. Fuente: {knownTerms.source === 'CLUB_CONTACT' ? 'contacto directo' : knownTerms.source === 'AGENT' ? 'representación' : 'información pública'}; fecha {knownTerms.assessedAt}.</p>}
        {currentTerms !== undefined && currentTerms.role !== undefined && <p className="market-operation-dossier__promise">{promise === undefined ? 'Rol propuesto; si se firma, se registrará como compromiso contractual.' : `Promesa de rol ${ROLE_LABEL[promise.role]} · ${promise.status === 'ACTIVE' ? 'vigente' : promise.status === 'FULFILLED' ? 'cumplida' : 'incumplida'}.`}</p>}
        {currentTerms !== undefined && <p className="market-operation-dossier__model-note">El mercado evalúa salario garantizado y duración. No consta una expectativa de rol del jugador que permita valorar el rol ofrecido en esta respuesta.</p>}
        {viabilitySalary !== undefined && viabilityYears !== undefined && !closed && <MarketViabilityPanel viability={buildMarketViability(world, teamId, { annualSalary: viabilitySalary, years: viabilityYears })} label="Viabilidad económica conocida por el club" />}
      </section>

      <section className="market-operation-dossier__panel market-operation-dossier__decision" aria-labelledby="market-operation-decision-title" aria-live="polite">
        <h3 id="market-operation-decision-title">{negotiation.status === 'CONTACTED' && negotiation.contactResponse === undefined || negotiation.status === 'OPEN' ? 'Qué está esperando el mundo' : 'Qué puedes decidir'}</h3>
        {children}
      </section>

      <section className="market-operation-dossier__panel market-operation-dossier__consequence" aria-labelledby="market-operation-consequence-title">
        <h3 id="market-operation-consequence-title">Consecuencias y autorizaciones</h3>
        {negotiation.status === 'SIGNED' ? <>
          <p>El contrato, la transacción de plantilla y el historial quedan guardados en el mundo.</p>
          {negotiation.signedContractId !== undefined && world.contractsById[negotiation.signedContractId] !== undefined && <p data-testid="market-signed-contract">Contrato registrado hasta {world.contractsById[negotiation.signedContractId]!.term.expiresOn}.</p>}
          {promise !== undefined && <>
            <p>La promesa de rol queda {promise.status === 'ACTIVE' ? 'vigente' : promise.status === 'FULFILLED' ? 'cumplida' : 'incumplida'} en la carrera.</p>
            <p>Al valorar una futura renovación, el motor considera esta promesa. El mercado no marca su cumplimiento durante la temporada.</p>
          </>}
        </> : negotiation.status === 'ACCEPTED' ? <>
          <p>La aceptación del jugador no crea por sí sola un contrato. Se requiere la autorización y ejecución vigentes del club.</p>
          <p>El salario y la duración pasan a Finance y Governance al iniciar la formalización.</p>
        </> : currentTerms !== undefined ? <>
          <p>Si se firma, la organización registrará el salario y la duración acordados en Finance y en el contrato.</p>
          {currentTerms.role !== undefined && <p>La promesa de {ROLE_LABEL[currentTerms.role]} se conservará con el contrato; la respuesta actual no la valora como preferencia del jugador.</p>}
        </> : <p>Presentar una oferta formal es lo que crea compromisos salariales y contractuales. El contacto actual no altera la plantilla ni Finance.</p>}
      </section>

      <details className="market-operation-dossier__history">
        <summary>Historial y datos del expediente</summary>
        {events.length === 0 ? <p>No hay acontecimientos registrados.</p> : <ol aria-label="Historial de la negociación">
          {events.map((event) => <li key={event.id}><time>{event.date}</time><span>{event.text}</span></li>)}
        </ol>}
        <dl className="market-operation-dossier__technical">
          <div><dt>Estado del motor</dt><dd>{negotiation.status}</dd></div>
          <div><dt>Operación</dt><dd>{negotiation.id}</dd></div>
          {negotiation.signedTransactionId !== undefined && <div><dt>Transacción</dt><dd>{negotiation.signedTransactionId}</dd></div>}
          {negotiation.signedGovernanceDecisionId !== undefined && <div><dt>Decisión de Governance</dt><dd>{negotiation.signedGovernanceDecisionId}</dd></div>}
          {knownTerms !== undefined && <div><dt>Conocimiento del club</dt><dd>{knownTerms.confidence}% · {knownTerms.assessedAt}</dd></div>}
        </dl>
      </details>
    </div>
  </article>
}
