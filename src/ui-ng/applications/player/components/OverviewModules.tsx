import { useState } from 'react'

import { GapList } from '@/ui-ng/applications/player/components/DeclaredGaps'
import type { MedicalReadinessMeterModel } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import type {
  OverviewAlertModel,
  OverviewObservationModel,
  OverviewRatingSeriesModel,
  PlayerOverviewModel,
} from '@/ui-ng/applications/player/data/playerWorkspaceModel'
import type { PlayerWorkspaceViewId } from '@/ui-ng/applications/player/playerStructuralData'

/**
 * Alert filters of the reference. Alerts carry an owning department, so each of these buckets maps
 * to the departments that belong to it: a bucket with no alert simply shows its empty state.
 */
const ALERT_FILTERS: readonly { readonly id: string; readonly label: string; readonly tags: readonly string[] }[] = [
  { id: 'all', label: 'ALL', tags: [] },
  { id: 'training', label: 'TRAINING', tags: ['Workload', 'Development'] },
  { id: 'contract', label: 'CONTRACT', tags: ['Contract'] },
  { id: 'medical', label: 'MEDICAL', tags: ['Availability', 'Medical'] },
  { id: 'role', label: 'ROLE', tags: ['Morale', 'Role'] },
  { id: 'scouting', label: 'SCOUTING', tags: ['Scouting'] },
]

/** Circular tone mark. The reference uses a glyph per severity rather than a coloured block. */
const TONE_GLYPH: Record<OverviewObservationModel['tone'], string> = {
  positive: '↑',
  neutral: 'i',
  warning: '−',
}

const ALERT_GLYPH: Record<OverviewAlertModel['severity'], string> = {
  critical: '!',
  warning: '−',
  info: 'i',
}

/* ── Row 1 ── */

export function OverviewIdentityModule({ overview }: { readonly overview: PlayerOverviewModel }) {
  const identity = overview.identityModule
  const rosterRank =
    identity.rosterRank.value === undefined
      ? identity.rosterRank.label
      : `#${identity.rosterRank.value} of ${identity.rosterSize} by rating`

  return (
    <section className="po-ov-panel po-ov-identity" data-ng-region="overview-identity">
      <header className="po-ov-panel__head">
        <span className="po-ov-panel__title">Player identity</span>
        <span className="po-ov-panel__meta">{identity.archetypeTitle}</span>
      </header>

      <div className="po-ov-identity__archetype">
        <span aria-hidden className="po-ov-identity__badge">
          ★
        </span>
        <span className="po-ov-identity__archetype-text">
          <span className="po-ov-identity__archetype-title">{identity.archetypeTitle}</span>
          <span className="po-ov-identity__archetype-role">{identity.roleTitle}</span>
        </span>
      </div>

      <ul className="po-ov-identity__tags">
        {identity.chips.map((chip) => (
          <li className="po-ov-tag" key={chip.id}>
            <span className="po-ov-tag__label">{chip.label}</span>
            <span className="po-ov-tag__value ng-type-numeric">{chip.value}</span>
          </li>
        ))}
      </ul>

      <p className="po-ov-identity__description">{identity.description}</p>

      <dl className="po-ov-identity__facts">
        <div>
          <dt>Squad role</dt>
          <dd className={identity.squadRole.value === undefined ? 'is-unavailable' : undefined}>
            {identity.squadRole.value ?? identity.squadRole.label}
          </dd>
        </div>
        <div>
          <dt>Hierarchy</dt>
          <dd className={identity.rosterRank.value === undefined ? 'is-unavailable' : undefined}>
            {rosterRank}
          </dd>
        </div>
        <div>
          <dt>Usage</dt>
          <dd className={identity.usage.value === undefined ? 'is-unavailable' : undefined}>
            {identity.usage.value ?? identity.usage.label}
          </dd>
        </div>
      </dl>

      <GapList gaps={identity.gaps} />
    </section>
  )
}

