import { useMemo, useState } from 'react'

import type { TeamId } from '@/domain/ids'
import type { TradeAsset, TradeAssetKind, TradeAssetMovement } from '@/domain/trade'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { resolveTradeSeasonAuthorityForTeam } from '@/engine/trade'
import { BdmButton, Dialog, Divider, EmptyState, Feedback, IconAction, Input, Select, Surface } from '@/ui/components/designSystem'
import { formatMoney } from '@/ui/formatters'
import { useGameStore } from '@/stores/gameStore'
import { assessTradeCommitmentReadiness } from '@/app/trades'
import { resolveGovernanceDecisionRights } from '@/domain/governance'
import { addTradeMovement, addTradeParticipant, buildTradePresentation, changeTradeCounterparty, createTradeDraft, humanizeTradeReason, removeTradeMovement, tradeAssetKey, tradeAssetLabel, type TradeDraft } from '@/ui/trades/TradePresentation'
import { STAFF_ROLE_LABELS } from '@/ui/staffPresentation'

function tradeActorLabel(world: GameWorld, actor: import('@/domain/trade').TradeNegotiationActor, date: string): string {
  if (actor.kind === 'USER') return 'User'
  const person = world.staffPeopleById[actor.staffPersonId]
  const history = (world.staffCareerHistoryByStaffId[actor.staffPersonId] ?? []).filter((entry) => entry.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]
  const name = person === undefined ? 'Staff member' : `${person.identity.firstName} ${person.identity.lastName}`
  return history?.kind === 'appointment' ? `${name} · ${STAFF_ROLE_LABELS[history.roleId]}` : name
}

