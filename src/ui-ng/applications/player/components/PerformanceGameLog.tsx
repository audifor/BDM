import type { GameId } from '@/domain/ids'

import type { PlayerGameLogRow } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

const COLUMNS: readonly { readonly key: keyof PlayerGameLogRow | 'started'; readonly label: string; readonly className?: string }[] = [
  { key: 'date', label: 'Date', className: 'pp-log__col--date' },
  { key: 'opponent', label: 'Opp', className: 'pp-log__col--opp' },
  { key: 'competition', label: 'Comp', className: 'pp-log__col--comp' },
  { key: 'homeAway', label: 'H/A', className: 'pp-log__col--ha' },
  { key: 'result', label: 'Result', className: 'pp-log__col--result' },
  { key: 'minutes', label: 'MIN', className: 'pp-log__col--num' },
  { key: 'points', label: 'PTS', className: 'pp-log__col--num' },
  { key: 'rebounds', label: 'REB', className: 'pp-log__col--num' },
  { key: 'assists', label: 'AST', className: 'pp-log__col--num' },
  { key: 'steals', label: 'STL', className: 'pp-log__col--num' },
  { key: 'blocks', label: 'BLK', className: 'pp-log__col--num' },
  { key: 'turnovers', label: 'TOV', className: 'pp-log__col--num' },
  { key: 'fg', label: 'FG', className: 'pp-log__col--shoot' },
  { key: 'threePt', label: '3PT', className: 'pp-log__col--shoot' },
  { key: 'ft', label: 'FT', className: 'pp-log__col--shoot' },
]

function cellValue(row: PlayerGameLogRow, key: keyof PlayerGameLogRow | 'started'): string {
  if (key === 'started') return row.started ? 'S' : '—'
  const value = row[key]
  return typeof value === 'number' ? String(value) : value
}

function isNumericColumn(className: string | undefined): boolean {
  return className === 'pp-log__col--num' || className === 'pp-log__col--shoot'
}

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

  return (
    <section className="pp-log" data-ng-region="performance-game-log">
      <header className="pp-panel-head">
        <span className="pp-panel-head__title">Game Log</span>
        <span className="pp-panel-head__meta">{rows.length} games</span>
      </header>
      <div className="pp-log__scroll">
        <table className="pp-log__table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th className={column.className} key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = selectedGameId === row.gameId
              return (
                <tr
                  aria-selected={selected}
                  className={selected ? 'is-selected' : undefined}
                  key={row.gameId}
                  onClick={() => onSelectGame(row.gameId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectGame(row.gameId)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {COLUMNS.map((column) => (
                    <td
                      className={`${column.className ?? ''}${isNumericColumn(column.className) ? ' ng-type-numeric' : ''}`.trim()}
                      key={column.key}
                    >
                      {cellValue(row, column.key)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
