/*
 * Coach · Career — the factual / historical screen of the professional trajectory.
 *
 * Overview answers "who am I now"; Career answers "how did I get here and where is it going".
 * Everything that the domain already records is read from the runtime GameWorld: employment and
 * contract start, salary, board state, career history entries, tenures, achievements, reputation
 * events and honour values. The only invented values live in `COACH_CAREER_MOCK` below and are
 * labelled in the UI with a `MOCK` tag; there is no canonical source for them (see the file header
 * inside that object).
 *
 * The trajectory chart and the mini-glyphs are implemented locally on purpose: they must not depend
 * on the private `co-*` Overview variant, which is being reworked in parallel by another agent.
 */

import { useMemo, useState, type ReactNode } from 'react'

import { getJobSecurity, type BoardState, type JobSecurity } from '@/domain/board'
import type { CoachCareerHistoryEntry } from '@/domain/coachCareer'
import {
  COACH_REPUTATION_DEFAULT,
  COACH_REPUTATION_DIMENSIONS,
  getCoachReputationBand,
  type CoachReputationProfile,
} from '@/domain/coachReputation'
import type { CoachFinanceProfile } from '@/domain/coachFinances'
import { addYears, compareGameDates, type GameDate } from '@/domain/date'
import type { SeasonId, TeamId } from '@/domain/ids'
import type { CoachAchievement, CoachTenure } from '@/domain/legacy'
import type { GameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney, formatPrototypeDate } from '@/ui/formatters'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

import './coach-career.css'

/* ────────────────────────────────────────────────────────────────────────────
 * MOCK · everything in this object has no canonical source in the domain.
 * ────────────────────────────────────────────────────────────────────────────
 *
 *  · contract.yearsLeft / totalValueFallback / clauses — coaches have no contract entity. The only
 *    real employment facts are `CoachEmployment.startedOn` and `CoachFinanceProfile.annualSalary`.
 *  · levelSeries — the RPG profile stores `development.globalProgress` / `developmentPoints`, never
 *    a "level". The overview mock's `Lv 6` has no source either.
 *  · milestones.playoffSeries — there is no playoff bracket / series model in domain or engine.
 *  · milestones.contractReviewYears — targets a renewal that the domain does not model.
 *  · security.mediaPatience / longTermOutlook — no canonical patience or outlook scalar exists.
 *
 * Any value shown from here carries a visible MOCK tag in the UI.
 */
const COACH_CAREER_MOCK: {
  contract: {
    yearsLeft: number
    totalValueFallback: number
    clauses: readonly { readonly id: string; readonly label: string; readonly detail: string; readonly tone: Tone }[]
  }
  levelSeries: readonly number[]
  milestones: {
    playoffSeries: { readonly current: number; readonly target: number }
    conferenceFinal: { readonly current: number; readonly target: number }
    contractReviewYears: number
  }
  security: {
    mediaPatience: { readonly filled: number; readonly tone: Tone }
    longTermOutlook: { readonly filled: number; readonly tone: Tone }
  }
} = {
  contract: {
    yearsLeft: 2,
    totalValueFallback: 1_200_000,
    clauses: [
      { id: 'playoffs', label: 'Playoff bonus', detail: 'One month salary per round won', tone: 'gold' },
      { id: 'buyout', label: 'Buyout', detail: 'Six months salary', tone: 'neutral' },
      { id: 'extension', label: 'Extension option', detail: 'Club option for one extra season', tone: 'cyan' },
    ],
  },
  levelSeries: [3, 3, 4, 4, 5, 6],
  milestones: {
    playoffSeries: { current: 0, target: 1 },
    conferenceFinal: { current: 0, target: 1 },
    contractReviewYears: 3,
  },
  security: {
    mediaPatience: { filled: 3, tone: 'warning' },
    longTermOutlook: { filled: 4, tone: 'positive' },
  },
}

type Tone = 'cyan' | 'positive' | 'warning' | 'negative' | 'gold' | 'purple' | 'neutral'
type DataSource = 'real' | 'derived' | 'mock'
type MetricFormat = 'percent' | 'integer' | 'money'
type Impact = 'Positive' | 'Neutral' | 'Negative'

interface TrajectoryPoint {
  readonly date: GameDate
  readonly value: number
  readonly label: string
}

interface TrajectorySeries {
  readonly id: string
  readonly label: string
  readonly short: string
  readonly source: DataSource
  readonly tone: Tone
  readonly format: MetricFormat
  readonly points: readonly TrajectoryPoint[]
  readonly endLabel: string
  readonly caption: string
  readonly projection: boolean
}

interface CareerEventMarker {
  readonly id: string
  readonly date: GameDate
  readonly label: string
  readonly tone: Tone
}

interface CareerMilestone {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly progress: number
  readonly valueLabel: string
  readonly targetLabel: string
  readonly tone: Tone
  readonly source: DataSource
  readonly tabId?: string
}

interface CareerHistoryRow {
  readonly id: string
  readonly dateLabel: string
  readonly teamName: string
  readonly role: string
  readonly event: string
  readonly contractNote: string
  readonly impact: Impact
  readonly impactTone: Tone
}

interface CareerTenureRow {
  readonly id: string
  readonly teamName: string
  readonly period: string
  readonly role: string
  readonly duration: string
  readonly sharePct: number
  readonly seasons: number
  readonly honours: number
  readonly current: boolean
}

interface CareerSecurityRow {
  readonly id: string
  readonly label: string
  readonly filled: number
  readonly total: number
  readonly tone: Tone
  readonly status: string
  readonly source: DataSource
  readonly note: string
}

interface CareerTimelineEvent {
  readonly id: string
  readonly dateLabel: string
  readonly title: string
  readonly detail: string
  readonly tone: Tone
  readonly icon: string
}

interface CoachCareerModel {
  readonly coachName: string
  readonly currentDate: GameDate
  readonly club: string
  readonly role: string
  readonly employmentLabel: string
  readonly startedOn?: GameDate
  readonly yearsInPost?: number
  readonly seasonsInCharge: number
  readonly wins: number
  readonly losses: number
  readonly winPct?: number
  readonly annualSalary?: number
  readonly jobSecurity?: JobSecurity
  readonly developmentFocus?: number
  readonly boardAlignment?: number
  readonly boardExpectation?: string
  readonly reputation: number
  readonly reputationBand: string
  readonly contractExpiresOn: GameDate
  readonly contractTotalValue: number
  readonly trajectory: readonly TrajectorySeries[]
  readonly markers: readonly CareerEventMarker[]
  readonly milestones: readonly CareerMilestone[]
  readonly history: readonly CareerHistoryRow[]
  readonly tenures: readonly CareerTenureRow[]
  readonly security: readonly CareerSecurityRow[]
  readonly timeline: readonly CareerTimelineEvent[]
  readonly honours: {
    readonly championships: number
    readonly promotions: number
    readonly dynasties: number
    readonly legacyValue: number
    readonly legacyStatus: string
    readonly hallStatus: string
  }
}