export function TradeCenterScreen({ world }: { readonly world: GameWorld }) {
  const userTeam = getUserTeam(world)
  // Club-season authority: the user's own club picks the competition whose TradeRules apply today.
  const authority = userTeam === undefined ? undefined : resolveTradeSeasonAuthorityForTeam(world, userTeam.id)
  const rules = authority?.rules
  const teams = useMemo(() => rules === undefined ? [] : Object.values(world.teams).filter((team) => Object.values(world.competitions).some((competition) => competition.ecosystemId === rules.ecosystemId && competition.participantTeamIds.includes(team.id))), [rules, world.competitions, world.teams])
  const [draft, setDraft] = useState<TradeDraft>(() => createTradeDraft(world))
  const [teamPickerMode, setTeamPickerMode] = useState<'partner' | 'add' | null>(null)
  const [assetTarget, setAssetTarget] = useState<TeamId | null>(null)
  const [assetSource, setAssetSource] = useState<TeamId | undefined>()
  const [assetKind, setAssetKind] = useState<TradeAssetKind>('player')
  const [teamQuery, setTeamQuery] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const proposeNegotiation = useGameStore((state) => state.proposeUserTradeNegotiation)
  const respondNegotiation = useGameStore((state) => state.respondUserToTradeNegotiation)
  const startCommitment = useGameStore((state) => state.startUserTradeCommitment)
  const recordCommitmentEvent = useGameStore((state) => state.recordUserTradeCommitmentEvent)

  if (rules === undefined || userTeam === undefined || teams.length < 2) return <section className="screen trade-center"><div className="trade-center__heading"><div><p className="eyebrow">TRADES</p><h1>Trade Center</h1></div></div><EmptyState description="No active NBA-like trade rules are available for this career." title="Trades unavailable" /></section>

  const presentation = buildTradePresentation(world, rules, draft)
  const availablePartners = teams.filter((team) => team.id !== userTeam.id && !draft.participantTeamIds.includes(team.id) && team.name.toLocaleLowerCase().includes(teamQuery.toLocaleLowerCase()))
  const openAssets = (target: TeamId) => { setAssetTarget(target); setAssetSource(draft.participantTeamIds.find((teamId) => teamId !== target)); setAssetKind(rules.allowedAssetKinds[0] ?? 'player'); setCashAmount('') }
  const addAsset = (asset: TradeAsset) => { if (assetTarget === null || assetSource === undefined) return; setDraft((current) => addTradeMovement(current, { asset, fromTeamId: assetSource, toTeamId: assetTarget })); setAssetTarget(null) }
  const assessPackage = () => setFeedback(presentation.allowed
    ? 'Configured trade checks pass. This is a read-only assessment; negotiation and execution are not available.'
    : 'This package does not pass the current trade checks. No trade was proposed or executed.')
  const packageProposal = () => ({ id: `trade-center:${userTeam.id}:${world.currentDate}`, ecosystemId: rules.ecosystemId, seasonId: authority!.season.id, participantTeamIds: [...draft.participantTeamIds], movements: [...draft.movements] })
  const sendProposal = () => {
    const result = proposeNegotiation(packageProposal())
    setFeedback(result.status === 'PROPOSED' || result.status === 'ALREADY_PROPOSED' ? 'The package is now recorded as a nonbinding proposal.' : `${result.status}: ${(result.reasons ?? []).join(', ')}`)
  }
  const respond = (negotiationId: string, expectedRevisionId: string, action: 'ACCEPT' | 'REJECT' | 'WITHDRAW' | 'COUNTER') => {
    const result = respondNegotiation({ negotiationId, expectedRevisionId, action, ...(action === 'COUNTER' ? { counterPackage: packageProposal() } : {}) })
    setFeedback(`${result.status}${result.reasons === undefined ? '' : `: ${result.reasons.join(', ')}`}`)
  }
  const currentSource = assetSource === undefined ? undefined : world.teams[assetSource]
  const userNegotiations = Object.values(world.tradeNegotiationsById).filter((item) => item.participantTeamIds.includes(userTeam.id)).sort((a, b) => b.startedOn.localeCompare(a.startedOn))

  return <section className="screen trade-center">
    <header className="trade-center__heading"><div><p className="eyebrow">TRADES</p><h1>Trade Center</h1><p>Build the exchange around what each team receives.</p></div><div className="trade-center__heading-actions">{draft.participantTeamIds.length > 1 && <BdmButton onClick={() => setTeamPickerMode('partner')} size="compact" variant="ghost">Change partner</BdmButton>}{draft.participantTeamIds.length > 1 && <BdmButton disabled={draft.participantTeamIds.length >= rules.maxTeamsPerTrade || availablePartners.length === 0} onClick={() => setTeamPickerMode('add')} size="compact" variant="ghost">+ Add team</BdmButton>}</div></header>
    {feedback !== null && <Feedback>{feedback}</Feedback>}
    {draft.participantTeamIds.length < 2 ? <EmptyState action={<BdmButton onClick={() => setTeamPickerMode('partner')} size="large">Select a team</BdmButton>} description="Choose another team to assess an exchange." icon="↔" title="Build a trade package" /> : <>
      <div className={`trade-board trade-board--${draft.participantTeamIds.length}`}>{presentation.teams.map((team) => <TradeTeamColumn hasSalaryMatching={presentation.hasSalaryMatching} key={team.teamId} onAddAsset={() => openAssets(team.teamId)} onRemove={(movement) => setDraft((current) => removeTradeMovement(current, movement))} team={team} />)}</div>
      <section className="trade-center__validation"><div><strong>{presentation.allowed ? 'Trade valid' : 'Trade needs changes'}</strong><p>{presentation.allowed ? 'Every team currently satisfies the configured trade rules.' : 'Review the team notes before proposing this trade.'}</p></div><div className="trade-center__reasons">{presentation.globalReasons.map((reason) => <Feedback key={reason} tone="danger">{humanizeTradeReason(reason)}</Feedback>)}{presentation.teams.flatMap((team) => team.validation?.reasons.map((reason, index) => <Feedback key={`${team.teamId}:${reason}:${index}`} tone="danger">{humanizeTradeReason(reason, team.teamName, team.validation)} <small>{reason}</small></Feedback>) ?? [])}</div></section>
      <footer className="trade-center__footer"><BdmButton disabled={draft.movements.length === 0} onClick={() => { setDraft(createTradeDraft(world)); setFeedback(null) }} variant="ghost">Clear package</BdmButton><BdmButton disabled={draft.movements.length === 0} onClick={assessPackage} variant="ghost">Assess package</BdmButton><BdmButton disabled={!presentation.allowed || draft.movements.length === 0} onClick={sendProposal} size="large">Propose trade</BdmButton></footer>
    </>}

    <section className="trade-center__negotiations"><h2>Trade negotiations</h2>{userNegotiations.length === 0 ? <p>No trade proposals yet.</p> : userNegotiations.map((negotiation) => {
      const revision = negotiation.revisions[negotiation.revisions.length - 1]!
      const isCurrentUserProposer = revision.proposedByTeamId === userTeam.id
      const hasUserAccepted = negotiation.actions.some((action) => action.revisionId === revision.id && action.teamId === userTeam.id && action.kind === 'ACCEPT')
      const canCounter = !isCurrentUserProposer && sameIds(draft.participantTeamIds, negotiation.participantTeamIds) && presentation.allowed && draft.movements.length > 0
      const commitment = negotiation.status === 'AGREED' ? assessTradeCommitmentReadiness(world, negotiation.id, revision.id) : undefined
      const userParticipant = commitment?.participants.find((participant) => participant.teamId === userTeam.id)
      const decision = userParticipant?.governanceDecisionId === undefined ? undefined : world.governanceDecisionsById[userParticipant.governanceDecisionId]
      const currentRights = decision === undefined ? undefined : resolveGovernanceDecisionRights({ bodies: Object.values(world.governanceBodiesById), authorityGrants: Object.values(world.governanceAuthorityGrantsById), participationGrants: Object.values(world.governanceDecisionParticipationGrantsById), decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: world.currentDate })
      const userApprovalBodies = currentRights?.approverBodyIds.filter((bodyId) => Object.values(world.governanceAppointmentsById).some((appointment) => appointment.actor.kind === 'COACH' && appointment.actor.id === world.userCoachId && appointment.bodyId === bodyId && appointment.startedOn <= world.currentDate && (appointment.endedOn === undefined || appointment.endedOn >= world.currentDate))) ?? []
      const userInstitutions = Object.values(world.governanceInstitutionsById).filter((institution) => institution.teamIds.includes(userTeam.id))
      const userProposerBodies = userInstitutions.length !== 1 ? [] : resolveGovernanceDecisionRights({ bodies: Object.values(world.governanceBodiesById), authorityGrants: Object.values(world.governanceAuthorityGrantsById), participationGrants: Object.values(world.governanceDecisionParticipationGrantsById), decisionType: 'PLAYER_TRADE_COMMITMENT', institutionId: userInstitutions[0]!.id, asOfDate: world.currentDate }).proposerBodyIds.filter((bodyId) => Object.values(world.governanceAppointmentsById).some((appointment) => appointment.actor.kind === 'COACH' && appointment.actor.id === world.userCoachId && appointment.bodyId === bodyId && appointment.startedOn <= world.currentDate && (appointment.endedOn === undefined || appointment.endedOn >= world.currentDate)))
      return <Surface className="trade-negotiation-card" key={negotiation.id}><strong>{negotiation.status} · Revision {revision.revisionNumber + 1}</strong><p>{world.teams[revision.proposedByTeamId]?.name ?? revision.proposedByTeamId} proposed this package on {revision.proposedOn}.{negotiation.status === 'EXECUTED' ? ' The agreed exchange is complete.' : ' It is nonbinding; agreement does not move players or other assets.'}</p><div className="trade-negotiation-card__history"><h3>Package history</h3>{negotiation.revisions.map((item) => <p key={item.id}><strong>Revision {item.revisionNumber + 1}</strong> · {item.movements.map((movement) => `${tradeAssetLabel(world, movement.asset)}: ${world.teams[movement.fromTeamId]?.name ?? movement.fromTeamId} → ${world.teams[movement.toTeamId]?.name ?? movement.toTeamId}`).join('; ')}</p>)}{negotiation.actions.map((action) => <small key={action.id}>{action.kind} · {world.teams[action.teamId]?.name ?? action.teamId} · {tradeActorLabel(world, action.actor, action.actedOn)} · {action.actedOn}</small>)}</div>{negotiation.status === 'AGREED' && <><p>Commitment status: {userParticipant?.status ?? commitment?.status ?? 'BLOCKED'}. {userParticipant?.blockers.join(', ')}</p>{decision === undefined ? userProposerBodies.length > 0 && <BdmButton onClick={() => setFeedback(`${startCommitment(negotiation.id, revision.id).status}`)} size="compact">Start this team’s commitment review</BdmButton> : userApprovalBodies.map((bodyId) => <BdmButton key={bodyId} onClick={() => setFeedback(`${recordCommitmentEvent(decision.id, 'APPROVED', bodyId).status}`)} size="compact">Approve for {world.governanceBodiesById[bodyId]?.name ?? bodyId}</BdmButton>)}</>}{!['AGREED', 'EXECUTED', 'REJECTED', 'WITHDRAWN'].includes(negotiation.status) && <div className="trade-center__heading-actions">{isCurrentUserProposer ? <BdmButton onClick={() => respond(negotiation.id, revision.id, 'WITHDRAW')} size="compact" variant="ghost">Withdraw</BdmButton> : !hasUserAccepted && <><BdmButton onClick={() => respond(negotiation.id, revision.id, 'ACCEPT')} size="compact">Accept</BdmButton><BdmButton onClick={() => respond(negotiation.id, revision.id, 'REJECT')} size="compact" variant="ghost">Reject</BdmButton><BdmButton disabled={!canCounter} onClick={() => respond(negotiation.id, revision.id, 'COUNTER')} size="compact" variant="ghost">Counter with current package</BdmButton></>}</div>}</Surface>
    })}</section>

    <Dialog onClose={() => { setTeamPickerMode(null); setTeamQuery('') }} open={teamPickerMode !== null} title={teamPickerMode === 'add' ? 'Add team to trade' : 'Select trade partner'}><div className="trade-picker"><Input aria-label="Search teams" label="Search teams" onChange={(event) => setTeamQuery(event.target.value)} placeholder="Search by team name" value={teamQuery} />{availablePartners.map((team) => <BdmButton key={team.id} onClick={() => { setDraft((current) => teamPickerMode === 'partner' ? changeTradeCounterparty(current, userTeam.id, team.id) : addTradeParticipant(current, team.id, rules.maxTeamsPerTrade)); setTeamPickerMode(null); setTeamQuery('') }} variant="ghost">{team.name}</BdmButton>)}{availablePartners.length === 0 && <p>No teams match this search.</p>}</div></Dialog>
    <Dialog onClose={() => setAssetTarget(null)} open={assetTarget !== null} title="Add asset"><div className="trade-picker"><Select ariaLabel="Source team" label="Sending team" onChange={(value) => setAssetSource(value as TeamId)} options={draft.participantTeamIds.filter((teamId) => teamId !== assetTarget).map((teamId) => ({ value: teamId, label: world.teams[teamId]!.name }))} value={assetSource} /><Select ariaLabel="Asset type" label="Asset type" onChange={(value) => setAssetKind(value as TradeAssetKind)} options={rules.allowedAssetKinds.map((kind) => ({ value: kind, label: assetKindLabel(kind) }))} value={assetKind} />{assetKind === 'cash' ? <div className="trade-picker__cash"><Input inputMode="numeric" label="Cash amount" onChange={(event) => setCashAmount(event.target.value)} placeholder="500000" value={cashAmount} /><BdmButton disabled={!validCash(cashAmount)} onClick={() => addAsset({ kind: 'cash', amount: Number(cashAmount) })}>Add cash</BdmButton></div> : currentSource === undefined ? null : <AssetChoices assets={assetsFor(world, currentSource.id, assetKind)} disabledKeys={new Set(draft.movements.map((movement) => tradeAssetKey(movement.asset)))} onChoose={addAsset} world={world} />}</div></Dialog>
  </section>
}

