import { useMemo, useState } from 'react'

import { assessPlayerContractSigningReadiness } from '@/app/governance'
import { assessRoutedFreeAgentOfferIntelligence } from '@/app/marketIntelligence'
import { assessFormalOfferPreparation } from '@/engine/marketIntelligence'
import { resolveGovernanceDecisionRights } from '@/domain/governance'
import { type PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { formatRatingEvaluation, getOrganizationRatingEvaluation } from '@/domain/intelligence'
import { getPlayerAge, type Player } from '@/domain/player'
import { canTeamAffordAdditionalSalary, getFreeAgents, getOrganizationKnowledge, getTeamFinancialSnapshot, isPlayerFreeAgent } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'
import type { NegotiationResponsibleActor } from '@/domain/market'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'

type PositionFilter = 'ALL' | Player['basketball']['primaryPosition']

function marketActorLabel(world: GameWorld, actor: NegotiationResponsibleActor | undefined, date: string | undefined): string | undefined {
  if (actor === undefined) return undefined
  if (actor.kind === 'USER') return 'User'
  if (actor.kind === 'ORGANIZATION') return 'Organization'
  const person = world.staffPeopleById[actor.staffPersonId]
  const history = (world.staffCareerHistoryByStaffId[actor.staffPersonId] ?? []).filter((entry) => date !== undefined && entry.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]
  const name = person === undefined ? 'Staff member' : `${person.identity.firstName} ${person.identity.lastName}`
  return history?.kind === 'appointment' ? `${name} · ${STAFF_ROLE_LABELS[history.roleId]}` : name
}

export function MarketWorkspace({ initialWorld }: { readonly initialWorld?: GameWorld } = {}) {
  const world = useGameStore((state) => state.world) ?? initialWorld ?? null
  const contactFreeAgent = useGameStore((state) => state.contactFreeAgent)
  const submitFreeAgentOffer = useGameStore((state) => state.submitFreeAgentOffer)
  const decideFreeAgentCounter = useGameStore((state) => state.decideFreeAgentCounter)
  const startFreeAgentSigningGovernance = useGameStore((state) => state.startFreeAgentSigningGovernance)
  const recordFreeAgentSigningDecision = useGameStore((state) => state.recordFreeAgentSigningDecision)
  const completeFreeAgentSigning = useGameStore((state) => state.completeFreeAgentSigning)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<PositionFilter>('ALL')
  const [selectedId, setSelectedId] = useState<PlayerId | undefined>()
  const [revisions, setRevisions] = useState<Record<string, { salary: string; years: string }>>({})
  const team = world === null ? undefined : getUserTeam(world)

  const agents = useMemo(() => {
    if (world === null) return []
    return getFreeAgents(world).filter(
      (player) =>
        (position === 'ALL' || player.basketball.primaryPosition === position) &&
        `${player.firstName} ${player.lastName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    )
  }, [position, query, world])

  if (world === null || team === undefined) {
    return <NgHoloShell appLabel="Market" empty region="market-workspace" />
  }

  const finances = getTeamFinancialSnapshot(world, team.id)
  const selectedIntentPlanId = selectedId === undefined ? undefined : Object.values(world.negotiationsById).find((item) => item.teamId === team.id && item.playerId === selectedId)?.sourcePlanId
  const offers = assessRoutedFreeAgentOfferIntelligence(world, team.id, selectedId, selectedIntentPlanId)
  const selected = agents.find((player) => player.id === selectedId)
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
      appLabel="Market"
      meta={`${agents.length} available · ${formatMoney(finances.remainingPlayerSalaryBudget)} remaining`}
      region="market-workspace"
      teamId={team.id}
      title="Free agents"
    >
      <div className="ng-canon__toolbar">
        <input aria-label="Search free agents" onChange={(event) => setQuery(event.target.value)} placeholder="Search players" value={query} />
        <select aria-label="Filter market by position" onChange={(event) => setPosition(event.target.value as PositionFilter)} value={position}>
          {(['ALL', 'PG', 'SG', 'SF', 'PF', 'C'] as const).map((value) => (
            <option key={value} value={value}>
              {value === 'ALL' ? 'All positions' : value}
            </option>
          ))}
        </select>
      </div>
      <div className="ng-canon__split">
        <div className="ng-canon__panel ng-holo-panel">
          {agents.length === 0 ? (
            <p className="ng-canon__empty">No available players.</p>
          ) : (
            <NgPrecisionTable
              className="ng-canon__table"
              columns={ngTableColumns(agents, [
                ngCol('player', 'Player', (player) => (
                  <button
                    className="ng-canon__link"
                    onClick={(event) => {
                      event.stopPropagation()
                      navigateToPlayer(player.id)
                    }}
                    type="button"
                  >
                    {player.firstName} {player.lastName}
                  </button>
                ), { value: (player) => `${player.firstName} ${player.lastName}` }),
                ngCol('pos', 'Pos', (player) => <PlayPositionMark position={player.basketball.primaryPosition} />, {
                  value: (player) => player.basketball.primaryPosition,
                }),
                ngCol('age', 'Age', (player) => getPlayerAge(world, player.id), {
                  numeric: true,
                  value: (player) => getPlayerAge(world, player.id) ?? 0,
                }),
              ])}
              gridId="ng-market-free-agents"
              onSelectionChange={(ids) => setSelectedId(ids[0] as PlayerId | undefined)}
              rows={agents}
              selectedId={selectedId}
            />
          )}
        </div>
        <aside className="ng-canon__inspector ng-holo-panel">
          {selected === undefined ? (
            <p className="ng-canon__empty">Select a free agent to inspect known information and current acquisition readiness.</p>
          ) : (
            <>
              <p className="ng-canon__eyebrow">Player inspector</p>
              <h3 className="ng-canon__title">
                {selected.firstName} {selected.lastName}
              </h3>
              <dl className="ng-canon__metrics">
                <NgMetric label="Position" value={<PlayPositionMark position={selected.basketball.primaryPosition} />} />
                <NgMetric label="Age" value={getPlayerAge(world, selected.id)} />
                <NgMetric label="Knowledge" value={getOrganizationKnowledge(world, team.organizationId, selected.id) === undefined ? 'Unknown' : 'Scouted'} />
                <NgMetric label="Finishing" value={evaluate(selected, 'finishing')} />
                <NgMetric label="Shooting" value={evaluate(selected, 'shooting')} />
                <NgMetric label="Creation" value={evaluate(selected, 'creation')} />
              </dl>
              <FreeAgentOfferActions
                offer={offers.find((item) => item.playerId === selected.id)}
                onContact={() => {
                  const offer = offers.find((item) => item.playerId === selected.id)
                  if (offer !== undefined) contactFreeAgent(team.id, selected.id, offer.sourceProposalId)
                }}
              />
            </>
          )}
        </aside>
      </div>
      <section aria-label="Free-agent negotiations" className="ng-canon__panel ng-holo-panel">
        <h3>Acquisition activity</h3>
        {Object.values(world.negotiationsById).filter((item) => item.teamId === team.id).sort((a, b) => a.id.localeCompare(b.id)).length === 0 ? (
          <p className="ng-canon__empty">No player contacts or negotiations yet.</p>
        ) : Object.values(world.negotiationsById).filter((item) => item.teamId === team.id).sort((a, b) => a.id.localeCompare(b.id)).map((negotiation) => {
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
            <article key={negotiation.id} className="ng-canon__panel" data-negotiation-id={negotiation.id}>
              <h4>{player === undefined ? negotiation.playerId : `${player.firstName} ${player.lastName}`}</h4>
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
            </article>
          )
        })}
      </section>
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
