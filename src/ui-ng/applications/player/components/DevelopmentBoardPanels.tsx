import type {
  DevelopmentCategoryCurveModel,
  DevelopmentCategoryRowModel,
  DevelopmentDetailModel,
  DevelopmentDriverRowModel,
  DevelopmentEventRowModel,
  DevelopmentMarkerModel,
  DevelopmentMoverRowModel,
  DevelopmentOverviewModel,
  DevelopmentProjectionModel,
  DevelopmentTrainingEffectModel,
  DevelopmentTrainingPlanModel,
  DevelopmentLifecycleModel,
} from '@/ui-ng/applications/player/data/buildPlayerDevelopmentModel'
import type { RatingCategory } from '@/ui-ng/applications/player/data/ratingCatalog'

/** Series colours of the reference, keyed by category so the curve, dots and tables always agree. */
export const CATEGORY_TONE: Record<RatingCategory, string> = {
  shooting: 'shooting',
  finishing: 'finishing',
  ballHandling: 'handling',
  playmaking: 'playmaking',
  offBall: 'offball',
  defense: 'defense',
  physical: 'physical',
  mental: 'mental',
}

/* ── Band 1 ── */

export function DevelopmentOverviewPanel({
  insight,
  overview,
}: {
  readonly insight: string
  readonly overview: DevelopmentOverviewModel
}) {
  return (
    <section className="po-dev-panel po-dev-overview" data-ng-region="development-overview">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Development overview</span>
      </header>
      <div className="po-dev-overview__grid">
        <div className="po-dev-overview__cell">
          <span className="po-dev-stat__label">Age</span>
          <span className="po-dev-overview__value ng-type-numeric">{overview.ageLabel}</span>
        </div>
        <div className="po-dev-overview__cell">
          <span className="po-dev-stat__label">Career stage</span>
          <span className="po-dev-overview__value">{overview.careerStageLabel}</span>
        </div>
        <div className="po-dev-overview__cell">
          <span className="po-dev-stat__label">Current trend</span>
          <span className={`po-dev-overview__value is-${overview.trendTone} ng-type-numeric`}>
            {overview.trendTone === 'positive' ? '↑ ' : overview.trendTone === 'negative' ? '↓ ' : ''}
            {overview.trendLabel}
          </span>
          <span className="po-dev-stat__note">{overview.trendNote}</span>
        </div>
        <div className="po-dev-overview__cell">
          <span className="po-dev-stat__label">Next evaluation</span>
          <span className="po-dev-overview__value ng-type-numeric">{overview.nextEvaluationLabel}</span>
          <span className="po-dev-stat__note">{overview.nextEvaluationNote}</span>
        </div>
      </div>
      <p className="po-dev-insight">
        {insight}
      </p>
    </section>
  )
}

/* ── Band 2 ── */

/**
 * The career curve: one line per category over the recorded seasons, with the dated events hung on
 * the season column they belong to. Every point is a reconstructed index, never a drawn random.
 */
