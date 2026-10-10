import { useMemo, useState } from 'react'

import type { GameId, SeasonId } from '@/domain/ids'
import { useGameStore } from '@/stores/gameStore'

import {
  PerformanceEfficiencyPanel,
  PerformanceFiltersBar,
  PerformanceGameInspectorPanel,
  PerformanceKpiStrip,
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
  type PerformanceRecentGame,
  type PlayerGameLogRow,
} from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

type AnalysisTab = 'efficiency' | 'shot' | 'splits'
type FormMetric = 'points' | 'rebounds' | 'assists' | 'valuation'
const FORM_METRICS: readonly { readonly id: FormMetric; readonly label: string }[] = [
  { id: 'points', label: 'PTS' }, { id: 'rebounds', label: 'REB' },
  { id: 'assists', label: 'AST' }, { id: 'valuation', label: 'VAL' },
]

/**
 * Compact single-series form chart. One visible metric at a time avoids
 * overlapping multiple bars and lines; the public recorded log remains the
 * only data source for both own roster and opponents.
 */
export function PerformanceCourtsideForm({
  games, selectedGameId, onSelectGame,
}: {
  readonly games: readonly PerformanceRecentGame[]
  readonly selectedGameId: GameId | null
  readonly onSelectGame: (id: GameId) => void
}) {
  const [metric, setMetric] = useState<FormMetric>('points')
  const chronological = [...games].reverse().slice(-8)
  const peak = Math.max(1, ...chronological.map((game) => Math.max(0, game[metric])))
  return <section className="po-pf-panel po-pf-form po-pf-form--courtside"
    data-ng-region="performance-recent-form">
    <header className="po-pf-panel__head">
      <div className="po-pf-headline"><span className="po-pf-panel__title">RECENT FORM</span>
        <small>Last {chronological.length} recorded games</small></div>
      <div className="po-pf-form-metrics" role="group" aria-label="Recent form statistic">
        {FORM_METRICS.map((item) =>
          <button key={item.id} type="button" aria-pressed={item.id === metric}
            onClick={() => setMetric(item.id)}>{item.label}</button>)}
      </div>
    </header>
    {chronological.length === 0 ? <p className="po-pf-empty">No recorded appearances in this context.</p>
      : <div className="po-pf-simple-form" aria-label="Last games by selected statistic">
        {chronological.map((game) => {
          const value = game[metric]
          return <button key={game.gameId} type="button"
            className={'po-pf-simple-form__item' + (selectedGameId === game.gameId ? ' is-selected' : '')}
            aria-pressed={selectedGameId === game.gameId}
            aria-label={game.date + ' vs ' + game.opponent + ': ' + value + ' ' + metric}
            onClick={() => onSelectGame(game.gameId)}>
            <span className="po-pf-simple-form__value">{value}</span>
            <span className="po-pf-simple-form__track">
              <i style={{height:Math.max(value > 0 ? 5 : 1,Math.min(100,Math.round((Math.max(0,value)/peak)*100))) + '%'}} />
            </span>
            <span className="po-pf-simple-form__opp">vs {game.opponent}</span>
            <span className="po-pf-simple-form__date">{game.date}</span>
          </button>
        })}
      </div>}
  </section>
}

/**
 * A readable eight-column game log. The inspector carries the remaining
 * box-score fields, avoiding cramped horizontal scrolling of 16+ columns.
 */
