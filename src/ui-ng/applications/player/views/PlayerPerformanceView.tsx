import { useMemo } from 'react'

import type { GameId } from '@/domain/ids'
import { useGameStore } from '@/stores/gameStore'

import { GameDetailInspector } from '@/ui-ng/applications/player/components/GameDetailInspector'
import { PerformanceGameLog } from '@/ui-ng/applications/player/components/PerformanceGameLog'
import { PerformanceRecentForm } from '@/ui-ng/applications/player/components/PerformanceRecentForm'
import { PerformanceSeasonSummary } from '@/ui-ng/applications/player/components/PerformanceSeasonSummary'
import { PerformanceShootingPanel } from '@/ui-ng/applications/player/components/PerformanceShootingPanel'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import {
  findGameLogRow,
  selectPerformanceSnapshot,
  type PerformanceCompetitionFilter,
} from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

export function PlayerPerformanceView() {
  const { model, playerId, session } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)

  const { selectedGameId, setSelectedGameId, competitionFilter, setCompetitionFilter } =
    session.performance

  const snapshot = useMemo(() => {
    if (model === null || world === null || playerId === null) return null
    return selectPerformanceSnapshot(model.performance, world, playerId, competitionFilter)
  }, [competitionFilter, model, playerId, world])

  if (model === null || snapshot === null) return null

  const showCompetitionFilter = snapshot.competitionOptions.length > 1

  return (
    <div className="pp-root" data-ng-region="player-performance">
      <div className="pp-root__upper">
        <PerformanceSeasonSummary snapshot={snapshot} />

        {showCompetitionFilter && (
          <div className="pp-competition-filter">
            <label className="pp-competition-filter__label" htmlFor="pp-competition-select">
              Competition
            </label>
            <select
              className="pp-competition-filter__select ng-btn"
              id="pp-competition-select"
              onChange={(event) =>
                setCompetitionFilter(event.target.value as PerformanceCompetitionFilter)
              }
              value={competitionFilter}
            >
              {snapshot.competitionOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {snapshot.status === 'available' && (
          <div className="pp-root__lanes">
            <section className="pp-production-lane" data-ng-region="performance-production">
              <header className="pp-panel-head">
                <span className="pp-panel-head__title">Production</span>
                <span className="pp-panel-head__meta">Per game</span>
              </header>
              <div className="pp-production-lane__grid">
                {snapshot.productionPrimary.map((cell) => (
                  <div className="pp-production-lane__cell" key={cell.label}>
                    <span className="pp-stat-label pp-stat-label--primary">{cell.label}</span>
                    <span className="pp-stat-value pp-stat-value--primary ng-type-numeric">
                      {cell.value}
                    </span>
                  </div>
                ))}
                {snapshot.productionSecondary.map((cell) => (
                  <div
                    className="pp-production-lane__cell pp-production-lane__cell--secondary"
                    key={cell.label}
                  >
                    <span className="pp-stat-label pp-stat-label--secondary">{cell.label}</span>
                    <span className="pp-stat-value pp-stat-value--secondary ng-type-numeric">
                      {cell.value}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <PerformanceShootingPanel snapshot={snapshot} />

            <PerformanceRecentForm
              onSelectGame={(gameId: GameId) => setSelectedGameId(gameId)}
              selectedGameId={selectedGameId}
              snapshot={snapshot}
            />
          </div>
        )}
      </div>

      <div className="pp-root__lower">
        <PerformanceGameLog
          emptyMessage="No game log entries for this season."
          onSelectGame={(gameId) => setSelectedGameId(gameId)}
          rows={snapshot.gameLogs}
          selectedGameId={selectedGameId}
        />
      </div>
    </div>
  )
}

/** Used by PlayerWorkspace shell for the inspector pane. */
export function PerformanceGameInspectorContent() {
  const { model, playerId, session } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const { selectedGameId, competitionFilter } = session.performance

  const snapshot = useMemo(() => {
    if (model === null || world === null || playerId === null) return null
    return selectPerformanceSnapshot(model.performance, world, playerId, competitionFilter)
  }, [competitionFilter, model, playerId, world])

  const selectedRow = useMemo(
    () => (snapshot === null ? undefined : findGameLogRow(snapshot, selectedGameId)),
    [selectedGameId, snapshot],
  )

  return <GameDetailInspector row={selectedRow} />
}
