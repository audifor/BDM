import { useEffect, useMemo, useState } from 'react'

import { assessTradeCommitmentReadiness, tradeNegotiationResponseReadiness } from '@/app/trades'
import type { TeamId } from '@/domain/ids'
import { resolveGovernanceDecisionRights } from '@/domain/governance'
import type { TradeAsset, TradeAssetKind, TradeNegotiation, TradeNegotiationRevision, TradeRules } from '@/domain/trade'
import { getUserTeam } from '@/engine/calendar'
import type { TradeValidationReason } from '@/engine/trade'
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
  type TradeDraft,
  type TradePresentation,
} from '@/ui/trades/TradePresentation'
import { UNAVAILABLE_SECTION_MESSAGE } from '@/ui-ng/system/startMenuCatalog'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
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
  readonly rules: TradeRules
}) {
  const { negotiationId } = useNgWorkspaceNavigation()
  const proposeNegotiation = useGameStore((state) => state.proposeUserTradeNegotiation)
  const startCommitment = useGameStore((state) => state.startUserTradeCommitment)
  const recordCommitmentEvent = useGameStore((state) => state.recordUserTradeCommitmentEvent)
  const [draft, setDraft] = useState(() => createTradeDraft(world))
  const [partnerId, setPartnerId] = useState<TeamId | ''>('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loadedNegotiationId, setLoadedNegotiationId] = useState<string | null>(null)
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
  const canPropose = presentation.allowed && draft.movements.length > 0 && draft.participantTeamIds.length >= 2
  const requestedNegotiation = negotiationId === null ? undefined : world.tradeNegotiationsById[negotiationId]

  // Arriving from the trade-response breakpoint loads that negotiation's package into the existing editor so a
  // counter can be built from the proposal on screen. It runs once per requested negotiation, never on every world
  // change, so it cannot overwrite an edit in progress.
  useEffect(() => {
    if (requestedNegotiation === undefined || requestedNegotiation.id === loadedNegotiationId) return
    setLoadedNegotiationId(requestedNegotiation.id)
    setDraft(draftFromNegotiation(requestedNegotiation))
  }, [loadedNegotiationId, requestedNegotiation])

  return (
    <NgHoloShell appLabel="Trades" meta={presentation.allowed ? 'Valid' : 'Needs changes'} region="trades-workspace" teamId={teamId} title="Trade center">
      <TradeNegotiations
        draft={draft}
        negotiationId={negotiationId}
        onFeedback={setFeedback}
        onLoadPackage={(negotiation) => {
          setLoadedNegotiationId(negotiation.id)
          setDraft(draftFromNegotiation(negotiation))
          setFeedback(`${world.teams[otherParticipantId(negotiation, teamId)]?.name ?? 'The other club'} package loaded into the editor.`)
        }}
        onRecordCommitmentEvent={(decisionId, kind, bodyId) => setFeedback(commandFeedback(recordCommitmentEvent(decisionId, kind, bodyId)))}
        onStartCommitment={(negotiation, revisionId) => setFeedback(commandFeedback(startCommitment(negotiation.id, revisionId)))}
        presentation={presentation}
        teamId={teamId}
        world={world}
      />
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
          disabled={draft.movements.length === 0}
          onClick={() => {
            setFeedback(presentation.allowed
              ? 'Configured trade checks pass. The package can be proposed, or used as the counter to an open negotiation.'
              : 'This package does not pass the current trade checks. Nothing was proposed or executed.')
          }}
          type="button"
        >
          Assess package
        </button>
        <button
          className="ng-canon__action"
          disabled={!canPropose}
          onClick={() => {
            const result = proposeNegotiation(presentation.proposal)
            setFeedback(commandFeedback(result))
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

type World = NonNullable<ReturnType<typeof useGameStore.getState>['world']>

const TERMINAL_NEGOTIATION_STATUSES: readonly TradeNegotiation['status'][] = ['AGREED', 'EXECUTED', 'REJECTED', 'WITHDRAWN']

/**
 * The canonical state of one participant's response to the negotiation's current revision. Every flag is derived
 * from the stored negotiation plus `tradeNegotiationResponseReadiness`, so the workspace never invents legality.
 */
interface NegotiationResponseState {
  readonly revision: TradeNegotiationRevision
  readonly terminal: boolean
  readonly awaitingUser: boolean
  readonly userResponded: boolean
  readonly userIsProposer: boolean
  readonly readiness: ReturnType<typeof tradeNegotiationResponseReadiness>
}

function currentRevision(negotiation: TradeNegotiation): TradeNegotiationRevision {
  return negotiation.revisions.find((item) => item.id === negotiation.currentRevisionId) ?? negotiation.revisions[negotiation.revisions.length - 1]!
}

function otherParticipantId(negotiation: TradeNegotiation, teamId: TeamId): TeamId {
  return negotiation.participantTeamIds.find((id) => id !== teamId) ?? teamId
}

function negotiationResponseState(world: World, negotiation: TradeNegotiation, teamId: TeamId): NegotiationResponseState {
  const revision = currentRevision(negotiation)
  const terminal = TERMINAL_NEGOTIATION_STATUSES.includes(negotiation.status)
  const userResponded = negotiation.actions.some(
    (action) => action.revisionId === revision.id && action.teamId === teamId && (action.kind === 'ACCEPT' || action.kind === 'REJECT'),
  )
  const userIsProposer = revision.proposedByTeamId === teamId
  const readiness = tradeNegotiationResponseReadiness(world, negotiation, teamId)
  return {
    revision,
    terminal,
    userResponded,
    userIsProposer,
    readiness,
    awaitingUser: !terminal && !userResponded && !userIsProposer && readiness.status === 'READY',
  }
}

/** Loads a negotiation's current package into the existing editor so a counter starts from what is on the table. */
function draftFromNegotiation(negotiation: TradeNegotiation): TradeDraft {
  const revision = currentRevision(negotiation)
  return { participantTeamIds: [...negotiation.participantTeamIds], movements: [...revision.movements] }
}

function tradeReasonText(reason: string): string {
  return humanizeTradeReason(reason as TradeValidationReason) ?? reason
}

/** Canonical command identity, with the shared presentation supplying prose only for the reasons it owns. */
function commandFeedback(result: { readonly status: string; readonly reasons?: readonly string[] }): string {
  const detail = (result.reasons ?? []).map(tradeReasonText).join(' · ')
  return detail === '' ? result.status : `${result.status} · ${detail}`
}

function sameParticipants(left: TradeDraft, right: TradeNegotiation): boolean {
  return left.participantTeamIds.length === right.participantTeamIds.length
    && left.participantTeamIds.every((teamId) => right.participantTeamIds.includes(teamId))
}

function appointedUserBodyIds(world: World, bodyIds: readonly string[]): readonly string[] {
  return bodyIds.filter((bodyId) => Object.values(world.governanceAppointmentsById).some((appointment) =>
    appointment.actor.kind === 'COACH'
    && appointment.actor.id === world.userCoachId
    && appointment.bodyId === bodyId
    && appointment.startedOn <= world.currentDate
    && (appointment.endedOn === undefined || appointment.endedOn >= world.currentDate)))
}

/**
 * MX0.5: the canonical trade-response surface. It lists every negotiation the user club participates in, opens the
 * one a breakpoint selected, and exposes only the actions `respondToTradeNegotiation`, `startUserTradeCommitment`
 * and `recordTradeCommitmentEvent` accept for the stored state. Acceptance is nonbinding and never moves assets;
 * an agreed package still has to pass each participant's commitment review before the engine executes it.
 */
function TradeNegotiations({
  world,
  teamId,
  negotiationId,
  draft,
  presentation,
  onLoadPackage,
  onStartCommitment,
  onRecordCommitmentEvent,
  onFeedback,
}: {
  readonly world: World
  readonly teamId: TeamId
  readonly negotiationId: string | null
  readonly draft: TradeDraft
  readonly presentation: TradePresentation
  readonly onLoadPackage: (negotiation: TradeNegotiation) => void
  readonly onStartCommitment: (negotiation: TradeNegotiation, revisionId: string) => void
  readonly onRecordCommitmentEvent: (decisionId: string, kind: 'APPROVED', bodyId: string) => void
  readonly onFeedback: (message: string) => void
}) {
  const respondToNegotiation = useGameStore((state) => state.respondUserToTradeNegotiation)
  const negotiations = useMemo(
    () =>
      Object.values(world.tradeNegotiationsById)
        .filter((item) => item.participantTeamIds.includes(teamId))
        .sort((left, right) =>
          negotiationSortRank(world, left, teamId) - negotiationSortRank(world, right, teamId)
          || right.startedOn.localeCompare(left.startedOn)
          || right.id.localeCompare(left.id)),
    [teamId, world],
  )

  if (negotiations.length === 0) {
    return (
      <section aria-label="Trade negotiations" className="ng-canon__panel ng-holo-panel">
        <p className="ng-canon__eyebrow">Trade negotiations</p>
        <p className="ng-canon__empty">No trade proposal involves your club yet.</p>
      </section>
    )
  }

  return (
    <section aria-label="Trade negotiations" className="ng-canon__panel ng-holo-panel">
      <p className="ng-canon__eyebrow">Trade negotiations</p>
      <div className="ng-canon__cards">
        {negotiations.map((negotiation) => {
          const state = negotiationResponseState(world, negotiation, teamId)
          const counterparty = world.teams[otherParticipantId(negotiation, teamId)]?.name ?? 'the other club'
          const canCounter = state.awaitingUser && sameParticipants(draft, negotiation) && presentation.allowed && draft.movements.length > 0
          return (
            <article
              className="ng-canon__card ng-holo-panel"
              data-negotiation-status={negotiation.status}
              data-requires-user-response={state.awaitingUser ? 'true' : 'false'}
              key={negotiation.id}
            >
              <p className="ng-canon__eyebrow">
                {negotiation.status} · Revision {state.revision.revisionNumber + 1}
                {negotiation.id === negotiationId ? ' · Opened from your trade response' : ''}
              </p>
              <h3 className="ng-canon__title">{counterparty}</h3>
              <p className="ng-canon__note">
                {world.teams[state.revision.proposedByTeamId]?.name ?? state.revision.proposedByTeamId} proposed this package on{' '}
                {state.revision.proposedOn}. Nonbinding: agreement does not move players or other assets.
              </p>
              {negotiation.id === negotiationId && !state.awaitingUser ? (
                <p className="ng-canon__note" role="status">This negotiation no longer requires your response.</p>
              ) : null}
              <div className="ng-canon__split">
                {negotiation.participantTeamIds.map((participantTeamId) => (
                  <div key={participantTeamId}>
                    <p className="ng-canon__eyebrow">{world.teams[participantTeamId]?.name ?? participantTeamId} receives</p>
                    {state.revision.movements.filter((movement) => movement.toTeamId === participantTeamId).length === 0 ? (
                      <p className="ng-canon__empty">Nothing.</p>
                    ) : (
                      <ul className="ng-canon__list">
                        {state.revision.movements
                          .filter((movement) => movement.toTeamId === participantTeamId)
                          .map((movement) => (
                            <li key={`${movement.fromTeamId}:${tradeAssetKey(movement.asset)}`}>
                              {tradeAssetLabel(world, movement.asset)}
                              <span className="ng-canon__note"> from {world.teams[movement.fromTeamId]?.name ?? movement.fromTeamId}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              <p className="ng-canon__note">{negotiationResponseSummary(world, negotiation, state, teamId)}</p>
              {state.readiness.reasons.length > 0 ? (
                <ul className="ng-canon__list">
                  {state.readiness.reasons.map((reason) => {
                    const prose = humanizeTradeReason(reason as TradeValidationReason)
                    return (
                      <li key={reason}>
                        {prose ?? reason}
                        {prose === undefined ? null : <span className="ng-canon__note"> {reason}</span>}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              <div className="ng-canon__actions">
                {state.awaitingUser ? (
                  <>
                    <button
                      className="ng-canon__action"
                      onClick={() => onFeedback(commandFeedback(respondToNegotiation({ negotiationId: negotiation.id, expectedRevisionId: negotiation.currentRevisionId, action: 'ACCEPT' })))}
                      type="button"
                    >
                      Accept
                    </button>
                    <button
                      className="ng-canon__action"
                      onClick={() => onFeedback(commandFeedback(respondToNegotiation({ negotiationId: negotiation.id, expectedRevisionId: negotiation.currentRevisionId, action: 'REJECT' })))}
                      type="button"
                    >
                      Reject
                    </button>
                    <button className="ng-canon__link" onClick={() => onLoadPackage(negotiation)} type="button">
                      Load package into editor
                    </button>
                    <button
                      className="ng-canon__action"
                      disabled={!canCounter}
                      onClick={() => onFeedback(commandFeedback(respondToNegotiation({ negotiationId: negotiation.id, expectedRevisionId: negotiation.currentRevisionId, action: 'COUNTER', counterPackage: presentation.proposal })))}
                      type="button"
                    >
                      Counter with this package
                    </button>
                  </>
                ) : null}
                {!state.terminal && state.userIsProposer ? (
                  <button
                    className="ng-canon__action"
                    onClick={() => onFeedback(commandFeedback(respondToNegotiation({ negotiationId: negotiation.id, expectedRevisionId: negotiation.currentRevisionId, action: 'WITHDRAW' })))}
                    type="button"
                  >
                    Withdraw
                  </button>
                ) : null}
              </div>
              {negotiation.status === 'AGREED' ? (
                <TradeCommitment
                  negotiation={negotiation}
                  onRecordCommitmentEvent={onRecordCommitmentEvent}
                  onStartCommitment={onStartCommitment}
                  revisionId={state.revision.id}
                  teamId={teamId}
                  world={world}
                />
              ) : null}
              {negotiation.status === 'EXECUTED' ? <p className="ng-canon__note">The agreed exchange is complete.</p> : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function negotiationSortRank(world: World, negotiation: TradeNegotiation, teamId: TeamId): number {
  if (negotiationResponseState(world, negotiation, teamId).awaitingUser) return 0
  return TERMINAL_NEGOTIATION_STATUSES.includes(negotiation.status) ? 2 : 1
}

/** Who owes the next decision, phrased from the stored negotiation rather than from a UI assumption. */
function negotiationResponseSummary(world: World, negotiation: TradeNegotiation, state: NegotiationResponseState, teamId: TeamId): string {
  if (state.terminal) {
    if (negotiation.status === 'AGREED') return 'All participants accepted this revision. Commitment reviews decide whether it executes.'
    if (negotiation.status === 'EXECUTED') return 'Executed through the canonical trade engine.'
    return `This negotiation is ${negotiation.status.toLowerCase()} and no further response is expected.`
  }
  if (state.awaitingUser) return 'Your response is required for this revision.'
  if (state.userIsProposer) {
    const waiting = negotiation.participantTeamIds.filter((id) => id !== teamId).map((id) => world.teams[id]?.name ?? id)
    return `Waiting for ${waiting.join(', ')} to respond to this revision.`
  }
  if (state.userResponded) return `Your ${negotiation.actions.some((action) => action.revisionId === state.revision.id && action.teamId === teamId && action.kind === 'ACCEPT') ? 'acceptance' : 'rejection'} is recorded for this revision.`
  return state.readiness.status === 'BLOCKED'
    ? 'This package cannot be answered while it fails the canonical trade checks.'
    : 'No defensible autonomous response policy exists for this club, so it stays pending.'
}

/**
 * Commitment review of an agreed package. The trade engine executes only after every participant's governance
 * decision is approved, so this is where an agreed exchange becomes a real one.
 */
function TradeCommitment({
  world,
  teamId,
  negotiation,
  revisionId,
  onStartCommitment,
  onRecordCommitmentEvent,
}: {
  readonly world: World
  readonly teamId: TeamId
  readonly negotiation: TradeNegotiation
  readonly revisionId: string
  readonly onStartCommitment: (negotiation: TradeNegotiation, revisionId: string) => void
  readonly onRecordCommitmentEvent: (decisionId: string, kind: 'APPROVED', bodyId: string) => void
}) {
  const readiness = assessTradeCommitmentReadiness(world, negotiation.id, revisionId)
  const participant = readiness.participants.find((item) => item.teamId === teamId)
  const decisionId = participant?.governanceDecisionId
  const decision = decisionId === undefined ? undefined : world.governanceDecisionsById[decisionId]
  const institution = Object.values(world.governanceInstitutionsById).find((item) => item.teamIds.includes(teamId))
  const rights = decision !== undefined || institution === undefined
    ? undefined
    : resolveGovernanceDecisionRights({
        bodies: Object.values(world.governanceBodiesById),
        authorityGrants: Object.values(world.governanceAuthorityGrantsById),
        participationGrants: Object.values(world.governanceDecisionParticipationGrantsById),
        decisionType: 'PLAYER_TRADE_COMMITMENT',
        institutionId: institution.id,
        asOfDate: world.currentDate,
      })
  const proposerBodies = appointedUserBodyIds(world, rights?.proposerBodyIds ?? [])
  const approverBodies = appointedUserBodyIds(world, participant?.requiredApprovals ?? [])
  const pendingApprovalBodies = approverBodies.filter((bodyId) => !(participant?.completedApprovals ?? []).includes(bodyId))

  return (
    <div className="ng-canon__panel ng-holo-panel">
      <p className="ng-canon__eyebrow">Commitment review</p>
      <p className="ng-canon__note">
        Status {participant?.status ?? readiness.status}. {participant?.blockers.join(', ') ?? readiness.blockers.join(', ')}
      </p>
      <div className="ng-canon__actions">
        {decision === undefined && proposerBodies.length > 0 ? (
          <button className="ng-canon__action" onClick={() => onStartCommitment(negotiation, revisionId)} type="button">
            Start this club's commitment review
          </button>
        ) : null}
        {decision !== undefined
          ? pendingApprovalBodies.map((bodyId) => (
              <button
                className="ng-canon__action"
                key={bodyId}
                onClick={() => onRecordCommitmentEvent(decision.id, 'APPROVED', bodyId)}
                type="button"
              >
                Approve for {world.governanceBodiesById[bodyId]?.name ?? bodyId}
              </button>
            ))
          : null}
      </div>
    </div>
  )
}
