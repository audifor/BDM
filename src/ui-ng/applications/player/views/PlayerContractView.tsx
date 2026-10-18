import {
  ContractFinancialSnapshotPanel,
  ContractIntelligencePanel,
  ContractClosingPanels,
} from '@/ui-ng/applications/player/components/ContractPanels'
import { ContractTermTimeline } from '@/ui-ng/applications/player/components/ContractTermTimeline'
import { ContractFinancialSchedule } from '@/ui-ng/applications/player/components/ContractFinancialSchedule'
import { ContractHistoryStrip, ContractRightsStrip } from '@/ui-ng/applications/player/components/ContractHistoryStrip'
import { PlayerContractOpportunities } from '@/ui-ng/applications/player/components/PlayerContractOpportunities'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { navigateToContracts } from '@/ui-ng/workspace/workspaceApps'

/** Contract gameplay screen, with mutually exclusive own-club and rival FOW boundaries. */
export function PlayerContractView() {
  const { model, session } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const { selectedItemId, setSelectedItemId } = session.contract
  if (model === null) return null

  if (model.knowledgeAccess.kind !== 'own-roster') {
    return <PlayerContractOpportunities
      world={world}
      playerId={model.identity.playerId}
      playerName={`${model.identity.firstName} ${model.identity.lastName}`}
      onScouting={() => session.setActiveView('scouting')}
    />
  }

  const contract = model.contract
  const userTeam = world === null ? undefined : getUserTeam(world)
  const mayManage = userTeam?.rosterPlayerIds.includes(model.identity.playerId) ?? false
  const manage = () => {
    if (userTeam !== undefined && mayManage) navigateToContracts(userTeam.id, model.identity.playerId)
  }
  const playerNegotiations = !mayManage || world === null ? [] :
    Object.values(world.retentionNegotiationsById)
      .filter((item) => item.playerId === model.identity.playerId && item.teamId === userTeam?.id)
      .sort((a, b) => b.openedOn.localeCompare(a.openedOn) || b.id.localeCompare(a.id))
  const latestNegotiation = playerNegotiations[0]
  const signedSuccessor = contract.agreement === null || world === null ? undefined :
    Object.values(world.contractsById).find((item) => item.predecessorContractId === contract.agreement!.contractId)
  const latestRelease = world === null ? undefined : Object.values(world.playerTransactionsById)
    .filter((item) => item.playerId === model.identity.playerId && item.kind === 'released')
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))[0]
  const playerRolePromise = !mayManage || world === null ? undefined :
    Object.values(world.rolePromisesById).find((item) => item.playerId === model.identity.playerId &&
      item.teamOrganizationId === userTeam?.organizationId && item.status === 'ACTIVE')

  const status = contract.statusBand
  const negotiationLabel = latestNegotiation === undefined ? null
    : latestNegotiation.execution?.status === 'SIGNED' ? 'SIGNED'
    : latestNegotiation.status === 'ACCEPTED' ? 'ACCEPTED IN PRINCIPLE'
    : ['REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(latestNegotiation.status) ? 'CLOSED'
    : latestNegotiation.status.replaceAll('_', ' ')

  if (contract.viewStatus === 'none') {
    return <section className="pc-root pc-root--no-agreement pc-root--v31" data-ng-region="player-contract"
      aria-label="No recorded agreement">
      <div className="pc-no-agreement pc-no-agreement--v31">
        <div className="pc-no-agreement__hero">
          <span>CONTRACT EVIDENCE</span>
          <div className="pc-no-agreement__main">
            <span className="pc-no-agreement__document" aria-hidden="true"><i /><i /><i /></span>
            <div>
              <strong>NO CONTRACT DATA ON FILE</strong>
              <small>Roster membership is recorded. No current or scheduled employment agreement is stored for this player.</small>
            </div>
          </div>
          <div className="pc-no-agreement__evidence" role="group" aria-label="Contract evidence coverage">
            <span><b>✓</b> ROSTER CONFIRMED</span>
            <span>— TERMS UNAVAILABLE</span>
            <span>— SALARY UNAVAILABLE</span>
          </div>
        </div>
        <div className="pc-no-agreement__actions">
          <span>MANAGER DECISION</span>
          <strong>REVIEW CONTRACT STATUS</strong>
          <p>Check Contracts / Planning for an existing agreement or available contract actions. Missing values are never estimated.</p>
          {mayManage && <button type="button" onClick={manage}>MANAGE CONTRACT ↗</button>}
        </div>
      </div>
      {contract.rights.items.length > 0 && <div className="pc-no-agreement__registration" data-ng-region="player-contract-registration">
        <strong>REGISTRATION</strong>
        {contract.rights.items.map((entry, index) =>
          <span key={index}><b>{entry.label}</b>{entry.value}</span>)}
      </div>}
      {contract.gaps.length > 0 && <details className="pc-root__data-boundaries">
        <summary>OTHER DATA NOT RECORDED <span>{contract.gaps.length} areas</span></summary>
        <ContractClosingPanels gaps={contract.gaps} />
      </details>}
    </section>
  }

  return <div className="pc-root pc-root--agreement" data-ng-region="player-contract">
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
      {mayManage && <button className="pc-contract-hero__manage" type="button" onClick={manage}>
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

    <div className="pc-root__row pc-root__row--schedule">
      <ContractFinancialSchedule
        rows={contract.financialSchedule}
        onSelectRow={setSelectedItemId}
        selectedItemId={selectedItemId}
      />
    </div>

    {(contract.rights.items.length > 0 || contract.history.length > 0 ||
      latestRelease !== undefined || signedSuccessor !== undefined || playerRolePromise !== undefined) &&
      <div className="pc-root__row pc-root__row--closing">
        {contract.rights.items.length > 0 && <ContractRightsStrip rights={contract.rights} />}
        {contract.history.length > 0 && <ContractHistoryStrip entries={contract.history} />}
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
