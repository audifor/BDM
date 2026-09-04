import type { PlayerGameLogRow } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

export function GameDetailInspector({ row }: { readonly row: PlayerGameLogRow | undefined }) {
  if (row === undefined) {
    return (
      <div className="pp-inspector pp-inspector--empty" data-ng-region="performance-game-inspector">
        <p className="pp-inspector__hint">Select a game from the log to inspect box-score detail.</p>
      </div>
    )
  }

  return (
    <div className="pp-inspector" data-ng-region="performance-game-inspector">
      <header className="pp-inspector__head">
        <span className="pp-inspector__opponent">vs {row.opponent}</span>
        <span className="pp-inspector__meta">
          {row.date} · {row.competition} · {row.homeAway} · {row.result}
        </span>
      </header>

      <div className="pp-inspector__line">
        <span className="pp-stat-label pp-stat-label--tertiary">MIN</span>
        <span className="pp-stat-value pp-stat-value--secondary ng-type-numeric">{row.minutes}</span>
        {row.started && <span className="pp-inspector__started">Started</span>}
      </div>

      <div className="pp-inspector__production">
        {[
          { label: 'PTS', value: row.points },
          { label: 'REB', value: row.rebounds },
          { label: 'AST', value: row.assists },
          { label: 'STL', value: row.steals },
          { label: 'BLK', value: row.blocks },
          { label: 'TOV', value: row.turnovers },
        ].map((cell) => (
          <div className="pp-inspector__prod-cell" key={cell.label}>
            <span className="pp-stat-label pp-stat-label--primary">{cell.label}</span>
            <span className="pp-stat-value pp-stat-value--primary ng-type-numeric">{cell.value}</span>
          </div>
        ))}
      </div>

      <div className="pp-inspector__shooting">
        {[
          { label: 'FG', value: row.fg },
          { label: '3PT', value: row.threePt },
          { label: 'FT', value: row.ft },
        ].map((line) => (
          <div className="pp-inspector__shoot-line" key={line.label}>
            <span className="pp-shooting__label">{line.label}</span>
            <span className="pp-shooting__attempts ng-type-numeric">{line.value}</span>
          </div>
        ))}
      </div>

      <div className="pp-inspector__footer">
        <span className="pp-stat-label pp-stat-label--tertiary">+/-</span>
        <span className="pp-stat-value pp-stat-value--secondary ng-type-numeric">{row.plusMinus}</span>
        <span className="pp-stat-label pp-stat-label--tertiary">PF</span>
        <span className="pp-stat-value pp-stat-value--secondary ng-type-numeric">{row.fouls}</span>
      </div>
    </div>
  )
}
