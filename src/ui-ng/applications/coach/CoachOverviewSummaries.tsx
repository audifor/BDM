/*
 * Coach · Overview — the six summary modules of the second row.
 *
 * Each module is a preview of its tab and doubles as the navigation affordance into it. The card is
 * an <article> with a full-size transparent button on top: that keeps the markup valid (no flow
 * content nested inside a <button>) while still giving the whole surface a single hover/focus halo.
 */

import type { CoachOverviewModel, CoachOverviewSummary, CoachOverviewTone } from '@/ui-ng/applications/coach/coachOverviewMock'
import {
  CircularProgress,
  MiniBarChart,
  MiniLineChart,
  StepSparkline,
} from '@/ui-ng/applications/coach/CoachOverviewCharts'
import { OverviewGlyph } from '@/ui-ng/applications/coach/CoachOverviewGlyph'

const DELTA_GLYPH = {
  up: 'caretUp',
  down: 'caretDown',
  flat: 'caretFlat',
} as const

const DELTA_TONE: Record<'up' | 'down' | 'flat', CoachOverviewTone> = {
  up: 'positive',
  down: 'negative',
  flat: 'neutral',
}

/* Reading of a micro-chart, derived from the series it is already drawing: where the line starts and
   where it ends, or the axis the bars are measured against. Deliberately a single faint string on the
   caption line — no axes, no ticks, no grid — and derived here so `CoachOverviewCharts` stays dumb and
   the `CoachOverviewModel` contract does not change. */
function chartScale(chart: CoachOverviewSummary['chart']): string | undefined {
  if (chart.kind === 'line' || chart.kind === 'steps') {
    const first = chart.points[0]
    const last = chart.points[chart.points.length - 1]
    if (first === undefined || last === undefined) return undefined
    return `${first} → ${last}`
  }
  if (chart.kind === 'bars' && chart.columns.length > 0) {
    return `0 – ${Math.max(...chart.columns.map((column) => column.value), 0)}`
  }
  return undefined
}

function SummaryChart({ summary }: { readonly summary: CoachOverviewSummary }) {
  const { chart } = summary
  const scale = chartScale(chart)
  if (chart.kind === 'line') {
    return (
      <MiniLineChart
        caption={chart.caption}
        endLabel={chart.endLabel}
        label={`${summary.title} — ${chart.title}`}
        points={chart.points}
        scale={scale}
        title={chart.title}
      />
    )
  }
  if (chart.kind === 'bars') {
    return (
      <MiniBarChart
        columns={chart.columns}
        label={`${summary.title} — ${chart.title}`}
        scale={scale}
        title={chart.title}
      />
    )
  }
  if (chart.kind === 'steps') {
    return (
      <StepSparkline
        caption={chart.caption}
        label={`${summary.title} — ${chart.title}`}
        points={chart.points}
        scale={scale}
        title={chart.title}
      />
    )
  }
  if (chart.kind === 'ring') {
    return <CircularProgress caption={chart.caption} label={`${summary.title} — ${chart.title}`} value={chart.value} />
  }
  return (
    <figure className="co-chart co-chart--meters">
      <figcaption className="co-chart__head">
        <span className="co-chart__title">{chart.title}</span>
      </figcaption>
      <ul className="co-meters">
        {chart.rows.map((row) => (
          <li className="co-meter" key={row.id}>
            <span className="co-meter__label">{row.label}</span>
            <span className="co-meter__value">Lv.{row.level}</span>
            <span
              aria-label={`${row.label} level ${row.level} of ${row.max}`}
              className="co-meter__track"
              role="img"
            >
              {Array.from({ length: row.max }, (_, index) => (
                <span
                  className={`co-meter__segment${index < row.level ? ' is-on' : ''}`}
                  key={`${row.id}-${index}`}
                />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

function SummaryCard({
  onOpen,
  summary,
}: {
  readonly onOpen?: (tabId: string) => void
  readonly summary: CoachOverviewSummary
}) {
  return (
    <article className="co-card" data-summary={summary.id}>
      <header className="co-card__head">
        <span className="co-card__icon">
          <OverviewGlyph name={summary.icon} size={16} />
        </span>
        <span className="co-card__titles">
          <span className="co-card__title">{summary.title}</span>
          <span className="co-card__subtitle">{summary.subtitle}</span>
        </span>
        <OverviewGlyph className="co-card__chevron" name="chevronRight" size={14} />
      </header>

      {summary.metrics.length === 0 ? null : (
        <ul className="co-card__metrics">
          {summary.metrics.map((metric) => (
            <li className="co-card__metric" key={metric.id} title={metric.tooltip}>
              <span className="co-card__metric-label">{metric.label}</span>
              <span className="co-card__metric-value">
                <span className={metric.tone === undefined ? undefined : `co-tone-text--${metric.tone}`}>
                  {metric.value}
                </span>
                {metric.delta === undefined ? null : (
                  <OverviewGlyph
                    className={`co-card__delta co-tone-text--${DELTA_TONE[metric.delta]}`}
                    name={DELTA_GLYPH[metric.delta]}
                    size={9}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="co-card__chart">
        <SummaryChart summary={summary} />
      </div>

      {summary.banner === undefined ? null : (
        <p className="co-card__banner" title={summary.banner.tooltip}>
          <OverviewGlyph name="sparkle" size={12} />
          {summary.banner.text}
        </p>
      )}

      <footer className="co-card__footer">
        <span className="co-card__footer-label">{summary.footer}</span>
        <span aria-hidden className="co-card__footer-arrow">
          →
        </span>
      </footer>

      <button
        aria-label={`${summary.footer} — ${summary.title}`}
        className="co-card__hit"
        onClick={onOpen === undefined ? undefined : () => onOpen(summary.tabId)}
        type="button"
      />
    </article>
  )
}

export function CoachOverviewSummaries({
  model,
  onOpenTab,
}: {
  readonly model: CoachOverviewModel
  readonly onOpenTab?: (tabId: string) => void
}) {
  return (
    <div className="co-summaries">
      {model.summaries.map((summary) => (
        <SummaryCard key={summary.id} onOpen={onOpenTab} summary={summary} />
      ))}
    </div>
  )
}
