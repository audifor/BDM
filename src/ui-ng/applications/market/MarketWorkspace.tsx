import { useEffect, useMemo, useState } from 'react'

import { assessPlayerContractSigningReadiness } from '@/app/governance'
import { assessRoutedFreeAgentOfferIntelligence, isDirectApproachNegotiation } from '@/app/marketIntelligence'
import { assessFormalOfferPreparation } from '@/engine/marketIntelligence'
import { resolveGovernanceDecisionRights } from '@/domain/governance'
import { type PlayerId, type TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { formatRatingEvaluation, getOrganizationRatingEvaluation } from '@/domain/intelligence'
import { getPlayerAge, type Player } from '@/domain/player'
import { getFreeAgents, getOrganizationKnowledge } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { isActiveNegotiation, type NegotiationRole } from '@/domain/market'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { ScoutingWorkspace } from '@/ui-ng/applications/scouting/ScoutingWorkspace'
import { MarketTalentBoard } from '@/ui-ng/applications/market/MarketTalentBoard'
import { MarketPlanningBoard } from '@/ui-ng/applications/market/MarketPlanningBoard'
import { MarketOperationsBar } from '@/ui-ng/applications/market/MarketOperationsBar'
import { MarketNeedsStrip } from '@/ui-ng/applications/market/MarketNeedsStrip'
import { CustomOfferForm } from '@/ui-ng/applications/market/CustomOfferForm'
import { TransferOperationsSection } from '@/ui-ng/applications/market/TransferOperationsSection'
import { MarketViabilityPanel } from '@/ui-ng/applications/market/MarketViabilityPanel'
import { buildMarketViability } from '@/ui-ng/applications/market/marketViability'
import { buildMarketOperationsHistory } from '@/ui-ng/applications/market/marketOperationsHistory'
import { MarketOperationDossier } from '@/ui-ng/applications/market/MarketOperationDossier'
import { getMarketSalarySummary, marketMinorUnitsToMajor } from './marketFinancialSummary'
import { addMarketTarget, archiveMarketTarget, getMarketTargetsForTeam, reviewMarketTarget, setMarketTargetNote, setMarketTargetPriority } from '@/app/market/MarketTargetService'
import type { MarketTargetPriority } from '@/domain/market/MarketTarget'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'
import './market-courtside-v3.css'
import './market-unified-navigation.css'
import './market-viability.css'

type MarketTab = 'explore' | 'targets' | 'scouting' | 'operations'
const MARKET_TABS: readonly { readonly id: MarketTab; readonly label: string }[] = [
  { id: 'explore', label: 'Buscar jugadores' },
  { id: 'targets', label: 'Objetivos' },
  { id: 'scouting', label: 'Scouting' },
  { id: 'operations', label: 'Operaciones' },
]

function knownMarketTerms(world: GameWorld, organizationId: string, playerId: string): { readonly salary?: number; readonly years?: number } {
  const entry = world.marketKnowledge.filter((item) => item.organizationId === organizationId && item.playerId === playerId).sort((a, b) => b.assessedAt.localeCompare(a.assessedAt))[0]
  return { ...(entry?.expectedSalary === undefined ? {} : { salary: entry.expectedSalary }), ...(entry?.expectedYears === undefined ? {} : { years: entry.expectedYears }) }
}

export function MarketWorkspace({ initialWorld, initialTab = 'explore' }: { readonly initialWorld?: GameWorld; readonly initialTab?: MarketTab; readonly onOpenScouting?: () => void } = {}) {
  const world = useGameStore((state) => state.world) ?? initialWorld ?? null
  const contactFreeAgent = useGameStore((state) => state.contactFreeAgent)
  const submitFreeAgentOffer = useGameStore((state) => state.submitFreeAgentOffer)
  const contactFreeAgentDirectly = useGameStore((state) => state.contactFreeAgentDirectly)
  const submitCustomFreeAgentOffer = useGameStore((state) => state.submitCustomFreeAgentOffer)
  const decideFreeAgentCounter = useGameStore((state) => state.decideFreeAgentCounter)
  const startFreeAgentSigningGovernance = useGameStore((state) => state.startFreeAgentSigningGovernance)
  const recordFreeAgentSigningDecision = useGameStore((state) => state.recordFreeAgentSigningDecision)
  const completeFreeAgentSigning = useGameStore((state) => state.completeFreeAgentSigning)
  const marketNotice = useGameStore((state) => state.marketNotice)
  const clearMarketNotice = useGameStore((state) => state.clearMarketNotice)
  const [activeTab, setActiveTab] = useState<MarketTab>(() => {
    if (typeof window === 'undefined') return initialTab
    const params = new URLSearchParams(window.location.search)
    const selected = params.get('marketTab')
    if (selected === 'free-agents' || selected === 'centre') return 'explore'
    if (selected === 'planning') return 'targets'
    return MARKET_TABS.some((tab) => tab.id === selected) ? selected as MarketTab : initialTab
  })
  const [searchPreset, setSearchPreset] = useState<'ALL' | 'FREE'>(() => typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('marketTab') === 'free-agents' || new URLSearchParams(window.location.search).get('marketContract') === 'FREE') ? 'FREE' : 'ALL')
  const [targetsView, setTargetsView] = useState<'tracking' | 'planning'>(() =>
    typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('marketTargetsView') === 'planning' || new URLSearchParams(window.location.search).get('marketTab') === 'planning')
      ? 'planning' : 'tracking')
  const [searchPosition, setSearchPosition] = useState<string>('ALL')
  const [comparisonIds, setComparisonIds] = useState<readonly PlayerId[]>([])
  const requestScoutingAssignment = useGameStore((state) => state.requestScoutingAssignment)
  const replaceWorld = useGameStore((state) => state.replaceWorld)
  const toggleComparison = (id: PlayerId) => setComparisonIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current)
  // PLAYER > CONTRACT passes a specific free-agent dossier in the URL.
  // Selection is only shown if the player is really present in the free-agent list.
  const [selectedId, setSelectedId] = useState<PlayerId | undefined>(() => {
    const id = typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get('playerId')
    return id ? id as PlayerId : undefined
  })
  const [revisions, setRevisions] = useState<Record<string, { salary: string; years: string; role: NegotiationRole | '' }>>({})
  const [operationFilter, setOperationFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL')
  const [selectedOperationId, setSelectedOperationId] = useState<string | undefined>()
  const team = world === null ? undefined : getUserTeam(world)

  const agents = useMemo(() => world === null ? [] : getFreeAgents(world), [world])
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search)
      const next = params.get('marketTab')
      if (next === 'free-agents') { setSearchPreset('FREE'); setActiveTab('explore') }
      else if (next === 'planning') { setTargetsView('planning'); setActiveTab('targets') }
      else if (next === 'centre') setActiveTab('explore')
      else if (MARKET_TABS.some((tab) => tab.id === next)) {
        if (next === 'explore') setSearchPreset(params.get('marketContract') === 'FREE' ? 'FREE' : 'ALL')
        if (next === 'targets') setTargetsView(params.get('marketTargetsView') === 'planning' ? 'planning' : 'tracking')
        setActiveTab(next as MarketTab)
      }
    }
    window.addEventListener('bdm-ng-nav', sync)
    window.addEventListener('popstate', sync)
    return () => { window.removeEventListener('bdm-ng-nav', sync); window.removeEventListener('popstate', sync) }
  }, [])

  if (world === null || team === undefined) {
    return <NgHoloShell appLabel="Market" empty region="market-workspace" />
  }

  const salarySummary = getMarketSalarySummary(world, team.id)
  const remainingSalaryBudget = salarySummary === null || salarySummary.players === null
    ? null
    : marketMinorUnitsToMajor(salarySummary.players.availableMinorUnits, salarySummary.currencyCode)
  const targets = getMarketTargetsForTeam(world, team.id)
  const applyTargetChange = (update: () => GameWorld): string | null => {
    try { const next = update(); if (next !== world) replaceWorld(next); return null }
    catch (error) { return error instanceof Error ? error.message : 'No se pudo modificar el objetivo.' }
  }
  const selectedIntentPlanId = selectedId === undefined ? undefined : Object.values(world.negotiationsById).find((item) => item.teamId === team.id && item.playerId === selectedId)?.sourcePlanId
  const offers = assessRoutedFreeAgentOfferIntelligence(world, team.id, selectedId, selectedIntentPlanId)
  const selected = agents.find((player) => player.id === selectedId)
  const negotiations = Object.values(world.negotiationsById).filter((item) => item.teamId === team.id).sort((a, b) => (b.startedOn ?? '').localeCompare(a.startedOn ?? '') || a.id.localeCompare(b.id))
  const closedNegotiationStatuses = ['SIGNED', 'CLOSED', 'WITHDRAWN', 'REJECTED', 'EXPIRED', 'DECLINED']
  const visibleNegotiations = negotiations.filter((item) => operationFilter === 'ALL' || (operationFilter === 'CLOSED' ? closedNegotiationStatuses.includes(item.status) : !closedNegotiationStatuses.includes(item.status)))
  const selectedNegotiation = visibleNegotiations.find((item) => item.id === selectedOperationId) ?? visibleNegotiations[0]
  const evaluate = (player: Player, dimension: string) =>
    formatRatingEvaluation(
      getOrganizationRatingEvaluation({
        organizationId: team.organizationId,
        playerId: player.id,
        dimension,
        knowledge: world.organizationKnowledge,
        currentDate: world.currentDate,
        publicPosition: player.basketball.primaryPosition,
      }),
    )

  return (
    <NgHoloShell
      appLabel="Mercado"
      meta={`${agents.length} libres · ${targets.length} objetivos · ${remainingSalaryBudget === null ? "sin presupuesto" : formatMoney(remainingSalaryBudget)} disponibles`}
      region="market-workspace"
      teamId={team.id}
      title="Mercado"
      className="market-workspace"
      tabs={MARKET_TABS}
      activeTabId={activeTab}
      onTabSelect={(id) => setActiveTab(id as MarketTab)}
    >
      <MarketOperationsBar world={world} teamId={team.id}
        onOpenScouting={() => setActiveTab('scouting')}
        onOpenFreeAgents={() => { setSearchPreset('FREE'); setActiveTab('explore') }} />
      {marketNotice !== null ? <p className={`market-notice is-${marketNotice.kind}`} role={marketNotice.kind === 'error' ? 'alert' : 'status'} data-testid="market-notice">{marketNotice.text} <button type="button" aria-label="Cerrar aviso" onClick={clearMarketNotice}>×</button></p> : null}
      {activeTab === 'explore' ? <MarketNeedsStrip world={world} teamId={team.id} onSearch={(position) => { setSearchPreset('FREE'); setSearchPosition(position ?? 'ALL') }} /> : null}
      {activeTab === 'targets' ? <nav className="market-target-views" aria-label="Vistas de objetivos"><button type="button" aria-pressed={targetsView === 'tracking'} onClick={() => setTargetsView('tracking')}>Seguimiento</button><button type="button" aria-pressed={targetsView === 'planning'} onClick={() => setTargetsView('planning')}>Planificación</button></nav> : null}
      {(activeTab === 'explore' || activeTab === 'targets' && targetsView === 'tracking') ? <MarketTalentBoard
        key={activeTab === 'explore' ? `${searchPreset}:${searchPosition}` : 'targets'}
        initialPosition={activeTab === 'explore' ? searchPosition : 'ALL'}
        world={world} teamId={team.id} mode={activeTab}
        initialContractFilter={activeTab === 'explore' ? searchPreset : 'ALL'}
        comparisonIds={comparisonIds} onToggleComparison={toggleComparison}
        onOpenPlayer={navigateToPlayer}
        onOpenScouting={() => setActiveTab('scouting')}
        onOpenOperations={() => setActiveTab('operations')}
        targets={targets}
        onAddTarget={(id) => applyTargetChange(() => addMarketTarget(world, team.id, id))}
        onArchiveTarget={(id) => applyTargetChange(() => archiveMarketTarget(world, team.id, id))}
        onReviewTarget={(id) => applyTargetChange(() => reviewMarketTarget(world, team.id, id))}
        onTargetPriority={(id, priority: MarketTargetPriority) => applyTargetChange(() => setMarketTargetPriority(world, team.id, id, priority))}
        onTargetNote={(id, note) => applyTargetChange(() => setMarketTargetNote(world, team.id, id, note))}
        onRequestScouting={requestScoutingAssignment}
        onOpenFreeAgent={(id) => setSelectedId(id)}
      /> : null}
      {activeTab === 'targets' && targetsView === 'planning' ? <MarketPlanningBoard world={world} teamId={team.id}
        remainingSalaryBudget={remainingSalaryBudget} onOpenPlayer={navigateToPlayer}
        onOpenScouting={() => setActiveTab('scouting')} onOpenTargets={() => setTargetsView('tracking')} /> : null}
      {activeTab === 'scouting' ? <ScoutingWorkspace embedded initialWorld={world} onOpenSearch={() => { setSearchPreset('ALL'); setActiveTab('explore') }} /> : null}
      {selected !== undefined ? <div className="market-contact-overlay" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedId(undefined) }}>
        <section role="dialog" aria-modal="true" aria-label="Contacto con agente libre" className="market-contact-modal">
          <header><div><span>AGENTE LIBRE</span><h2>{selected.firstName} {selected.lastName}</h2></div><button type="button" aria-label="Cerrar contacto" onClick={() => setSelectedId(undefined)}>×</button></header>
          <dl className="ng-canon__metrics">
            <NgMetric label="Posición" value={<PlayPositionMark position={selected.basketball.primaryPosition} />} />
            <NgMetric label="Edad" value={getPlayerAge(world, selected.id)} />
            <NgMetric label="Conocimiento" value={getOrganizationKnowledge(world, team.organizationId, selected.id) === undefined ? 'Desconocido' : 'Evaluado'} />
            <NgMetric label="Finalización" value={evaluate(selected, 'finishing')} />
            <NgMetric label="Tiro" value={evaluate(selected, 'shooting')} />
            <NgMetric label="Creación" value={evaluate(selected, 'creation')} />
          </dl>
          {(() => { const known = knownMarketTerms(world, team.organizationId, selected.id)
            return <MarketViabilityPanel viability={buildMarketViability(world, team.id, { ...(known.salary === undefined ? {} : { annualSalary: known.salary }), ...(known.years === undefined ? {} : { years: known.years }) })} /> })()}
          <FreeAgentOfferActions world={world} teamId={team.id} playerId={selected.id} recommended={offers.some((item) => item.playerId === selected.id && item.outcome === 'FREE_AGENT_OFFER')}
            onContact={() => { contactFreeAgentDirectly(team.id, selected.id); setSelectedId(undefined); setActiveTab('operations') }} />
        </section>
      </div> : null}
      {activeTab === 'operations' ? <section aria-label="Free-agent negotiations" className="market-negotiations">
        <header className="market-negotiations__head"><div><strong>OPERACIONES</strong><span>{negotiations.length} seguimientos</span></div><select aria-label="Filtrar operaciones" value={operationFilter} onChange={(event) => setOperationFilter(event.target.value as typeof operationFilter)}><option value="ALL">Todas</option><option value="ACTIVE">En curso</option><option value="CLOSED">Cerradas</option></select></header>
        {visibleNegotiations.length === 0 ? <div className="market-operation-empty">
          <h2>{negotiations.length === 0 ? 'Tu seguimiento de fichajes empieza aquí.' : 'No hay operaciones en este filtro.'}</h2>
          <p>{negotiations.length === 0 ? 'Busca un jugador, revisa qué conoce el club e inicia el contacto. La respuesta llegará al avanzar la carrera.' : 'Cambia el filtro para consultar las otras operaciones.'}</p>
          {negotiations.length === 0 && <button type="button" onClick={() => { setSearchPreset('FREE'); setActiveTab('explore') }}>Buscar jugadores libres</button>}
        </div> : <div className="market-operation-layout">
          <nav className="market-operation-list" aria-label="Seguimiento de fichajes">
            {visibleNegotiations.map((item) => {
              const player = world.players[item.playerId]
              const name = player === undefined ? item.playerId : `${player.firstName} ${player.lastName}`
              const stage = item.status === 'CONTACTED' && item.contactResponse === undefined ? 'Esperando respuesta'
                : item.status === 'CONTACTED' && item.contactResponse?.outcome === 'OPEN_TO_TALKS' ? 'Abierto a conversar'
                  : item.status === 'COUNTERED' ? 'Contraoferta recibida'
                    : item.status === 'ACCEPTED' ? 'Condiciones acordadas'
                      : item.status === 'SIGNED' ? 'Fichaje formalizado'
                        : item.status === 'OPEN' ? 'Oferta enviada'
                          : item.status === 'REJECTED' ? 'Oferta rechazada'
                            : item.status === 'WITHDRAWN' ? 'Retirada por el club' : item.status === 'CLOSED' ? 'Cerrada' : item.status
              return <button key={item.id} type="button" className={selectedNegotiation?.id === item.id ? 'is-selected' : ''} aria-pressed={selectedNegotiation?.id === item.id} onClick={() => setSelectedOperationId(item.id)}>
                <strong>{name}</strong><span>{stage}</span><small>{'salary' in item && item.salary !== undefined ? `${formatMoney(item.salary)} / ${item.years} años` : `Contacto · ${item.startedOn ?? 'sin fecha'}`}</small>
              </button>
            })}
          </nav>
          {selectedNegotiation === undefined ? null : (() => {
            const negotiation = selectedNegotiation
            const offer = assessRoutedFreeAgentOfferIntelligence(world, team.id, negotiation.playerId, negotiation.sourcePlanId)
              .find((item) => item.sourceProposalId === negotiation.sourceProposalId)
            const preparation = offer === undefined ? undefined : assessFormalOfferPreparation(world, offer)
            const signing = assessPlayerContractSigningReadiness(world, team.id, negotiation.id)
            const decision = signing.governanceDecisionId === undefined ? undefined : world.governanceDecisionsById[signing.governanceDecisionId]
            const signingAppointments = Object.values(world.governanceAppointmentsById).filter((appointment) => appointment.actor.kind === 'COACH'
              && appointment.actor.id === world.userCoachId && appointment.startedOn <= world.currentDate
              && (appointment.endedOn === undefined || appointment.endedOn >= world.currentDate))
            const institution = Object.values(world.governanceInstitutionsById).find((item) => item.teamIds.includes(team.id))
            const rights = institution === undefined ? undefined : resolveGovernanceDecisionRights({
              decisionType: 'PLAYER_CONTRACT_SIGNING', institutionId: institution.id, asOfDate: world.currentDate,
              bodies: Object.values(world.governanceBodiesById), authorityGrants: Object.values(world.governanceAuthorityGrantsById),
              participationGrants: Object.values(world.governanceDecisionParticipationGrantsById),
            })
            const proposerBodyIds = rights?.proposerBodyIds.filter((bodyId) => signingAppointments.some((appointment) => appointment.bodyId === bodyId)) ?? []
            const approverBodyIds = decision === undefined ? [] : signing.requiredApproverBodyIds.filter((bodyId) => signingAppointments.some((appointment) => appointment.bodyId === bodyId))
            const approved = new Set(signing.approvedBodyIds)
            const known = knownMarketTerms(world, team.organizationId, negotiation.playerId)
            const salary = 'salary' in negotiation && negotiation.salary !== undefined ? negotiation.salary : preparation?.salaryProposal?.amount ?? known.salary
            const years = 'salary' in negotiation && negotiation.years !== undefined ? negotiation.years : preparation?.termProposalYears ?? known.years
            const revision = revisions[negotiation.id] ?? { salary: '', years: '', role: negotiation.role ?? '' }
            const humanSigningState = signing.status === 'SIGNED' || signing.status === 'ALREADY_SIGNED' ? 'El contrato ya está formalizado.'
              : signing.status === 'APPROVED' ? 'Las autorizaciones necesarias están completas. Falta ejecutar la firma.'
                : signing.status === 'REQUIRES_APPROVAL' ? 'La formalización espera la aprobación de Governance.'
                  : signing.status === 'UNKNOWN' ? 'La autoridad para formalizar no está resuelta en este momento.'
                    : signing.blocker === undefined ? 'La formalización todavía no está disponible.' : 'Finance o Governance deben resolver una restricci\u00f3n antes de firmar.'
            return <MarketOperationDossier world={world} teamId={team.id} negotiation={negotiation} isFreeAgent={getFreeAgents(world).some((item) => item.id === negotiation.playerId)}
              {...(salary === undefined ? {} : { viabilitySalary: salary })} {...(years === undefined ? {} : { viabilityYears: years })}>
              {negotiation.status === 'CONTACTED' && negotiation.contactResponse === undefined && <p>El mundo está esperando una respuesta del contacto. Avanza el calendario; no tienes que confirmar nada para que llegue.</p>}
              {negotiation.status === 'CONTACTED' && negotiation.contactResponse?.outcome === 'OPEN_TO_TALKS' && (
                isDirectApproachNegotiation(negotiation)
                  ? <CustomOfferForm world={world} teamId={team.id} negotiationId={negotiation.id}
                    {...(known.salary === undefined ? {} : { defaultSalary: known.salary })}
                    {...(known.years === undefined ? {} : { defaultYears: known.years })}
                    onSubmit={(terms) => submitCustomFreeAgentOffer(team.id, negotiation.id, terms)} />
                  : <div className="market-operation-dossier__controls">
                    <p>{preparation?.readiness === 'READY_TO_SUBMIT_OFFER' ? 'La propuesta preparada está lista para enviarse.' : 'La recomendación de oferta ya no está vigente. Revisa las condiciones conocidas antes de actuar.'}</p>
                    {preparation !== undefined && <details><summary>Ver preparación y restricciones</summary><p>{preparation.readiness.replaceAll('_', ' ').toLowerCase()}{preparation.blockers.length > 0 ? ` · ${preparation.blockers.map((item) => item.replaceAll('_', ' ').toLowerCase()).join(', ')}` : ''}</p></details>}
                    {negotiation.sourceProposalId !== undefined && <button disabled={preparation?.readiness !== 'READY_TO_SUBMIT_OFFER'} onClick={() => submitFreeAgentOffer(team.id, negotiation.id, negotiation.sourceProposalId!)} type="button">Enviar propuesta preparada</button>}
                  </div>
              )}
              {negotiation.status === 'OPEN' && <p>La propuesta ya fue enviada. La respuesta del jugador o su representante se resolver? al avanzar el calendario.</p>}
              {negotiation.status === 'COUNTERED' && negotiation.salary !== undefined && <div className="market-operation-dossier__controls">
                <p>La respuesta recibida contiene una nueva petición. Puedes aceptarla, ajustar tus condiciones o cerrar la negociación.</p>
                <button onClick={() => decideFreeAgentCounter(team.id, negotiation.id, negotiation.round, { kind: 'ACCEPT_COUNTER' })} type="button">Aceptar contraoferta</button>
                <label>Salario revisado<input aria-label={`Salario revisado ${negotiation.id}`} min="1" onChange={(event) => setRevisions((state) => ({ ...state, [negotiation.id]: { ...(state[negotiation.id] ?? revision), salary: event.target.value } }))} type="number" value={revision.salary} /></label>
                <label>Duraci\u00f3n revisada<input aria-label={`Duraci\u00f3n revisada ${negotiation.id}`} min="1" onChange={(event) => setRevisions((state) => ({ ...state, [negotiation.id]: { ...(state[negotiation.id] ?? revision), years: event.target.value } }))} type="number" value={revision.years} /></label>
                <label>Compromiso de rol<select aria-label={`Rol revisado ${negotiation.id}`} value={revision.role} onChange={(event) => setRevisions((state) => ({ ...state, [negotiation.id]: { ...(state[negotiation.id] ?? revision), role: event.target.value as NegotiationRole | '' } }))}>
                  <option value="">Sin promesa de rol</option><option value="STAR">Estrella</option><option value="STARTER">Titular</option><option value="ROTATION">Rotación</option><option value="DEPTH">Fondo de plantilla</option>
                </select></label>
                <button disabled={!Number.isSafeInteger(Number(revision.salary)) || Number(revision.salary) < 1 || !Number.isSafeInteger(Number(revision.years)) || Number(revision.years) < 1}
                  onClick={() => decideFreeAgentCounter(team.id, negotiation.id, negotiation.round, { kind: 'REVISE_OFFER', terms: { salary: Number(revision.salary), years: Number(revision.years), ...(revision.role === '' ? {} : { role: revision.role }) } })} type="button">Enviar oferta revisada</button>
                <button onClick={() => decideFreeAgentCounter(team.id, negotiation.id, negotiation.round, { kind: 'DECLINE_COUNTER' })} type="button">No continuar</button>
              </div>}
              {negotiation.status === 'ACCEPTED' && <div className="market-operation-dossier__controls">
                <p>Estado de formalización: {humanSigningState}</p>
                {decision !== undefined && <p>Aprobaciones: {approved.size} de {signing.requiredApproverBodyIds.length}. Pendientes: {signing.requiredApproverBodyIds.filter((bodyId) => !approved.has(bodyId)).map((bodyId) => world.governanceBodiesById[bodyId]?.name ?? bodyId).join(', ') || 'ninguna'}.</p>}
              </div>}
              {negotiation.status === 'ACCEPTED' && decision === undefined && proposerBodyIds.map((bodyId) => (
                <button key={bodyId} onClick={() => startFreeAgentSigningGovernance(team.id, negotiation.id, negotiation.sourceProposalId!, bodyId)} type="button">Solicitar formalización ({world.governanceBodiesById[bodyId]?.name ?? bodyId})</button>
              ))}
              {decision !== undefined && approverBodyIds.filter((bodyId) => !approved.has(bodyId)).map((bodyId) => (
                <button key={bodyId} onClick={() => recordFreeAgentSigningDecision(decision.id, 'APPROVED', bodyId)} type="button">Aprobar formalización ({world.governanceBodiesById[bodyId]?.name ?? bodyId})</button>
              ))}
              {decision !== undefined && signing.status !== 'SIGNED' && signing.status !== 'ALREADY_SIGNED' && !['REJECTED', 'VETOED', 'WITHDRAWN'].includes(signing.status) && proposerBodyIds.slice(0, 1).map((bodyId) => (
                <button key={`cancel:${bodyId}`} onClick={() => recordFreeAgentSigningDecision(decision.id, 'WITHDRAWN', bodyId)} type="button">Retirar solicitud</button>
              ))}
              {decision !== undefined && signing.status === 'APPROVED' && team.coachId === world.userCoachId && (
                <button onClick={() => completeFreeAgentSigning(team.id, negotiation.id, negotiation.sourceProposalId!)} type="button">Formalizar fichaje</button>
              )}
              {['REJECTED', 'WITHDRAWN', 'CLOSED', 'EXPIRED', 'DECLINED'].includes(negotiation.status) && <p>Esta operación terminó. El expediente conserva las condiciones y respuestas que se comunicaron.</p>}
            </MarketOperationDossier>
          })()}
        </div>}
        <TransferOperationsSection world={world} teamId={team.id} />
        <MarketOperationsHistory world={world} teamId={team.id} />
      </section> : null}
    </NgHoloShell>
  )
}

