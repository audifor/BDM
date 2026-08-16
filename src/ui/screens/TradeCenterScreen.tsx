import { useMemo, useState } from 'react'

import type { TeamId } from '@/domain/ids'
import type { TradeAsset, TradeAssetKind, TradeAssetMovement, TradeProposal } from '@/domain/trade'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { BdmButton, Dialog, Divider, EmptyState, Feedback, IconAction, Input, Select, Surface } from '@/ui/components/designSystem'
import { formatMoney } from '@/ui/formatters'
import { addTradeMovement, addTradeParticipant, buildTradePresentation, changeTradeCounterparty, createTradeDraft, humanizeTradeReason, removeTradeMovement, tradeAssetKey, tradeAssetLabel, type TradeDraft } from '@/ui/trades/TradePresentation'

export function TradeCenterScreen({ world, onExecute }: { readonly world: GameWorld; readonly onExecute: (proposal: TradeProposal) => void }) {
  const rules = world.tradeRulesBySeasonId[world.currentSeasonId]
  const userTeam = getUserTeam(world)
  const teams = useMemo(() => rules === undefined ? [] : Object.values(world.teams).filter((team) => Object.values(world.competitions).some((competition) => competition.ecosystemId === rules.ecosystemId && competition.participantTeamIds.includes(team.id))), [rules, world.competitions, world.teams])
  const [draft, setDraft] = useState<TradeDraft>(() => createTradeDraft(world))
  const [teamPickerMode, setTeamPickerMode] = useState<'partner' | 'add' | null>(null)
  const [assetTarget, setAssetTarget] = useState<TeamId | null>(null)
  const [assetSource, setAssetSource] = useState<TeamId | undefined>()
  const [assetKind, setAssetKind] = useState<TradeAssetKind>('player')
  const [teamQuery, setTeamQuery] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  if (rules === undefined || userTeam === undefined || teams.length < 2) return <section className="screen trade-center"><div className="trade-center__heading"><div><p className="eyebrow">TRADES</p><h1>Trade Center</h1></div></div><EmptyState description="No active NBA-like trade rules are available for this career." title="Trades unavailable" /></section>

  const presentation = buildTradePresentation(world, rules, draft)
  const availablePartners = teams.filter((team) => team.id !== userTeam.id && !draft.participantTeamIds.includes(team.id) && team.name.toLocaleLowerCase().includes(teamQuery.toLocaleLowerCase()))
  const openAssets = (target: TeamId) => { setAssetTarget(target); setAssetSource(draft.participantTeamIds.find((teamId) => teamId !== target)); setAssetKind(rules.allowedAssetKinds[0] ?? 'player'); setCashAmount('') }
  const addAsset = (asset: TradeAsset) => { if (assetTarget === null || assetSource === undefined) return; setDraft((current) => addTradeMovement(current, { asset, fromTeamId: assetSource, toTeamId: assetTarget })); setAssetTarget(null) }
  const execute = () => { try { onExecute(presentation.proposal); setDraft(createTradeDraft(world)); setFeedback('Trade completed.') } catch (error) { setFeedback(error instanceof Error ? error.message : 'The trade could not be completed.') } }
  const currentSource = assetSource === undefined ? undefined : world.teams[assetSource]

  return <section className="screen trade-center">
    <header className="trade-center__heading"><div><p className="eyebrow">TRADES</p><h1>Trade Center</h1><p>Build the exchange around what each team receives.</p></div><div className="trade-center__heading-actions">{draft.participantTeamIds.length > 1 && <BdmButton onClick={() => setTeamPickerMode('partner')} size="compact" variant="ghost">Change partner</BdmButton>}{draft.participantTeamIds.length > 1 && <BdmButton disabled={draft.participantTeamIds.length >= rules.maxTeamsPerTrade || availablePartners.length === 0} onClick={() => setTeamPickerMode('add')} size="compact" variant="ghost">+ Add team</BdmButton>}</div></header>
    {feedback !== null && <Feedback tone="success">{feedback}</Feedback>}
    {draft.participantTeamIds.length < 2 ? <EmptyState action={<BdmButton onClick={() => setTeamPickerMode('partner')} size="large">Select a team</BdmButton>} description="Choose another team to start a negotiation." icon="↔" title="Build a trade" /> : <>
      <div className={`trade-board trade-board--${draft.participantTeamIds.length}`}>{presentation.teams.map((team) => <TradeTeamColumn hasSalaryMatching={presentation.hasSalaryMatching} key={team.teamId} onAddAsset={() => openAssets(team.teamId)} onRemove={(movement) => setDraft((current) => removeTradeMovement(current, movement))} team={team} />)}</div>
      <section className="trade-center__validation"><div><strong>{presentation.allowed ? 'Trade valid' : 'Trade needs changes'}</strong><p>{presentation.allowed ? 'Every team currently satisfies the configured trade rules.' : 'Review the team notes before proposing this trade.'}</p></div><div className="trade-center__reasons">{presentation.globalReasons.map((reason) => <Feedback key={reason} tone="danger">{humanizeTradeReason(reason)}</Feedback>)}{presentation.teams.flatMap((team) => team.validation?.reasons.map((reason, index) => <Feedback key={`${team.teamId}:${reason}:${index}`} tone="danger">{humanizeTradeReason(reason, team.teamName, team.validation)} <small>{reason}</small></Feedback>) ?? [])}</div></section>
      <footer className="trade-center__footer"><BdmButton disabled={draft.movements.length === 0} onClick={() => { setDraft(createTradeDraft(world)); setFeedback(null) }} variant="ghost">Clear proposal</BdmButton><BdmButton disabled={!presentation.allowed} onClick={execute} size="large">Propose trade</BdmButton></footer>
    </>}

    <Dialog onClose={() => { setTeamPickerMode(null); setTeamQuery('') }} open={teamPickerMode !== null} title={teamPickerMode === 'add' ? 'Add team to trade' : 'Select trade partner'}><div className="trade-picker"><Input aria-label="Search teams" label="Search teams" onChange={(event) => setTeamQuery(event.target.value)} placeholder="Search by team name" value={teamQuery} />{availablePartners.map((team) => <BdmButton key={team.id} onClick={() => { setDraft((current) => teamPickerMode === 'partner' ? changeTradeCounterparty(current, userTeam.id, team.id) : addTradeParticipant(current, team.id, rules.maxTeamsPerTrade)); setTeamPickerMode(null); setTeamQuery('') }} variant="ghost">{team.name}</BdmButton>)}{availablePartners.length === 0 && <p>No teams match this search.</p>}</div></Dialog>
    <Dialog onClose={() => setAssetTarget(null)} open={assetTarget !== null} title="Add asset"><div className="trade-picker"><Select ariaLabel="Source team" label="Sending team" onChange={(value) => setAssetSource(value as TeamId)} options={draft.participantTeamIds.filter((teamId) => teamId !== assetTarget).map((teamId) => ({ value: teamId, label: world.teams[teamId]!.name }))} value={assetSource} /><Select ariaLabel="Asset type" label="Asset type" onChange={(value) => setAssetKind(value as TradeAssetKind)} options={rules.allowedAssetKinds.map((kind) => ({ value: kind, label: assetKindLabel(kind) }))} value={assetKind} />{assetKind === 'cash' ? <div className="trade-picker__cash"><Input inputMode="numeric" label="Cash amount" onChange={(event) => setCashAmount(event.target.value)} placeholder="500000" value={cashAmount} /><BdmButton disabled={!validCash(cashAmount)} onClick={() => addAsset({ kind: 'cash', amount: Number(cashAmount) })}>Add cash</BdmButton></div> : currentSource === undefined ? null : <AssetChoices assets={assetsFor(world, currentSource.id, assetKind)} disabledKeys={new Set(draft.movements.map((movement) => tradeAssetKey(movement.asset)))} onChoose={addAsset} world={world} />}</div></Dialog>
  </section>
}

