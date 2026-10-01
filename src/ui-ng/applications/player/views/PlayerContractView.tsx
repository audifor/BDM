import { useMemo } from 'react'

import { ContractTermTimeline } from '@/ui-ng/applications/player/components/ContractTermTimeline'
import {
  ContractClosingPanels,
  ContractFinancialSnapshotPanel,
  ContractIntelligencePanel,
  ContractSummaryPanel,
} from '@/ui-ng/applications/player/components/ContractPanels'
import { ContractDetailInspector } from '@/ui-ng/applications/player/components/ContractDetailInspector'
import { ContractFinancialSchedule } from '@/ui-ng/applications/player/components/ContractFinancialSchedule'
import {
  ContractHistoryStrip,
  ContractRightsStrip,
} from '@/ui-ng/applications/player/components/ContractHistoryStrip'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { findContractInspectorDetail } from '@/ui-ng/applications/player/data/buildPlayerContractModel'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { navigateToContracts } from '@/ui-ng/workspace/workspaceApps'

export function PlayerContractView() {
  const { model, session } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const { selectedItemId, setSelectedItemId } = session.contract

  if (model === null) return null

  const contract = model.contract
  const playerNegotiations = world === null ? [] : Object.values(world.retentionNegotiationsById)
    .filter((item) => item.playerId === model.identity.playerId)
    .sort((a, b) => b.openedOn.localeCompare(a.openedOn) || b.id.localeCompare(a.id))
  const latestNegotiation = playerNegotiations[0]
  const signedSuccessor = contract.agreement === null || world === null ? undefined : Object.values(world.contractsById).find((item) => item.predecessorContractId === contract.agreement!.contractId)
  const latestRelease = world === null ? undefined : Object.values(world.playerTransactionsById)
    .filter((item) => item.playerId === model.identity.playerId && item.kind === 'released')
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))[0]
  const playerRolePromise = world === null ? undefined : Object.values(world.rolePromisesById)
    .find((item) => item.playerId === model.identity.playerId && item.status === 'ACTIVE')

  return (
    <div className="pc-root" data-ng-region="player-contract">
      <section className="pc-root__row" aria-label="Player contract status">
        {latestRelease !== undefined && <span>Released {latestRelease.occurredOn}</span>}
        {signedSuccessor !== undefined && <span>Successor signed · starts {signedSuccessor.term.startsOn}</span>}
        {playerRolePromise !== undefined && <span>Role promise · {playerRolePromise.role}</span>}
        {latestNegotiation !== undefined && <span>{latestNegotiation.execution?.status === 'SIGNED' ? 'Signed' : latestNegotiation.status === 'ACCEPTED' ? 'Accepted in principle' : ['REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(latestNegotiation.status) ? 'Negotiation closed' : 'Negotiating'}</span>}
      </section>
      {/* Row 1 — summary | financial snapshot | intelligence, as in the reference. */}
      <div className="pc-root__row pc-root__row--summary">
        <ContractSummaryPanel
          band={contract.statusBand}
          compensationNote={contract.compensationContextNote}
          emptyMessage={contract.emptyMessage}
        />        <div className="pc-root__snapshot-stack">
          <ContractFinancialSnapshotPanel snapshot={contract.snapshot} />
          <ContractTermTimeline
            nodes={contract.timeline}
            onSelectItem={setSelectedItemId}
            selectedItemId={selectedItemId}
          />
        </div>
        <ContractIntelligencePanel intelligence={contract.intelligence} />
      </div>

      {contract.viewStatus !== 'none' && (
        <div className="pc-root__row pc-root__row--schedule">
          <ContractFinancialSchedule
            onSelectRow={setSelectedItemId}
            rows={contract.financialSchedule}
            selectedItemId={selectedItemId}
          />
        </div>
      )}

      <ContractClosingPanels gaps={contract.gaps} />

      <div className="pc-root__row pc-root__row--closing">
        <ContractRightsStrip rights={contract.rights} />
        <ContractHistoryStrip entries={contract.history} />
      </div>
      {world !== null && getUserTeam(world)?.rosterPlayerIds.includes(model.identity.playerId) && (
        <button type="button" onClick={() => navigateToContracts(getUserTeam(world)?.id, model.identity.playerId)}>
          Open Contracts / Planning
        </button>
      )}
    </div>
  )
}

export function ContractInspectorContent() {
  const { model, session } = usePlayerWorkspace()
  const { selectedItemId } = session.contract

  const detail = useMemo(() => {
    if (model === null) return undefined
    return findContractInspectorDetail(model.contract, selectedItemId)
  }, [model, selectedItemId])

  return <ContractDetailInspector detail={detail} />
}
