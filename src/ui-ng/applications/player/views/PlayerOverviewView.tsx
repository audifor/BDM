import {
  OverviewAlerts,
  OverviewContractMedicalPulse,
  OverviewDevelopmentPulse,
  OverviewIdentityModule,
  OverviewObservations,
  OverviewRecentForm,
  OverviewSeasonSnapshot,
  OverviewTimeline,
} from '@/ui-ng/applications/player/components/OverviewModules'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'

/**
 * PLAYER · OVERVIEW — three fixed rows read as one screen:
 * identity/snapshot/form, intelligence/pulses, then alerts and timeline.
 */
export function PlayerOverviewView() {
  const { model, session } = usePlayerWorkspace()
  if (model === null) return null

  const { overview } = model

  return (
    <div className="po-overview" data-ng-region="player-overview">
      <div className="po-ov-row po-ov-row--identity">
        <OverviewIdentityModule overview={overview} />
        <OverviewSeasonSnapshot overview={overview} />
        <OverviewRecentForm overview={overview} />
      </div>
      <div className="po-ov-row po-ov-row--intel">
        <OverviewObservations overview={overview} />
        <OverviewDevelopmentPulse overview={overview} />
        <OverviewContractMedicalPulse
          onOpenPage={(view) => session.setActiveView(view)}
          overview={overview}
          readiness={model.medical.readiness}
        />
      </div>
      <div className="po-ov-row po-ov-row--actions">
        <OverviewAlerts onOpenPage={(view) => session.setActiveView(view)} overview={overview} />
        <OverviewTimeline onOpenPage={(view) => session.setActiveView(view)} overview={overview} />
      </div>
    </div>
  )
}
