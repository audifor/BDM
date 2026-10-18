import { useEffect, useMemo, useState } from 'react'

import {
  GOVERNANCE_COMMAND_REASON_TEXT,
  buildClubGovernanceModel,
  governanceDecisionById,
  governanceRequestById,
  type ClubGovernanceModel,
  type ClubGovernanceRequestResponse,
  type GovernanceDecisionRow,
  type GovernanceRequestRow,
} from '@/app/governance'
import { getUserTeam } from '@/engine/calendar'
import { evaluateRenewalRecommendation, getBoardSummary } from '@/engine/board'
import { useGameStore } from '@/stores/gameStore'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { BoardCourtsideSections } from './BoardCourtsideSections'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import '@/ui-ng/applications/club/courtside-club-management.css'

const BOARD_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'mandate', label: 'Mandate' },
  { id: 'institution', label: 'Boardroom' },
  { id: 'requests', label: 'Requests' },
  { id: 'resources', label: 'Resources' },
  { id: 'governance', label: 'Governance' },
  { id: 'history', label: 'History' },
] as const
type BoardTabId = (typeof BOARD_TABS)[number]['id']

interface GovernanceNotice {
  readonly tone: 'APPLIED' | 'BLOCKED'
  readonly text: string
}

export function BoardWorkspace() {
  const world = useGameStore((state) => state.world)
  const recordGovernanceDecisionEvent = useGameStore((state) => state.recordGovernanceDecisionEvent)
  const executeGovernanceDecision = useGameStore((state) => state.executeGovernanceDecision)
  const respondGovernanceRequest = useGameStore((state) => state.respondGovernanceRequest)
  const navigation = useNgWorkspaceNavigation()
  const hasGovernanceContext = (navigation.decisionId ?? '') !== '' || (navigation.requestId ?? '') !== ''
  const [tab, setTab] = useState<BoardTabId>(hasGovernanceContext ? 'governance' : 'overview')
  const [notice, setNotice] = useState<GovernanceNotice | null>(null)

  // A governance breakpoint can resolve while this workspace is already open.
  useEffect(() => {
    if ((navigation.decisionId ?? '') !== '' || (navigation.requestId ?? '') !== '') setTab('governance')
  }, [navigation.decisionId, navigation.requestId])

  const team = world === null ? undefined : getUserTeam(world)
  const summary = world === null || team === undefined ? undefined : getBoardSummary(world, team.id)
  const governance = useMemo<ClubGovernanceModel | null>(
    () => (world === null || team === undefined ? null : buildClubGovernanceModel(world, team.id)),
    [world, team],
  )

  if (world === null) {
    return <NgHoloShell appLabel="Board" empty emptyMessage="No career loaded." className="cs-club-management cs-club-board" region="board-workspace" />
  }
  if (team === undefined || governance === null) {
    return <NgHoloShell appLabel="Board" empty emptyMessage="No team assigned to the user coach." className="cs-club-management cs-club-board" region="board-workspace" />
  }
  if (summary === undefined) {
    return <NgHoloShell appLabel="Board" empty emptyMessage="The board will initialize when this project starts." className="cs-club-management cs-club-board" region="board-workspace" teamId={team.id} />
  }

  const renewal = evaluateRenewalRecommendation(summary.state)
  const selectedDecision = governanceDecisionById(governance, navigation.decisionId ?? undefined)
  const selectedRequest = governanceRequestById(governance, navigation.requestId ?? undefined)
  const actionableDecisions = governance.pendingDecisions.filter((decision) => decision.userApproverBodyIds.length > 0 || decision.userExecutorBodyIds.length > 0)

  const recordEvent = (decisionId: string, kind: 'APPROVED' | 'REJECTED' | 'VETOED', bodyId: string) => {
    const result = recordGovernanceDecisionEvent(decisionId, kind, bodyId)
    if (result.status === 'APPLIED') {
      setNotice({ tone: 'APPLIED', text: `${kind} recorded · now ${result.decisionStatus ?? result.canonicalStatus ?? 'updated'}${result.canonicalStatus === null ? '' : ` (${result.canonicalStatus})`}.` })
      return
    }
    setNotice({ tone: 'BLOCKED', text: [...result.reasons.map((reason) => GOVERNANCE_COMMAND_REASON_TEXT[reason]), ...result.canonicalReasons].join(' ') })
  }

  const executeDecision = (decisionId: string, executorBodyId: string) => {
    const result = executeGovernanceDecision(decisionId, executorBodyId)
    if (result.status === 'APPLIED') {
      setNotice({ tone: 'APPLIED', text: `Decision executed (${result.canonicalStatus ?? 'EXECUTED'}).` })
      return
    }
    setNotice({ tone: 'BLOCKED', text: [...result.reasons.map((reason) => GOVERNANCE_COMMAND_REASON_TEXT[reason]), ...result.canonicalReasons].join(' ') })
  }

  const respondRequest = (requestId: string, kind: ClubGovernanceRequestResponse) => {
    const result = respondGovernanceRequest(requestId, kind)
    setNotice(result.status === 'APPLIED'
      ? { tone: 'APPLIED', text: `Request ${kind.toLowerCase()} · recorded in Governance history.` }
      : { tone: 'BLOCKED', text: `Request response refused: ${result.reasons.join(', ')}` })
  }

  return (
    <NgHoloShell
      activeTabId={tab}
      appLabel="Board"
      meta={
        <>
          {summary.jobSecurity}
          {' · '}
          <span className="ng-type-numeric">{governance.pendingDecisions.length}</span> pending
          {' · '}
          <span className="ng-type-numeric">{actionableDecisions.length}</span> awaiting you
        </>
      }
      onTabSelect={(id) => setTab(id as BoardTabId)}
      region="board-workspace"
      className="cs-club-management cs-club-board"
      tabs={BOARD_TABS}
      teamId={team.id}
      title={team.name}
    >
      {notice === null ? null : (
        <p className={notice.tone === 'APPLIED' ? 'ng-canon__note' : 'ng-canon__badge'} data-ng-region="board-governance-notice">
          {notice.text}
        </p>
      )}

      {tab !== 'governance' && tab !== 'history' ? (
        <BoardCourtsideSections
          tab={tab as 'overview' | 'mandate' | 'institution' | 'requests' | 'resources'}
          world={world}
          teamId={team.id}
          state={summary.state}
          governance={governance}
          jobSecurity={summary.jobSecurity}
          renewal={renewal}
          onSelectTab={setTab}
        />
      ) : null}

      {tab === 'governance' ? (
        <GovernancePanel
          governance={governance}
          onRespond={respondRequest}
          onExecute={executeDecision}
          onRecordEvent={recordEvent}
          selectedDecisionId={selectedDecision?.decisionId}
          selectedRequestId={selectedRequest?.requestId}
        />
      ) : null}

      {tab === 'history' ? (
        <div className="cs-board-v3">
          <section className="cs-board-v3__panel" data-ng-region="board-confidence-history">
            <h2>Confianza: historial de cambios</h2>
            {summary.state.reasons.length === 0 ? <p className="cs-board-v3__empty">No hay cambios documentados en la confianza.</p> : (
              <div className="cs-board-v3__table-wrap"><table className="cs-board-v3__table">
                <thead><tr><th>Fecha</th><th>Motivo</th><th>Impacto</th></tr></thead>
                <tbody>{[...summary.state.reasons].reverse().map((reason) =>
                  <tr key={reason.id}><td>{reason.date}</td><td>{reason.detail}</td><td>{reason.delta > 0 ? '+' : ''}{reason.delta}</td></tr>
                )}</tbody>
              </table></div>
            )}
          </section>
          <div className="ng-canon__panel ng-holo-panel" data-ng-region="board-governance-history">
          <p className="ng-canon__eyebrow">Governance history</p>
          {governance.history.length === 0 ? (
            <p className="ng-canon__empty">No governance decision or request has been recorded yet.</p>
          ) : (
            <NgPrecisionTable
              className="ng-canon__table"
              columns={ngTableColumns(governance.history.map((row) => ({ ...row, id: row.historyId })), [
                ngCol('date', 'Date', (row) => row.effectiveOn, { value: (row) => row.effectiveOn }),
                ngCol('source', 'Source', (row) => row.source, { value: (row) => row.source }),
                ngCol('kind', 'Event', (row) => row.kind, { value: (row) => row.kind }),
                ngCol('subject', 'Matter', (row) => row.subjectLabel, { value: (row) => row.subjectLabel }),
                ngCol('actor', 'Actor', (row) => row.actorLabel, { value: (row) => row.actorLabel }),
              ])}
              gridId="ng-board-governance-history"
              rows={governance.history.map((row) => ({ ...row, id: row.historyId }))}
            />
          )}
        </div>
        </div>
      ) : null}
    </NgHoloShell>
  )
}

