import { useMemo } from 'react'

import {
  MedicalActiveInjuryDossier,
  MedicalNoInjuryNotice,
} from '@/ui-ng/applications/player/components/MedicalActiveInjuryDossier'
import { MedicalAvailabilityBand } from '@/ui-ng/applications/player/components/MedicalAvailabilityBand'
import { MedicalDetailInspector } from '@/ui-ng/applications/player/components/MedicalDetailInspector'
import { MedicalFatigueInstrument } from '@/ui-ng/applications/player/components/MedicalFatigueInstrument'
import { MedicalHistoryList } from '@/ui-ng/applications/player/components/MedicalHistoryList'
import { MedicalRecoveryTimeline } from '@/ui-ng/applications/player/components/MedicalRecoveryTimeline'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { findMedicalInspectorDetail } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'

export function PlayerMedicalView() {
  const { model, session } = usePlayerWorkspace()
  const { selectedEventId, setSelectedEventId } = session.medical

  if (model === null) return null

  const medical = model.medical
  const injured = medical.activeInjury !== null

  return (
    <div
      className={`pm-root${injured ? ' pm-root--injured' : ''}`}
      data-ng-region="player-medical"
    >
      <MedicalAvailabilityBand band={medical.availabilityBand} />

      <div className="pm-root__upper">
        <MedicalFatigueInstrument
          fatigue={medical.fatigue}
          risk={medical.risk}
          riskUnavailableLabel={medical.riskUnavailableLabel}
        />
        <div aria-hidden className="pm-root__upper-spacer" />
      </div>

      <div className="pm-root__injury-slot">
        {injured && medical.activeInjury !== null ? (
          <MedicalActiveInjuryDossier injury={medical.activeInjury} />
        ) : (
          <MedicalNoInjuryNotice />
        )}
      </div>

      <div className="pm-root__main">
        <MedicalRecoveryTimeline nodes={medical.recoveryTimeline} />
        <MedicalHistoryList
          emptyMessage={medical.historyEmptyMessage}
          onSelectRow={setSelectedEventId}
          rows={medical.history}
          selectedEventId={selectedEventId}
        />
      </div>
    </div>
  )
}

export function MedicalInspectorContent() {
  const { model, session } = usePlayerWorkspace()
  const { selectedEventId } = session.medical

  const detail = useMemo(() => {
    if (model === null) return undefined
    return findMedicalInspectorDetail(model.medical, selectedEventId)
  }, [model, selectedEventId])

  return <MedicalDetailInspector detail={detail} />
}