function TradeTeamColumn({ hasSalaryMatching, onAddAsset, onRemove, team }: { readonly hasSalaryMatching: boolean; readonly onAddAsset: () => void; readonly onRemove: (movement: TradeAssetMovement) => void; readonly team: ReturnType<typeof buildTradePresentation>['teams'][number] }) {
  const validation = team.validation
  return <Surface className="trade-team" elevated><header><span className="trade-team__crest">{team.teamName.split(/\s+/).map((part) => part[0]).join('').slice(0, 3)}</span><div><p>TEAM</p><h2>{team.teamName}</h2></div></header><Divider /><p className="trade-team__label">RECEIVES</p><div className="trade-team__assets">{team.received.length === 0 ? <p className="trade-team__empty">No assets added yet.</p> : team.received.map((asset) => <div className="trade-asset" key={`${asset.movement.fromTeamId}:${tradeAssetKey(asset.movement.asset)}`}><div><strong>{asset.label}</strong><small>From {asset.sourceTeamName}</small></div><IconAction aria-label={`Remove ${asset.label}`} onClick={() => onRemove(asset.movement)} size="compact" tooltip="Remove asset">×</IconAction></div>)}</div><BdmButton className="trade-team__add" onClick={onAddAsset} variant="ghost">+ Add asset</BdmButton>{hasSalaryMatching && validation !== undefined && <div className={`trade-salary${validation.reasons.includes('SALARY_MATCHING_FAILED') ? ' is-invalid' : ''}`}><span>Outgoing <b>{formatMoney(validation.outgoingSalary)}</b></span><span>Incoming <b>{formatMoney(validation.incomingSalary)}</b></span><span>Limit <b>{validation.incomingSalaryLimit === undefined ? '—' : formatMoney(validation.incomingSalaryLimit)}</b></span></div>}</Surface>
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