export function CoachCareerScreen({
  world: worldProp,
  onOpenTab,
}: {
  readonly world?: GameWorld
  readonly onOpenTab?: (tabId: string) => void
}) {
  const storeWorld = useGameStore((state) => state.world)
  const world = worldProp ?? storeWorld
  const [metricId, setMetricId] = useState('winPct')

  const model = useMemo(() => (world === null || world === undefined ? null : buildCoachCareerModel(world)), [world])

  if (model === null) {
    return (
      <section className="ng-canon__panel ng-holo-panel cc-career cc-career--empty" data-section="career">
        <p className="ng-canon__empty">No career loaded.</p>
      </section>
    )
  }

  const series = model.trajectory.find((item) => item.id === metricId) ?? model.trajectory[0]
  const uniqueDates = new Set(model.history.map((row) => row.dateLabel))

  return (
    <div className="cc-career" data-section="career">
      <div className="cc-row cc-row--top">
        <PositionPanel model={model} onOpenTab={onOpenTab} />
        <TrajectoryPanel
          markerCount={model.markers.length}
          onSelectMetric={setMetricId}
          selectedId={series?.id ?? ''}
          series={series}
          seriesList={model.trajectory}
          markers={model.markers}
          currentDate={model.currentDate}
        />
        <MilestonesPanel model={model} onOpenTab={onOpenTab} />
      </div>

      <div className="cc-row cc-row--mid">
        <section className="ng-canon__panel ng-holo-panel cc-panel cc-panel--table" data-section="history">
          <PanelHead
            aside={<span className="cc-meta">{uniqueDates.size} dated entries</span>}
            icon="history"
            title="Career History"
          />
          {model.history.length === 0 ? (
            <p className="ng-canon__empty">No recorded career events yet.</p>
          ) : (
            <NgPrecisionTable
              className="ng-canon__table"
              columns={ngTableColumns(model.history, [
                ngCol('date', 'Date', (row) => row.dateLabel, { value: (row) => row.dateLabel, defaultWidth: 96 }),
                ngCol('team', 'Team', (row) => row.teamName, { value: (row) => row.teamName }),
                ngCol('role', 'Role', (row) => row.role, { value: (row) => row.role, defaultWidth: 86 }),
                ngCol('event', 'Event', (row) => row.event, { value: (row) => row.event }),
                ngCol('contract', 'Contract note', (row) => row.contractNote, {
                  value: (row) => row.contractNote,
                  defaultWidth: 116,
                }),
                ngCol(
                  'impact',
                  'Impact',
                  (row) => <span className={`cc-impact cc-tone-text--${row.impactTone}`}>{row.impact}</span>,
                  { value: (row) => row.impact, defaultWidth: 88 },
                ),
              ])}
              gridId="ng-coach-career-history"
              rows={model.history}
            />
          )}
        </section>

        <section className="ng-canon__panel ng-holo-panel cc-panel" data-section="tenures">
          <PanelHead
            aside={<span className="cc-meta">{model.tenures.length} spells</span>}
            icon="stack"
            title="Tenure Breakdown"
          />
          <div className="cc-panel__body cc-tenures">
            {model.tenures.length === 0 ? (
              <p className="ng-canon__empty">No tenures recorded. Your first spell starts here.</p>
            ) : (
              model.tenures.map((tenure) => (
                <div className={`cc-tenure${tenure.current ? ' is-current' : ''}`} key={tenure.id}>
                  <div className="cc-tenure__head">
                    <span className="cc-tenure__team">{tenure.teamName}</span>
                    <span className="cc-tenure__share">{tenure.sharePct}%</span>
                  </div>
                  <div className="cc-tenure__meta">
                    <span>{tenure.period}</span>
                    <span>{tenure.role}</span>
                    <span>{tenure.duration}</span>
                    <span>{tenure.seasons} seasons</span>
                    <span>{tenure.honours} honours</span>
                  </div>
                  <span className="cc-tenure__track" aria-hidden>
                    <span className="cc-tenure__fill" style={{ width: `${Math.max(3, tenure.sharePct)}%` }} />
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="ng-canon__panel ng-holo-panel cc-panel" data-section="security">
        <PanelHead
          aside={<span className="cc-meta">Segmented states, not raw numbers</span>}
          icon="shieldCheck"
          title="Contract & Security"
        />
        <div className="cc-panel__body cc-security">
          {model.security.map((row) => (
            <div className="cc-security__row" key={row.id} title={row.note}>
              <div className="cc-security__head">
                <span className="cc-security__label">{row.label}</span>
                {row.source === 'mock' ? <MockTag /> : <span className="cc-source cc-source--real">LIVE</span>}
              </div>
              <span className={`cc-security__status cc-tone-text--${row.tone}`} data-tone={row.tone}>
                {row.status}
              </span>
              <Segments filled={row.filled} label={row.label} tone={row.tone} total={row.total} />
              <p className="cc-security__note">{row.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ng-canon__panel ng-holo-panel cc-panel" data-section="timeline">
        <PanelHead
          aside={
            <span className="cc-meta">
              {model.honours.championships} titles · {model.honours.legacyStatus} · Hall{' '}
              {model.honours.hallStatus}
            </span>
          }
          icon="flag"
          title="Career Timeline"
        />
        <div className="cc-panel__body">
          {model.timeline.length === 0 ? (
            <p className="ng-canon__empty">The story starts with your first appointment.</p>
          ) : (
            <ol className="cc-strip">
              {model.timeline.map((event) => (
                <li className={`cc-strip__item cc-tone-edge--${event.tone}`} key={event.id}>
                  <span className={`cc-strip__icon cc-tone-text--${event.tone}`}>
                    <CareerGlyph name={event.icon} size={14} />
                  </span>
                  <span className="cc-strip__date">{event.dateLabel}</span>
                  <span className="cc-strip__title">{event.title}</span>
                  <span className="cc-strip__detail">{event.detail}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}

/* ── Panels ── */

function PositionPanel({
  model,
  onOpenTab,
}: {
  readonly model: CoachCareerModel
  readonly onOpenTab?: (tabId: string) => void
}) {
  return (
    <section className="ng-canon__panel ng-holo-panel cc-panel" data-section="position">
      <PanelHead
        aside={model.jobSecurity === undefined ? undefined : <SecurityChip security={model.jobSecurity} />}
        icon="briefcase"
        title="Current Position"
      />
      <div className="cc-panel__body cc-position">
        <div className="cc-position__hero">
          <span className="cc-hlabel">Club</span>
          <span className="cc-position__club">{model.club}</span>
          <span className="cc-position__role">{model.role}</span>
          <span className="cc-position__since">
            {model.startedOn === undefined
              ? model.employmentLabel
              : `${model.employmentLabel} since ${formatPrototypeDate(model.startedOn)}`}
          </span>
        </div>

        <dl className="cc-stats">
          <Stat label="Seasons in charge" value={String(model.seasonsInCharge)} />
          <Stat label="Years in post" value={model.yearsInPost === undefined ? '—' : `${model.yearsInPost}y`} />
          <Stat label="Career record" value={model.wins + model.losses === 0 ? '—' : `${model.wins}–${model.losses}`} />
          <Stat label="Career win %" value={formatWinPct(model.winPct)} tone="cyan" />
          <Stat
            label="Annual salary"
            value={model.annualSalary === undefined ? '—' : `$${formatMoney(model.annualSalary)}`}
            tone="gold"
          />
          <Stat
            label="Job security"
            value={model.jobSecurity === undefined ? '—' : securityLabel(model.jobSecurity)}
            tone={model.jobSecurity === undefined ? 'neutral' : jobSecurityTone(model.jobSecurity)}
          />
        </dl>

        <div className="cc-bars">
          <ValueBar
            label="Development focus"
            source="real"
            tone="cyan"
            value={model.developmentFocus}
          />
          <ValueBar label="Board alignment" source="real" tone="positive" value={model.boardAlignment} />
        </div>

        <div className="cc-contract">
          <div className="cc-contract__head">
            <span className="cc-block__title">Current contract</span>
            <MockTag />
          </div>
          <dl className="cc-contract__rows">
            <Stat
              label="Started"
              value={model.startedOn === undefined ? '—' : formatPrototypeDate(model.startedOn)}
            />
            <Stat label="Expires" value={formatPrototypeDate(model.contractExpiresOn)} tone="warning" />
            <Stat label="Total value" value={`$${formatMoney(model.contractTotalValue)}`} />
            <Stat
              label="Annual salary"
              value={model.annualSalary === undefined ? '—' : `$${formatMoney(model.annualSalary)}`}
              tone="gold"
            />
          </dl>
          <ul className="cc-clauses">
            {COACH_CAREER_MOCK.contract.clauses.map((clause) => (
              <li className="cc-clause" key={clause.id} title={clause.detail}>
                <span className={`cc-clause__label cc-tone-text--${clause.tone}`}>{clause.label}</span>
                <span className="cc-clause__detail">{clause.detail}</span>
              </li>
            ))}
          </ul>
          {model.boardExpectation === undefined ? null : (
            <p className="cc-contract__expectation">Board expectation: {model.boardExpectation}</p>
          )}
        </div>

        <div className="cc-position__actions">
          <NavButton label="View opportunities" onOpenTab={onOpenTab} tabId="opportunities" />
          <NavButton label="Open legacy" onOpenTab={onOpenTab} tabId="legacy" />
        </div>
      </div>
    </section>
  )
}

function TrajectoryPanel({
  currentDate,
  markerCount,
  markers,
  onSelectMetric,
  selectedId,
  series,
  seriesList,
}: {
  readonly currentDate: GameDate
  readonly markerCount: number
  readonly markers: readonly CareerEventMarker[]
  readonly onSelectMetric: (id: string) => void
  readonly selectedId: string
  readonly series: TrajectorySeries | undefined
  readonly seriesList: readonly TrajectorySeries[]
}) {
  return (
    <section className="ng-canon__panel ng-holo-panel cc-panel" data-section="trajectory">
      <PanelHead
        aside={
          <span className="cc-meta">
            {markerCount} recorded move{markerCount === 1 ? '' : 's'}
          </span>
        }
        icon="trendingUp"
        title="Career Trajectory"
      />
      <div className="cc-panel__body cc-trajectory">
        <div aria-label="Trajectory metric" className="cc-metrics" role="group">
          {seriesList.map((item) => (
            <button
              aria-pressed={item.id === selectedId}
              className={`cc-metric${item.id === selectedId ? ' is-active' : ''}`}
              key={item.id}
              onClick={() => onSelectMetric(item.id)}
              type="button"
            >
              {item.short}
              {item.source === 'mock' ? <span className="cc-metric__flag">MOCK</span> : null}
            </button>
          ))}
        </div>

        {series === undefined ? (
          <p className="ng-canon__empty">No trajectory metric available.</p>
        ) : (
          <>
            <div className="cc-trajectory__head">
              <span className="cc-trajectory__label">{series.label}</span>
              <span className={`cc-trajectory__value cc-tone-text--${series.tone}`}>{series.endLabel}</span>
            </div>
            <TrajectoryChart currentDate={currentDate} markers={markers} series={series} />
            <p className="cc-trajectory__caption">
              <SourceTag source={series.source} /> {series.caption}
            </p>
          </>
        )}
      </div>
    </section>
  )
}

function MilestonesPanel({
  model,
  onOpenTab,
}: {
  readonly model: CoachCareerModel
  readonly onOpenTab?: (tabId: string) => void
}) {
  return (
    <section className="ng-canon__panel ng-holo-panel cc-panel" data-section="milestones">
      <PanelHead
        aside={<span className="cc-meta">Closest first</span>}
        icon="target"
        title="Next Milestones"
      />
      <div className="cc-panel__body cc-milestones">
        <ul className="cc-milestone-list">
          {model.milestones.map((milestone, index) => (
            <li className={`cc-milestone${index === 0 ? ' is-next' : ''}`} key={milestone.id}>
              <div className="cc-milestone__head">
                <span className="cc-milestone__label">{milestone.label}</span>
                <span className="cc-milestone__values">
                  <span className={`cc-milestone__current cc-tone-text--${milestone.tone}`} data-tone={milestone.tone}>
                    {milestone.valueLabel}
                  </span>
                  <span className="cc-milestone__target">{milestone.targetLabel}</span>
                </span>
              </div>
              <Progress value={milestone.progress} tone={milestone.tone} />
              <div className="cc-milestone__foot">
                <p className="cc-milestone__detail">
                  {milestone.source === 'mock' ? <MockTag /> : null}
                  {milestone.detail}
                </p>
                {milestone.tabId === undefined ? null : (
                  <NavLink label="Open" onOpenTab={onOpenTab} tabId={milestone.tabId} />
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="cc-milestones__foot">
          <span className="cc-meta">
            {model.honours.dynasties} dynasties · {model.honours.promotions} promotions · legacy{' '}
            {model.honours.legacyValue}
          </span>
          <NavLink label="Open legacy" onOpenTab={onOpenTab} tabId="legacy" />
        </div>
      </div>
    </section>
  )
}

/* ── Chart ── */

function TrajectoryChart({
  currentDate,
  markers,
  series,
}: {
  readonly currentDate: GameDate
  readonly markers: readonly CareerEventMarker[]
  readonly series: TrajectorySeries
}) {
  const points = dedupeByDate(series.points)
  if (points.length === 0) {
    return (
      <p className="cc-chart__empty">
        No recorded {series.label.toLowerCase()} yet — {' '}
        {series.source === 'mock' ? 'the placeholder series is not plotted' : 'it appears once a season completes'}.
      </p>
    )
  }

  const projected = series.projection && series.source !== 'mock' && points.length >= 2
  const xCandidates = [...points.map((point) => dateToNumber(point.date)), ...markers.map((item) => dateToNumber(item.date))]
  const xMin = Math.min(...xCandidates)
  let xMax = Math.max(...points.map((point) => dateToNumber(point.date)))
  if (projected) xMax = Math.max(xMax, dateToNumber(addYears(currentDate, 1)))
  if (xMax <= xMin) xMax = xMin + 365 * 86_400_000

  const last = points[points.length - 1]!
  const previous = points[points.length - 2]
  const projectionDate = addYears(currentDate, 1)
  const projectionValue =
    projected && previous !== undefined
      ? last.value +
        (last.value - previous.value) *
          ((dateToNumber(projectionDate) - dateToNumber(last.date)) /
            Math.max(1, dateToNumber(last.date) - dateToNumber(previous.date)))
      : last.value

  const values = [...points.map((point) => point.value), ...(projected ? [projectionValue] : [])]
  let yMin = series.format === 'percent' ? 0 : Math.min(0, ...values)
  let yMax = series.format === 'percent' ? 1 : Math.max(1, ...values)
  if (yMax <= yMin) yMax = yMin + 1
  else if (series.format !== 'percent') {
    const padding = (yMax - yMin) * 0.15
    yMin = Math.max(0, yMin - padding)
    yMax += padding
  }

  const padY = 14
  const x = (date: number) => ((date - xMin) / (xMax - xMin)) * 100
  const y = (value: number) => {
    const ratio = clamp((value - yMin) / (yMax - yMin), 0, 1)
    return padY + (1 - ratio) * (100 - padY * 2)
  }

  const line = points.map((point) => `${x(dateToNumber(point.date)).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ')
  const visibleMarkers = markers
    .filter((marker) => dateToNumber(marker.date) >= xMin && dateToNumber(marker.date) <= xMax)
    .slice(-6)

  const minYear = new Date(xMin).getUTCFullYear()
  const maxYear = new Date(xMax).getUTCFullYear()
  const step = maxYear - minYear <= 5 ? 1 : Math.ceil((maxYear - minYear) / 4)
  const ticks: number[] = []
  for (let year = minYear; year <= maxYear; year += step) ticks.push(year)
  if (ticks[ticks.length - 1] !== maxYear) ticks.push(maxYear)

  const description = [
    `${series.label} trajectory: ${points.map((point) => `${point.label} ${formatMetricValue(point.value, series.format)}`).join(', ')}`,
    projected
      ? `Projection to ${formatPrototypeDate(projectionDate)}: ${formatMetricValue(projectionValue, series.format)}`
      : 'No projection',
  ].join('. ')

  return (
    <div className="cc-chart">
      <svg aria-label={description} className="cc-chart__svg" preserveAspectRatio="none" role="img" viewBox="0 0 100 100">
        <polygon
          className={`cc-chart__area cc-chart__area--${series.tone}`}
          points={`0,100 ${line} 100,100`}
        />
        <polyline
          className={`cc-chart__line cc-chart__line--${series.tone}`}
          points={line}
          vectorEffect="non-scaling-stroke"
        />
        {projected ? (
          <polyline
            className="cc-chart__projection"
            points={`${x(dateToNumber(last.date)).toFixed(2)},${y(last.value).toFixed(2)} 100,${y(projectionValue).toFixed(2)}`}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {ticks.map((year) => (
          <line
            className="cc-chart__tick"
            key={`tick-${year}`}
            vectorEffect="non-scaling-stroke"
            x1={x(dateToNumber(`${year}-01-01` as GameDate))}
            x2={x(dateToNumber(`${year}-01-01` as GameDate))}
            y1={0}
            y2={100}
          />
        ))}
      </svg>

      <div className="cc-chart__overlay" aria-hidden>
        {points.map((point, index) => (
          <span
            className={`cc-chart__dot${index === points.length - 1 ? ' is-last' : ''} cc-tone-bg--${series.tone}`}
            key={`${point.date}-${index}`}
            style={{ left: `${x(dateToNumber(point.date))}%`, top: `${y(point.value)}%` }}
          />
        ))}
        {projected ? (
          <span
            className="cc-chart__dot is-projected"
            style={{ left: '100%', top: `${y(projectionValue)}%` }}
          />
        ) : null}
        {visibleMarkers.map((marker, index) => (
          <span
            className={`cc-chart__marker cc-tone-text--${marker.tone}`}
            key={marker.id}
            style={{ left: `${x(dateToNumber(marker.date))}%` }}
          >
            <span className={`cc-chart__marker-label ${index % 2 === 0 ? 'is-top' : 'is-bottom'}`}>
              {marker.label}
            </span>
          </span>
        ))}
      </div>

      <div className="cc-chart__axis" aria-hidden>
        {ticks.map((year) => (
          <span
            className="cc-chart__axis-label"
            key={`axis-${year}`}
            style={{ left: `${x(dateToNumber(`${year}-01-01` as GameDate))}%` }}
          >
            {year}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Small pieces ── */

function PanelHead({
  aside,
  icon,
  title,
}: {
  readonly aside?: ReactNode
  readonly icon: string
  readonly title: string
}) {
  return (
    <header className="cc-panel__head">
      <h2 className="cc-panel__heading">
        <CareerGlyph className="cc-panel__icon" name={icon} size={14} />
        <span className="cc-panel__title">{title}</span>
      </h2>
      {aside === undefined ? null : <div className="cc-panel__aside">{aside}</div>}
    </header>
  )
}

function Stat({ label, tone, value }: { readonly label: string; readonly tone?: Tone; readonly value: string }) {
  return (
    <div className="cc-stat">
      <dt>{label}</dt>
      <dd className={tone === undefined ? undefined : `cc-tone-text--${tone}`}>{value}</dd>
    </div>
  )
}

function ValueBar({
  label,
  source,
  tone,
  value,
}: {
  readonly label: string
  readonly source: DataSource
  readonly tone: Tone
  readonly value: number | undefined
}) {
  return (
    <div className="cc-valuebar">
      <span className="cc-valuebar__label">
        {label}
        {source === 'mock' ? <MockTag /> : null}
      </span>
      <span className={`cc-valuebar__value cc-tone-text--${tone}`}>{value === undefined ? '—' : value}</span>
      <span className="cc-valuebar__track">
        <span
          className={`cc-valuebar__fill cc-tone-bg--${tone}`}
          style={{ width: `${value === undefined ? 0 : clamp(value, 0, 100)}%` }}
        />
      </span>
    </div>
  )
}

function Progress({ tone, value }: { readonly tone: Tone; readonly value: number }) {
  const percent = Math.round(clamp(value, 0, 1) * 100)
  return (
    <span aria-label={`Progress ${percent}%`} className="cc-progress" role="img">
      <span className={`cc-progress__fill cc-tone-bg--${tone}`} style={{ width: `${percent}%` }} />
    </span>
  )
}

function Segments({
  filled,
  label,
  tone,
  total,
}: {
  readonly filled: number
  readonly label: string
  readonly tone: Tone
  readonly total: number
}) {
  return (
    <span aria-label={`${label} ${filled} of ${total}`} className="cc-segments" role="img">
      {Array.from({ length: total }, (_, index) => (
        <span
          className={`cc-segments__block${index < filled ? ` is-on cc-tone-bg--${tone}` : ''}`}
          key={`${label}-${index}`}
        />
      ))}
    </span>
  )
}

function SecurityChip({ security }: { readonly security: JobSecurity }) {
  return (
    <span className={`cc-chip cc-tone-text--${jobSecurityTone(security)}`}>{securityLabel(security)}</span>
  )
}

function MockTag() {
  return (
    <span className="cc-tag cc-tag--mock" title="No canonical source in the domain — placeholder value">
      MOCK
    </span>
  )
}

function SourceTag({ source }: { readonly source: DataSource }) {
  const label = source === 'real' ? 'LIVE' : source === 'derived' ? 'DERIVED' : 'MOCK'
  return (
    <span className={`cc-source cc-source--${source}`} title={SOURCE_TITLES[source]}>
      {label}
    </span>
  )
}

function NavButton({
  label,
  onOpenTab,
  tabId,
}: {
  readonly label: string
  readonly onOpenTab?: (tabId: string) => void
  readonly tabId: string
}) {
  if (onOpenTab === undefined) return <span className="cc-nav is-inert">{label}</span>
  return (
    <button className="cc-nav" onClick={() => onOpenTab(tabId)} type="button">
      {label}
    </button>
  )
}

function NavLink({
  label,
  onOpenTab,
  tabId,
}: {
  readonly label: string
  readonly onOpenTab?: (tabId: string) => void
  readonly tabId: string
}) {
  if (onOpenTab === undefined) return <span className="cc-link is-inert">{label}</span>
  return (
    <button className="cc-link" onClick={() => onOpenTab(tabId)} type="button">
      {label}
    </button>
  )
}

const SOURCE_TITLES: Readonly<Record<DataSource, string>> = {
  real: 'Read directly from the canonical GameWorld',
  derived: 'Reconstructed from dated domain records',
  mock: 'No canonical source in the domain — placeholder value',
}

/* ── Glyphs (local, so this screen does not depend on the Overview files) ── */

const CAREER_GLYPHS: Record<string, ReactNode> = {
  briefcase: (
    <>
      <rect height="11" rx="1.8" width="17.2" x="3.4" y="8.4" />
      <path d="M8.6 8.4V6.6a1.8 1.8 0 0 1 1.8-1.8h3.2a1.8 1.8 0 0 1 1.8 1.8v1.8" />
      <path d="M3.4 13.2h17.2" />
    </>
  ),
  trendingUp: (
    <>
      <path d="M3.6 16.6 9 11.2l3.4 3.4 7.4-7.4" />
      <path d="M15.4 7.2h4.4v4.4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 3.8v3.4M12 16.8v3.4M3.8 12h3.4M16.8 12h3.4" />
    </>
  ),
  history: (
    <>
      <path d="M3.6 12a8.4 8.4 0 1 0 2.5-6" />
      <path d="M3.4 4.6V9h4.4" />
      <path d="M12 7.8V12l3 1.8" />
    </>
  ),
  stack: (
    <>
      <path d="M12 3.6 3.8 8 12 12.4 20.2 8Z" />
      <path d="m3.8 12.6 8.2 4.4 8.2-4.4" />
      <path d="m3.8 16.8 8.2 4.4 8.2-4.4" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 3.4 5.4 6v5.4c0 4 2.7 7.4 6.6 8.9 3.9-1.5 6.6-4.9 6.6-8.9V6Z" />
      <path d="m9.4 11.8 1.9 1.9 3.5-3.6" />
    </>
  ),
  flag: (
    <>
      <path d="M6.2 20.6V4.2" />
      <path d="M6.2 5.4h11.4l-2.2 3.6 2.2 3.6H6.2" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4.6h8v5a4 4 0 0 1-8 0Z" />
      <path d="M8 6.2H5.6v1.6a2.6 2.6 0 0 0 2.6 2.6M16 6.2h2.4v1.6a2.6 2.6 0 0 1-2.6 2.6" />
      <path d="M12 13.6v3.2" />
      <path d="M8.4 20.2h7.2l-.8-3.4H9.2Z" />
    </>
  ),
  star: <path d="m12 3.8 2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 17.3l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8Z" />,
  users: (
    <>
      <circle cx="9.4" cy="8.4" r="3.2" />
      <path d="M3.6 19.6a5.8 5.8 0 0 1 11.6 0" />
      <path d="M16 6.2a3.2 3.2 0 0 1 0 6.2" />
      <path d="M17.4 14.6a5.8 5.8 0 0 1 3 5" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.6l1.6 4.5 4.5 1.6-4.5 1.6L12 15.8l-1.6-4.5L5.9 9.7l4.5-1.6Z" />
      <path d="M17.6 15.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z" />
    </>
  ),
}

function CareerGlyph({
  className,
  name,
  size = 14,
}: {
  readonly className?: string
  readonly name: string
  readonly size?: number
}) {
  const glyph = CAREER_GLYPHS[name] ?? CAREER_GLYPHS.stack
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width={size}
    >
      {glyph}
    </svg>
  )
}

/* ── Model builder ── */

export function buildCoachCareerModel(world: GameWorld): CoachCareerModel {
  const coachId = world.userCoachId
  const coach = world.coaches[coachId]
  const currentDate = world.currentDate
  const employment = world.coachEmploymentByCoachId[coachId]
  const tenures = Object.values(world.coachTenuresById)
    .filter((tenure) => tenure.coachId === coachId)
    .sort((a, b) => compareGameDates(a.startedOn, b.startedOn) || a.id.localeCompare(b.id))
  const history = [...(world.coachCareerHistoryByCoachId[coachId] ?? [])]
  const achievements = Object.values(world.coachAchievementsById)
    .filter((achievement) => achievement.coachId === coachId)
    .sort((a, b) => compareGameDates(a.occurredOn, b.occurredOn) || a.id.localeCompare(b.id))
  const reputationProfile = world.coachReputationProfilesByCoachId[coachId]
  const finances = world.coachFinancesByCoachId[coachId]
  const legacy = world.coachLegacyByCoachId[coachId]

  const teamId = employment?.status === 'employed' ? employment.teamId : undefined
  const team = teamId === undefined ? undefined : world.teams[teamId]
  const board = teamId === undefined ? undefined : world.boardStatesByTeamId[teamId]
  const startedOn = employment?.status === 'employed' ? employment.startedOn : undefined

  const records = deriveSeasonRecords(world, tenures)
  const wins = records.reduce((total, record) => total + record.wins, 0)
  const losses = records.reduce((total, record) => total + record.losses, 0)
  const winPct = wins + losses === 0 ? undefined : wins / (wins + losses)
  const seasonsInCharge = tenures.reduce((total, tenure) => total + (tenure.seasonsManaged ?? 0), 0)
  const reputation = reputationProfile === undefined ? COACH_REPUTATION_DEFAULT : averageReputation(reputationProfile)
  const annualSalary = finances?.annualSalary

  const contractExpiresOn = addYears(startedOn ?? currentDate, COACH_CAREER_MOCK.contract.yearsLeft)
  const contractTotalValue =
    annualSalary === undefined
      ? COACH_CAREER_MOCK.contract.totalValueFallback
      : Math.round(annualSalary * COACH_CAREER_MOCK.contract.yearsLeft)

  const contractsByTeam = acceptedContractNotes(world, coachId)
  const trajectory = buildTrajectorySeries({ achievements, currentDate, finances, legacyValue: legacy?.legacyValue, records, reputationProfile })
  const markers = buildMarkers(history, world)
  const milestones = buildMilestones({ reputation, records, seasonsInCharge, startedOn, currentDate })

  return {
    coachName: coach === undefined ? 'Unknown coach' : `${coach.firstName} ${coach.lastName}`,
    currentDate,
    club: team?.name ?? 'Unattached',
    role: employment?.status === 'employed' ? 'Head Coach' : 'Free agent',
    employmentLabel: employment?.status === 'employed' ? 'Head Coach' : 'Out of work',
    startedOn,
    yearsInPost: startedOn === undefined ? undefined : round1(daysBetween(startedOn, currentDate) / 365.25),
    seasonsInCharge,
    wins,
    losses,
    winPct,
    annualSalary,
    jobSecurity: board === undefined ? undefined : getJobSecurity(board),
    developmentFocus: board?.profile.developmentFocus,
    boardAlignment: board?.confidence,
    boardExpectation: board?.expectation.summary,
    reputation,
    reputationBand: getCoachReputationBand(reputation),
    contractExpiresOn,
    contractTotalValue,
    trajectory,
    markers,
    milestones,
    history: buildHistoryRows({ achievements, contractsByTeam, history, world }),
    tenures: buildTenureRows({ currentDate, tenures, world }),
    security: buildSecurityRows(board),
    timeline: buildTimeline(history, achievements, world),
    honours: {
      championships: achievements.filter((achievement) => achievement.type === 'championship').length,
      promotions: achievements.filter((achievement) => achievement.type === 'promotion').length,
      dynasties: achievements.filter((achievement) => achievement.type === 'dynasty').length,
      legacyValue: legacy?.legacyValue ?? 0,
      legacyStatus: legacy?.status ?? 'unproven',
      hallStatus: legacy?.hallStatus ?? 'notEligible',
    },
  }
}

interface SeasonRecordLine {
  readonly seasonId: string
  readonly wins: number
  readonly losses: number
  readonly completedOn: GameDate
}

/**
 * A coach win/loss record is not stored anywhere. It is recoverable from the domain's own linkage:
 * `LegacyEngine.processCoachSeason` writes the finalized season into the tenure's `processedSeasonIds`,
 * and `SeasonHistoryRecord.finalStandings` carries that season's wins/losses per team. Attribution is
 * therefore "the coach in charge when the season was finalized"; a mid-season change is credited to
 * the season-end coach. Seasons that were never finalized contribute nothing.
 */
function deriveSeasonRecords(world: GameWorld, tenures: readonly CoachTenure[]): readonly SeasonRecordLine[] {
  const lines: SeasonRecordLine[] = []
  const seen = new Set<string>()
  for (const tenure of tenures) {
    for (const seasonId of tenure.processedSeasonIds ?? []) {
      const record = world.seasonHistoryBySeasonId[seasonId as SeasonId]
      if (record === undefined) continue
      const line = record.finalStandings.find((item) => item.teamId === tenure.teamId)
      if (line === undefined) continue
      const key = `${seasonId}:${tenure.teamId}`
      if (seen.has(key)) continue
      seen.add(key)
      lines.push({ seasonId, wins: line.wins, losses: line.losses, completedOn: record.completedOn })
    }
  }
  return lines.sort((a, b) => compareGameDates(a.completedOn, b.completedOn) || a.seasonId.localeCompare(b.seasonId))
}

function buildTrajectorySeries({
  achievements,
  currentDate,
  finances,
  legacyValue,
  records,
  reputationProfile,
}: {
  readonly achievements: readonly CoachAchievement[]
  readonly currentDate: GameDate
  readonly finances: CoachFinanceProfile | undefined
  readonly legacyValue: number | undefined
  readonly records: readonly SeasonRecordLine[]
  readonly reputationProfile: CoachReputationProfile | undefined
}): readonly TrajectorySeries[] {
  const winPoints: TrajectoryPoint[] = []
  let runningWins = 0
  let runningLosses = 0
  for (const record of records) {
    runningWins += record.wins
    runningLosses += record.losses
    const played = runningWins + runningLosses
    winPoints.push({
      date: record.completedOn,
      value: played === 0 ? 0 : runningWins / played,
      label: yearLabel(record.completedOn),
    })
  }
  if (winPoints.length > 0) {
    winPoints.push({ date: currentDate, value: winPoints[winPoints.length - 1]!.value, label: 'Now' })
  }

  const reputationPoints = deriveReputationPoints(reputationProfile, currentDate)
  const salaryPoints = deriveSalaryPoints(finances, currentDate)
  const standingPoints = deriveStandingPoints(achievements, legacyValue, currentDate)
  const levelPoints = COACH_CAREER_MOCK.levelSeries.map((value, index) => ({
    date: addYears(currentDate, index - (COACH_CAREER_MOCK.levelSeries.length - 1)),
    value,
    label: String(new Date(dateToNumber(currentDate)).getUTCFullYear() + index - (COACH_CAREER_MOCK.levelSeries.length - 1)),
  }))

  return [
    series('winPct', 'Career win percentage', 'Win %', 'real', 'cyan', 'percent', winPoints, true, records.length),
    series('reputation', 'Reputation', 'Reputation', 'derived', 'gold', 'integer', reputationPoints, true, reputationPoints.length),
    series('salary', 'Annual salary', 'Salary', 'real', 'positive', 'money', salaryPoints, true, salaryPoints.length),
    series('level', 'Career level (placeholder)', 'Level', 'mock', 'purple', 'integer', levelPoints, false, 0),
    series('standing', 'Career standing (from honours)', 'Standing', 'derived', 'gold', 'integer', standingPoints, true, standingPoints.length),
  ]
}

function series(
  id: string,
  label: string,
  short: string,
  source: DataSource,
  tone: Tone,
  format: MetricFormat,
  points: readonly TrajectoryPoint[],
  projection: boolean,
  recordedCount: number,
): TrajectorySeries {
  const last = points[points.length - 1]
  const caption =
    source === 'mock'
      ? 'Placeholder series — the domain records no career level. Not plotted as history.'
      : id === 'winPct'
        ? recordedCount === 0
          ? 'No finalized season yet, so no win percentage can be derived.'
          : `${recordedCount} finalized season${recordedCount === 1 ? '' : 's'} attributed to your tenures.`
        : source === 'derived'
          ? `${recordedCount} dated record${recordedCount === 1 ? '' : 's'} replayed from the domain.`
          : `${recordedCount} recorded entr${recordedCount === 1 ? 'y' : 'ies'} · current value ${last === undefined ? '—' : formatMetricValue(last.value, format)}.`
  return {
    id,
    label,
    short,
    source,
    tone,
    format,
    points,
    endLabel: last === undefined ? '—' : formatMetricValue(last.value, format),
    caption,
    projection,
  }
}

function deriveReputationPoints(
  profile: CoachReputationProfile | undefined,
  currentDate: GameDate,
): readonly TrajectoryPoint[] {
  if (profile === undefined) return []
  const values = Object.fromEntries(COACH_REPUTATION_DIMENSIONS.map((dimension) => [dimension, COACH_REPUTATION_DEFAULT])) as Record<string, number>
  const points: TrajectoryPoint[] = []
  for (const event of [...profile.events].sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.id.localeCompare(b.id))) {
    for (const dimension of COACH_REPUTATION_DIMENSIONS) {
      values[dimension] = clamp(values[dimension]! + (event.deltas[dimension] ?? 0), 0, 1000)
    }
    const average = COACH_REPUTATION_DIMENSIONS.reduce((total, dimension) => total + values[dimension]!, 0) / COACH_REPUTATION_DIMENSIONS.length
    points.push({ date: event.gameDate as GameDate, value: Math.round(average), label: formatPrototypeDate(event.gameDate as GameDate) })
  }
  points.push({ date: currentDate, value: averageReputation(profile), label: 'Now' })
  return points
}

function deriveSalaryPoints(
  finances: CoachFinanceProfile | undefined,
  currentDate: GameDate,
): readonly TrajectoryPoint[] {
  if (finances === undefined) return []
  const points: TrajectoryPoint[] = finances.movements
    .filter((movement) => movement.type === 'salary')
    .map((movement) => ({
      date: movement.date,
      // Salary movements are the net monthly amount; gross annual = net / (1 - tax) * 12.
      value: Math.round((movement.amount / Math.max(0.01, 1 - finances.incomeTaxRate)) * 12),
      label: formatPrototypeDate(movement.date),
    }))
  points.push({ date: currentDate, value: finances.annualSalary, label: 'Now' })
  return points
}

function deriveStandingPoints(
  achievements: readonly CoachAchievement[],
  legacyValue: number | undefined,
  currentDate: GameDate,
): readonly TrajectoryPoint[] {
  let total = 0
  const points = achievements.map((achievement) => {
    total += achievement.legacyValue
    return { date: achievement.occurredOn, value: total, label: formatPrototypeDate(achievement.occurredOn) }
  })
  points.push({ date: currentDate, value: legacyValue ?? total, label: 'Now' })
  return points
}

function buildMarkers(history: readonly CoachCareerHistoryEntry[], world: GameWorld): readonly CareerEventMarker[] {
  return history.map((entry, index) => {
    const team = world.teams[entry.teamId]?.name ?? entry.teamId
    const label =
      entry.kind === 'appointment'
        ? entry.reason === 'initialAppointment'
          ? `First post · ${team}`
          : `Appointed · ${team}`
        : entry.reason === 'fired'
          ? `Dismissed · ${team}`
          : `Left · ${team}`
    const tone: Tone = entry.kind === 'appointment' ? 'positive' : entry.reason === 'fired' ? 'negative' : 'warning'
    return { id: `${entry.date}-${index}`, date: entry.date, label, tone }
  })
}

function buildMilestones({
  currentDate,
  records,
  reputation,
  seasonsInCharge,
  startedOn,
}: {
  readonly currentDate: GameDate
  readonly records: readonly SeasonRecordLine[]
  readonly reputation: number
  readonly seasonsInCharge: number
  readonly startedOn: GameDate | undefined
}): readonly CareerMilestone[] {
  const wins = records.reduce((total, record) => total + record.wins, 0)
  const boundaries = [0, 100, 200, 350, 500, 650, 800, 900, 1000]
  const nextBoundary = boundaries.find((boundary) => boundary > reputation) ?? 1000
  const previousBoundary = [...boundaries].reverse().find((boundary) => boundary <= reputation) ?? 0
  const yearsInPost = startedOn === undefined ? 0 : daysBetween(startedOn, currentDate) / 365.25

  const milestones: CareerMilestone[] = [
    {
      id: 'wins',
      label: '100 Career Wins',
      detail: `${Math.max(0, 100 - wins)} wins to go. Dated season records only.`,
      progress: wins / 100,
      valueLabel: `${wins} wins`,
      targetLabel: '100 wins',
      tone: 'gold',
      source: 'real',
      tabId: 'legacy',
    },
    {
      id: 'reputation',
      label: 'Next Reputation Threshold',
      detail: `Band ${getCoachReputationBand(reputation)} → next threshold at ${nextBoundary}.`,
      progress: nextBoundary === previousBoundary ? 1 : (reputation - previousBoundary) / (nextBoundary - previousBoundary),
      valueLabel: `Reputation ${reputation}`,
      targetLabel: `Next band ${nextBoundary}`,
      tone: 'gold',
      source: 'real',
      tabId: 'reputation',
    },
    {
      id: 'seasons',
      label: 'Five Seasons in Charge',
      detail: `${Math.max(0, 5 - seasonsInCharge)} more finalized seasons.`,
      progress: seasonsInCharge / 5,
      valueLabel: `${seasonsInCharge} seasons`,
      targetLabel: '5 seasons',
      tone: 'cyan',
      source: 'real',
    },
    {
      id: 'playoff',
      label: 'First Playoff Series Win',
      detail: 'No playoff bracket is modelled yet — target is a placeholder.',
      progress: COACH_CAREER_MOCK.milestones.playoffSeries.current / COACH_CAREER_MOCK.milestones.playoffSeries.target,
      valueLabel: `${COACH_CAREER_MOCK.milestones.playoffSeries.current} series`,
      targetLabel: `${COACH_CAREER_MOCK.milestones.playoffSeries.target} win`,
      tone: 'cyan',
      source: 'mock',
    },
    {
      id: 'conferenceFinal',
      label: 'Conference Final',
      detail: 'Reaching a conference final is not tracked separately — placeholder target.',
      progress: COACH_CAREER_MOCK.milestones.conferenceFinal.current / COACH_CAREER_MOCK.milestones.conferenceFinal.target,
      valueLabel: `${COACH_CAREER_MOCK.milestones.conferenceFinal.current} reached`,
      targetLabel: `${COACH_CAREER_MOCK.milestones.conferenceFinal.target} final`,
      tone: 'cyan',
      source: 'mock',
    },
    {
      id: 'contract',
      label: 'Contract Review',
      detail: `Renewals are not modelled; target assumes a ${COACH_CAREER_MOCK.milestones.contractReviewYears}-year review.`,
      progress: yearsInPost / COACH_CAREER_MOCK.milestones.contractReviewYears,
      valueLabel: `${round1(yearsInPost)}y in post`,
      targetLabel: `${COACH_CAREER_MOCK.milestones.contractReviewYears} years`,
      tone: 'warning',
      source: 'mock',
      tabId: 'opportunities',
    },
  ]

  return [...milestones].sort(
    (a, b) => clamp(b.progress, 0, 1) - clamp(a.progress, 0, 1) || a.id.localeCompare(b.id),
  )
}

function buildHistoryRows({
  achievements,
  contractsByTeam,
  history,
  world,
}: {
  readonly achievements: readonly CoachAchievement[]
  readonly contractsByTeam: ReadonlyMap<string, number>
  readonly history: readonly CoachCareerHistoryEntry[]
  readonly world: GameWorld
}): readonly CareerHistoryRow[] {
  const rows: { sortDate: GameDate; row: CareerHistoryRow }[] = []

  for (const [index, entry] of history.entries()) {
    const teamName = world.teams[entry.teamId]?.name ?? entry.teamId
    const base = {
      id: `history-${entry.date}-${index}`,
      dateLabel: formatPrototypeDate(entry.date),
      teamName,
      role: 'Head Coach',
      contractNote: entry.kind === 'appointment' ? contractNoteFor(contractsByTeam, entry.teamId) : '—',
    }
    if (entry.kind === 'appointment') {
      rows.push({
        sortDate: entry.date,
        row: {
          ...base,
          event: entry.reason === 'initialAppointment' ? 'Initial appointment' : 'Appointed head coach',
          impact: 'Positive',
          impactTone: 'positive',
        },
      })
    } else {
      const fired = entry.reason === 'fired'
      rows.push({
        sortDate: entry.date,
        row: {
          ...base,
          event: fired ? 'Dismissed' : 'Left for another club',
          impact: fired ? 'Negative' : 'Neutral',
          impactTone: fired ? 'negative' : 'warning',
        },
      })
    }
  }

  const ACHIEVEMENT_EVENTS: Readonly<Record<CoachAchievement['type'], { readonly event: string; readonly tone: Tone }>> = {
    championship: { event: 'Champion', tone: 'positive' },
    promotion: { event: 'Promotion', tone: 'positive' },
    exceptionalSeason: { event: 'Exceptional season', tone: 'cyan' },
    dynasty: { event: 'Dynasty established', tone: 'gold' },
    hallInduction: { event: 'Hall of Fame induction', tone: 'purple' },
  }

  for (const achievement of achievements) {
    const meta = ACHIEVEMENT_EVENTS[achievement.type]
    rows.push({
      sortDate: achievement.occurredOn,
      row: {
        id: `honour-${achievement.id}`,
        dateLabel: formatPrototypeDate(achievement.occurredOn),
        teamName: achievement.teamId === undefined ? 'Career' : world.teams[achievement.teamId]?.name ?? achievement.teamId,
        role: 'Head Coach',
        event: meta.event,
        contractNote: '—',
        impact: 'Positive',
        impactTone: meta.tone,
      },
    })
  }

  return rows
    .sort((a, b) => compareGameDates(a.sortDate, b.sortDate) || a.row.id.localeCompare(b.row.id))
    .map((item) => item.row)
}

function buildTenureRows({
  currentDate,
  tenures,
  world,
}: {
  readonly currentDate: GameDate
  readonly tenures: readonly CoachTenure[]
  readonly world: GameWorld
}): readonly CareerTenureRow[] {
  const durations = tenures.map((tenure) => daysBetween(tenure.startedOn, tenure.endedOn ?? currentDate))
  const totalDays = Math.max(1, durations.reduce((total, value) => total + value, 0))

  return tenures.map((tenure, index) => {
    const days = durations[index]!
    const honours = Object.values(world.coachAchievementsById).filter(
      (achievement) => achievement.coachId === tenure.coachId && achievement.teamId === tenure.teamId,
    ).length
    const current = tenure.endedOn === undefined
    return {
      id: tenure.id,
      teamName: world.teams[tenure.teamId]?.name ?? tenure.teamId,
      period: `${formatYear(tenure.startedOn)}–${current ? 'Present' : formatYear(tenure.endedOn!)}`,
      role: 'Head Coach',
      duration: formatDuration(days),
      sharePct: Math.round((days / totalDays) * 100),
      seasons: tenure.seasonsManaged ?? 0,
      honours,
      current,
    }
  })
}

function buildSecurityRows(board: BoardState | undefined): readonly CareerSecurityRow[] {
  const rows: CareerSecurityRow[] = []

  if (board === undefined) {
    rows.push({
      id: 'jobSecurity',
      label: 'Job Security',
      filled: 0,
      total: 5,
      tone: 'neutral',
      status: 'Unknown',
      source: 'real',
      note: 'No board state for the current club.',
    })
  } else {
    const security = getJobSecurity(board)
    rows.push({
      id: 'jobSecurity',
      label: 'Job Security',
      filled: jobSecurityFilled(security),
      total: 5,
      tone: jobSecurityTone(security),
      status: securityLabel(security),
      source: 'real',
      note: `Derived from board confidence (${board.confidence}) and patience (${board.profile.patience}).`,
    })
  }

  const patience = board?.profile.patience
  rows.push({
    id: 'boardPatience',
    label: 'Board Patience',
    filled: patience === undefined ? 0 : clamp(Math.round(patience / 20), 0, 5),
    total: 5,
    tone: patience === undefined ? 'neutral' : toneForValue(patience),
    status: patience === undefined ? 'Unknown' : patienceLabel(patience),
    source: 'real',
    note: patience === undefined ? 'No board profile for the current club.' : `Board profile patience ${patience}/100.`,
  })

  rows.push({
    id: 'mediaPatience',
    label: 'Media Patience',
    filled: COACH_CAREER_MOCK.security.mediaPatience.filled,
    total: 5,
    tone: COACH_CAREER_MOCK.security.mediaPatience.tone,
    status: patienceLabel(COACH_CAREER_MOCK.security.mediaPatience.filled * 20),
    source: 'mock',
    note: 'No canonical media patience scalar — placeholder projection.',
  })

  rows.push({
    id: 'longTermOutlook',
    label: 'Long-term Outlook',
    filled: COACH_CAREER_MOCK.security.longTermOutlook.filled,
    total: 5,
    tone: COACH_CAREER_MOCK.security.longTermOutlook.tone,
    status: patienceLabel(COACH_CAREER_MOCK.security.longTermOutlook.filled * 20),
    source: 'mock',
    note: 'No canonical long-term outlook field — placeholder projection.',
  })

  return rows
}

function buildTimeline(
  history: readonly CoachCareerHistoryEntry[],
  achievements: readonly CoachAchievement[],
  world: GameWorld,
): readonly CareerTimelineEvent[] {
  const events: { sortDate: GameDate; event: CareerTimelineEvent; kind: string }[] = []

  for (const [index, entry] of history.entries()) {
    const team = world.teams[entry.teamId]?.name ?? entry.teamId
    if (entry.kind === 'appointment') {
      const first = entry.reason === 'initialAppointment'
      events.push({
        sortDate: entry.date,
        kind: first ? 'first' : 'appointment',
        event: {
          id: `tl-${entry.date}-${index}`,
          dateLabel: formatPrototypeDate(entry.date),
          title: first ? 'First post' : 'New club',
          detail: `${entry.reason === 'initialAppointment' ? 'Appointed' : 'Hired'} head coach · ${team}`,
          tone: 'positive',
          icon: 'briefcase',
        },
      })
    } else {
      const fired = entry.reason === 'fired'
      events.push({
        sortDate: entry.date,
        kind: 'departure',
        event: {
          id: `tl-${entry.date}-${index}`,
          dateLabel: formatPrototypeDate(entry.date),
          title: fired ? 'Dismissed' : 'Moved on',
          detail: fired ? `Left ${team} after a board decision` : `Left ${team} for another club`,
          tone: fired ? 'negative' : 'warning',
          icon: 'flag',
        },
      })
    }
  }

  for (const achievement of achievements) {
    const team = achievement.teamId === undefined ? 'Career' : world.teams[achievement.teamId]?.name ?? achievement.teamId
    const detail: Readonly<Record<CoachAchievement['type'], { readonly title: string; readonly tone: Tone; readonly icon: string }>> = {
      championship: { title: 'Champion', tone: 'gold', icon: 'trophy' },
      promotion: { title: 'Promotion', tone: 'positive', icon: 'trendingUp' },
      exceptionalSeason: { title: 'Exceptional season', tone: 'cyan', icon: 'star' },
      dynasty: { title: 'Dynasty', tone: 'gold', icon: 'trophy' },
      hallInduction: { title: 'Hall of Fame', tone: 'purple', icon: 'star' },
    }
    const meta = detail[achievement.type]
    events.push({
      sortDate: achievement.occurredOn,
      kind: 'honour',
      event: {
        id: `tl-${achievement.id}`,
        dateLabel: formatPrototypeDate(achievement.occurredOn),
        title: meta.title,
        detail: `${team} · ${achievement.seasonId}`,
        tone: meta.tone,
        icon: meta.icon,
      },
    })
  }

  const sorted = events.sort((a, b) => compareGameDates(a.sortDate, b.sortDate) || a.event.id.localeCompare(b.event.id))
  const firstPost = sorted.find((item) => item.kind === 'first')
  const recent = sorted.slice(-6)
  const chosen = [...new Set([...(firstPost === undefined ? [] : [firstPost]), ...recent])].sort(
    (a, b) => compareGameDates(a.sortDate, b.sortDate) || a.event.id.localeCompare(b.event.id),
  )
  return chosen.map((item) => item.event)
}

/* ── Derivation helpers ── */

function acceptedContractNotes(world: GameWorld, coachId: string): ReadonlyMap<string, number> {
  const notes = new Map<string, number>()
  for (const offer of Object.values(world.coachJobOffersById)) {
    if (offer.coachId !== coachId || offer.status !== 'accepted' || offer.annualSalary === undefined) continue
    notes.set(offer.teamId, offer.annualSalary)
  }
  return notes
}

function contractNoteFor(notes: ReadonlyMap<string, number>, teamId: TeamId): string {
  const salary = notes.get(teamId)
  return salary === undefined ? '—' : `$${formatMoney(salary)}/yr`
}

function averageReputation(profile: CoachReputationProfile): number {
  const total = COACH_REPUTATION_DIMENSIONS.reduce((sum, dimension) => sum + profile.values[dimension], 0)
  return Math.round(total / COACH_REPUTATION_DIMENSIONS.length)
}

function jobSecurityTone(security: JobSecurity): Tone {
  if (security === 'secure') return 'positive'
  if (security === 'stable') return 'cyan'
  if (security === 'underPressure') return 'warning'
  return 'negative'
}

function jobSecurityFilled(security: JobSecurity): number {
  if (security === 'secure') return 5
  if (security === 'stable') return 4
  if (security === 'underPressure') return 3
  if (security === 'atRisk') return 2
  return 1
}

function securityLabel(security: JobSecurity): string {
  if (security === 'underPressure') return 'Under pressure'
  if (security === 'atRisk') return 'At risk'
  return security.charAt(0).toUpperCase() + security.slice(1)
}

function patienceLabel(value: number): string {
  if (value >= 80) return 'Very high'
  if (value >= 60) return 'High'
  if (value >= 40) return 'Moderate'
  if (value >= 20) return 'Low'
  return 'Very low'
}

function toneForValue(value: number): Tone {
  if (value >= 70) return 'positive'
  if (value >= 45) return 'cyan'
  if (value >= 25) return 'warning'
  return 'negative'
}

function formatMetricValue(value: number, format: MetricFormat): string {
  if (format === 'percent') return formatWinPct(value)
  if (format === 'money') return `$${formatMoney(value)}`
  return String(Math.round(value))
}

function formatWinPct(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(3).replace(/^0/, '')
}

function formatYear(date: GameDate): string {
  return date.slice(0, 4)
}

function yearLabel(date: GameDate): string {
  return `Season ${date.slice(0, 4)}`
}

function formatDuration(days: number): string {
  if (days < 30) return `${Math.max(1, Math.round(days))}d`
  const years = Math.floor(days / 365.25)
  const months = Math.round((days - years * 365.25) / 30.44)
  if (years === 0) return `${months}m`
  return months === 0 ? `${years}y` : `${years}y ${months}m`
}

function dateToNumber(date: GameDate): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year!, month! - 1, day!)
}

function daysBetween(from: GameDate, to: GameDate): number {
  return Math.max(0, Math.round((dateToNumber(to) - dateToNumber(from)) / 86_400_000))
}

function dedupeByDate(points: readonly TrajectoryPoint[]): readonly TrajectoryPoint[] {
  const byDate = new Map<string, TrajectoryPoint>()
  for (const point of [...points].sort((a, b) => a.date.localeCompare(b.date))) byDate.set(point.date, point)
  return [...byDate.values()]
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