function GovernancePanel({
  governance,
  onRespond,
  onRecordEvent,
  onExecute,
  selectedDecisionId,
  selectedRequestId,
}: {
  readonly governance: ClubGovernanceModel
  readonly onRespond: (requestId: string, kind: ClubGovernanceRequestResponse) => void
  readonly onRecordEvent: (decisionId: string, kind: 'APPROVED' | 'REJECTED' | 'VETOED', bodyId: string) => void
  readonly onExecute: (decisionId: string, executorBodyId: string) => void
  readonly selectedDecisionId: string | undefined
  readonly selectedRequestId: string | undefined
}) {
  return (
    <div className="cs-board__governance-layout">
      <div className="ng-canon__panel ng-holo-panel" data-ng-region="board-governance-queue">
        <p className="ng-canon__eyebrow">Pending matters</p>
        {governance.decisions.length === 0 ? (
          <p className="ng-canon__empty" data-ng-region="board-governance-empty">
            No canonical Governance decision is recorded for this club.
          </p>
        ) : (
          governance.decisions.map((decision) => (
            <DecisionCard
              decision={decision}
              governance={governance}
              key={decision.decisionId}
              onExecute={onExecute}
              onRecordEvent={onRecordEvent}
              selected={decision.decisionId === selectedDecisionId}
            />
          ))
        )}
      </div>

      <div className="ng-canon__panel ng-holo-panel" data-ng-region="board-governance-requests">
        <p className="ng-canon__eyebrow">Requests</p>
        {governance.requests.length === 0 ? (
          <p className="ng-canon__empty">No governance request is recorded for this club.</p>
        ) : (
          <ul className="ng-canon__list">
            {governance.requests.map((request) => (
              <RequestRow key={request.requestId} request={request} selected={request.requestId === selectedRequestId} onRespond={onRespond} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function DecisionCard({
  decision,
  governance,
  onRecordEvent,
  onExecute,
  selected,
}: {
  readonly decision: GovernanceDecisionRow
  readonly governance: ClubGovernanceModel
  readonly onRecordEvent: (decisionId: string, kind: 'APPROVED' | 'REJECTED' | 'VETOED', bodyId: string) => void
  readonly onExecute: (decisionId: string, executorBodyId: string) => void
  readonly selected: boolean
}) {
  const bodyName = (bodyId: string) => governance.bodies.find((body) => body.bodyId === bodyId)?.name ?? bodyId
  const approved = new Set(decision.approvedBodyIds)
  const approvedCount = decision.approverBodyIds.filter((bodyId) => approved.has(bodyId)).length
  // The canonical execution command refuses a decision that still lacks a required approval, so the
  // action is offered only once this matter's own approvals are recorded.
  const approvedNow = decision.missingApproverBodyIds.length === 0 && (decision.approverBodyIds.length === 0 || decision.status === 'APPROVED')
  return (
    <article className="ng-canon__card" data-ng-region="board-governance-decision" data-selected={selected ? 'true' : undefined}>
      <p className="ng-canon__eyebrow">
        {decision.decisionType} · {decision.status ?? 'NOT_STARTED'} · proposed {decision.proposedOn}
      </p>
      <h4 className="ng-canon__title">{decision.subjectLabel}</h4>
      <p className="ng-canon__note">
        Proposer: {decision.proposerBodyIds.map(bodyName).join(' · ') || 'unmapped'} · Approvals: {approvedCount}/{decision.approverBodyIds.length} (
        {decision.approverBodyIds.map((bodyId) => `${bodyName(bodyId)}${approved.has(bodyId) ? ' ✓' : ''}`).join(' · ') || 'none required'})
        {decision.vetoBodyIds.length === 0 ? '' : ` · Veto: ${decision.vetoBodyIds.map(bodyName).join(' · ')}`}
        {decision.executorBodyIds.length === 0 ? '' : ` · Executor: ${decision.executorBodyIds.map(bodyName).join(' · ')}`}
      </p>
      {decision.missingApproverBodyIds.length === 0 ? null : (
        <p className="ng-canon__note">
          Awaiting: {decision.missingApproverBodyIds.map((bodyId) => (decision.userApproverBodyIds.includes(bodyId) ? `${bodyName(bodyId)} (you)` : bodyName(bodyId))).join(' · ')}
        </p>
      )}
      {decision.userApproverBodyIds.length === 0 && decision.userExecutorBodyIds.length === 0 ? (
        <p className="ng-canon__note">This matter is decided by another actor; the user coach holds no pending role in it.</p>
      ) : null}
      <div className="ng-canon__actions">
        {decision.eventCommandAvailable ? decision.userApproverBodyIds.map((bodyId) => (
          <span key={bodyId}>
            <button className="ng-canon__action" onClick={() => onRecordEvent(decision.decisionId, 'APPROVED', bodyId)} type="button">
              Approve as {bodyName(bodyId)}
            </button>
            <button className="ng-canon__action" onClick={() => onRecordEvent(decision.decisionId, 'REJECTED', bodyId)} type="button">
              Reject as {bodyName(bodyId)}
            </button>
          </span>
        )) : null}
        {decision.userExecutorBodyIds.map((bodyId) => approvedNow ? (
          <button className="ng-canon__action" key={`execute:${bodyId}`} onClick={() => onExecute(decision.decisionId, bodyId)} type="button">
            Execute as {bodyName(bodyId)}
          </button>
        ) : null)}
      </div>
      {decision.userExecutorBodyIds.length > 0 && !approvedNow ? (
        <p className="ng-canon__note" data-ng-region="board-governance-execution-locked">
          Execution by {decision.userExecutorBodyIds.map(bodyName).join(' · ')} unlocks when the required approvals above are recorded.
        </p>
      ) : null}
      {!decision.eventCommandAvailable && decision.userApproverBodyIds.length > 0 ? (
        <p className="ng-canon__note" data-ng-region="board-governance-approval-not-actionable">
          Recording an approval for this decision type is not yet a club action.
        </p>
      ) : null}
      {decision.events.length === 0 ? null : <p className="ng-canon__note">{decision.events.map((event) => `${event.effectiveOn} ${event.kind} · ${event.bodyName}`).join(' · ')}</p>}
    </article>
  )
}

function RequestRow({ request, selected, onRespond }: {
  readonly request: GovernanceRequestRow
  readonly selected: boolean
  readonly onRespond: (requestId: string, kind: ClubGovernanceRequestResponse) => void
}) {
  return (
    <li data-ng-region="board-governance-request" data-selected={selected ? 'true' : undefined}>
      {request.category} · {request.summary} · {request.status ?? 'NOT_ISSUED'}
      {request.dueOn === null ? '' : ` · due ${request.dueOn}${request.overdue ? ' (overdue)' : ''}`}
      {` · from ${request.issuerLabel} to ${request.recipientLabel}`}
      {request.addressedToUser ? ' · addressed to you' : ''}
      {request.responseCommandAvailable ? (
        <div className="ng-canon__actions">
          {request.status === 'ISSUED' ? (
            <button className="ng-canon__action" type="button" onClick={() => onRespond(request.requestId, 'ACKNOWLEDGED')}>Acknowledge request</button>
          ) : null}
          <button className="ng-canon__action" type="button" onClick={() => onRespond(request.requestId, 'ACCEPTED')}>Accept request</button>
          <button className="ng-canon__action" type="button" onClick={() => onRespond(request.requestId, 'DECLINED')}>Decline request</button>
        </div>
      ) : request.addressedToUser && request.status === 'ACCEPTED'
        ? ' · accepted; fulfillment requires canonical evidence'
        : !request.addressedToUser ? ' · read-only: not addressed to your coach' : ''}
    </li>
  )
}
