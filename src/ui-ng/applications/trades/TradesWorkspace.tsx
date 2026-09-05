import { useMemo, useState } from 'react'

import type { TeamId } from '@/domain/ids'
import type { TradeAsset, TradeAssetKind } from '@/domain/trade'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import {
  addTradeMovement,
  addTradeParticipant,
  buildTradePresentation,
  changeTradeCounterparty,
  createTradeDraft,
  humanizeTradeReason,
  removeTradeMovement,
  tradeAssetKey,
  tradeAssetLabel,
} from '@/ui/trades/TradePresentation'
import { UNAVAILABLE_SECTION_MESSAGE } from '@/ui-ng/system/startMenuCatalog'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'

function assetsFor(world: NonNullable<ReturnType<typeof useGameStore.getState>['world']>, teamId: TeamId, kind: Exclude<TradeAssetKind, 'cash'>): readonly TradeAsset[] {
  if (kind === 'player') return world.teams[teamId]!.rosterPlayerIds.map((playerId) => ({ kind, playerId }))
  if (kind === 'draftPick') return Object.values(world.draftPicksById).filter((pick) => pick.ownerTeamId === teamId && pick.selection === undefined).map((pick) => ({ kind, draftPickId: pick.id }))
  if (kind === 'futureDraftPick') return Object.values(world.futureDraftPickRightsById).filter((pick) => pick.ownerTeamId === teamId).map((pick) => ({ kind, futureDraftPickRightId: pick.id }))
  if (kind === 'playerRights') return Object.values(world.playerRightsById).filter((right) => right.ownerTeamId === teamId && right.status === 'active').map((right) => ({ kind, playerRightsId: right.id }))
  return Object.values(world.draftPickSwapRightsById).filter((right) => right.holderTeamId === teamId && right.status === 'active').map((right) => ({ kind, draftPickSwapRightId: right.id }))
}

export function TradesWorkspace() {
  const world = useGameStore((state) => state.world)
  const team = world === null ? undefined : getUserTeam(world)
  const rules = world === null ? undefined : world.tradeRulesBySeasonId[world.currentSeasonId]
  const eligibleTeams =
    world === null || rules === undefined
      ? []
      : Object.values(world.teams).filter((item) =>
          Object.values(world.competitions).some(
            (competition) => competition.ecosystemId === rules.ecosystemId && competition.participantTeamIds.includes(item.id),
          ),
        )

  if (world === null || team === undefined || rules === undefined || eligibleTeams.length < 2) {
    return (
      <NgHoloShell
        appLabel="Trades"
        empty
        emptyMessage={UNAVAILABLE_SECTION_MESSAGE}
        region="trades-workspace"
        teamId={team?.id}
      />
    )
  }

  return <TradesBoard rules={rules} teamId={team.id} world={world} />
}