export function PerformanceCourtsideGameLog({
  rows, selectedGameId, onSelectGame,
}: {
  readonly rows: readonly PlayerGameLogRow[]
  readonly selectedGameId: GameId | null
  readonly onSelectGame: (id: GameId) => void
}) {
  return <section className="po-pf-panel po-pf-log po-pf-log--courtside" data-ng-region="performance-game-log">
    <header className="po-pf-panel__head"><span className="po-pf-panel__title">GAME LOG</span>
      <span className="po-pf-panel__meta">{rows.length} recorded games · select to inspect</span>
    </header>
    {rows.length === 0 ? <p className="po-pf-empty">No game matches this context.</p>
      : <div className="po-pf-log__scroll">
        <table className="po-pf-courtside-table">
          <thead><tr><th>DATE</th><th>OPPONENT</th><th>RESULT</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>VAL</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.gameId}
            className={row.gameId === selectedGameId ? 'is-selected' : ''}>
            <td>{row.dateLabel}</td>
            <td><button type="button" aria-pressed={row.gameId === selectedGameId}
              title={row.competition + ' · ' + (row.homeAway === 'H' ? 'Home' : 'Away')}
              onClick={() => onSelectGame(row.gameId)}>{row.opponent}</button></td>
            <td><span className={'po-pf-result is-' + (row.outcome === 'W' ? 'win' : row.outcome === 'L' ? 'loss' : 'tie')}>{row.result}</span></td>
            <td>{row.minutes}</td><td>{row.points}</td><td>{row.rebounds}</td><td>{row.assists}</td><td>{row.valuation}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>
}

export function PlayerPerformanceView() {
  const { model, playerId, session } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>('efficiency')
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
  const activeGameId = findGameLogRow(snapshot, selectedGameId)?.gameId ?? snapshot.gameLogs[0]?.gameId ?? null
  const own = model.knowledgeAccess.kind === 'own-roster'

  return (
    <div className="po-pf-board po-pf-board--courtside" data-ng-region="player-performance"
      data-knowledge={own ? 'own' : 'opponent'}>
      <div className="po-pf-context">
        <div className="po-pf-context__source">
          <strong>{own ? 'SEASON PERFORMANCE' : 'RECORDED PERFORMANCE'}</strong>
          <span>{own ? 'Official match statistics' : 'Opponent · recorded box scores only'}</span>
        </div>
        <PerformanceFiltersBar filters={filters} onChange={onFilterChange}
          values={{season:effectiveSeasonId,competition:competitionFilter,phase:phaseFilter,split:splitFilter}} />
      </div>
      {snapshot.kpiStrip.length > 0
        ? <PerformanceKpiStrip cells={snapshot.kpiStrip} />
        : <div className="po-pf-empty-summary" role="status">No appearances have been recorded for the selected context. Change season or filters to explore other matches.</div>}

      <div className="po-pf-main">
        <section className="po-pf-analysis" aria-label="Statistical analysis">
          <div className="po-pf-analysis__tabs" role="group" aria-label="Performance analysis">
            <button type="button" aria-pressed={analysisTab === 'efficiency'}
              onClick={() => setAnalysisTab('efficiency')}>EFFICIENCY</button>
            <button type="button" aria-pressed={analysisTab === 'shot'}
              onClick={() => setAnalysisTab('shot')}>SHOOTING</button>
            <button type="button" aria-pressed={analysisTab === 'splits'}
              onClick={() => setAnalysisTab('splits')}>SPLITS</button>
          </div>
          <div className="po-pf-analysis__body">
            {analysisTab === 'efficiency' && <PerformanceEfficiencyPanel metrics={snapshot.efficiencyMetrics} />}
            {analysisTab === 'shot' && <PerformanceShotProfilePanel profile={snapshot.shotProfile} />}
            {analysisTab === 'splits' && <PerformanceSplitsPanel note={snapshot.splitsNote} rows={snapshot.splits} />}
          </div>
          <p className="po-pf-analysis__footer">
            {analysisTab === 'efficiency' ? 'Rates calculated from completed match box scores. — means insufficient attempts or data.'
              : analysisTab === 'shot' ? '2PT and 3PT zones only. Shot coordinates are not recorded.'
              : 'Home, away and opponent splits use actual logged games. Unsupported halves remain unavailable.'}
          </p>
        </section>

        <div className="po-pf-games">
          <PerformanceCourtsideForm games={snapshot.recentForm}
            onSelectGame={onSelectGame} selectedGameId={activeGameId} />
          <PerformanceCourtsideGameLog rows={snapshot.gameLogs}
            onSelectGame={onSelectGame} selectedGameId={activeGameId} />
        </div>

        <PerformanceGameInspectorPanel rows={snapshot.gameLogs}
          onSelectGame={onSelectGame} selectedGameId={activeGameId} />
      </div>
    </div>
  )
}
