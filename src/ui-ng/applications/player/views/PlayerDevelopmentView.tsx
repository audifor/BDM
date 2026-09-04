import { useMemo } from 'react'

import { DevelopmentContextBand } from '@/ui-ng/applications/player/components/DevelopmentContextBand'
import { DevelopmentDetailInspector } from '@/ui-ng/applications/player/components/DevelopmentDetailInspector'
import { DevelopmentLongitudinalNotice } from '@/ui-ng/applications/player/components/DevelopmentLongitudinalNotice'
import { DevelopmentScoutPotential } from '@/ui-ng/applications/player/components/DevelopmentScoutPotential'
import { DevelopmentSeasonStimulus } from '@/ui-ng/applications/player/components/DevelopmentSeasonStimulus'
import { DevelopmentTrainingContext } from '@/ui-ng/applications/player/components/DevelopmentTrainingContext'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { findDevelopmentInspectorDetail } from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'

export function PlayerDevelopmentView() {
  const { model, session } = usePlayerWorkspace()
  const { selectedItemId, setSelectedItemId } = session.development

  if (model === null) return null

  const development = model.development

  return (
    <div className="pd-root" data-ng-region="player-development">
      <DevelopmentContextBand band={development.contextBand} />

      <div className="pd-root__upper">
        <DevelopmentSeasonStimulus
          model={development.seasonStimulus}
          onSelectItem={setSelectedItemId}
          selectedItemId={selectedItemId}
        />
        <DevelopmentTrainingContext model={development.trainingContext} />
      </div>

      <div className="pd-root__main">
        <DevelopmentScoutPotential
          model={development.scoutPotential}
          onSelectItem={setSelectedItemId}
          selectedItemId={selectedItemId}
        />
        <DevelopmentLongitudinalNotice model={development.longitudinal} />
      </div>
    </div>
  )
}

export function DevelopmentInspectorContent() {
  const { model, session } = usePlayerWorkspace()
  const { selectedItemId } = session.development

  const detail = useMemo(() => {
    if (model === null) return undefined
    return findDevelopmentInspectorDetail(model.development, selectedItemId)
  }, [model, selectedItemId])

  return <DevelopmentDetailInspector detail={detail} />
}