export function OverviewSeasonSnapshot({ overview }: { readonly overview: PlayerOverviewModel }) {
  const { season } = overview
  // The reference highlights VAL, and it is the first cell the eye lands on.
  const [selectedStat, setSelectedStat] = useState('val')
  const selected =
    season.trends.find((trend) => trend.id === selectedStat) ??
    season.trends.find((trend) => trend.id === 'pts') ??
    season.trends[0]
  // USG%, AST% and TOV% are declared gaps: the efficiency band states them once, next to the rest.
  const declaredSecondary = season.secondary
  const missingSecondary = season.gaps.filter((gap) => gap.id === 'usage')
  const selectable = new Set(season.trends.map((trend) => trend.id))

  return (
    <section className="po-ov-panel po-ov-season" data-ng-region="overview-season">
      <header className="po-ov-panel__head">
        <span className="po-ov-panel__title">Season snapshot</span>
        <span className="po-ov-season__meta">
          <span>{season.seasonLabel ?? '—'}</span>
          <span>{season.competitionLabel ?? 'Competition not tracked'}</span>
          <span className="po-ov-season__games ng-type-numeric">
            {season.status === 'available' ? `${season.gamesPlayed} GAMES` : 'NO GAMES'}
          </span>
        </span>
      </header>

      {season.status === 'unavailable' ? (
        <p className="po-ov-empty">{season.trendNote}</p>
      ) : (
        <>
          <div className="po-ov-season__headline">
            {season.headline.map((stat) => (
              <SeasonStatCell
                digits={1}
                isSelectable={selectable.has(stat.id)}
                isSelected={selected?.id === stat.id}
                key={stat.id}
                label={stat.label}
                onSelect={() => setSelectedStat(stat.id)}
                tone={stat.id === 'val' ? 'accent' : 'primary'}
                value={stat.value}
              />
            ))}
          </div>

          <div className="po-ov-season__secondary">
            {declaredSecondary.map((stat) => (
              <SeasonStatCell
                digits={1}
                isSelectable={selectable.has(stat.id)}
                isSelected={selected?.id === stat.id}
                key={stat.id}
                label={stat.label}
                onSelect={() => setSelectedStat(stat.id)}
                tone="secondary"
                value={stat.value}
              />
            ))}
            {missingSecondary.map((gap) => (
              <span className="po-ov-stat is-unavailable" key={gap.id} title={gap.reason}>
                <span className="po-ov-stat__label">{gap.label}</span>
                <span className="po-ov-stat__value ng-type-numeric">—</span>
              </span>
            ))}
          </div>

          <div className="po-ov-season__trend">
            <div className="po-ov-season__trend-head">
              <span className="po-ov-season__trend-title">
                Season trend ({selected?.label ?? 'VAL'})
              </span>
              {selected?.average !== null && selected !== undefined && (
                <span className="po-ov-season__trend-average ng-type-numeric">
                  Season Avg: {selected.average.toFixed(selected.digits)}
                </span>
              )}
            </div>
            <Sparkline
              average={selected?.average ?? null}
              digits={selected?.digits ?? 1}
              label={`${selected?.label ?? 'VAL'} per game · ${season.trendNote}`}
              labels={season.trendLabels}
              points={selected?.points ?? []}
            />
          </div>
        </>
      )}
    </section>
  )
}

/**
 * One stat cell. The design reads as a plain figure, so only selectable cells become buttons: they
 * re-plot the trend chart and never shift the layout.
 */
function SeasonStatCell({
  digits,
  isSelectable,
  isSelected,
  label,
  onSelect,
  tone,
  value,
}: {
  readonly digits: number
  readonly isSelectable: boolean
  readonly isSelected: boolean
  readonly label: string
  readonly onSelect: () => void
  readonly tone: 'primary' | 'accent' | 'secondary'
  readonly value: string
}) {
  const className = `po-ov-season__cell is-${tone}${isSelected ? ' is-selected' : ''}`
  const content = (
    <>
      <span className={tone === 'secondary' ? 'po-ov-stat__value ng-type-numeric' : 'po-ov-season__value ng-type-numeric'}>
        {value}
      </span>
      <span className={tone === 'secondary' ? 'po-ov-stat__label' : 'po-ov-season__label'}>
        {label}
      </span>
    </>
  )

  if (!isSelectable) {
    return <span className={`${className} is-static`}>{content}</span>
  }

  return (
    <button
      aria-pressed={isSelected}
      className={className}
      onClick={onSelect}
      title={`Plot ${label} per game`}
      type="button"
    >
      {content}
    </button>
  )
}

