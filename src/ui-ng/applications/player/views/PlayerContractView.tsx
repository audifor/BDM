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

export function PlayerContractView() {
  const { model, session } = usePlayerWorkspace()
  const { selectedItemId, setSelectedItemId } = session.contract

  if (model === null) return null

  const contract = model.contract

  return (
    <div className="pc-root" data-ng-region="player-contract">
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
