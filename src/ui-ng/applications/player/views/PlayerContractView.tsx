import { useMemo } from 'react'

import {
  ContractFinancialSnapshotPanel,
  ContractIntelligencePanel,
  ContractClosingPanels,
} from '@/ui-ng/applications/player/components/ContractPanels'
import { ContractTermTimeline } from '@/ui-ng/applications/player/components/ContractTermTimeline'
import { ContractFinancialSchedule } from '@/ui-ng/applications/player/components/ContractFinancialSchedule'
import { ContractHistoryStrip, ContractRightsStrip } from '@/ui-ng/applications/player/components/ContractHistoryStrip'
import { ContractDetailInspector } from '@/ui-ng/applications/player/components/ContractDetailInspector'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { findContractInspectorDetail } from '@/ui-ng/applications/player/data/buildPlayerContractModel'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { navigateToContracts } from '@/ui-ng/workspace/workspaceApps'

function ContractKnowledgeBoundary({ onScouting }: { readonly onScouting: () => void }) {
  return <section className="pc-root pc-root--restricted" data-ng-region="player-contract-knowledge">
    <div className="pc-restricted">
      <span className="pc-restricted__eyebrow">CONTRACT KNOWLEDGE</span>
      <strong>CONTRACT TERMS NOT VERIFIED</strong>
      <p>Salary, guarantees, negotiation terms and internal role commitments are private.
        No authorized club-specific contract report is available here.</p>
      <button type="button" onClick={onScouting}>OPEN SCOUTING REPORT ›</button>
    </div>
  </section>
}