export function OverviewRecentForm({ overview }: { readonly overview: PlayerOverviewModel }) {
  const { recentForm } = overview
  const games = [...recentForm.games].reverse()
  const emptySlots = Math.max(0, recentForm.slots - games.length)
  const average =
    recentForm.seasonAveragePoints === null ? null : recentForm.seasonAveragePoints.toFixed(1)

  return (
    <section className="po-ov-panel po-ov-form" data-ng-region="overview-form">
      <header className="po-ov-panel__head">
        <span className="po-ov-panel__title">Recent form</span>
        <span className="po-ov-panel__meta">{recentForm.windowLabel}</span>
      </header>

      {recentForm.status === 'unavailable' ? (
        <p className="po-ov-empty">{recentForm.averageLabel}</p>
      ) : (
        <div className="po-ov-form__plot">
          <ul className="po-ov-form__slots">
            {games.map((game, index) => (
              <li
                className={`po-ov-form__game${index === 0 ? ' is-first' : ''}${index === games.length + emptySlots - 1 ? ' is-last' : ''}`}
                key={game.id}
                tabIndex={0}
              >
                <span className="po-ov-form__points ng-type-numeric">{game.points}</span>
                <span
                  className={`po-ov-form__bar is-${game.tone}`}
                  style={{ height: `${Math.max(4, game.height)}%` }}
                />
                <span className="po-ov-form__opponent">vs {game.opponent}</span>
                <span className="po-ov-form__date">{game.dateLabel ?? '—'}</span>
                {/* The full box score of the game, shown while the slot is hovered or focused. */}
                <div className="po-ov-form__card" role="tooltip">
                  <div className="po-ov-form__card-head">
                    <span className="po-ov-form__card-title">vs {game.opponent}</span>
                    <span className="po-ov-form__card-date">{game.dateLabel ?? '—'}</span>
                  </div>
                  <dl className="po-ov-form__card-stats">
                    {game.figures.map((figure) => (
                      <div key={figure.id}>
                        <dt>{figure.label}</dt>
                        <dd className="ng-type-numeric">{figure.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </li>
            ))}
            {Array.from({ length: emptySlots }, (_value, index) => (
              <li className="po-ov-form__game is-empty" key={`empty-${index}`}>
                <span className="po-ov-form__points ng-type-numeric">-</span>
                <span className="po-ov-form__bar is-empty" />
                <span className="po-ov-form__opponent">-</span>
                <span className="po-ov-form__date"> </span>
              </li>
            ))}
          </ul>
          {average !== null && (
            <span className="po-ov-form__average ng-type-numeric">
              Season Avg {average}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

/* ── Row 2 ── */

export function OverviewObservations({ overview }: { readonly overview: PlayerOverviewModel }) {
  return (
    <section className="po-ov-panel po-ov-intel" data-ng-region="overview-intel">
      <header className="po-ov-panel__head">
        <span className="po-ov-panel__title">Coach intelligence</span>
        <span className="po-ov-panel__meta">
          {overview.observations.length} {overview.observations.length === 1 ? 'reading' : 'readings'}
        </span>
      </header>

      {overview.observations.length === 0 ? (
        <p className="po-ov-empty">{overview.observationsNote}</p>
      ) : (
        <>
          <ul className="po-ov-intel__list">
            {overview.observations.map((observation) => (
              <li className={`po-ov-intel__row is-${observation.tone}`} key={observation.id}>
                <span aria-hidden className="po-ov-intel__glyph">
                  {TONE_GLYPH[observation.tone]}
                </span>
                <span className="po-ov-intel__text">
                  <span className="po-ov-intel__label">{observation.label}</span>
                  <span className="po-ov-intel__detail">{observation.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <span className="po-ov-note">{overview.observationsNote}</span>
        </>
      )}
    </section>
  )
}

export function OverviewDevelopmentPulse({ overview }: { readonly overview: PlayerOverviewModel }) {
  const pulse = overview.developmentPulse

  return (
    <section className="po-ov-panel po-ov-dev" data-ng-region="overview-development">
      <header className="po-ov-panel__head">
        <span className="po-ov-panel__title">Development pulse</span>
        <span className="po-ov-dev__trend">
          Current trend
          <span className="po-ov-dev__trend-value ng-type-numeric">{pulse.trendLabel}</span>
          <span className="po-ov-note">base trend</span>
        </span>
      </header>

      <dl className="po-ov-dev__facts">
        <div>
          <dt>Stage</dt>
          <dd>
            {pulse.stageLabel} <span className="po-ov-note">(Age {pulse.ageLabel})</span>
          </dd>
        </div>
        <div>
          <dt>Training focus</dt>
          <dd className={pulse.trainingLabel.value === undefined ? 'is-unavailable' : undefined}>
            {pulse.trainingLabel.value ?? pulse.trainingLabel.label}
          </dd>
        </div>
        <div className="is-quiet">
          <dt>Potential</dt>
          <dd className={pulse.potentialStatus === 'available' ? undefined : 'is-unavailable'}>
            {pulse.potentialLabel}
          </dd>
        </div>
      </dl>

      <div className="po-ov-dev__evolution">
        <div className="po-ov-dev__evolution-head">
          <span className="po-ov-dev__evolution-title">Rating evolution (Selected)</span>
          <span className="po-ov-note">{pulse.moversNote}</span>
        </div>
        <RatingEvolution seasonLabels={pulse.seasonLabels} series={pulse.series} />
      </div>
    </section>
  )
}

export function OverviewContractMedicalPulse({
  overview,
  readiness,
  onOpenPage,
}: {
  readonly overview: PlayerOverviewModel
  readonly readiness: readonly MedicalReadinessMeterModel[]
  readonly onOpenPage: (view: PlayerWorkspaceViewId) => void
}) {
  const { contractPulse, medicalPulse } = overview
  const status = overview.medicalPulse.availabilityLabel

  return (
    <section className="po-ov-panel po-ov-pulse" data-ng-region="overview-pulse">
      <header className="po-ov-panel__head">
        <span className="po-ov-panel__title">Contract &amp; medical pulse</span>
        <span className="po-ov-panel__meta">{contractPulse.teamName ?? 'No club'}</span>
      </header>

      <div className="po-ov-pulse__halves">
        <div className="po-ov-pulse__half">
          <div className="po-ov-pulse__half-head">
            <span aria-hidden className="po-ov-pulse__icon is-contract">
              ▤
            </span>
            <span className="po-ov-pulse__half-title">Contract</span>
          </div>
          {contractPulse.status === 'available' ? (
            <dl className="po-ov-pulse__facts">
              <div>
                <dt>Annual salary</dt>
                <dd className="ng-type-numeric">{contractPulse.salaryLabel ?? 'Not tracked'}</dd>
              </div>
              <div>
                <dt>Seasons remaining</dt>
                <dd>{contractPulse.remainingLabel ?? '—'}</dd>
              </div>
              <div>
                <dt>Expiry date</dt>
                <dd className="ng-type-numeric">{contractPulse.endDateLabel ?? '—'}</dd>
              </div>
            </dl>
          ) : (
            <p className="po-ov-empty">
              {contractPulse.message ?? 'No contract recorded for this player.'}
            </p>
          )}
          <button className="po-ov-cta" onClick={() => onOpenPage('contract')} type="button">
            View contract →
          </button>
        </div>

        <div className="po-ov-pulse__half">
          <div className="po-ov-pulse__half-head">
            <span aria-hidden className="po-ov-pulse__icon is-medical">
              ✚
            </span>
            <span className="po-ov-pulse__half-title">Medical / availability</span>
          </div>
          <dl className="po-ov-pulse__facts">
            <div>
              <dt>Status</dt>
              <dd className={medicalPulse.availabilityLabel === 'Available' ? 'is-positive' : 'is-warning'}>
                {status}
              </dd>
            </div>
            {readiness.map((meter) => (
              <div key={meter.id}>
                <dt>{meter.label}</dt>
                <dd className={meter.fill === null ? 'is-unavailable' : undefined}>
                  {meter.valueLabel}
                </dd>
              </div>
            ))}
          </dl>
          {medicalPulse.priorityDetail !== null && (
            <p className="po-ov-pulse__priority">{medicalPulse.priorityDetail}</p>
          )}
          <button className="po-ov-cta" onClick={() => onOpenPage('medical')} type="button">
            View medical →
          </button>
        </div>
      </div>
    </section>
  )
}

/* ── Row 3 ── */

export function OverviewAlerts({
  onOpenPage,
  overview,
}: {
  readonly overview: PlayerOverviewModel
  readonly onOpenPage: (view: PlayerWorkspaceViewId) => void
}) {
  const [filter, setFilter] = useState('all')
  const active = ALERT_FILTERS.find((candidate) => candidate.id === filter) ?? ALERT_FILTERS[0]!
  const visible =
    active.tags.length === 0
      ? overview.alerts
      : overview.alerts.filter((alert) => active.tags.includes(alert.tag))

  return (
    <section className="po-ov-panel po-ov-alerts" data-ng-region="overview-alerts">
      <header className="po-ov-panel__head">
        <span className="po-ov-panel__title">Alerts &amp; decisions</span>
        <span className="po-ov-filters">
          {ALERT_FILTERS.map((candidate) => (
            <button
              aria-pressed={candidate.id === filter}
              className={`po-ov-filter${candidate.id === filter ? ' is-active' : ''}`}
              key={candidate.id}
              onClick={() => setFilter(candidate.id)}
              type="button"
            >
              {candidate.label}
            </button>
          ))}
        </span>
      </header>

      {visible.length === 0 ? (
        <p className="po-ov-empty">No decision in this category.</p>
      ) : (
        <ul className="po-ov-alerts__list">
          {visible.map((alert) => (
            <li className={`po-ov-alerts__row is-${alert.severity}`} key={alert.id}>
              <span aria-hidden className="po-ov-alerts__glyph">
                {ALERT_GLYPH[alert.severity]}
              </span>
              <span className="po-ov-alerts__text">
                <span className="po-ov-alerts__label">{alert.label}</span>
                <span className="po-ov-alerts__detail">{alert.detail}</span>
              </span>
              <span className="po-ov-alerts__date ng-type-numeric">{alert.dateLabel}</span>
              {alert.action === null ? (
                <span aria-hidden className="po-ov-alerts__action-slot" />
              ) : (
                <button
                  className="po-ov-action"
                  onClick={() => onOpenPage(alert.action!.view)}
                  type="button"
                >
                  {alert.action.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function OverviewTimeline({
  onOpenPage,
  overview,
}: {
  readonly overview: PlayerOverviewModel
  readonly onOpenPage: (view: PlayerWorkspaceViewId) => void
}) {
  return (
    <section className="po-ov-panel po-ov-timeline" data-ng-region="overview-timeline">
      <header className="po-ov-panel__head">
        <span className="po-ov-panel__title">Player timeline</span>
        <button className="po-ov-cta is-inline" onClick={() => onOpenPage('history')} type="button">
          View full history →
        </button>
      </header>

      {overview.timeline.length === 0 ? (
        <p className="po-ov-empty">No milestone recorded yet.</p>
      ) : (
        <ol className="po-ov-timeline__track">
          {overview.timeline.map((node) => (
            <li className={`po-ov-timeline__node is-${node.state}`} key={node.id}>
              <span className="po-ov-timeline__date ng-type-numeric">{node.dateLabel ?? '—'}</span>
              <span aria-hidden className="po-ov-timeline__dot" />
              <span className="po-ov-timeline__label">{node.label}</span>
              <span className="po-ov-timeline__detail">{node.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/* ── Shared blocks ── */

/** Season-by-season curves, one line per rating, with the recorded movement as the legend. */
function RatingEvolution({
  seasonLabels,
  series,
}: {
  readonly seasonLabels: readonly string[]
  readonly series: readonly OverviewRatingSeriesModel[]
}) {
  const usable = series.filter((entry) => entry.points.length > 0)
  if (usable.length === 0) {
    return <p className="po-ov-empty">No rating transition recorded yet, so there is no curve to draw.</p>
  }

  const all = usable.flatMap((entry) => entry.points)
  const max = Math.max(...all)
  const min = Math.min(...all)
  const span = max - min || 1
  const width = 100
  const height = 46
  const steps = Math.max(...usable.map((entry) => entry.points.length))

  return (
    <div className="po-ov-ratings">
      <div className="po-ov-ratings__plot">
        <svg
          aria-label={`Rating evolution: ${usable.map((entry) => entry.label).join(', ')}`}
          className="po-ov-ratings__svg"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          {[0, 0.5, 1].map((ratio) => (
            <line
              className="po-ov-ratings__grid"
              key={ratio}
              vectorEffect="non-scaling-stroke"
              x1={0}
              x2={width}
              y1={ratio * height}
              y2={ratio * height}
            />
          ))}
          {usable.map((entry, index) => {
            if (entry.points.length < 2) return null
            const path = entry.points
              .map((value, position) => {
                const x = (position / (entry.points.length - 1)) * width
                const y = height - ((value - min) / span) * (height - 6) - 3
                return `${x.toFixed(2)},${y.toFixed(2)}`
              })
              .join(' ')
            return (
              <polyline
                className={`po-ov-ratings__line is-series-${index}`}
                key={entry.id}
                points={path}
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>
        {usable.map((entry, index) =>
          entry.points.map((value, position) => {
            const x = entry.points.length < 2 ? 0 : (position / (entry.points.length - 1)) * 100
            const y = 100 - (((value - min) / span) * (height - 6) + 3) * (100 / height)
            return (
              <span
                className={`po-ov-ratings__dot is-series-${index}`}
                key={`${entry.id}-${position}`}
                style={{ left: `${x}%`, top: `${y}%` }}
              />
            )
          }),
        )}
      </div>

      <div className="po-ov-ratings__body">
        <ul className="po-ov-ratings__legend">
          {usable.map((entry, index) => (
            <li className={`po-ov-ratings__item is-series-${index}`} key={entry.id}>
              <span aria-hidden className="po-ov-ratings__swatch" />
              <span className="po-ov-ratings__name">{entry.label}</span>
              <span className="po-ov-ratings__value ng-type-numeric">
                {entry.points[entry.points.length - 1]}
              </span>
              <span className="po-ov-ratings__delta ng-type-numeric">
                ({entry.delta >= 0 ? '+' : ''}
                {entry.delta})
              </span>
            </li>
          ))}
        </ul>
        <ul className="po-ov-ratings__axis">
          {seasonLabels.slice(0, steps).map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/**
 * Axis-free trend reading for the selected stat. The line is SVG, but the markers are HTML
 * elements: the plot uses `preserveAspectRatio="none"`, which would stretch an SVG circle into an
 * ellipse. A game with no value for the stat leaves a gap in the line, never a zero.
 */
function Sparkline({
  average = null,
  digits,
  label,
  labels,
  points,
}: {
  readonly average?: number | null
  readonly digits: number
  readonly label: string
  readonly labels: readonly string[]
  readonly points: readonly (number | null)[]
  readonly averageLabelPrefix?: string
}) {
  const known = points
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => entry.value !== null)
  if (known.length === 0) return null

  const values = known.map((entry) => entry.value)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const flat = max === min
  const span = max - min || 1
  const width = 100
  const height = 30
  const yFor = (value: number): number =>
    flat ? height / 2 : height - ((value - min) / span) * (height - 4) - 2
  const xFor = (index: number): number =>
    points.length < 2 ? 0 : (index / (points.length - 1)) * width
  const coords = known.map((entry) => ({ x: xFor(entry.index), y: yFor(entry.value) }))
  const line = coords.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
  const markers = coords.length > 12 ? [coords[coords.length - 1]!] : coords
  const averageY = average === null ? null : Math.max(0, Math.min(height, yFor(average)))

  return (
    <div className="po-ov-spark">
      <svg
        aria-label={label}
        className="po-ov-spark__svg"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 0.5, 1].map((ratio) => (
          <line
            className="po-ov-spark__grid"
            key={ratio}
            vectorEffect="non-scaling-stroke"
            x1={0}
            x2={width}
            y1={ratio * height}
            y2={ratio * height}
          />
        ))}
        {coords.length > 1 && (
          <polyline className="po-ov-spark__line" points={line} vectorEffect="non-scaling-stroke" />
        )}
        {averageY !== null && (
          <line
            className="po-ov-spark__average"
            vectorEffect="non-scaling-stroke"
            x1={0}
            x2={width}
            y1={averageY}
            y2={averageY}
          />
        )}
      </svg>
      {markers.map((point, index) => (
        <span
          className={index === markers.length - 1 ? 'po-ov-spark__dot is-last' : 'po-ov-spark__dot'}
          key={`${point.x}-${point.y}-${index}`}
          style={{ left: `${(point.x / width) * 100}%`, top: `${(point.y / height) * 100}%` }}
        />
      ))}
      <ul className="po-ov-spark__axis">
        {labels.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
      <span className="po-ov-spark__scale ng-type-numeric" aria-hidden>
        {min.toFixed(digits)}–{max.toFixed(digits)}
      </span>
    </div>
  )
}