function FreeAgentOfferActions({ world, teamId, playerId, recommended, onContact }: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly recommended: boolean
  readonly onContact: () => void
}) {
  const activeContact = Object.values(world.negotiationsById).find((item) => item.teamId === teamId && item.playerId === playerId && isActiveNegotiation(item))
  if (activeContact !== undefined) return <p>Contact status: {activeContact.status}</p>
  return <div>
    <p>{recommended ? 'Encaja con una necesidad detectada de la plantilla.' : 'No responde a una necesidad detectada: las necesidades son una recomendación, no un requisito.'}</p>
    <button onClick={onContact} type="button">Contact player</button>
  </div>
}

function MarketOperationsHistory({ world, teamId }: { readonly world: GameWorld; readonly teamId: TeamId }) {
  const rows = buildMarketOperationsHistory(world, teamId)
  return <section className="market-history" aria-label="Historial de operaciones" data-testid="market-history">
    <header><strong>HISTORIAL DE OPERACIONES</strong><small>{rows.length} ejecutadas</small></header>
    {rows.length === 0 ? <p className="ng-canon__empty">Aún no se ha ejecutado ninguna operación: una oferta o una negociación no cuenta hasta que se firma.</p> : <ul>
      {rows.map((row) => <li key={row.id} data-operation-kind={row.kind}><time>{row.date}</time><b>{row.kind.replace('_', ' ')}</b><span>{row.subject}</span><small>{row.summary}</small></li>)}
    </ul>}
  </section>
}
