import { useMemo } from 'react'

import type { GameId, SeasonId } from '@/domain/ids'
import { useGameStore } from '@/stores/gameStore'

import {
  PerformanceEfficiencyPanel,
  PerformanceFiltersBar,
  PerformanceGameInspectorPanel,
  PerformanceGameLogPanel,
  PerformanceKpiStrip,
  PerformanceRecentFormChart,
  PerformanceShotProfilePanel,
  PerformanceSplitsPanel,
} from '@/ui-ng/applications/player/components/PerformanceBoardPanels'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import {
  buildPerformanceFilterBar,
  findGameLogRow,
  selectPerformanceSnapshot,
  type PerformanceCompetitionFilter,
  type PerformanceFilterModel,
  type PerformancePhaseFilter,
  type PerformanceSplitFilter,
} from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

export function PlayerPerformanceView() {
  const { model, playerId, session } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const {
    selectedGameId,
    setSelectedGameId,
    seasonId,
    setSeasonId,
    competitionFilter,
    setCompetitionFilter,
    phaseFilter,
    setPhaseFilter,
    splitFilter,
    setSplitFilter,
  } = session.performance

  const effectiveSeasonId = seasonId ?? model?.performance.seasonId ?? null

  const snapshot = useMemo(() => {
    if (model === null || world === null || playerId === null || effectiveSeasonId === null) return null
    return selectPerformanceSnapshot(model.performance, world, playerId, {
      seasonId: effectiveSeasonId,
      competition: competitionFilter,
      phase: phaseFilter,
      split: splitFilter,
    })
  }, [competitionFilter, effectiveSeasonId, model, phaseFilter, playerId, splitFilter, world])

  const filters = useMemo(() => {
    if (world === null || playerId === null || effectiveSeasonId === null) return []
    return buildPerformanceFilterBar(world, playerId, effectiveSeasonId, {
      competition: competitionFilter,
      phase: phaseFilter,
      split: splitFilter,
    })
  }, [competitionFilter, effectiveSeasonId, phaseFilter, playerId, splitFilter, world])

  if (model === null || snapshot === null || effectiveSeasonId === null) return null

  const onFilterChange = (id: PerformanceFilterModel['id'], value: string): void => {
    switch (id) {
      case 'season':
        setSeasonId(value as SeasonId)
        return
      case 'competition':
        setCompetitionFilter(value as PerformanceCompetitionFilter)
        return
      case 'phase':
        setPhaseFilter(value as PerformancePhaseFilter)
        return
      case 'split':
        setSplitFilter(value as PerformanceSplitFilter)
        return
    }
  }

  const onSelectGame = (gameId: GameId): void => setSelectedGameId(gameId)
  const activeGameId = findGameLogRow(snapshot, selectedGameId)?.gameId ?? null

  return (
    <div className="po-pf-board" data-ng-region="player-performance">
      <PerformanceFiltersBar
        filters={filters}
        onChange={onFilterChange}
        values={{
          season: effectiveSeasonId,
          competition: competitionFilter,
          phase: phaseFilter,
          split: splitFilter,
        }}
      />

      <PerformanceKpiStrip cells={snapshot.kpiStrip} />

      <div className="po-pf-band--upper">
        <PerformanceEfficiencyPanel metrics={snapshot.efficiencyMetrics} />
        <PerformanceShotProfilePanel profile={snapshot.shotProfile} />
        <PerformanceSplitsPanel note={snapshot.splitsNote} rows={snapshot.splits} />
      </div>

      <PerformanceRecentFormChart
        games={snapshot.recentForm}
        onSelectGame={onSelectGame}
        selectedGameId={activeGameId}
      />

      <PerformanceGameLogPanel
        onSelectGame={onSelectGame}
        rows={snapshot.gameLogs}
        selectedGameId={activeGameId}
      />

      <PerformanceGameInspectorPanel
        onSelectGame={onSelectGame}
        rows={snapshot.gameLogs}
        selectedGameId={activeGameId}
      />
    </div>
  )
}