function sameIds(a: readonly string[], b: readonly string[]): boolean { const left = [...a].sort(); const right = [...b].sort(); return left.length === right.length && left.every((value, index) => value === right[index]) }

function TradeTeamColumn({ hasSalaryMatching, onAddAsset, onRemove, team }: { readonly hasSalaryMatching: boolean; readonly onAddAsset: () => void; readonly onRemove: (movement: TradeAssetMovement) => void; readonly team: ReturnType<typeof buildTradePresentation>['teams'][number] }) {
  const validation = team.validation
  return <Surface className="trade-team" elevated><header><span className="trade-team__crest">{team.teamName.split(/\s+/).map((part) => part[0]).join('').slice(0, 3)}</span><div><p>TEAM</p><h2>{team.teamName}</h2></div></header><Divider /><p className="trade-team__label">RECEIVES</p><div className="trade-team__assets">{team.received.length === 0 ? <p className="trade-team__empty">No assets added yet.</p> : team.received.map((asset) => <div className="trade-asset" key={`${asset.movement.fromTeamId}:${tradeAssetKey(asset.movement.asset)}`}><div><strong>{asset.label}</strong><small>From {asset.sourceTeamName}{asset.intelligence === undefined ? '' : ` · Intelligence ${asset.intelligence}`}</small></div><IconAction aria-label={`Remove ${asset.label}`} onClick={() => onRemove(asset.movement)} size="compact" tooltip="Remove asset">×</IconAction></div>)}</div><BdmButton className="trade-team__add" onClick={onAddAsset} variant="ghost">+ Add asset</BdmButton>{hasSalaryMatching && validation !== undefined && <div className={`trade-salary${validation.reasons.includes('SALARY_MATCHING_FAILED') ? ' is-invalid' : ''}`}><span>Outgoing <b>{formatMoney(validation.outgoingSalary)}</b></span><span>Incoming <b>{formatMoney(validation.incomingSalary)}</b></span><span>Limit <b>{validation.incomingSalaryLimit === undefined ? '—' : formatMoney(validation.incomingSalaryLimit)}</b></span></div>}</Surface>
}

