import type { RatingEvolutionModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'

/**
 * Plot geometry. The SVG stretches to the panel width, so its own shapes stay ratio-free: the
 * gridlines and the averages are lines and the series is a polyline. The points are HTML so
 * they stay round instead of being stretched into wide ellipses.
 */
const VIEW = 100
const PAD_TOP = 8
const PAD_BOTTOM = 8
/** Minimum window height so a flat series still reads as a plotted line rather than a wall. */
const MIN_WINDOW = 4
const MAX_X_LABELS = 6

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function AttributeEvolutionChart({
  evolution,
  label,
  title,
}: {
  readonly evolution: RatingEvolutionModel
  readonly label: string
  /** Panel-supplied heading; defaults to the attribute's own evolution caption. */
  readonly title?: string
}) {
  const points = evolution.points
  const leagueAverage = evolution.league.status === 'available' ? evolution.league.average : null
  const teamAverage = evolution.team.status === 'available' ? evolution.team.average : null
  const values = [
    ...points.map((point) => point.value),
    ...(leagueAverage === null ? [] : [leagueAverage]),
    ...(teamAverage === null ? [] : [teamAverage]),
  ]
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const centre = (rawMin + rawMax) / 2
  const window = Math.max(MIN_WINDOW, rawMax - rawMin) * 1.5
  const yMin = Math.max(0, Math.min(centre - window / 2, 100 - window))
  const yMax = Math.min(100, yMin + window)

  const xFor = (index: number) =>
    points.length < 2 ? VIEW / 2 : (index / (points.length - 1)) * VIEW
  const yFor = (value: number) =>
    PAD_TOP + (1 - (value - yMin) / (yMax - yMin)) * (VIEW - PAD_TOP - PAD_BOTTOM)

  const xStep = points.length <= MAX_X_LABELS ? 1 : Math.ceil(points.length / MAX_X_LABELS)
  const lastIndex = points.length - 1
  const description = [
    `${label} evolution across ${points.length} ${points.length === 1 ? 'season' : 'seasons'}`,
    points.map((point) => `${point.label} ${formatValue(point.value)}`).join(', '),
    leagueAverage === null ? 'League average not available' : `League average ${formatValue(leagueAverage)}`,
    teamAverage === null ? 'Team average not available' : `Team average ${formatValue(teamAverage)}`,
    evolution.note,
  ].join('. ')

  return (
    <figure className="po-attr-evolution">
      <figcaption className="po-attr-evolution__head">
        <span className="po-attr-evolution__title">{title ?? `Evolution · ${label}`}</span>
        <span className="po-attr-evolution__legend">
          <span className="po-attr-evolution__key po-attr-evolution__key--player">
            Player <b className="ng-type-numeric">{formatValue(evolution.current)}</b>
          </span>
          <span className="po-attr-evolution__key po-attr-evolution__key--league">
            League average{' '}
            <b className="ng-type-numeric">{leagueAverage === null ? '—' : formatValue(leagueAverage)}</b>
          </span>
          <span className="po-attr-evolution__key po-attr-evolution__key--team">
            Team average{' '}
            <b className="ng-type-numeric">{teamAverage === null ? '—' : formatValue(teamAverage)}</b>
          </span>
        </span>
      </figcaption>

      <div className="po-attr-evolution__plot">
        <div aria-hidden className="po-attr-evolution__scale ng-type-numeric">
          <span>{formatValue(yMax)}</span>
          <span>{formatValue((yMin + yMax) / 2)}</span>
          <span>{formatValue(yMin)}</span>
        </div>
        <div className="po-attr-evolution__area">
          <div className="po-attr-evolution__canvas">
            <svg
              aria-label={description}
              className="po-attr-evolution__svg"
              preserveAspectRatio="none"
              role="img"
              viewBox={`0 0 ${VIEW} ${VIEW}`}
            >
              {[yMin, (yMin + yMax) / 2, yMax].map((tick) => (
                <line
                  className="po-attr-evolution__grid"
                  key={`grid-${tick}`}
                  vectorEffect="non-scaling-stroke"
                  x1={0}
                  x2={VIEW}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                />
              ))}

              {leagueAverage === null ? null : (
                <line
                  className="po-attr-evolution__league"
                  vectorEffect="non-scaling-stroke"
                  x1={0}
                  x2={VIEW}
                  y1={yFor(leagueAverage)}
                  y2={yFor(leagueAverage)}
                />
              )}
              {teamAverage === null ? null : (
                <line
                  className="po-attr-evolution__team"
                  vectorEffect="non-scaling-stroke"
                  x1={0}
                  x2={VIEW}
                  y1={yFor(teamAverage)}
                  y2={yFor(teamAverage)}
                />
              )}

              {points.length > 1 && (
                <polyline
                  className="po-attr-evolution__line"
                  points={points.map((point, index) => `${xFor(index)},${yFor(point.value)}`).join(' ')}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            <div aria-hidden className="po-attr-evolution__points">
              {points.map((point, index) => (
                <span
                  className={`po-attr-evolution__point${point.isCurrent ? ' is-current' : ''}`}
                  key={point.id}
                  style={{ left: `${xFor(index)}%`, top: `${yFor(point.value)}%` }}
                />
              ))}
            </div>
          </div>

          {/* Labels are positioned from the same `xFor` used by the plot, so a tick always sits
              under its own point rather than being spread across the row. */}
          <div aria-hidden className="po-attr-evolution__axis">
            {points.map((point, index) =>
              index % xStep === 0 || index === lastIndex ? (
                <span
                  className={`po-attr-evolution__tick${index === 0 ? ' is-first' : ''}${index === lastIndex ? ' is-last' : ''}${point.isCurrent ? ' is-current' : ''}`}
                  key={point.id}
                  style={{ left: `${xFor(index)}%` }}
                >
                  {point.label}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>

      <p className="po-attr-evolution__caption">{evolution.note}</p>
    </figure>
  )
}
