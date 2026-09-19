import type { GameId } from '@/domain/ids'

import type {
  PerformanceEfficiencyMetricModel,
  PerformanceFilterModel,
  PerformanceKpiModel,
  PerformanceRecentGame,
  PerformanceShotProfileModel,
  PerformanceSplitRowModel,
  PlayerGameLogRow,
} from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

/** Colour of each shot-zone block, keyed by the zone the model reports. */
const ZONE_TONE: Record<string, string> = {
  'inside-arc': 'yellow',
  'outside-arc': 'cyan',
}

/** Legend colours of the form chart. */
const FORM_SERIES = [
  { id: 'points', label: 'Points', tone: 'green' },
  { id: 'rebounds', label: 'Rebounds', tone: 'yellow' },
  { id: 'assists', label: 'Assists', tone: 'cyan' },
  { id: 'valuation', label: 'VAL', tone: 'white' },
] as const

/* ── Band 1 · context filters ── */

export function PerformanceFiltersBar({
  filters,
  onChange,
  values,
}: {
  readonly filters: readonly PerformanceFilterModel[]
  readonly onChange: (id: PerformanceFilterModel['id'], value: string) => void
  /** Current selection per selector id, exactly as the session holds it. */
  readonly values: Readonly<Record<PerformanceFilterModel['id'], string>>
}) {
  return (
    <section className="po-pf-filters" data-ng-region="performance-filters">
      {filters.map((filter) => (
        <label className="po-pf-filter" key={filter.id}>
          <span className="po-pf-stat__label">{filter.label}</span>
          <span className="po-pf-filter__control">
            <select
              aria-label={filter.label}
              className="po-pf-filter__select"
              onChange={(event) => onChange(filter.id, event.target.value)}
              value={values[filter.id]}
            >
              {filter.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <span aria-hidden className="po-pf-filter__chevron">
              ▾
            </span>
          </span>
        </label>
      ))}
    </section>
  )
}

/* ── Band 2 · KPI strip ── */

export function PerformanceKpiStrip({ cells }: { readonly cells: readonly PerformanceKpiModel[] }) {
  return (
    <section className="po-pf-kpis" data-ng-region="performance-kpis">
      {cells.map((cell) => (
        <div className="po-pf-kpi" key={cell.id}>
          <span className="po-pf-stat__label">{cell.label}</span>
          <span className="po-pf-kpi__value ng-type-numeric">{cell.value}</span>
        </div>
      ))}
    </section>
  )
}

/* ── Band 3 · efficiency ── */

export function PerformanceEfficiencyPanel({
  metrics,
}: {
  readonly metrics: readonly PerformanceEfficiencyMetricModel[]
}) {
  const shooting = metrics.filter((metric) => metric.row === 'volume')
  const advanced = metrics.filter((metric) => metric.row === 'advanced')

  return (
    <section className="po-pf-panel po-pf-efficiency" data-ng-region="performance-efficiency">
      <header className="po-pf-panel__head">
        <span className="po-pf-panel__title">Efficiency</span>
        <span className="po-pf-panel__meta">Per game averages</span>
      </header>
      <div className="po-pf-efficiency__grid is-five">
        {shooting.map((metric) => (
          <div className="po-pf-efficiency__cell" key={metric.id}>
            <span className="po-pf-stat__label">{metric.label}</span>
            <span className="po-pf-efficiency__value ng-type-numeric">
              {metric.value}
              {metric.value === '—' ? '' : '%'}
            </span>
            <span className="po-pf-efficiency__detail ng-type-numeric">{metric.detail ?? ''}</span>
          </div>
        ))}
      </div>
      <div className="po-pf-efficiency__grid is-four">
        {advanced.map((metric) => (
          <div className="po-pf-efficiency__cell" key={metric.id}>
            <span className="po-pf-stat__label">{metric.label}</span>
            <span className="po-pf-efficiency__value is-advanced ng-type-numeric">
              {metric.value}
              {metric.value === '—' ? '' : '%'}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Band 3 · shot profile ── */

/**
 * Half court drawn from the two zones the save records. The paint carries the inside-arc reading,
 * the area behind the arc carries the three-point one: no coordinate is invented to place them.
 */
export function PerformanceShotProfilePanel({
  profile,
}: {
  readonly profile: PerformanceShotProfileModel
}) {
  const inside = profile.zones.find((zone) => zone.id === 'inside-arc')
  const outside = profile.zones.find((zone) => zone.id === 'outside-arc')

  return (
    <section className="po-pf-panel po-pf-shot" data-ng-region="performance-shot-profile">
      <header className="po-pf-panel__head">
        <span className="po-pf-panel__title">Shot profile</span>
        <span className="po-pf-panel__meta">FG% by location</span>
      </header>

      <div className="po-pf-shot__body">
        <div className="po-pf-shot__court">
          <svg
            aria-label="Half court showing the two shooting zones the save records"
            className="po-pf-shot__svg"
            role="img"
            viewBox="0 0 200 168"
          >
            {/* Baseline and sidelines. */}
            <rect className="po-pf-court__line" height={168} width={186} x={7} y={1} />
            {/* Lane and free-throw circle. */}
            <rect className="po-pf-court__line" height={86} width={68} x={66} y={1} />
            <circle className="po-pf-court__line" cx={100} cy={87} r={26} />
            {/* Three-point arc and the rim. */}
            <path className="po-pf-court__line" d="M 7 22 L 7 6 M 193 22 L 193 6" />
            <path
              className="po-pf-court__line"
              d="M 7 8 L 7 24 A 93 93 0 0 0 193 24 L 193 8"
            />
            <circle className="po-pf-court__rim" cx={100} cy={12} r={7} />
          </svg>

          {inside !== undefined && (
            <span
              className={`po-pf-zone is-${ZONE_TONE[inside.id]}`}
              style={{ left: '50%', top: '34%' }}
              title={`${inside.label}\n${inside.made}/${inside.attempted}\n${inside.percentage ?? '—'}%\n${inside.share}% of attempts`}
            >
              <span className="po-pf-zone__pct ng-type-numeric">
                {inside.percentage === null ? '—' : `${inside.percentage}%`}
              </span>
              <span className="po-pf-zone__made ng-type-numeric">
                {inside.made}/{inside.attempted}
              </span>
            </span>
          )}

          {outside !== undefined && (
            <span
              className={`po-pf-zone is-${ZONE_TONE[outside.id]} is-small`}
              style={{ left: '50%', top: '82%' }}
              title={`${outside.label}\n${outside.made}/${outside.attempted}\n${outside.percentage ?? '—'}%\n${outside.share}% of attempts`}
            >
              <span className="po-pf-zone__pct ng-type-numeric">
                {outside.percentage === null ? '—' : `${outside.percentage}%`}
              </span>
              <span className="po-pf-zone__made ng-type-numeric">
                {outside.made}/{outside.attempted}
              </span>
            </span>
          )}
        </div>

        <div className="po-pf-shot__legend">
          <span className="po-pf-shot__legend-title">FGA distribution</span>
          {profile.zones.map((zone) => (
            <span className={`po-pf-legend-row is-${ZONE_TONE[zone.id]}`} key={zone.id}>
              <span aria-hidden className="po-pf-legend-row__dot" />
              <span className="po-pf-legend-row__label">{zone.label}</span>
              <span className="po-pf-legend-row__value ng-type-numeric">{zone.share}%</span>
            </span>
          ))}
          <span className="po-pf-stat__note">{profile.note}</span>
        </div>
      </div>
    </section>
  )
}

/* ── Band 3 · splits ── */

export function PerformanceSplitsPanel({
  note,
  rows,
}: {
  readonly note: string
  readonly rows: readonly PerformanceSplitRowModel[]
}) {
  return (
    <section className="po-pf-panel po-pf-splits" data-ng-region="performance-splits">
      <header className="po-pf-panel__head">
        <span className="po-pf-panel__title">Splits</span>
        <span className="po-pf-panel__meta">Per game averages</span>
      </header>
      <div className="po-pf-splits__table" role="table">
        <div className="po-pf-splits__head" role="row">
          <span role="columnheader">Split</span>
          <span role="columnheader">GP</span>
          <span role="columnheader">PTS</span>
          <span role="columnheader">REB</span>
          <span role="columnheader">AST</span>
          <span role="columnheader">FG%</span>
          <span role="columnheader">3P%</span>
          <span role="columnheader">VAL</span>
        </div>
        {rows.map((row) => (
          <div
            className={`po-pf-splits__row${row.reason === null ? '' : ' is-unavailable'}`}
            key={row.id}
            role="row"
            title={row.reason ?? undefined}
          >
            <span className="po-pf-splits__label" role="cell">
              {row.label}
            </span>
            <span className="ng-type-numeric" role="cell">
              {row.games}
            </span>
            <span className="ng-type-numeric" role="cell">
              {row.points}
            </span>
            <span className="ng-type-numeric" role="cell">
              {row.rebounds}
            </span>
            <span className="ng-type-numeric" role="cell">
              {row.assists}
            </span>
            <span className="ng-type-numeric" role="cell">
              {row.fieldGoalPercentage ?? '—'}
            </span>
            <span className="ng-type-numeric" role="cell">
              {row.threePointPercentage ?? '—'}
            </span>
            <span className="ng-type-numeric" role="cell">
              {row.valuation}
            </span>
          </div>
        ))}
      </div>
      <span className="po-pf-stat__note">{note}</span>
    </section>
  )
}

/* ── Band 4 · recent form ── */

/**
 * Last games as grouped bars plus the valuation line. Bars are drawn in percentages and the line is
 * a stretched polyline with HTML nodes, so nothing distorts when the panel resizes.
 */
export function PerformanceRecentFormChart({
  games,
  onSelectGame,
  selectedGameId,
}: {
  readonly games: readonly PerformanceRecentGame[]
  readonly onSelectGame: (gameId: GameId) => void
  readonly selectedGameId: GameId | null
}) {
  const ordered = [...games].reverse()
  const peak = Math.max(10, ...ordered.map((game) => Math.max(game.points, game.valuation)))
  const step = Math.ceil(peak / 10) * 10
  const ticks = [step, Math.round((step / 3) * 2), Math.round(step / 3), 0]
  const toPercent = (value: number): number => Math.max(0, Math.min(100, (value / step) * 100))
  const columns = Math.max(1, ordered.length)

  return (
    <section className="po-pf-panel po-pf-form" data-ng-region="performance-recent-form">
      <header className="po-pf-panel__head">
        <span className="po-pf-panel__title">Recent form</span>
        <span className="po-pf-form__legend">
          {FORM_SERIES.map((series) => (
            <span className={`po-pf-form__legend-item is-${series.tone}`} key={series.id}>
              <span aria-hidden className="po-pf-form__legend-mark" />
              {series.label}
            </span>
          ))}
        </span>
      </header>

      {ordered.length === 0 ? (
        <p className="po-pf-empty">No game has been played in this context.</p>
      ) : (
        <div className="po-pf-form__body">
          <ul className="po-pf-form__axis">
            {ticks.map((tick) => (
              <li key={tick}>{tick}</li>
            ))}
          </ul>
          <div className="po-pf-form__plot">
            <div aria-hidden className="po-pf-form__grid">
              {ticks.map((tick) => (
                <span key={tick} />
              ))}
            </div>

            <svg
              aria-hidden
              className="po-pf-form__line"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
              <polyline
                points={ordered
                  .map((game, index) => {
                    const x = ((index + 0.5) / columns) * 100
                    return `${x.toFixed(2)},${(100 - toPercent(game.valuation)).toFixed(2)}`
                  })
                  .join(' ')}
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            <div className="po-pf-form__columns">
              {ordered.map((game) => (
                <button
                  aria-pressed={selectedGameId === game.gameId}
                  className={`po-pf-form__game${selectedGameId === game.gameId ? ' is-selected' : ''}`}
                  key={game.gameId}
                  onClick={() => onSelectGame(game.gameId)}
                  title={`${game.date} vs ${game.opponent}\nPTS ${game.points} · REB ${game.rebounds} · AST ${game.assists} · VAL ${game.valuation}`}
                  type="button"
                >
                  <span className="po-pf-form__bars">
                    <span
                      className="po-pf-form__bar is-green"
                      style={{ height: `${toPercent(game.points)}%` }}
                    >
                      <span className="po-pf-form__bar-value ng-type-numeric">{game.points}</span>
                    </span>
                    <span
                      className="po-pf-form__bar is-yellow"
                      style={{ height: `${toPercent(game.rebounds)}%` }}
                    >
                      <span className="po-pf-form__bar-value ng-type-numeric">{game.rebounds}</span>
                    </span>
                    <span
                      className="po-pf-form__bar is-cyan"
                      style={{ height: `${toPercent(game.assists)}%` }}
                    >
                      <span className="po-pf-form__bar-value ng-type-numeric">{game.assists}</span>
                    </span>
                    <span
                      className="po-pf-form__node"
                      style={{ bottom: `${toPercent(game.valuation)}%` }}
                    >
                      <span className="po-pf-form__node-value ng-type-numeric">{game.valuation}</span>
                    </span>
                  </span>
                  <span className="po-pf-form__label">
                    <span className="po-pf-form__opponent">vs {game.opponent}</span>
                    <span className="po-pf-form__date">{game.date}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/* ── Band 5 · game log ── */

type GameLogTableRow = PlayerGameLogRow & { readonly id: string }

export function PerformanceGameLogPanel({
  onSelectGame,
  rows,
  selectedGameId,
}: {
  readonly onSelectGame: (gameId: GameId) => void
  readonly rows: readonly PlayerGameLogRow[]
  readonly selectedGameId: GameId | null
}) {
  const tableRows: readonly GameLogTableRow[] = rows.map((row) => ({ ...row, id: row.gameId }))

  return (
    <section className="po-pf-panel po-pf-log" data-ng-region="performance-game-log">
      <header className="po-pf-panel__head">
        <span className="po-pf-panel__title">Game log</span>
        <span className="po-pf-panel__meta ng-type-numeric">
          {rows.length} {rows.length === 1 ? 'game' : 'games'}
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="po-pf-empty">No game matches this context.</p>
      ) : (
        <div className="po-pf-log__scroll">
          <NgPrecisionTable
            className="po-pf-log__table"
            columns={ngTableColumns(tableRows, [
              ngCol<GameLogTableRow>('date', 'Date', (row) => row.date, { value: (row) => row.date }),
              ngCol<GameLogTableRow>('opponent', 'Opponent', (row) => row.opponent, { value: (row) => row.opponent }),
              ngCol<GameLogTableRow>('competition', 'Competition', (row) => row.competition, { value: (row) => row.competition }),
              ngCol<GameLogTableRow>('homeAway', 'H/A', (row) => row.homeAway, { defaultWidth: 46, value: (row) => row.homeAway }),
              ngCol<GameLogTableRow>(
                'result',
                'Result',
                (row) => (
                  <span className={`po-pf-result is-${row.outcome === 'W' ? 'win' : row.outcome === 'L' ? 'loss' : 'tie'}`}>
                    {row.result}
                  </span>
                ),
                { defaultWidth: 84, value: (row) => row.result },
              ),
              ngCol<GameLogTableRow>('minutes', 'MIN', (row) => row.minutes, { defaultWidth: 50, numeric: true, value: (row) => row.minutes }),
              ngCol<GameLogTableRow>('points', 'PTS', (row) => row.points, { defaultWidth: 46, numeric: true, value: (row) => row.points }),
              ngCol<GameLogTableRow>('rebounds', 'REB', (row) => row.rebounds, { defaultWidth: 46, numeric: true, value: (row) => row.rebounds }),
              ngCol<GameLogTableRow>('assists', 'AST', (row) => row.assists, { defaultWidth: 46, numeric: true, value: (row) => row.assists }),
              ngCol<GameLogTableRow>('steals', 'STL', (row) => row.steals, { defaultWidth: 46, numeric: true, value: (row) => row.steals }),
              ngCol<GameLogTableRow>('blocks', 'BLK', (row) => row.blocks, { defaultWidth: 46, numeric: true, value: (row) => row.blocks }),
              ngCol<GameLogTableRow>('turnovers', 'TOV', (row) => row.turnovers, { defaultWidth: 46, numeric: true, value: (row) => row.turnovers }),
              ngCol<GameLogTableRow>('fg', 'FG', (row) => row.fg, { defaultWidth: 54, numeric: true, value: (row) => row.fg }),
              ngCol<GameLogTableRow>('threePt', '3PT', (row) => row.threePt, { defaultWidth: 54, numeric: true, value: (row) => row.threePt }),
              ngCol<GameLogTableRow>('ft', 'FT', (row) => row.ft, { defaultWidth: 54, numeric: true, value: (row) => row.ft }),
              ngCol<GameLogTableRow>('valuation', 'VAL', (row) => row.valuation, { defaultWidth: 48, numeric: true, value: (row) => row.valuation }),
            ])}
            gridId="ng-player-game-log"
            onRowClick={(row) => onSelectGame(row.gameId)}
            onSelectionChange={(ids) => {
              if (ids[0]) onSelectGame(ids[0] as GameId)
            }}
            rows={tableRows}
            selectedId={selectedGameId ?? undefined}
          />
        </div>
      )}
    </section>
  )
}

/* ── Bands 4-5 · game inspector ── */

const INSPECTOR_PRODUCTION = [
  { id: 'min', label: 'MIN', read: (row: PlayerGameLogRow) => String(row.minutes) },
  { id: 'pts', label: 'PTS', read: (row: PlayerGameLogRow) => String(row.points) },
  { id: 'reb', label: 'REB', read: (row: PlayerGameLogRow) => String(row.rebounds) },
  { id: 'ast', label: 'AST', read: (row: PlayerGameLogRow) => String(row.assists) },
  { id: 'stl', label: 'STL', read: (row: PlayerGameLogRow) => String(row.steals) },
  { id: 'blk', label: 'BLK', read: (row: PlayerGameLogRow) => String(row.blocks) },
] as const

export function PerformanceGameInspectorPanel({
  onSelectGame,
  rows,
  selectedGameId,
}: {
  readonly onSelectGame: (gameId: GameId) => void
  readonly rows: readonly PlayerGameLogRow[]
  readonly selectedGameId: GameId | null
}) {
  const index = rows.findIndex((row) => row.gameId === selectedGameId)
  const row = index === -1 ? rows[0] : rows[index]

  if (row === undefined) {
    return (
      <section className="po-pf-panel po-pf-inspector" data-ng-region="performance-game-inspector">
        <header className="po-pf-panel__head">
          <span className="po-pf-panel__title">Game inspector</span>
        </header>
        <p className="po-pf-empty">No game matches this context.</p>
      </section>
    )
  }

  const move = (delta: number): void => {
    const next = rows[Math.max(0, Math.min(rows.length - 1, (index === -1 ? 0 : index) + delta))]
    if (next !== undefined) onSelectGame(next.gameId)
  }

  return (
    <section className="po-pf-panel po-pf-inspector" data-ng-region="performance-game-inspector">
      <header className="po-pf-panel__head">
        <span className="po-pf-panel__title">Game inspector</span>
      </header>

      <div className="po-pf-inspector__selector">
        <button
          aria-label="Previous game"
          className="po-pf-inspector__arrow"
          disabled={index <= 0}
          onClick={() => move(-1)}
          type="button"
        >
          ‹
        </button>
        <span className="po-pf-inspector__picker">
          <select
            aria-label="Selected game"
            className="po-pf-inspector__select"
            onChange={(event) => onSelectGame(event.target.value as GameId)}
            value={row.gameId}
          >
            {rows.map((option) => (
              <option key={option.gameId} value={option.gameId}>
                {option.dateLabel} vs {option.opponentName}
              </option>
            ))}
          </select>
          <span aria-hidden className="po-pf-inspector__chevron">
            ▾
          </span>
        </span>
        <button
          aria-label="Next game"
          className="po-pf-inspector__arrow"
          disabled={index === -1 || index >= rows.length - 1}
          onClick={() => move(1)}
          type="button"
        >
          ›
        </button>
      </div>

      <div className="po-pf-inspector__matchup">
        <span aria-hidden className="po-pf-inspector__crest">
          {row.opponent.slice(0, 3)}
        </span>
        <span className="po-pf-inspector__team">
          <span className="po-pf-inspector__team-name">{row.opponentName}</span>
          <span className="po-pf-stat__note">{row.competition}</span>
        </span>
        <span className="po-pf-inspector__result">
          <span
            className={`po-pf-inspector__score is-${row.outcome === 'W' ? 'win' : row.outcome === 'L' ? 'loss' : 'tie'} ng-type-numeric`}
          >
            {row.outcome} {row.result.replace(/^[WLT] /, '')}
          </span>
          <span className="po-pf-inspector__venue">
            {row.homeAway === 'H' ? 'Home' : 'Away'}
          </span>
        </span>
      </div>

      <div className="po-pf-inspector__stats">
        <div className="po-pf-inspector__column">
          {INSPECTOR_PRODUCTION.map((cell) => (
            <span className="po-pf-inspector__line" key={cell.id}>
              <span className="po-pf-stat__label">{cell.label}</span>
              <span className="po-pf-inspector__line-value ng-type-numeric">{cell.read(row)}</span>
            </span>
          ))}
        </div>
        <div className="po-pf-inspector__column">
          {[
            { id: 'fg', label: 'FG', value: row.fg, pct: row.fgPercentage },
            { id: '3pt', label: '3PT', value: row.threePt, pct: row.threePointPercentage },
            { id: 'ft', label: 'FT', value: row.ft, pct: row.ftPercentage },
          ].map((line) => (
            <span className="po-pf-inspector__line is-shooting" key={line.id}>
              <span className="po-pf-stat__label">{line.label}</span>
              <span className="po-pf-inspector__line-value ng-type-numeric">{line.value}</span>
              <span className="po-pf-inspector__line-pct ng-type-numeric">
                {line.pct === null ? '—' : `${line.pct}%`}
              </span>
            </span>
          ))}
          <span className="po-pf-inspector__line">
            <span className="po-pf-stat__label">TOV</span>
            <span className="po-pf-inspector__line-value ng-type-numeric">{row.turnovers}</span>
          </span>
          <span className="po-pf-inspector__line">
            <span className="po-pf-stat__label">VAL</span>
            <span className="po-pf-inspector__line-value ng-type-numeric">{row.valuation}</span>
          </span>
        </div>
      </div>

      <p className="po-pf-inspector__note">{row.summary}</p>
    </section>
  )
}