function AssetChoices({ assets, disabledKeys, onChoose, world }: { readonly assets: readonly TradeAsset[]; readonly disabledKeys: ReadonlySet<string>; readonly onChoose: (asset: TradeAsset) => void; readonly world: GameWorld }) {
  return <div className="trade-picker__assets">{assets.length === 0 ? <p>No available assets of this type.</p> : assets.map((asset) => <BdmButton disabled={disabledKeys.has(tradeAssetKey(asset))} key={tradeAssetKey(asset)} onClick={() => onChoose(asset)} variant="ghost">{tradeAssetLabel(world, asset)}</BdmButton>)}</div>
}

function assetsFor(world: GameWorld, teamId: TeamId, kind: Exclude<TradeAssetKind, 'cash'>): readonly TradeAsset[] {
  if (kind === 'player') return world.teams[teamId]!.rosterPlayerIds.map((playerId) => ({ kind, playerId }))
  if (kind === 'draftPick') return Object.values(world.draftPicksById).filter((pick) => pick.ownerTeamId === teamId && pick.selection === undefined).map((pick) => ({ kind, draftPickId: pick.id }))
  if (kind === 'futureDraftPick') return Object.values(world.futureDraftPickRightsById).filter((pick) => pick.ownerTeamId === teamId).map((pick) => ({ kind, futureDraftPickRightId: pick.id }))
  if (kind === 'playerRights') return Object.values(world.playerRightsById).filter((right) => right.ownerTeamId === teamId && right.status === 'active').map((right) => ({ kind, playerRightsId: right.id }))
  return Object.values(world.draftPickSwapRightsById).filter((right) => right.holderTeamId === teamId && right.status === 'active').map((right) => ({ kind, draftPickSwapRightId: right.id }))
}

function assetKindLabel(kind: TradeAssetKind): string { return ({ player: 'Players', draftPick: 'Draft picks', futureDraftPick: 'Future picks', playerRights: 'Player rights', draftPickSwapRight: 'Pick swaps', cash: 'Cash' })[kind] }
function validCash(value: string): boolean { return Number.isInteger(Number(value)) && Number(value) > 0 }
