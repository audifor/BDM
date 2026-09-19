import { useMemo } from 'react'

import {
  CareerCurvePanel,
  CategoryDevelopmentPanel,
  DevelopmentDetailPanel,
  DevelopmentDriversPanel,
  DevelopmentEventsPanel,
  DevelopmentOverviewPanel,
  DevelopmentStagePanel,
  RatingMoversPanel,
  ScoutingProjectionPanel,
  TrainingEffectPanel,
  TrainingPlanPanel,
} from '@/ui-ng/applications/player/components/DevelopmentBoardPanels'
import { DevelopmentDetailInspector } from '@/ui-ng/applications/player/components/DevelopmentDetailInspector'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import {
  findDevelopmentInspectorDetail,
  type PlayerDevelopmentModel,
} from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'
import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'

export function PlayerDevelopmentView() {
  const { model, session } = usePlayerWorkspace()
  const { selectedItemId, setSelectedItemId } = session.development

  if (model === null) return null

  const development = model.development
  const selectedCategory = selectedCategoryOf(development, selectedItemId)

  return (
    <div className="po-dev-board" data-ng-region="player-development">
      <div className="po-dev-band po-dev-band--overview">
        <DevelopmentOverviewPanel insight={development.insight} overview={development.overview} />
      </div>

      <div className="po-dev-band po-dev-band--curve">
        <CareerCurvePanel
          markers={development.markers}
          seasons={seasonLabelsOf(development)}
          series={development.categoryCurve}
        />
        <DevelopmentStagePanel lifecycle={development.lifecycle} />
        <DevelopmentDetailPanel
          detail={development.detailByCategory[selectedCategory ?? 'shooting']}
          onClose={() => setSelectedItemId(null)}
          selectedCategoryLabel={selectedCategory === null ? null : development.lifecycle.focusLabel}
        />
      </div>

      <div className="po-dev-band po-dev-band--middle">
        <div className="po-dev-band__stack">
          <CategoryDevelopmentPanel
            onSelectCategory={setSelectedItemId}
            rows={development.categoryDevelopment}
            selectedCategory={selectedCategory}
          />
          <RatingMoversPanel note={development.longitudinal.note} rows={development.longitudinal.movers} />
          <TrainingPlanPanel plan={development.trainingPlan} />
          <TrainingEffectPanel effect={development.trainingEffect} />
        </div>
        <DevelopmentGapPanel gaps={development.gaps} />
      </div>

      <div className="po-dev-band po-dev-band--last">
        <DevelopmentDriversPanel rows={development.drivers} />
        <DevelopmentEventsPanel events={development.longitudinal.events} />
        <ScoutingProjectionPanel projection={development.projection} />
      </div>
    </div>
  )
}

/** The gaps this page still cannot produce, kept visible instead of filled with invented copy. */
function DevelopmentGapPanel({ gaps }: { readonly gaps: PlayerDevelopmentModel['gaps'] }) {
  return (
    <section className="po-dev-panel" data-ng-region="development-declared-gaps">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Not in the save</span>
        <span className="po-dev-panel__meta ng-type-numeric">{gaps.length}</span>
      </header>
      <ul className="po-dev-gaps">
        {gaps.map((gap) => (
          <li key={gap.id}>
            <span className="po-dev-gaps__label">{gap.label}</span>
            <span className="po-dev-stat__note">{gap.reason}</span>
          </li>
        ))}
      </ul>
    </section>
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

function seasonLabelsOf(development: PlayerDevelopmentModel): readonly string[] {
  const columns = Math.max(0, ...development.categoryCurve.map((entry) => entry.points.length))
  const events = development.longitudinal.events
  return Array.from({ length: columns }, (_value, index) =>
    index === columns - 1 ? 'Current' : events[index]?.dateLabel ?? `S${index + 1}`,
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
