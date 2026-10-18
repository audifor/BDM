import { useEffect, useMemo, useState } from 'react'

import { assessPlayerContractSigningReadiness } from '@/app/governance'
import { assessRoutedFreeAgentOfferIntelligence } from '@/app/marketIntelligence'
import { assessFormalOfferPreparation } from '@/engine/marketIntelligence'
import { resolveGovernanceDecisionRights } from '@/domain/governance'
import { type PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { formatRatingEvaluation, getOrganizationRatingEvaluation } from '@/domain/intelligence'
import { getPlayerAge, type Player } from '@/domain/player'
import { getFreeAgents, getOrganizationKnowledge, isPlayerFreeAgent } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import type { NegotiationResponsibleActor } from '@/domain/market'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { ScoutingWorkspace } from '@/ui-ng/applications/scouting/ScoutingWorkspace'
import { MarketTalentBoard } from '@/ui-ng/applications/market/MarketTalentBoard'
import { MarketPlanningBoard } from '@/ui-ng/applications/market/MarketPlanningBoard'
import { MarketOperationsBar } from '@/ui-ng/applications/market/MarketOperationsBar'
import { getMarketSalarySummary, marketMinorUnitsToMajor } from './marketFinancialSummary'
import { addMarketTarget, archiveMarketTarget, getMarketTargetsForTeam, reviewMarketTarget, setMarketTargetNote, setMarketTargetPriority } from '@/app/market/MarketTargetService'
import type { MarketTargetPriority } from '@/domain/market/MarketTarget'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'
import './market-courtside-v3.css'
import './market-unified-navigation.css'

type MarketTab = 'explore' | 'targets' | 'scouting' | 'operations'
const MARKET_TABS: readonly { readonly id: MarketTab; readonly label: string }[] = [
  { id: 'explore', label: 'Buscar jugadores' },
  { id: 'targets', label: 'Objetivos' },
  { id: 'scouting', label: 'Scouting' },
  { id: 'operations', label: 'Operaciones' },
]

function marketActorLabel(world: GameWorld, actor: NegotiationResponsibleActor | undefined, date: string | undefined): string | undefined {
  if (actor === undefined) return undefined
  if (actor.kind === 'USER') return 'User'
  if (actor.kind === 'ORGANIZATION') return 'Organization'
  const person = world.staffPeopleById[actor.staffPersonId]
  const history = (world.staffCareerHistoryByStaffId[actor.staffPersonId] ?? []).filter((entry) => date !== undefined && entry.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]
  const name = person === undefined ? 'Staff member' : `${person.identity.firstName} ${person.identity.lastName}`
  return history?.kind === 'appointment' ? `${name} · ${STAFF_ROLE_LABELS[history.roleId]}` : name
}

export function MarketWorkspace({ initialWorld, initialTab = 'explore' }: { readonly initialWorld?: GameWorld; readonly initialTab?: MarketTab; readonly onOpenScouting?: () => void } = {}) {
  const world = useGameStore((state) => state.world) ?? initialWorld ?? null
  const contactFreeAgent = useGameStore((state) => state.contactFreeAgent)
  const submitFreeAgentOffer = useGameStore((state) => state.submitFreeAgentOffer)
  const decideFreeAgentCounter = useGameStore((state) => state.decideFreeAgentCounter)
  const startFreeAgentSigningGovernance = useGameStore((state) => state.startFreeAgentSigningGovernance)
  const recordFreeAgentSigningDecision = useGameStore((state) => state.recordFreeAgentSigningDecision)
  const completeFreeAgentSigning = useGameStore((state) => state.completeFreeAgentSigning)
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
  const [revisions, setRevisions] = useState<Record<string, { salary: string; years: string }>>({})
  const [operationFilter, setOperationFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED'>('ALL')
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
  const visibleNegotiations = negotiations.filter((item) => operationFilter === 'ALL' || (operationFilter === 'CLOSED' ? ['SIGNED', 'WITHDRAWN', 'REJECTED', 'EXPIRED', 'DECLINED'].includes(item.status) : !['SIGNED', 'WITHDRAWN', 'REJECTED', 'EXPIRED', 'DECLINED'].includes(item.status)))
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
      {activeTab === 'targets' ? <nav className="market-target-views" aria-label="Vistas de objetivos"><button type="button" aria-pressed={targetsView === 'tracking'} onClick={() => setTargetsView('tracking')}>Seguimiento</button><button type="button" aria-pressed={targetsView === 'planning'} onClick={() => setTargetsView('planning')}>Planificación</button></nav> : null}
      {(activeTab === 'explore' || activeTab === 'targets' && targetsView === 'tracking') ? <MarketTalentBoard
        key={activeTab === 'explore' ? searchPreset : 'targets'}
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
          <FreeAgentOfferActions offer={offers.find((item) => item.playerId === selected.id)}
            onContact={() => { const offer = offers.find((item) => item.playerId === selected.id)
              if (offer !== undefined) { contactFreeAgent(team.id, selected.id, offer.sourceProposalId); setSelectedId(undefined); setActiveTab('operations') } }} />
        </section>
      </div> : null}
      {activeTab === 'operations' ? <section aria-label="Free-agent negotiations" className="market-negotiations">
        <header className="market-negotiations__head"><strong>OPERACIONES</strong><span>{negotiations.length} registradas</span><select aria-label="Filtrar operaciones" value={operationFilter} onChange={(event) => setOperationFilter(event.target.value as typeof operationFilter)}><option value="ALL">Todas</option><option value="ACTIVE">En curso</option><option value="CLOSED">Cerradas</option></select></header>
        {visibleNegotiations.length === 0 ? (
          <p className="ng-canon__empty">Sin operaciones en este filtro.</p>
        ) : visibleNegotiations.map((negotiation) => {
          const player = world.players[negotiation.playerId]
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
          return (
            <article key={negotiation.id} className="market-negotiations__entry" data-negotiation-id={negotiation.id}><details className="market-negotiations__details"><summary><span className="market-negotiations__person">{player === undefined ? negotiation.playerId : `${player.firstName} ${player.lastName}`}</span><span className="market-negotiations__state">{negotiation.status}</span><span className="market-negotiations__sum">{negotiation.salary === undefined ? "Sin oferta" : `${formatMoney(negotiation.salary)} / ${negotiation.years} años`}</span><span className="market-negotiations__date">{negotiation.startedOn}</span><span className="market-negotiations__chevron">▾</span></summary><div className="market-negotiations__body">
              <p>Contact: {negotiation.status === 'CONTACTED' ? 'Awaiting player response' : 'CONTACTED'} · Response: {negotiation.contactResponse?.outcome ?? 'Pending'}</p>
              {marketActorLabel(world, negotiation.contactResponsibleActor ?? negotiation.responsibleActor, negotiation.startedOn) !== undefined && <p>Contact handled by: {marketActorLabel(world, negotiation.contactResponsibleActor ?? negotiation.responsibleActor, negotiation.startedOn)}</p>}
              {marketActorLabel(world, negotiation.offerResponsibleActor, negotiation.offerSubmittedOn) !== undefined && <p>Offer submitted by: {marketActorLabel(world, negotiation.offerResponsibleActor, negotiation.offerSubmittedOn)}</p>}
              <p>Negotiation: {negotiation.status}{'salary' in negotiation && negotiation.salary !== undefined ? ` · ${formatMoney(negotiation.salary)} / ${negotiation.years} years` : ''}</p>
              {negotiation.status === 'CONTACTED' && negotiation.contactResponse?.outcome === 'OPEN_TO_TALKS' && preparation !== undefined && (
                <>
                  <p>Offer preparation: {preparation.readiness}{preparation.blockers.length > 0 ? ` · ${preparation.blockers.join(', ')}` : ''}</p>
                  {preparation.readiness === 'READY_TO_SUBMIT_OFFER' && <button onClick={() => submitFreeAgentOffer(team.id, negotiation.id, negotiation.sourceProposalId!)} type="button">Submit prepared offer</button>}
                </>
              )}
              {negotiation.status === 'COUNTERED' && negotiation.salary !== undefined && (
                <>
                  <p>Counter: {formatMoney(negotiation.salary)} / {negotiation.years} years</p>
                  <button onClick={() => decideFreeAgentCounter(team.id, negotiation.id, negotiation.round, { kind: 'ACCEPT_COUNTER' })} type="button">Accept counter</button>
                  <label>Revise salary<input aria-label={`Revised salary ${negotiation.id}`} min="1" onChange={(event) => setRevisions((state) => ({ ...state, [negotiation.id]: { salary: event.target.value, years: state[negotiation.id]?.years ?? '' } }))} type="number" value={revisions[negotiation.id]?.salary ?? ''} /></label>
                  <label>Revise years<input aria-label={`Revised years ${negotiation.id}`} min="1" onChange={(event) => setRevisions((state) => ({ ...state, [negotiation.id]: { salary: state[negotiation.id]?.salary ?? '', years: event.target.value } }))} type="number" value={revisions[negotiation.id]?.years ?? ''} /></label>
                  <button disabled={!Number.isSafeInteger(Number(revisions[negotiation.id]?.salary)) || Number(revisions[negotiation.id]?.salary) < 1 || !Number.isSafeInteger(Number(revisions[negotiation.id]?.years)) || Number(revisions[negotiation.id]?.years) < 1}
                    onClick={() => decideFreeAgentCounter(team.id, negotiation.id, negotiation.round, { kind: 'REVISE_OFFER', terms: { salary: Number(revisions[negotiation.id]?.salary), years: Number(revisions[negotiation.id]?.years) } })} type="button">Submit revised offer</button>
                  <button onClick={() => decideFreeAgentCounter(team.id, negotiation.id, negotiation.round, { kind: 'DECLINE_COUNTER' })} type="button">Decline counter</button>
                </>
              )}
              {negotiation.status === 'ACCEPTED' && <p>Agreed terms: {formatMoney(negotiation.salary)} / {negotiation.years} years</p>}
              {negotiation.status === 'ACCEPTED' && signing.status !== 'SIGNED' && signing.status !== 'ALREADY_SIGNED' && (
                <>
                  <p>Signing Governance: {signing.status} · {signing.blocker ?? 'Awaiting current authority'}</p>
                  {decision !== undefined && <p>Approvals: {approved.size} of {signing.requiredApproverBodyIds.length}; pending: {signing.requiredApproverBodyIds.filter((bodyId) => !approved.has(bodyId)).map((bodyId) => world.governanceBodiesById[bodyId]?.name ?? bodyId).join(', ') || 'none'}</p>}
                </>
              )}
              {negotiation.status === 'ACCEPTED' && decision === undefined && proposerBodyIds.map((bodyId) => (
                <button key={bodyId} onClick={() => startFreeAgentSigningGovernance(team.id, negotiation.id, negotiation.sourceProposalId!, bodyId)} type="button">Start signing approval ({world.governanceBodiesById[bodyId]?.name ?? bodyId})</button>
              ))}
              {decision !== undefined && approverBodyIds.filter((bodyId) => !approved.has(bodyId)).map((bodyId) => (
                <button key={bodyId} onClick={() => recordFreeAgentSigningDecision(decision.id, 'APPROVED', bodyId)} type="button">Approve signing ({world.governanceBodiesById[bodyId]?.name ?? bodyId})</button>
              ))}
              {decision !== undefined && signing.status === 'APPROVED' && team.coachId === world.userCoachId && (
                <button onClick={() => completeFreeAgentSigning(team.id, negotiation.id, negotiation.sourceProposalId!)} type="button">Complete signing</button>
              )}
              {negotiation.status === 'SIGNED' && <p>Signed · Contract {negotiation.signedContractId}</p>}
              {!isPlayerFreeAgent(world, negotiation.playerId) && negotiation.status !== 'SIGNED' && <p>Signing blocker: Player is no longer a free agent.</p>}
            </div></details></article>
          )
        })}
      </section> : null}
    </NgHoloShell>
  )
}

function FreeAgentOfferActions({ offer, onContact }: {
  readonly offer: ReturnType<typeof assessRoutedFreeAgentOfferIntelligence>[number] | undefined
  readonly onContact: () => void
}) {
  const activeContact = offer?.existingNegotiation
  if (activeContact !== undefined) return <p>Contact status: {activeContact.status}</p>
  if (offer === undefined) return <p>Contact unavailable: this player is not in the current feasible BS10 acquisition recommendations.</p>
  return <div>
    <p>Contact readiness: {offer.contactReadiness}</p>
    {offer.contactReadiness === 'READY_TO_CONTACT'
      ? <button onClick={onContact} type="button">Contact player</button>
      : <p>Contact blocker: {offer.blockers.join(', ') || offer.contactAuthority.blockers.join(', ') || 'Current proposal is unavailable.'}</p>}
  </div>
}