/** CONTRACT is a management workspace, not a duplicate of the private contract backend. */
export function PlayerContractView() {
  const { model, session } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const { selectedItemId, setSelectedItemId } = session.contract
  if (model === null) return null

  // Important: do not read or render World Truth contract/negotiation data
  // for external players. PLAYER FOW permits only authorized public sources.
  if (model.knowledgeAccess.kind !== 'own-roster') {
    return <ContractKnowledgeBoundary onScouting={() => session.setActiveView('scouting')} />
  }

  const contract = model.contract
  const userTeam = world === null ? undefined : getUserTeam(world)
  const mayManage = userTeam?.rosterPlayerIds.includes(model.identity.playerId) ?? false
  const playerNegotiations = !mayManage || world === null ? [] :
    Object.values(world.retentionNegotiationsById)
      .filter((item) => item.playerId === model.identity.playerId && item.teamId === userTeam?.id)
      .sort((a, b) => b.openedOn.localeCompare(a.openedOn) || b.id.localeCompare(a.id))
  const latestNegotiation = playerNegotiations[0]
  const signedSuccessor = contract.agreement === null || world === null ? undefined :
    Object.values(world.contractsById)
      .find((item) => item.predecessorContractId === contract.agreement!.contractId)
  const latestRelease = world === null ? undefined : Object.values(world.playerTransactionsById)
    .filter((item) => item.playerId === model.identity.playerId && item.kind === 'released')
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))[0]
  const playerRolePromise = !mayManage || world === null ? undefined :
    Object.values(world.rolePromisesById)
      .find((item) => item.playerId === model.identity.playerId &&
        item.teamOrganizationId === userTeam?.organizationId && item.status === 'ACTIVE')

  const status = contract.statusBand
  const negotiationLabel = latestNegotiation === undefined ? null
    : latestNegotiation.execution?.status === 'SIGNED' ? 'SIGNED'
    : latestNegotiation.status === 'ACCEPTED' ? 'ACCEPTED IN PRINCIPLE'
    : ['REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(latestNegotiation.status) ? 'CLOSED'
    : latestNegotiation.status.replaceAll('_', ' ')

  return <div className="pc-root" data-ng-region="player-contract">
    <section className="pc-contract-hero" aria-label="Player contract status">
      <div className="pc-contract-hero__identity">
        <span className="pc-contract-hero__eyebrow">CURRENT AGREEMENT</span>
        <strong>{status?.teamName ?? 'No recorded club'}</strong>
        <div className="pc-contract-hero__status">
          <span className={`pc-contract-hero__pill is-${status?.statusTone ?? 'none'}`}>{status?.statusLabel ?? 'Unknown'}</span>
          <span>{status?.contractType ?? '—'}</span>
        </div>
      </div>
      <div className="pc-contract-hero__milestone">
        <span className="pc-contract-hero__eyebrow">NEXT KEY DATE</span>
        <strong>{contract.intelligence.nextKeyDateLabel}</strong>
        <small>{status?.seasonsRemaining ?? contract.intelligence.nextKeyDateNote}</small>
      </div>
      <div className="pc-contract-hero__decision">
        <span className="pc-contract-hero__eyebrow">EXPIRY OUTLOOK</span>
        <strong className={`is-${contract.intelligence.expiryRiskTone}`}>{contract.intelligence.expiryRiskLabel}</strong>
        {negotiationLabel !== null && <small>Retention: {negotiationLabel}</small>}
        {negotiationLabel === null && <small>{contract.intelligence.decisionLabel === 'Yes' ? 'Review due' : 'No immediate action'}</small>}
      </div>
      {mayManage && <button className="pc-contract-hero__manage" type="button"
        onClick={() => navigateToContracts(userTeam!.id, model.identity.playerId)}>
        MANAGE CONTRACT <span aria-hidden="true">↗</span>
      </button>}
    </section>

    <div className="pc-root__row pc-root__row--overview">
      <ContractFinancialSnapshotPanel snapshot={contract.snapshot} />
      <ContractTermTimeline
        nodes={contract.timeline}
        onSelectItem={setSelectedItemId}
        selectedItemId={selectedItemId}
      />
      <ContractIntelligencePanel intelligence={contract.intelligence} />
    </div>

    {contract.viewStatus !== 'none' && <div className="pc-root__row pc-root__row--schedule">
      <ContractFinancialSchedule
        rows={contract.financialSchedule}
        onSelectRow={setSelectedItemId}
        selectedItemId={selectedItemId}
      />
    </div>}

    {(contract.rights.items.length > 0 || contract.history.length > 0 ||
      latestRelease !== undefined || signedSuccessor !== undefined || playerRolePromise !== undefined) &&
      <div className="pc-root__row pc-root__row--closing">
        <ContractRightsStrip rights={contract.rights} />
        <ContractHistoryStrip entries={contract.history} />
        {(latestRelease !== undefined || signedSuccessor !== undefined || playerRolePromise !== undefined) &&
          <section className="pc-contract-activity">
            <header className="pc-panel-head"><span className="pc-panel-head__title">Contract activity</span></header>
            {latestRelease !== undefined && <span>Released · {latestRelease.occurredOn}</span>}
            {signedSuccessor !== undefined && <span>Successor signed · starts {signedSuccessor.term.startsOn}</span>}
            {playerRolePromise !== undefined && <span>Active role promise · {playerRolePromise.role}</span>}
          </section>}
      </div>}

    {contract.gaps.length > 0 && <details className="pc-root__data-boundaries">
      <summary>DATA NOT RECORDED <span>{contract.gaps.length} areas</span></summary>
      <ContractClosingPanels gaps={contract.gaps} />
    </details>}
  </div>
}

export function ContractInspectorContent() {
  const { model, session } = usePlayerWorkspace()
  const { selectedItemId } = session.contract
  const detail = useMemo(() => {
    if (model === null || model.knowledgeAccess.kind !== 'own-roster') return undefined
    return findContractInspectorDetail(model.contract, selectedItemId)
  }, [model, selectedItemId])

  if (model?.knowledgeAccess.kind !== 'own-roster') {
    return <div className="pc-inspector pc-inspector--empty" data-ng-region="contract-inspector">
      <p className="pc-inspector__hint">Private contract details are not available for external players.</p>
    </div>
  }
  return <ContractDetailInspector detail={detail} />
}
