import type { GameId } from '@/domain/ids'

import type { PlayerGameLogRow } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

type GameLogTableRow = PlayerGameLogRow & { readonly id: string }

export function PerformanceGameLog({
  rows,
  selectedGameId,
  onSelectGame,
  emptyMessage,
}: {
  readonly rows: readonly PlayerGameLogRow[]
  readonly selectedGameId: GameId | null
  readonly onSelectGame: (gameId: GameId) => void
  readonly emptyMessage: string
}) {
  if (rows.length === 0) {
    return (
      <section className="pp-log pp-log--empty" data-ng-region="performance-game-log">
        <header className="pp-panel-head">
          <span className="pp-panel-head__title">Game Log</span>
        </header>
        <p className="pp-panel-empty">{emptyMessage}</p>
      </section>
    )
  }

  const tableRows: readonly GameLogTableRow[] = rows.map((row) => ({ ...row, id: row.gameId }))

  return (
    <section className="pp-log" data-ng-region="performance-game-log">
      <header className="pp-panel-head">
        <span className="pp-panel-head__title">Game Log</span>
        <span className="pp-panel-head__meta">{rows.length} games</span>
      </header>
      <div className="pp-log__scroll">
        <NgPrecisionTable
          className="pp-log__table"
          columns={[
            ngCol<GameLogTableRow>('date', 'Date', (row) => row.date, { value: (row) => row.date }),
            ngCol<GameLogTableRow>('opponent', 'Opp', (row) => row.opponent, { value: (row) => row.opponent }),
            ngCol<GameLogTableRow>('competition', 'Comp', (row) => row.competition, { value: (row) => row.competition }),
            ngCol<GameLogTableRow>('homeAway', 'H/A', (row) => row.homeAway, { value: (row) => row.homeAway }),
            ngCol<GameLogTableRow>('result', 'Result', (row) => row.result, { value: (row) => row.result }),
            ngCol<GameLogTableRow>('minutes', 'MIN', (row) => row.minutes, { defaultWidth: 52, numeric: true, value: (row) => row.minutes }),
            ngCol<GameLogTableRow>('points', 'PTS', (row) => row.points, { defaultWidth: 48, numeric: true, value: (row) => row.points }),
            ngCol<GameLogTableRow>('rebounds', 'REB', (row) => row.rebounds, { defaultWidth: 48, numeric: true, value: (row) => row.rebounds }),
            ngCol<GameLogTableRow>('assists', 'AST', (row) => row.assists, { defaultWidth: 48, numeric: true, value: (row) => row.assists }),
            ngCol<GameLogTableRow>('steals', 'STL', (row) => row.steals, { defaultWidth: 48, numeric: true, value: (row) => row.steals }),
            ngCol<GameLogTableRow>('blocks', 'BLK', (row) => row.blocks, { defaultWidth: 48, numeric: true, value: (row) => row.blocks }),
            ngCol<GameLogTableRow>('turnovers', 'TOV', (row) => row.turnovers, { defaultWidth: 48, numeric: true, value: (row) => row.turnovers }),
            ngCol<GameLogTableRow>('fg', 'FG', (row) => row.fg, { defaultWidth: 56, numeric: true, value: (row) => row.fg }),
            ngCol<GameLogTableRow>('threePt', '3PT', (row) => row.threePt, { defaultWidth: 56, numeric: true, value: (row) => row.threePt }),
            ngCol<GameLogTableRow>('ft', 'FT', (row) => row.ft, { defaultWidth: 56, numeric: true, value: (row) => row.ft }),
          ]}
          gridId="ng-player-game-log"
          onRowClick={(row) => onSelectGame(row.gameId)}
          onSelectionChange={(ids) => {
            if (ids[0]) onSelectGame(ids[0] as GameId)
          }}
          rows={tableRows}
          selectedId={selectedGameId ?? undefined}
        />
      </div>
    </section>
  )
}