export function CareerCurvePanel({
  markers,
  seasons,
  series,
}: {
  readonly markers: readonly DevelopmentMarkerModel[]
  readonly seasons: readonly string[]
  readonly series: readonly DevelopmentCategoryCurveModel[]
}) {
  const usable = series.filter((entry) => entry.points.length > 1)
  const columns = usable.length === 0 ? 0 : Math.max(...usable.map((entry) => entry.points.length))
  const all = usable.flatMap((entry) => entry.points)
  const max = all.length === 0 ? 100 : Math.max(...all)
  const min = all.length === 0 ? 0 : Math.min(...all)
  const span = max - min || 1

  return (
    <section className="po-dev-panel po-dev-curve" data-ng-region="development-curve">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Career development curve</span>
        <span className="po-dev-panel__meta">Category index per season</span>
      </header>

      {usable.length === 0 ? (
        <p className="po-dev-empty">
          No season transition has been recorded yet, so there is no curve to draw.
        </p>
      ) : (
        <div className="po-dev-curve__body">
          <ul aria-hidden className="po-dev-curve__axis">
            {[max, Math.round(min + span * 0.66), Math.round(min + span * 0.33), min].map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>

          <div className="po-dev-curve__plot">
            <svg
              aria-label={`Category development across ${columns} recorded seasons`}
              className="po-dev-curve__svg"
              preserveAspectRatio="none"
              role="img"
              viewBox={`0 0 100 ${100}`}
            >
              {[0, 25, 50, 75, 100].map((y) => (
                <line
                  className="po-dev-curve__grid"
                  key={y}
                  vectorEffect="non-scaling-stroke"
                  x1={0}
                  x2={100}
                  y1={y}
                  y2={y}
                />
              ))}
              {usable.map((entry) => (
                <polyline
                  className={`po-dev-curve__line is-${CATEGORY_TONE[entry.id]}`}
                  key={entry.id}
                  points={entry.points
                    .map((value, index) => {
                      const x = entry.points.length < 2 ? 0 : (index / (entry.points.length - 1)) * 100
                      const y = 100 - ((value - min) / span) * 100
                      return `${x.toFixed(2)},${y.toFixed(2)}`
                    })
                    .join(' ')}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            <div className="po-dev-curve__markers">
              {markers.map((marker) => (
                <span
                  className={`po-dev-marker is-${marker.kind}`}
                  key={marker.id}
                  style={{
                    left: `${columns < 2 ? 0 : (Math.min(marker.columnIndex, columns - 1) / (columns - 1)) * 100}%`,
                  }}
                  title={`${marker.label} · ${marker.dateLabel} · ${marker.detail}`}
                >
                  <span aria-hidden className="po-dev-marker__icon">
                    {marker.kind === 'injury' ? '✚' : '◆'}
                  </span>
                  {marker.label}
                </span>
              ))}
            </div>

            <div className="po-dev-curve__columns">
              {Array.from({ length: columns }, (_value, index) => (
                <span key={index}>{seasons[index] ?? `S${index + 1}`}</span>
              ))}
            </div>
          </div>

          <ul className="po-dev-curve__legend">
            {usable.map((entry) => (
              <li className={`is-${CATEGORY_TONE[entry.id]}`} key={entry.id}>
                <span aria-hidden className="po-dev-curve__key" />
                <span className="po-dev-curve__name">{entry.label}</span>
                <span className="po-dev-curve__delta ng-type-numeric">
                  {entry.delta > 0 ? '+' : ''}
                  {entry.delta}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export function DevelopmentStagePanel({
  lifecycle,
}: {
  readonly lifecycle: DevelopmentLifecycleModel
}) {
  return (
    <section className="po-dev-panel po-dev-stage" data-ng-region="development-stage">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Development stage</span>
        <span className="po-dev-panel__meta">Player lifecycle</span>
      </header>

      <ol className="po-dev-stage__track">
        {lifecycle.stages.map((stage) => (
          <li className={stage.isCurrent ? 'is-current' : undefined} key={stage.id}>
            <span aria-hidden className="po-dev-stage__dot" />
            <span className="po-dev-stage__label">{stage.label}</span>
          </li>
        ))}
      </ol>

      <dl className="po-dev-stage__facts">
        <div>
          <dt>Current position</dt>
          <dd>{lifecycle.currentLabel}</dd>
        </div>
        <div>
          <dt>Development focus</dt>
          <dd>{lifecycle.focusLabel}</dd>
        </div>
        <div>
          <dt>Long term potential</dt>
          <dd className={lifecycle.potentialStatus === 'available' ? undefined : 'is-unavailable'}>
            {lifecycle.potentialLabel}
          </dd>
        </div>
      </dl>
    </section>
  )
}

export function DevelopmentDetailPanel({
  detail,
  onClose,
  selectedCategoryLabel,
}: {
  readonly detail: DevelopmentDetailModel
  readonly onClose: () => void
  readonly selectedCategoryLabel: string | null
}) {
  return (
    <section className="po-dev-panel po-dev-detail" data-ng-region="development-detail">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Development detail</span>
        <span className="po-dev-panel__meta">{selectedCategoryLabel ?? 'Whole profile'}</span>
      </header>

      <div className="po-dev-detail__title">
        <span aria-hidden className="po-dev-detail__icon">
          ◎
        </span>
        <span className="po-dev-detail__name">{detail.categoryLabel} development</span>
      </div>

      <div className="po-dev-detail__numbers">
        <div>
          <span className="po-dev-stat__label">Current rating</span>
          <span className="po-dev-detail__rating ng-type-numeric">{detail.current}</span>
        </div>
        <div>
          <span className="po-dev-stat__label">Trend (recorded)</span>
          <span
            className={`po-dev-detail__trend ng-type-numeric is-${detail.trend > 0 ? 'positive' : detail.trend < 0 ? 'negative' : 'neutral'}`}
          >
            {detail.trend > 0 ? '↑ ' : detail.trend < 0 ? '↓ ' : ''}
            {detail.trend > 0 ? '+' : ''}
            {detail.trend}
          </span>
        </div>
      </div>

      <div className="po-dev-detail__rate">
        <span className="po-dev-stat__label">Development rate</span>
        <span className={`po-dev-detail__rate-value is-${detail.rateTone}`}>{detail.rateLabel}</span>
        <span className="po-dev-stat__note">{detail.rateNote}</span>
      </div>

      <div className="po-dev-detail__lists">
        <div>
          <span className="po-dev-detail__list-title">Key improvements</span>
          {detail.improvements.length === 0 ? (
            <p className="po-dev-stat__note">No improvement recorded for this family yet.</p>
          ) : (
            <ul>
              {detail.improvements.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <span className="po-dev-detail__list-title">Areas to improve</span>
          <ul>
            {detail.toImprove.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      </div>

      <blockquote className="po-dev-detail__quote">{detail.coachNote}</blockquote>

      {selectedCategoryLabel !== null && (
        <button className="po-dev-detail__reset" onClick={onClose} type="button">
          Show whole profile
        </button>
      )}
    </section>
  )
}

/* ── Band 3 ── */

export function CategoryDevelopmentPanel({
  onSelectCategory,
  rows,
  selectedCategory,
}: {
  readonly onSelectCategory: (category: RatingCategory) => void
  readonly rows: readonly DevelopmentCategoryRowModel[]
  readonly selectedCategory: RatingCategory | null
}) {
  return (
    <section className="po-dev-panel po-dev-categories" data-ng-region="development-categories">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Category development</span>
        <span className="po-dev-panel__meta ng-type-numeric">{rows.length} families</span>
      </header>
      <div className="po-dev-categories__table">
        <div aria-hidden className="po-dev-categories__head">
          <span>Category</span>
          <span>Current</span>
          <span>Potential</span>
          <span>Trend</span>
        </div>
        {rows.map((row) => (
          <button
            className={`po-dev-categories__row is-${CATEGORY_TONE[row.id]}${
              row.id === selectedCategory ? ' is-selected' : ''
            }`}
            key={row.id}
            onClick={() => onSelectCategory(row.id)}
            title="Select this family for the detail panel"
            type="button"
          >
            <span className="po-dev-categories__label">
              <span aria-hidden className="po-dev-dot" />
              {row.categoryLabel}
            </span>
            <span className="po-dev-categories__current ng-type-numeric">{row.current}</span>
            <span className="po-dev-categories__potential ng-type-numeric">
              {row.potential ?? '—'}
            </span>
            <span
              className={`po-dev-categories__trend ng-type-numeric is-${row.trend > 0 ? 'positive' : row.trend < 0 ? 'negative' : 'neutral'}`}
            >
              {row.trend > 0 ? '↑' : row.trend < 0 ? '↓' : '–'} {row.trend > 0 ? '+' : ''}
              {row.trend}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function RatingMoversPanel({
  note,
  rows,
}: {
  readonly note: string
  readonly rows: readonly DevelopmentMoverRowModel[]
}) {
  return (
    <section className="po-dev-panel po-dev-movers" data-ng-region="development-movers">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Rating movers</span>
      </header>
      <span className="po-dev-stat__note">Biggest changes recorded</span>
      {rows.length === 0 ? (
        <p className="po-dev-stat__note">{note}</p>
      ) : (
        <ul className="po-dev-movers__list">
          {rows.map((row) => (
            <li key={row.id}>
              <span aria-hidden className="po-dev-dot" />
              <span className="po-dev-movers__label">{row.label}</span>
              <span className="po-dev-movers__delta ng-type-numeric">
                {row.delta > 0 ? '+' : ''}
                {row.delta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function TrainingPlanPanel({ plan }: { readonly plan: DevelopmentTrainingPlanModel }) {
  return (
    <section className="po-dev-panel po-dev-plan" data-ng-region="development-training-plan">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Training plan</span>
      </header>

      <div className="po-dev-plan__focus">
        <span aria-hidden className="po-dev-plan__icon">
          ◎
        </span>
        <span className="po-dev-plan__text">
          <span className="po-dev-stat__label">Current focus</span>
          <span className="po-dev-plan__label">{plan.focusLabel}</span>
          <span className="po-dev-stat__note">{plan.focusDetail}</span>
        </span>
      </div>

      <div className="po-dev-plan__focus">
        <span aria-hidden className="po-dev-plan__icon is-group">
          ▣
        </span>
        <span className="po-dev-plan__text">
          <span className="po-dev-stat__label">Secondary focus</span>
          <span className="po-dev-plan__label">{plan.secondaryLabel}</span>
          <span className="po-dev-stat__note">{plan.secondaryDetail}</span>
        </span>
      </div>

      <div className="po-dev-plan__load">
        <span className="po-dev-stat__label">Training load</span>
        <span aria-hidden className={`po-dev-bar is-${plan.loadTone}`}>
          {plan.loadFill === null ? null : (
            <span className="po-dev-bar__fill" style={{ width: `${plan.loadFill}%` }} />
          )}
        </span>
        <span className={`po-dev-plan__load-value is-${plan.loadTone}`}>{plan.loadLabel}</span>
      </div>
    </section>
  )
}

export function TrainingEffectPanel({
  effect,
}: {
  readonly effect: DevelopmentTrainingEffectModel
}) {
  return (
    <section className="po-dev-panel po-dev-effect" data-ng-region="development-training-effect">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Training effect</span>
      </header>
      <span className="po-dev-stat__note">{effect.note}</span>
      {effect.rows.length === 0 ? (
        <p className="po-dev-stat__note">
          No training is assigned, so no impact can be estimated.
        </p>
      ) : (
        <ul className="po-dev-effect__list">
          {effect.rows.map((row) => (
            <li className={`is-${CATEGORY_TONE[row.id]}`} key={row.id}>
              <span aria-hidden className="po-dev-dot" />
              <span className="po-dev-effect__label">{row.label}</span>
              <span className="po-dev-effect__value ng-type-numeric">
                {row.impact > 0 ? '+' : ''}
                {row.impact.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="po-dev-effect__confidence">
        <span className="po-dev-stat__label">Confidence</span>
        <span aria-hidden className="po-dev-bar is-positive">
          {effect.confidenceFill === null ? null : (
            <span className="po-dev-bar__fill" style={{ width: `${effect.confidenceFill}%` }} />
          )}
        </span>
        <span className="po-dev-effect__confidence-value">{effect.confidenceLabel}</span>
      </div>
    </section>
  )
}

/* ── Band 4 ── */

export function DevelopmentDriversPanel({
  rows,
}: {
  readonly rows: readonly DevelopmentDriverRowModel[]
}) {
  const positive = rows.filter((row) => row.tone !== 'negative')
  const negative = rows.filter((row) => row.tone === 'negative')

  return (
    <section className="po-dev-panel po-dev-drivers" data-ng-region="development-drivers">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Development drivers</span>
      </header>
      <div className="po-dev-drivers__columns">
        <div>
          <span className="po-dev-drivers__title">Positive factors</span>
          <ul>
            {positive.map((row) => (
              <li className="is-positive" key={row.id} title={row.valueLabel}>
                <span aria-hidden className="po-dev-drivers__glyph">
                  +
                </span>
                <span className="po-dev-drivers__text">
                  {row.label}
                  <span className="po-dev-stat__note"> {row.valueLabel}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="po-dev-drivers__title">Negative factors</span>
          <ul>
            {negative.map((row) => (
              <li className="is-negative" key={row.id} title={row.valueLabel}>
                <span aria-hidden className="po-dev-drivers__glyph">
                  −
                </span>
                <span className="po-dev-drivers__text">
                  {row.label}
                  <span className="po-dev-stat__note"> {row.valueLabel}</span>
                </span>
              </li>
            ))}
          </ul>
          {negative.length === 0 && (
            <p className="po-dev-stat__note">No factor is currently working against development.</p>
          )}
        </div>
      </div>
    </section>
  )
}

export function DevelopmentEventsPanel({
  events,
}: {
  readonly events: readonly DevelopmentEventRowModel[]
}) {
  return (
    <section className="po-dev-panel po-dev-events" data-ng-region="development-events">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Development events</span>
        <span className="po-dev-panel__meta ng-type-numeric">{events.length} recorded</span>
      </header>
      {events.length === 0 ? (
        <p className="po-dev-empty">
          No injury or season transition has been recorded for this player yet.
        </p>
      ) : (
        <div className="po-dev-events__table">
          <div aria-hidden className="po-dev-events__head">
            <span>Date</span>
            <span>Event</span>
            <span>Impact</span>
            <span>Note</span>
          </div>
          {events.map((event) => (
            <div className="po-dev-events__row" key={event.id}>
              <span className="ng-type-numeric">{event.dateLabel}</span>
              <span className="po-dev-events__event">
                <span aria-hidden className={`po-dev-events__icon is-${event.kind}`}>
                  {event.kind === 'injury' ? '✚' : '◆'}
                </span>
                {event.label}
              </span>
              <span
                className={`po-dev-events__impact ng-type-numeric is-${(event.impact ?? 0) < 0 ? 'negative' : (event.impact ?? 0) > 0 ? 'positive' : 'neutral'}`}
              >
                {event.impact === null ? '—' : `${event.impact > 0 ? '+' : ''}${event.impact}`}
              </span>
              <span className="po-dev-events__note">{event.detail}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function ScoutingProjectionPanel({
  projection,
}: {
  readonly projection: DevelopmentProjectionModel
}) {
  return (
    <section className="po-dev-panel po-dev-projection" data-ng-region="development-projection">
      <header className="po-dev-panel__head">
        <span className="po-dev-panel__title">Scouting projection</span>
        <span className="po-dev-panel__meta">Based on current development trajectory</span>
      </header>
      {projection.status === 'unavailable' ? (
        <p className="po-dev-empty">{projection.note}</p>
      ) : (
        <ul className="po-dev-projection__bands">
          {projection.outcomes.map((outcome) => (
            <li className={outcome.id === 'expected' ? 'is-emphasis' : undefined} key={outcome.id}>
              <span className="po-dev-stat__label">{outcome.label}</span>
              <span className="po-dev-projection__domain">{outcome.domainLabel}</span>
              <span className="po-dev-projection__range ng-type-numeric">{outcome.rangeLabel}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="po-dev-stat__note">{projection.note}</p>
    </section>
  )
}
