import { useMemo, useState } from 'react'

import type { MedicalBodyRegionId } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import { MedicalBodyMap } from '@/ui-ng/applications/player/components/MedicalBodyMap'
import { MedicalDetailInspector } from '@/ui-ng/applications/player/components/MedicalDetailInspector'
import {
  CurrentInjuryPanel,
  InjuryPatternPanel,
  LoadManagementPanel,
  MedicalDetailPanel,
  MedicalFilterStrip,
  MedicalHistoryPanel,
  PhysicalReadinessPanel,
  RecoveryTimelinePanel,
  StaffNotesPanel,
} from '@/ui-ng/applications/player/components/MedicalBoardPanels'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { findMedicalInspectorDetail } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'

/**
 * PLAYER · MEDICAL — the reference's three columns: readiness, injury and load on the left; the body
 * map with the recovery timeline in the centre; the medical detail and its blocks on the right; and
 * the department filter strip along the bottom.
 *
 * Everything is read from the recorded injuries, the workload windows and the availability state.
 * The two blocks the save cannot fill (staff notes, treatment) state their gap instead of guessing.
 */
export function PlayerMedicalView() {
  const { model, session } = usePlayerWorkspace()
  const { selectedEventId, setSelectedEventId } = session.medical
  const [selectedRegionId, setSelectedRegionId] = useState<MedicalBodyRegionId | null>(null)
  const medical = model?.medical
  const staffNoteGaps = useMemo(
    () => model?.medical.gaps.filter((gap) => gap.id === 'staff-notes') ?? [],
    [model?.medical.gaps],
  )

  if (model === null || medical === undefined) return null

  const selectedRegion =
    selectedRegionId === null
      ? undefined
      : medical.bodyRegions.find((region) => region.id === selectedRegionId)

  return (
    <div className="po-med-board" data-ng-region="player-medical">
      <div className="po-med-col po-med-col--left">
        <PhysicalReadinessPanel meters={medical.readiness} />
        <CurrentInjuryPanel band={medical.availabilityBand} />
        <LoadManagementPanel note={medical.loadNote} windows={medical.loadWindows} />
      </div>

      <div className="po-med-col po-med-col--center">
        <section className="po-med-panel po-med-bodymap-panel">
          <header className="po-med-panel__head">
            <span className="po-med-panel__title">Body map</span>
            <span className="po-med-panel__meta">
              Click on a body region for detailed information
            </span>
            <span
              className={`po-med-bodymap-panel__health is-${
                medical.bodyRegions.some((region) => region.status === 'attention')
                  ? 'attention'
                  : 'healthy'
              }`}
            >
              {medical.bodyRegions.some((region) => region.status === 'attention')
                ? '● Issues recorded'
                : '● All systems healthy'}
            </span>
          </header>
          <MedicalBodyMap
            onSelectRegion={setSelectedRegionId}
            regions={medical.bodyRegions}
            selectedRegionId={selectedRegionId}
          />
        </section>

        <RecoveryTimelinePanel milestones={medical.recoveryMilestones} />
      </div>

      <div className="po-med-col po-med-col--right">
        <MedicalDetailPanel
          detail={medical.detail}
          regionDetail={selectedRegion?.detail ?? null}
          regionLabel={selectedRegion?.label ?? null}
        />

        <div className="po-med-split po-med-split--history">
          <MedicalHistoryPanel
            emptyMessage={medical.historyEmptyMessage}
            onSelectRow={(id) => setSelectedEventId(id as never)}
            rows={medical.history}
            selectedEventId={selectedEventId}
          />

          <div className="po-med-stack">
            <InjuryPatternPanel pattern={medical.injuryPattern} />
            <StaffNotesPanel gaps={staffNoteGaps} />
          </div>
        </div>
      </div>

      <MedicalFilterStrip
        alerts={model.overview.alerts}
        onOpenPage={(view) => session.setActiveView(view)}
      />
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
