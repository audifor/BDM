import { useMemo, useState } from 'react'

import { ScoutingProjectionPanel } from '@/ui-ng/applications/player/components/DevelopmentBoardPanels'
import { PlayerDevelopmentRecords } from '@/ui-ng/applications/player/components/PlayerDevelopmentRecords'
import {
  DevelopmentHeroVisual,
  DevelopmentFamilyVisual,
  DevelopmentCurveVisual,
  DevelopmentDetailVisual,
  DevelopmentTrainingVisual,
  DevelopmentStimulusVisual,
  DevelopmentTimelineVisual,
} from '@/ui-ng/applications/player/components/PlayerDevelopmentVisuals'
import { DevelopmentDetailInspector } from '@/ui-ng/applications/player/components/DevelopmentDetailInspector'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import {
  findDevelopmentInspectorDetail,
  type PlayerDevelopmentModel,
} from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'
import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'
import { useGameStore } from '@/stores/gameStore'

export function PlayerDevelopmentView() {
  const { model, session } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const { selectedItemId, setSelectedItemId } = session.development
  const [activePane, setActivePane] = useState<'dashboard' | 'records'>('dashboard')

  if (model === null) return null

  const development = model.development
  if (model.knowledgeAccess.kind !== 'own-roster') {
    return (
      <div className="po-dev-board po-dev-board--courtside po-dev-board--scouted"
        data-ng-region="player-development" data-knowledge="external">
        <div className="po-dev-cs__fow">
          <div className="po-dev-cs__fow-heading">
            <span>SCOUTED DEVELOPMENT</span>
            <strong>Knowledge from your organisation</strong>
            <p>Private player ratings, recorded development history, training plans and internal potential ceilings are not available to rival clubs. The information below contains only authorized scouting estimates.</p>
          </div>
          <ScoutingProjectionPanel projection={development.projection} />
          <section className="po-dev-panel po-dev-cs__knowledge" data-ng-region="development-scouting-boundary">
            <header className="po-dev-panel__head">
              <span className="po-dev-panel__title">SCOUTED POTENTIAL</span>
              <span className="po-dev-panel__meta">{development.scoutPotential.status === 'available' ? 'Observed evaluations' : 'Awaiting scout report'}</span>
            </header>
            {development.scoutPotential.status === 'unavailable'
              ? <p className="po-dev-stat__note">No authorized potential evaluation is available yet. Request scouting to learn more about this player.</p>
              : <ul className="po-dev-cs__potential">
                {development.scoutPotential.rows.filter((row) => row.evaluationLabel !== '?').map((row) =>
                  <li key={row.id}><span>{row.domainLabel}</span><strong>{row.evaluationLabel}</strong></li>)}
              </ul>}
            <p className="po-dev-stat__note">{development.scoutPotential.contextNote}</p>
          </section>
        </div>
      </div>
    )
  }

  const selectedCategory = selectedCategoryOf(development, selectedItemId)

  return (
    <div className="po-dev-board po-dev-board--courtside" data-ng-region="player-development"
      data-knowledge="own" data-mode={activePane}>
      {activePane === 'dashboard' && <div className="po-dev-cs__overview">
        <DevelopmentHeroVisual data={development} />
      </div>}
      <div className="po-dev-cs__navigation">
        <div className="po-dev-cs__heading">
          <strong>{activePane === 'dashboard' ? 'DEVELOPMENT DASHBOARD' : 'DEVELOPMENT RECORDS'}</strong>

        </div>
        <div className="po-dev-cs__tabs" role="group" aria-label="Development display">
          <button type="button" aria-pressed={activePane === 'dashboard'}
            onClick={() => setActivePane('dashboard')}>OVERVIEW</button>
          <button type="button" aria-pressed={activePane === 'records'}
            onClick={() => setActivePane('records')}>RECORDS</button>
        </div>
      </div>
      {activePane === 'dashboard'
        ? <div className="po-dev-cs__main po-dev-cs__main--v2" data-ng-region="development-dashboard">
          <div className="po-dev-v2__top">
            <DevelopmentFamilyVisual data={development}
              selected={selectedCategory ?? 'shooting'} onSelect={setSelectedItemId} />
            <DevelopmentCurveVisual data={development}
              selected={selectedCategory ?? 'shooting'} onSelect={setSelectedItemId} />
            <DevelopmentDetailVisual data={development} selected={selectedCategory ?? 'shooting'} />
          </div>
          <div className="po-dev-v2__bottom">
            <DevelopmentTrainingVisual data={development} />
            <DevelopmentStimulusVisual data={development} />
            <DevelopmentTimelineVisual data={development} />
          </div>
        </div>
        : <PlayerDevelopmentRecords world={world} playerId={model.identity.playerId} development={development} />}

    </div>
  )
}

/** The category a selection points at, whichever stimulus id the session happens to hold. */
function selectedCategoryOf(
  development: PlayerDevelopmentModel,
  selectedItemId: string | null,
): RatingCategory | null {
  if (selectedItemId === null) return null
  const direct = development.categoryCurve.find((entry) => entry.id === selectedItemId)
  if (direct !== undefined) return direct.id
  const stimulus = development.seasonStimulus.categories.find((entry) => entry.id === selectedItemId)
  return stimulus?.id ?? null
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