function TradesBoard({
  world,
  teamId,
  rules,
}: {
  readonly world: NonNullable<ReturnType<typeof useGameStore.getState>['world']>
  readonly teamId: TeamId
  readonly rules: NonNullable<NonNullable<ReturnType<typeof useGameStore.getState>['world']>['tradeRulesBySeasonId'][string]>
}) {
  const executeTrade = useGameStore((state) => state.executeTrade)
  const [draft, setDraft] = useState(() => createTradeDraft(world))
  const [partnerId, setPartnerId] = useState<TeamId | ''>('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const teams = useMemo(
    () =>
      Object.values(world.teams).filter((item) =>
        Object.values(world.competitions).some(
          (competition) => competition.ecosystemId === rules.ecosystemId && competition.participantTeamIds.includes(item.id),
        ),
      ),
    [rules.ecosystemId, world.competitions, world.teams],
  )

  const presentation = buildTradePresentation(world, rules, draft)
  const partners = teams.filter((item) => item.id !== teamId)

  return (
    <NgHoloShell appLabel="Trades" meta={presentation.allowed ? 'Valid' : 'Needs changes'} region="trades-workspace" teamId={teamId} title="Trade center">
      <div className="ng-canon__toolbar">
        <select aria-label="Trade partner" onChange={(event) => setPartnerId(event.target.value as TeamId)} value={partnerId}>
          <option value="">Select partner</option>
          {partners.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          className="ng-canon__action"
          disabled={partnerId === ''}
          onClick={() => {
            const next = draft.participantTeamIds.length < 2 ? changeTradeCounterparty(draft, teamId, partnerId as TeamId) : addTradeParticipant(draft, partnerId as TeamId, rules.maxTeamsPerTrade)
            setDraft(next)
          }}
          type="button"
        >
          Add partner
        </button>
        <button
          className="ng-canon__action"
          onClick={() => {
            setDraft(createTradeDraft(world))
            setFeedback(null)
          }}
          type="button"
        >
          Clear
        </button>
        <button
          className="ng-canon__action"
          disabled={!presentation.allowed}
          onClick={() => {
            try {
              executeTrade(presentation.proposal)
              setDraft(createTradeDraft(world))
              setFeedback('Trade completed.')
            } catch (error) {
              setFeedback(error instanceof Error ? error.message : 'The trade could not be completed.')
            }
          }}
          type="button"
        >
          Propose trade
        </button>
      </div>
      {feedback !== null ? <p className="ng-canon__note">{feedback}</p> : null}
      <div className="ng-canon__cards">
        {presentation.teams.map((column) => (
          <section className="ng-canon__card ng-holo-panel" key={column.teamId}>
            <p className="ng-canon__eyebrow">Receives</p>
            <h3 className="ng-canon__title">{column.teamName}</h3>
            {column.received.length === 0 ? (
              <p className="ng-canon__empty">No assets added yet.</p>
            ) : (
              <ul className="ng-canon__list">
                {column.received.map((asset) => (
                  <li key={`${asset.movement.fromTeamId}:${tradeAssetKey(asset.movement.asset)}`}>
                    {asset.label}
                    <button className="ng-canon__link" onClick={() => setDraft((current) => removeTradeMovement(current, asset.movement))} type="button">
                      {' '}
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <AssetAdder
              onAdd={(asset, fromTeamId) => setDraft((current) => addTradeMovement(current, { asset, fromTeamId, toTeamId: column.teamId }))}
              participantTeamIds={draft.participantTeamIds}
              rulesKinds={rules.allowedAssetKinds}
              targetId={column.teamId}
              world={world}
            />
          </section>
        ))}
      </div>
      <div className="ng-canon__panel ng-holo-panel" style={{ marginTop: 'var(--ng-spacing-12)' }}>
        {presentation.globalReasons.length === 0 && presentation.teams.every((item) => (item.validation?.reasons.length ?? 0) === 0) ? (
          <p className="ng-canon__note">Every team currently satisfies the configured trade rules.</p>
        ) : (
          <ul className="ng-canon__list">
            {presentation.globalReasons.map((reason) => (
              <li key={reason}>{humanizeTradeReason(reason)}</li>
            ))}
            {presentation.teams.flatMap((item) =>
              (item.validation?.reasons ?? []).map((reason, index) => (
                <li key={`${item.teamId}:${reason}:${index}`}>{humanizeTradeReason(reason, item.teamName, item.validation)}</li>
              )),
            )}
          </ul>
        )}
      </div>
    </NgHoloShell>
  )
}

function AssetAdder({
  world,
  targetId,
  participantTeamIds,
  rulesKinds,
  onAdd,
}: {
  readonly world: NonNullable<ReturnType<typeof useGameStore.getState>['world']>
  readonly targetId: TeamId
  readonly participantTeamIds: readonly TeamId[]
  readonly rulesKinds: readonly TradeAssetKind[]
  readonly onAdd: (asset: TradeAsset, fromTeamId: TeamId) => void
}) {
  const sources = participantTeamIds.filter((id) => id !== targetId)
  const [sourceId, setSourceId] = useState<TeamId | ''>(sources[0] ?? '')
  const [kind, setKind] = useState<TradeAssetKind>(rulesKinds[0] ?? 'player')
  const source = sourceId === '' ? undefined : world.teams[sourceId]
  return (
    <div className="ng-canon__toolbar">
      <select aria-label="Sending team" onChange={(event) => setSourceId(event.target.value as TeamId)} value={sourceId}>
        {sources.map((id) => (
          <option key={id} value={id}>
            {world.teams[id]?.name}
          </option>
        ))}
      </select>
      <select aria-label="Asset type" onChange={(event) => setKind(event.target.value as TradeAssetKind)} value={kind}>
        {rulesKinds.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      {kind === 'cash' || source === undefined ? null : (
        <select
          aria-label="Asset"
          onChange={(event) => {
            const key = event.target.value
            const asset = assetsFor(world, source.id, kind as Exclude<TradeAssetKind, 'cash'>).find((item) => tradeAssetKey(item) === key)
            if (asset !== undefined) onAdd(asset, source.id)
          }}
          value=""
        >
          <option value="">Add asset</option>
          {assetsFor(world, source.id, kind as Exclude<TradeAssetKind, 'cash'>).map((asset) => (
            <option key={tradeAssetKey(asset)} value={tradeAssetKey(asset)}>
              {tradeAssetLabel(world, asset)}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
