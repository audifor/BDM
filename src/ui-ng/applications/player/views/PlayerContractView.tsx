import { useMemo } from 'react'

import { ContractAgreementSummary, ContractTermTimeline } from '@/ui-ng/applications/player/components/ContractTermTimeline'
import { ContractDetailInspector } from '@/ui-ng/applications/player/components/ContractDetailInspector'
import { ContractFinancialSchedule } from '@/ui-ng/applications/player/components/ContractFinancialSchedule'
import {
  ContractHistoryStrip,
  ContractRightsStrip,
} from '@/ui-ng/applications/player/components/ContractHistoryStrip'
import { ContractStatusBand } from '@/ui-ng/applications/player/components/ContractStatusBand'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { findContractInspectorDetail } from '@/ui-ng/applications/player/data/buildPlayerContractModel'

export function PlayerContractView() {
  const { model, session } = usePlayerWorkspace()
  const { selectedItemId, setSelectedItemId } = session.contract

  if (model === null) return null

  const contract = model.contract

  return (
    <div className="pc-root" data-ng-region="player-contract">
      <div className="pc-root__upper">
        <ContractStatusBand
          band={contract.statusBand}
          compensationContextNote={contract.compensationContextNote}
          emptyMessage={contract.emptyMessage}
        />
        <ContractAgreementSummary agreement={contract.agreement} />
        <ContractRightsStrip rights={contract.rights} />
      </div>

      {contract.viewStatus !== 'none' && (
        <div className="pc-root__main">
          <ContractTermTimeline
            nodes={contract.timeline}
            onSelectItem={setSelectedItemId}
            selectedItemId={selectedItemId}
          />
          <ContractFinancialSchedule
            onSelectRow={setSelectedItemId}
            rows={contract.financialSchedule}
            selectedItemId={selectedItemId}
          />
        </div>
      )}

      <ContractHistoryStrip entries={contract.history} />
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
