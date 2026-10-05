import { useMemo, useState } from 'react'

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
import { ratingCategory, ratingLabel } from '@/ui-ng/applications/player/data/ratingCatalog'
import { useGameStore } from '@/stores/gameStore'

export function PlayerDevelopmentView() {
  const { model, session } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const { selectedItemId, setSelectedItemId } = session.development

  if (model === null) return null

  const development = model.development
  if (model.knowledgeAccess.kind !== 'own-roster') {
    return (
      <div className="po-dev-board" data-ng-region="player-development">
        <section className="po-dev-panel" data-ng-region="development-scouting-boundary">
          <header className="po-dev-panel__head"><span className="po-dev-panel__title">Individual development</span></header>
          <p className="po-dev-stat__note">Individual rating values and development history are unavailable for external players until rating-level scouting exists.</p>
        </section>
        <ScoutingProjectionPanel projection={development.projection} />
      </div>
    )
  }
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
      {world !== null && <PlayerHistoryPanels world={world} playerId={model.identity.playerId} />}
    </div>
  )
}

function PlayerHistoryPanels({ world, playerId }: { readonly world: NonNullable<ReturnType<typeof useGameStore.getState>['world']>; readonly playerId: import('@/domain/ids').PlayerId }) {
  const [stimulusVisibleCount, setStimulusVisibleCount] = useState(40)
  const training = Object.values(world.scheduledTrainingSessionsById)
    .flatMap((session) => {
      const result = session.execution?.participants.find((participant) => participant.playerId === playerId)
      return result === undefined ? [] : [{ session, result }]
    })
    .sort((a, b) => b.session.date.localeCompare(a.session.date))
  const ratingHistory = world.playerRatingHistoryByPlayerId[playerId] ?? []
  const stimulusEvents = Object.values(world.developmentStimulusEventsById).filter((event) => event.playerId === playerId).sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div className="po-dev-band po-dev-band--last">
      <section className="po-dev-panel" data-ng-region="player-training-history">
        <header className="po-dev-panel__head"><span className="po-dev-panel__title">Training history</span><span className="po-dev-panel__meta">{training.length}</span></header>
        {training.length === 0 ? <p className="po-dev-stat__note">No completed Training history is recorded.</p> : (
          <ul className="po-dev-gaps">{training.slice(0, 12).map(({ session, result }) => {
            const execution = session.execution!
            const staff = execution.executingStaffPersonIds.map((id) => {
              const person = world.staffPeopleById[id]
              return person === undefined ? String(id) : `${person.identity.firstName} ${person.identity.lastName}`
            }).join(', ') || 'No assigned executor'
            const event = result.developmentStimulusEventId === undefined ? undefined : world.developmentStimulusEventsById[result.developmentStimulusEventId]
            const stimulus = event === undefined ? '0.00' : Object.values(event.byRating).reduce<number>((sum, amount) => sum + (amount ?? 0), 0).toFixed(2)
            const injuryLabels = result.injuryIds.map((id) => `${world.injuriesById[id]?.kind ?? 'Injury'} (${id})`)
            return <li key={session.id}><span>{session.date} · {execution.moduleName} · {result.participation}</span><span className="po-dev-stat__note">Staff: {staff} · fatigue {result.careerFatigueDelta >= 0 ? '+' : ''}{result.careerFatigueDelta.toFixed(1)} · stimulus {stimulus} · injuries {injuryLabels.join(', ') || 'none'}</span></li>
          })}</ul>
        )}
        <p className="po-dev-stat__note">Training supplied stimulus to the development cycle; individual sessions do not directly change ratings.</p>
      </section>
      <section className="po-dev-panel" data-ng-region="player-rating-truth-history">
        <header className="po-dev-panel__head"><span className="po-dev-panel__title">80-rating annual history</span><span className="po-dev-panel__meta">Changed ratings</span></header>
        {ratingHistory.length === 0 ? <p className="po-dev-stat__note">Canonical annual history will be recorded at the next development checkpoint.</p> : ratingHistory.slice().reverse().map((season) => {
          const changes = Object.entries(season.truthDeltas ?? {}) as [import('@/domain/player').PlayerTruthRatingKey, { before: number; after: number; delta: number }][]
          return <details key={season.cycleId ?? String(season.seasonId)}><summary>{season.checkpointDate ?? String(season.seasonId)} · {changes.length} rating changes</summary>
            <p className="po-dev-stat__note">Age {season.age ?? '—'} · age trend {season.baseTrend ?? '—'} · potential factor {season.potentialGrowthFactor?.toFixed(2) ?? '—'}. Training stimulus was one input; changes are not attributed to individual sessions.</p>
            <ul className="po-dev-gaps">{changes.sort(([a], [b]) => ratingCategory(a).localeCompare(ratingCategory(b)) || a.localeCompare(b)).map(([key, change]) => <li key={key}><span>{ratingCategory(key)} · {ratingLabel(key)}</span><span>{change.before} → {change.after} ({change.delta > 0 ? '+' : ''}{change.delta})</span></li>)}</ul>
          </details>
        })}
        {stimulusEvents.length > 0 && <details><summary>Stimulus source history · {stimulusEvents.length} records</summary><ul className="po-dev-gaps">{stimulusEvents.slice(0, stimulusVisibleCount).map((event) => <li key={event.id}><span>{event.date} · {event.sourceType === 'match' ? 'Match' : 'Training'} · {event.sourceId}</span><span>{Object.entries(event.byRating).map(([key, amount]) => `${key.replace(/([A-Z])/g, ' $1')} +${amount!.toFixed(2)}`).join(', ')}</span></li>)}</ul>{stimulusEvents.length > stimulusVisibleCount && <button type="button" onClick={() => setStimulusVisibleCount((count) => count + 40)}>Show older stimulus sources</button>}</details>}
      </section>
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
