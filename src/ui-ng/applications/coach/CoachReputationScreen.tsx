/*
 * Coach · Reputation — how the basketball ecosystem perceives the character.
 *
 * The old tab was four numbers in a table. This board answers five questions instead: who respects
 * me, who does not, why, where am I known, and which story the press is writing about me.
 *
 * Data policy (MIXTO):
 * - REAL: the four dimension values, their band, the aggregate and every event stream. All of it is
 *   read from `world.coachReputationProfilesByCoachId[userCoachId]` (scale 0..1000, default 200) and
 *   from the career history. Per-dimension variation, the recent-change figure, the explanation, the
 *   signal list, the timeline and the milestones are all derived from those sources, never invented.
 * - MOCK: collective perception, geographic reach, media narratives and two of the six drivers have
 *   no domain backing at all, so they live in the single labelled `COACH_REPUTATION_MOCK` object
 *   below and every surface that renders them is marked with a visible `mock` tag.
 *
 * Nothing here is persisted: the timeline is reconstructed from the event log, which is the same
 * source of truth the stored values come from.
 */

import { useMemo, useState } from 'react'

import {
  COACH_REPUTATION_DIMENSIONS,
  COACH_REPUTATION_MAX,
  getCoachReputationBand,
  getRecentCoachReputationEvents,
  type CoachReputationDimension,
  type CoachReputationEvent,
  type CoachReputationProfile,
} from '@/domain/coachReputation'
import type { GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
import {
  coachReputationBandLabel,
  coachReputationEventLabel,
  coachReputationSourceLabel,
  formatCoachReputationDelta,
} from '@/ui/coachReputationPresentation'
import { formatPrototypeDate } from '@/ui/formatters'
import {
  HorizontalValueBar,
  MiniLineChart,
  OverviewPanelHeader,
} from '@/ui-ng/applications/coach/CoachOverviewCharts'
import { OverviewGlyph } from '@/ui-ng/applications/coach/CoachOverviewGlyph'

import './coach-reputation.css'

/* ── Shared vocabulary ── */

/** Same tone set the Overview uses, so both screens speak one colour language. */
type ReputationTone = 'neutral' | 'cyan' | 'positive' | 'warning' | 'negative' | 'gold' | 'purple'
type TrendDirection = 'up' | 'down' | 'flat'

const DIMENSION_LABELS: Readonly<Record<CoachReputationDimension, string>> = {
  competitive: 'Competitive',
  development: 'Development',
  professional: 'Professional',
  publicStanding: 'Public Standing',
}

const TREND_GLYPH: Readonly<Record<TrendDirection, string>> = {
  up: 'caretUp',
  down: 'caretDown',
  flat: 'caretFlat',
}

const TREND_TONE: Readonly<Record<TrendDirection, ReputationTone>> = {
  up: 'positive',
  down: 'negative',
  flat: 'neutral',
}

/** Scales the timeline can be switched to. Twelve months is the entry point. */
const TIMELINE_SCALES = [6, 12, 24] as const
const DEFAULT_SCALE_MONTHS = 12
/** Window behind "recent change" and the driver trends. */
const RECENT_WINDOW_MONTHS = 6
const SIGNAL_LIMIT = 5
const MILESTONE_LIMIT = 6
const MILESTONE_EVENT_LIMIT = 4

const CAREER_REASON_LABELS: Readonly<Record<string, string>> = {
  initialAppointment: 'Appointed',
  hired: 'Hired',
  fired: 'Dismissed',
  acceptedOtherJob: 'Left for another club',
}

/* ── MOCK ──
 * The ONLY invented data on this screen. Everything a collective thinks of the coach, every market
 * where he is known, every press narrative and two driver weights exist nowhere in src/domain yet.
 * They are kept in one object so the whole set can be swapped for a selector without touching JSX.
 * Narrative headlines are templates: the `{coach}` / `{team}` slots are filled with real names. */
export const COACH_REPUTATION_MOCK = {
  perception: [
    { id: 'players', label: 'Players', value: 78, note: 'Squad buys into the development plan.' },
    { id: 'board', label: 'Board', value: 64, note: 'Board backs the competitive trajectory.' },
    { id: 'media', label: 'Media', value: 51, note: 'Press is split on the tactical setup.' },
    { id: 'agents', label: 'Agents', value: 58, note: 'Agents value the pathway to real minutes.' },
    { id: 'owners', label: 'Owners', value: 34, note: 'Ownership questions the defensive identity.' },
    { id: 'league', label: 'League', value: 69, note: 'League office respects the professional record.' },
  ],
  territories: [
    { id: 'home', label: 'Horizon League', interest: 86, sentiment: 'Home market', tone: 'positive' },
    { id: 'northAmerica', label: 'North American', interest: 74, sentiment: 'Well known', tone: 'positive' },
    { id: 'europe', label: 'European', interest: 62, sentiment: 'Respected', tone: 'cyan' },
    { id: 'asia', label: 'Asian', interest: 34, sentiment: 'Watchful', tone: 'warning' },
    { id: 'southAmerica', label: 'South American', interest: 28, sentiment: 'Emerging', tone: 'warning' },
    { id: 'oceania', label: 'Oceania', interest: 17, sentiment: 'Limited', tone: 'negative' },
  ],
  narratives: [
    { id: 'rise', headline: '{team} thrive under {coach}', sentiment: 'Positive', tone: 'positive', volume: 74 },
    { id: 'development', headline: 'Players credit {coach} for their development', sentiment: 'Positive', tone: 'positive', volume: 61 },
    { id: 'defence', headline: 'Questions raised over the defensive setup', sentiment: 'Negative', tone: 'negative', volume: 48 },
    { id: 'boardroom', headline: '{coach} keeps the board onside', sentiment: 'Neutral', tone: 'cyan', volume: 39 },
  ],
  driverWeights: {
    onFieldSuccess: 92,
    playerDevelopment: 84,
    professionalism: 71,
    politicalSkill: 58,
    publicBehaviour: 66,
    controversyRisk: 54,
  },
  /** Political skill has no dimension behind it, unlike the other real drivers. */
  politicalSkill: { value: 54, trend: 'flat' as TrendDirection },
} as const

/* ── Derived model ── */

interface ReputationDimensionView {
  readonly id: CoachReputationDimension
  readonly label: string
  readonly value: number
  readonly band: string
  readonly percent: number
  readonly delta: number
  readonly tone: ReputationTone
}

interface ReputationSummaryView {
  readonly dimensions: readonly ReputationDimensionView[]
  readonly total: number
  readonly totalBand: string
  readonly totalPercent: number
  readonly scaleMax: number
  readonly recentChange: {
    readonly total: number
    readonly months: number
    readonly eventCount: number
    readonly note: string
  }
}

interface PerceptionView {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly tone: ReputationTone
  readonly note: string
}

interface SignalDeltaView {
  readonly id: string
  readonly label: string
  readonly delta: number
  readonly tone: ReputationTone
}

interface SignalView {
  readonly id: string
  readonly date: string
  readonly label: string
  readonly meta: string
  readonly effect: number
  readonly tone: ReputationTone
  readonly deltas: readonly SignalDeltaView[]
}

interface DriverView {
  readonly id: string
  readonly label: string
  readonly weight: number
  readonly current: number
  readonly trend: TrendDirection
  readonly isMock: boolean
  readonly note: string
}

interface TerritoryView {
  readonly id: string
  readonly label: string
  readonly interest: number
  readonly sentiment: string
  readonly tone: ReputationTone
}

interface NarrativeView {
  readonly id: string
  readonly headline: string
  readonly sentiment: string
  readonly tone: ReputationTone
  readonly volume: number
}

interface TimelineView {
  readonly scaleMonths: number
  readonly points: readonly number[]
  readonly labels: readonly string[]
  readonly caption: string
  readonly endLabel: string
  readonly deltas: readonly SignalDeltaView[]
}

interface MilestoneView {
  readonly id: string
  readonly date: string
  readonly label: string
  readonly detail: string
  readonly effect: number | null
  readonly tone: ReputationTone
}

export interface CoachReputationModel {
  readonly summary: ReputationSummaryView
  readonly perception: readonly PerceptionView[]
  readonly signals: readonly SignalView[]
  readonly signalCount: number
  readonly drivers: readonly DriverView[]
  readonly territories: readonly TerritoryView[]
  readonly narratives: readonly NarrativeView[]
  readonly timeline: TimelineView
  readonly milestones: readonly MilestoneView[]
}

/* ── Date helpers (calendar month buckets, no inventing a date library) ── */

function monthKeyOf(date: string): string {
  return date.slice(0, 7)
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [yearText, monthText] = monthKey.split('-')
  const total = Number(yearText) * 12 + (Number(monthText) - 1) + delta
  const year = Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`
}

/** "2030-03" -> "MAR", reusing the shared prototype date formatter. */
function monthLabelOf(monthKey: string): string {
  return formatPrototypeDate(`${monthKey}-01` as GameDate).slice(3, 6)
}

function monthWindow(currentKey: string, months: number): readonly string[] {
  return Array.from({ length: months }, (_, index) => shiftMonthKey(currentKey, -(months - 1 - index)))
}

function clampValue(value: number): number {
  return Math.max(0, Math.min(COACH_REPUTATION_MAX, value))
}

function toneOfDelta(delta: number): ReputationTone {
  return delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'
}

function trendOfDelta(delta: number): TrendDirection {
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
}

function eventEffect(event: CoachReputationEvent): number {
  let total = 0
  for (const dimension of COACH_REPUTATION_DIMENSIONS) total += event.deltas[dimension] ?? 0
  return total
}

function measureEvents(events: readonly CoachReputationEvent[], dimension: CoachReputationDimension): number {
  return events.reduce((total, event) => total + (event.deltas[dimension] ?? 0), 0)
}

function eventsInWindow(
  events: readonly CoachReputationEvent[],
  currentKey: string,
  months: number,
): readonly CoachReputationEvent[] {
  const keys = new Set(monthWindow(currentKey, months))
  return events.filter((event) => keys.has(monthKeyOf(event.gameDate)))
}

/**
 * The value a dimension had at the end of `monthKey`, back-cast from today's value by subtracting
 * every delta recorded after that month. Presentation only — nothing is persisted from it.
 */
function dimensionValueAt(
  profile: CoachReputationProfile,
  dimension: CoachReputationDimension,
  monthKey: string,
): number {
  let later = 0
  for (const event of profile.events) {
    if (monthKeyOf(event.gameDate) > monthKey) later += event.deltas[dimension] ?? 0
  }
  return clampValue(profile.values[dimension] - later)
}

function totalStandingOf(profile: CoachReputationProfile, monthKey: string | null): number {
  const values = COACH_REPUTATION_DIMENSIONS.map((dimension) =>
    monthKey === null ? profile.values[dimension] : dimensionValueAt(profile, dimension, monthKey),
  )
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length)
}

function buildRecentChangeNote(
  windowEvents: readonly CoachReputationEvent[],
  deltas: readonly { readonly label: string; readonly delta: number }[],
  months: number,
): string {
  if (windowEvents.length === 0) return `No reputation events recorded in the last ${months} months.`
  const gains = [...deltas].filter((entry) => entry.delta > 0).sort((left, right) => right.delta - left.delta)
  const losses = [...deltas].filter((entry) => entry.delta < 0).sort((left, right) => left.delta - right.delta)
  const parts = [`${windowEvents.length} event${windowEvents.length === 1 ? '' : 's'} tracked`]
  if (gains[0] !== undefined) parts.push(`${gains[0].label} leads the gains (${formatCoachReputationDelta(gains[0].delta)})`)
  if (losses[0] !== undefined) parts.push(`${losses[0].label} is the main drag (${formatCoachReputationDelta(losses[0].delta)})`)
  if (gains.length === 0 && losses.length === 0) parts.push('standing is unchanged')
  return `${parts.join('. ')}.`
}

function signalMetaOf(event: CoachReputationEvent): string {
  const source = coachReputationSourceLabel(event.source)
  if (event.context.kind === 'matchResult' && 'expectedWinProbability' in event.context) {
    return `${source} · expected ${Math.round(event.context.expectedWinProbability * 100)}%`
  }
  if (event.context.kind === 'seasonAchievement' && 'achievement' in event.context) {
    return `${source} · ${event.context.achievement}`
  }
  return source
}

function deltaChipsOf(event: CoachReputationEvent): readonly SignalDeltaView[] {
  return COACH_REPUTATION_DIMENSIONS.map((dimension) => ({
    id: dimension,
    label: DIMENSION_LABELS[dimension],
    delta: event.deltas[dimension] ?? 0,
    tone: toneOfDelta(event.deltas[dimension] ?? 0),
  })).filter((chip) => chip.delta !== 0)
}

/*
 * Perception has no domain source, so the mock values are read as a support reading: high means the
 * collective is behind the coach, low means it doubts him. The colour is therefore semantic — green
 * support, amber doubt, red opposition — because the whole point of the panel is that the same coach
 * can be loved by one group and rejected by another.
 */
function perceptionTone(value: number): ReputationTone {
  return value >= 60 ? 'positive' : value >= 40 ? 'warning' : 'negative'
}

function buildPerception(): readonly PerceptionView[] {
  return COACH_REPUTATION_MOCK.perception.map((group) => ({
    id: group.id,
    label: group.label,
    value: group.value,
    tone: perceptionTone(group.value),
    note: group.note,
  }))
}

/** Share of negative events in a slice of the window, as a 0..100 index. */
function negativeShare(events: readonly CoachReputationEvent[]): number {
  if (events.length === 0) return 0
  const negative = events.filter((event) => eventEffect(event) < 0).length
  return Math.round((negative / events.length) * 100)
}

/**
 * Four drivers read a stored dimension: level from the canonical value (0..1000 -> 0..100 index),
 * trend from that dimension's deltas inside the window. Controversy Risk is derived from the
 * polarity of the same window instead of a dimension. Weights and Political Skill are mock.
 */
function buildDrivers(profile: CoachReputationProfile, windowEvents: readonly CoachReputationEvent[]): readonly DriverView[] {
  const weights = COACH_REPUTATION_MOCK.driverWeights
  const definition = [
    { id: 'onFieldSuccess', label: 'On-field Success', dimension: 'competitive' as const, weight: weights.onFieldSuccess, note: 'Reads the competitive dimension.' },
    { id: 'playerDevelopment', label: 'Player Development', dimension: 'development' as const, weight: weights.playerDevelopment, note: 'Reads the development dimension.' },
    { id: 'professionalism', label: 'Professionalism', dimension: 'professional' as const, weight: weights.professionalism, note: 'Reads the professional dimension, which professionalEvent entries move.' },
    { id: 'publicBehaviour', label: 'Public Behaviour', dimension: 'publicStanding' as const, weight: weights.publicBehaviour, note: 'Reads the public standing dimension.' },
  ]
  const real: readonly DriverView[] = definition.map((driver) => {
    // The profile value is a 0..1000 standing; the driver reads it as a 0..100 index.
    const current = Math.round((profile.values[driver.dimension] / COACH_REPUTATION_MAX) * 100)
    const delta = measureEvents(windowEvents, driver.dimension)
    return {
      id: driver.id,
      label: driver.label,
      weight: driver.weight,
      current,
      trend: trendOfDelta(delta),
      isMock: false,
      note: `${driver.note} Last ${RECENT_WINDOW_MONTHS} months: ${formatCoachReputationDelta(delta)}.`,
    }
  })

  const half = Math.ceil(windowEvents.length / 2)
  const trend: TrendDirection =
    windowEvents.length === 0
      ? 'flat'
      : trendOfDelta(negativeShare(windowEvents.slice(-half)) - negativeShare(windowEvents.slice(0, half)))

  return [
    ...real,
    {
      id: 'politicalSkill',
      label: 'Political Skill',
      weight: weights.politicalSkill,
      current: COACH_REPUTATION_MOCK.politicalSkill.value,
      trend: COACH_REPUTATION_MOCK.politicalSkill.trend,
      isMock: true,
      note: 'Illustrative placeholder — no domain source for political skill yet.',
    },
    {
      id: 'controversyRisk',
      label: 'Controversy Risk',
      weight: weights.controversyRisk,
      current: negativeShare(windowEvents),
      trend,
      isMock: false,
      note: `Share of negative events in the last ${RECENT_WINDOW_MONTHS} months.`,
    },
  ]
}

/* ── Model assembly ── */

export function buildCoachReputationModel(world: GameWorld, scaleMonths: number): CoachReputationModel | null {
  const coachId = world.userCoachId
  const profile = world.coachReputationProfilesByCoachId[coachId]
  if (profile === undefined) return null

  const currentKey = monthKeyOf(world.currentDate)
  const windowEvents = eventsInWindow(profile.events, currentKey, RECENT_WINDOW_MONTHS)
  const dimensionDeltas = COACH_REPUTATION_DIMENSIONS.map((dimension) => ({
    id: dimension,
    label: DIMENSION_LABELS[dimension],
    delta: measureEvents(windowEvents, dimension),
  }))

  const dimensions: readonly ReputationDimensionView[] = COACH_REPUTATION_DIMENSIONS.map((dimension) => {
    const delta = measureEvents(windowEvents, dimension)
    const value = profile.values[dimension]
    return {
      id: dimension,
      label: DIMENSION_LABELS[dimension],
      value,
      band: coachReputationBandLabel(getCoachReputationBand(value)),
      percent: Math.round((value / COACH_REPUTATION_MAX) * 100),
      delta,
      tone: toneOfDelta(delta),
    }
  })

  const total = totalStandingOf(profile, null)

  const signals: readonly SignalView[] = getRecentCoachReputationEvents(profile, SIGNAL_LIMIT).map((event) => ({
    id: event.id,
    date: formatPrototypeDate(event.gameDate as GameDate),
    label: coachReputationEventLabel(world, event),
    meta: signalMetaOf(event),
    effect: eventEffect(event),
    tone: toneOfDelta(eventEffect(event)),
    deltas: deltaChipsOf(event),
  }))

  const yearEvents = eventsInWindow(profile.events, currentKey, 12)
  const milestoneEvents: readonly MilestoneView[] = [...yearEvents]
    .sort((left, right) => Math.abs(eventEffect(right)) - Math.abs(eventEffect(left)) || right.gameDate.localeCompare(left.gameDate) || left.id.localeCompare(right.id))
    .slice(0, MILESTONE_EVENT_LIMIT)
    .map((event) => ({
      id: event.id,
      date: formatPrototypeDate(event.gameDate as GameDate),
      label: coachReputationEventLabel(world, event),
      detail: signalMetaOf(event),
      effect: eventEffect(event),
      tone: toneOfDelta(eventEffect(event)),
    }))

  const careerMilestones: readonly MilestoneView[] = (world.coachCareerHistoryByCoachId[coachId] ?? [])
    .filter((entry) => monthKeyOf(entry.date) >= shiftMonthKey(currentKey, -11))
    .slice(-2)
    .map((entry) => ({
      id: `${entry.kind}:${entry.date}`,
      date: formatPrototypeDate(entry.date),
      label: entry.kind === 'appointment' ? 'Appointment' : 'Departure',
      detail: `${CAREER_REASON_LABELS[entry.reason] ?? entry.reason} · ${world.teams[entry.teamId]?.name ?? entry.teamId}`,
      effect: null,
      tone: entry.kind === 'appointment' ? 'gold' : 'negative',
    }))

  const milestones = [...milestoneEvents, ...careerMilestones]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, MILESTONE_LIMIT)

  const timelineKeys = monthWindow(currentKey, scaleMonths)
  const points = timelineKeys.map((key) => totalStandingOf(profile, key))

  const perception = buildPerception()
  const drivers = buildDrivers(profile, windowEvents)
  const territories: readonly TerritoryView[] = COACH_REPUTATION_MOCK.territories.map((territory) => ({
    id: territory.id,
    label: territory.label,
    interest: territory.interest,
    sentiment: territory.sentiment,
    tone: territory.tone,
  }))
  const coach = world.coaches[coachId]
  const coachLastName = coach?.lastName ?? 'The coach'
  const employment = world.coachEmploymentByCoachId[coachId]
  const teamLabel =
    employment?.status === 'employed' && employment.teamId !== undefined
      ? world.teams[employment.teamId]?.name ?? 'The club'
      : 'The squad'
  const narratives: readonly NarrativeView[] = COACH_REPUTATION_MOCK.narratives.map((narrative) => ({
    id: narrative.id,
    headline: narrative.headline.replace('{coach}', coachLastName).replace('{team}', teamLabel),
    sentiment: narrative.sentiment,
    tone: narrative.tone,
    volume: narrative.volume,
  }))

  return {
    summary: {
      dimensions,
      total,
      totalBand: coachReputationBandLabel(getCoachReputationBand(total)),
      totalPercent: Math.round((total / COACH_REPUTATION_MAX) * 100),
      scaleMax: COACH_REPUTATION_MAX,
      recentChange: {
        total: dimensionDeltas.reduce((sum, entry) => sum + entry.delta, 0),
        months: RECENT_WINDOW_MONTHS,
        eventCount: windowEvents.length,
        note: buildRecentChangeNote(windowEvents, dimensionDeltas, RECENT_WINDOW_MONTHS),
      },
    },
    perception,
    signals,
    signalCount: profile.events.length,
    drivers,
    territories,
    narratives,
    timeline: {
      scaleMonths,
      points,
      labels: timelineKeys.map(monthLabelOf),
      caption: `Last ${scaleMonths} months`,
      endLabel: String(total),
      deltas: dimensions.map((dimension) => ({
        id: dimension.id,
        label: dimension.label,
        delta: dimension.delta,
        tone: dimension.tone,
      })),
    },
    milestones,
  }
}

/* ── Panels ── */

function MockTag() {
  return (
    <span className="cr-mock-tag" title="Illustrative placeholder — no domain source yet">
      mock
    </span>
  )
}

function SummaryPanel({ model, onOpenTab }: { readonly model: CoachReputationModel; readonly onOpenTab?: (tabId: string) => void }) {
  const { summary } = model
  return (
    <section className="ng-canon__panel ng-holo-panel cr-panel" data-section="summary">
      <OverviewPanelHeader
        aside={
          <button
            className="cr-link"
            disabled={onOpenTab === undefined}
            onClick={onOpenTab === undefined ? undefined : () => onOpenTab('career')}
            type="button"
          >
            Career record →
          </button>
        }
        icon="star"
        subtitle="Four dimensions"
        title="Reputation summary"
      />
      <div className="cr-summary">
        <ul className="cr-dims">
          {summary.dimensions.map((dimension) => (
            <li className="cr-dim" key={dimension.id} data-dimension={dimension.id}>
              <span className="cr-dim__label">{dimension.label}</span>
              <span className="cr-dim__band">{dimension.band}</span>
              <span className="cr-dim__value">{dimension.value}</span>
              <span className={`cr-dim__delta cr-tone--${dimension.tone}`}>{formatCoachReputationDelta(dimension.delta)}</span>
              <span
                aria-label={`${dimension.label} ${dimension.value} of ${summary.scaleMax}`}
                className="cr-dim__track"
                role="img"
              >
                <span className="cr-dim__fill" style={{ width: `${dimension.percent}%` }} />
              </span>
            </li>
          ))}
        </ul>

        <div className="cr-summary__side">
          <div className="cr-total">
            <span className="cr-total__label">Total standing</span>
            <span className="cr-total__value">
              {summary.total}
              <span className="cr-total__max">/{summary.scaleMax}</span>
            </span>
            <span className="cr-total__band">
              <OverviewGlyph name="star" size={11} />
              {summary.totalBand}
            </span>
            <span
              aria-label={`Total standing ${summary.total} of ${summary.scaleMax}`}
              className="cr-total__track"
              role="img"
            >
              <span className="cr-total__fill" style={{ width: `${summary.totalPercent}%` }} />
            </span>
          </div>

          <div className="cr-change">
            <span className="cr-change__label">Recent change</span>
            <span className="cr-change__row">
              <span className={`cr-change__value cr-tone--${toneOfDelta(summary.recentChange.total)}`}>
                {formatCoachReputationDelta(summary.recentChange.total)}
              </span>
              <span className="cr-change__window">Last {summary.recentChange.months} months</span>
            </span>
            <p className="cr-change__note">{summary.recentChange.note}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function PerceptionPanel({ model }: { readonly model: CoachReputationModel }) {
  return (
    <section className="ng-canon__panel ng-holo-panel cr-panel" data-mock="true" data-section="perception">
      <OverviewPanelHeader aside={<MockTag />} icon="users" subtitle="Six audiences" title="Perception breakdown" />
      <div className="cr-perception">
        {model.perception.map((group) => (
          <HorizontalValueBar key={group.id} label={group.label} title={group.note} tone={group.tone} value={group.value} />
        ))}
      </div>
      <p className="cr-foot">Independent readings per collective — the same coach can be backed internally and doubted outside.</p>
    </section>
  )
}

function SignalsPanel({ model }: { readonly model: CoachReputationModel }) {
  return (
    <section className="ng-canon__panel ng-holo-panel cr-panel" data-section="signals">
      <OverviewPanelHeader
        aside={<span className="cr-panel__hint">Newest first</span>}
        icon="activity"
        subtitle="What moved the numbers"
        title="Recent changes & signals"
      />
      {model.signals.length === 0 ? (
        <p className="cr-empty">No reputation events recorded yet.</p>
      ) : (
        <>
          <ul className="cr-signals">
            {model.signals.map((signal) => (
              <li className={`cr-signal cr-edge--${signal.tone}`} key={signal.id}>
                <span className="cr-signal__label">{signal.label}</span>
                <span className={`cr-signal__effect cr-tone--${signal.tone}`}>{formatCoachReputationDelta(signal.effect)}</span>
                <span className="cr-signal__chips">
                  {signal.deltas.map((chip) => (
                    <span className={`cr-chip cr-tone--${chip.tone}`} key={chip.id}>
                      {formatCoachReputationDelta(chip.delta)} {chip.label}
                    </span>
                  ))}
                </span>
                <span className="cr-signal__date">
                  {signal.date} · {signal.meta}
                </span>
              </li>
            ))}
          </ul>
          <p className="cr-foot">
            Net Δ sums the four dimension deltas · {model.signals.length} of {model.signalCount} recorded events
          </p>
        </>
      )}
    </section>
  )
}

function DriversPanel({ model }: { readonly model: CoachReputationModel }) {
  return (
    <section className="ng-canon__panel ng-holo-panel cr-panel" data-mock="true" data-section="drivers">
      <OverviewPanelHeader
        aside={<span className="cr-panel__hint">Why it moves</span>}
        icon="chartBars"
        subtitle="Weight · current · trend"
        title="Reputation drivers"
      />
      <div className="cr-drivers">
        <div className="cr-drivers__head">
          <span>Driver</span>
          <span className="cr-num">Weight</span>
          <span className="cr-num">Now</span>
          <span />
          <span className="cr-num">Trend</span>
        </div>
        <ul className="cr-drivers__list">
          {model.drivers.map((driver) => (
            <li className={`cr-driver${driver.isMock ? ' is-mock' : ''}`} key={driver.id} title={driver.note}>
              <span className="cr-driver__label">
                {driver.label}
                {driver.isMock ? <MockTag /> : null}
              </span>
              <span className="cr-num cr-driver__weight">{driver.weight}</span>
              <span className="cr-num cr-driver__current">{driver.current}</span>
              <span
                aria-label={`${driver.label} ${driver.current} of 100`}
                className="cr-driver__track"
                role="img"
              >
                <span className="cr-driver__fill" style={{ width: `${Math.max(0, Math.min(100, driver.current))}%` }} />
              </span>
              <span className={`cr-driver__trend cr-tone--${TREND_TONE[driver.trend]}`}>
                <OverviewGlyph name={TREND_GLYPH[driver.trend]} size={10} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="cr-foot">
        Levels read the stored dimensions; trends read the last {RECENT_WINDOW_MONTHS} months of events. Weights and
        Political Skill are illustrative; Controversy Risk is the share of negative events.
      </p>
    </section>
  )
}

function ReachPanel({ model, onOpenTab }: { readonly model: CoachReputationModel; readonly onOpenTab?: (tabId: string) => void }) {
  return (
    <section className="ng-canon__panel ng-holo-panel cr-panel" data-mock="true" data-section="reach">
      <OverviewPanelHeader aside={<MockTag />} icon="landmark" subtitle="Where you are known" title="Geographic reach" />
      <ul className="cr-territories">
        {model.territories.map((territory) => (
          <li className="cr-territory" key={territory.id}>
            <span className="cr-territory__label">{territory.label}</span>
            <span className={`cr-territory__sentiment cr-tone--${territory.tone}`}>{territory.sentiment}</span>
            <span className="cr-num cr-territory__interest">{territory.interest}</span>
            <span
              aria-label={`${territory.label} interest ${territory.interest} of 100`}
              className="cr-territory__track"
              role="img"
            >
              <span className={`cr-territory__fill cr-fill--${territory.tone}`} style={{ width: `${territory.interest}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="cr-foot">
        Reach is not automatic: a strong home circuit does not travel.{' '}
        <button
          className="cr-link"
          disabled={onOpenTab === undefined}
          onClick={onOpenTab === undefined ? undefined : () => onOpenTab('opportunities')}
          type="button"
        >
          Check international openings →
        </button>
      </p>
    </section>
  )
}

function NarrativePanel({ model }: { readonly model: CoachReputationModel }) {
  return (
    <section className="ng-canon__panel ng-holo-panel cr-panel" data-mock="true" data-section="narrative">
      <OverviewPanelHeader aside={<MockTag />} icon="mic" subtitle="The story being written" title="Media & narrative" />
      <ul className="cr-narratives">
        {model.narratives.map((narrative) => (
          <li className={`cr-narrative cr-edge--${narrative.tone}`} key={narrative.id}>
            <span className="cr-narrative__headline">“{narrative.headline}”</span>
            <span className={`cr-narrative__sentiment cr-tone--${narrative.tone}`}>{narrative.sentiment}</span>
            <span
              aria-label={`${narrative.headline} volume ${narrative.volume} of 100`}
              className="cr-narrative__track"
              role="img"
            >
              <span className={`cr-narrative__fill cr-fill--${narrative.tone}`} style={{ width: `${narrative.volume}%` }} />
            </span>
            <span className="cr-num cr-narrative__volume">{narrative.volume}</span>
          </li>
        ))}
      </ul>
      <p className="cr-foot">Aggregated narratives, not articles. Volume is how loudly the press is running the story.</p>
    </section>
  )
}

function TimelinePanel({
  model,
  onScaleChange,
}: {
  readonly model: CoachReputationModel
  readonly onScaleChange: (months: number) => void
}) {
  const { timeline } = model
  return (
    <section className="ng-canon__panel ng-holo-panel cr-panel" data-section="timeline">
      <OverviewPanelHeader
        aside={
          <div aria-label="Timeline scale" className="cr-scale" role="group">
            {TIMELINE_SCALES.map((months) => (
              <button
                aria-pressed={months === timeline.scaleMonths}
                className={`cr-scale__btn${months === timeline.scaleMonths ? ' is-active' : ''}`}
                key={months}
                onClick={() => onScaleChange(months)}
                type="button"
              >
                {months}M
              </button>
            ))}
          </div>
        }
        icon="trendingUp"
        subtitle="Aggregate standing"
        title="Reputation timeline"
      />
      <div className="cr-timeline">
        <MiniLineChart
          caption={timeline.caption}
          endLabel={timeline.endLabel}
          label={`Total standing, last ${timeline.scaleMonths} months: ${timeline.points.join(', ')}`}
          points={timeline.points}
          title="Total standing"
        />
        <ul className="cr-timeline__legend">
          {timeline.deltas.map((entry) => (
            <li className="cr-timeline__entry" key={entry.id}>
              <span className="cr-timeline__label">{entry.label}</span>
              <span className={`cr-timeline__delta cr-tone--${entry.tone}`}>{formatCoachReputationDelta(entry.delta)}</span>
            </li>
          ))}
        </ul>
        <span className="cr-timeline__axis">
          {timeline.labels.map((label, index) => (
            <span className="cr-timeline__tick" key={`${label}-${index}`}>
              {label}
            </span>
          ))}
        </span>
      </div>
    </section>
  )
}

function MilestonesPanel({ model, onOpenTab }: { readonly model: CoachReputationModel; readonly onOpenTab?: (tabId: string) => void }) {
  return (
    <section className="ng-canon__panel ng-holo-panel cr-panel" data-section="milestones">
      <OverviewPanelHeader
        aside={
          <button
            className="cr-link"
            disabled={onOpenTab === undefined}
            onClick={onOpenTab === undefined ? undefined : () => onOpenTab('career')}
            type="button"
          >
            Full history →
          </button>
        }
        icon="flag"
        subtitle="Ranked by impact"
        title="Key milestones"
      />
      {model.milestones.length === 0 ? (
        <p className="cr-empty">No milestones recorded in the last twelve months.</p>
      ) : (
        <ul className="cr-milestones">
          {model.milestones.map((milestone) => (
            <li className={`cr-milestone cr-edge--${milestone.tone}`} key={milestone.id}>
              <span className="cr-milestone__date">{milestone.date}</span>
              <span className="cr-milestone__label">{milestone.label}</span>
              <span className={`cr-milestone__effect cr-tone--${milestone.tone}`}>
                {milestone.effect === null ? '—' : formatCoachReputationDelta(milestone.effect)}
              </span>
              <span className="cr-milestone__detail">{milestone.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ── Screen ── */

export function CoachReputationScreen({
  onOpenTab,
  world: worldOverride,
}: {
  readonly onOpenTab?: (tabId: string) => void
  /** Test/host seam: fall back to the live store when omitted. */
  readonly world?: GameWorld
}) {
  const storeWorld = useGameStore((state) => state.world)
  const world = worldOverride ?? storeWorld
  const [scaleMonths, setScaleMonths] = useState<number>(DEFAULT_SCALE_MONTHS)

  const model = useMemo(
    () => (world === null ? null : buildCoachReputationModel(world, scaleMonths)),
    [world, scaleMonths],
  )

  if (model === null) {
    return (
      <div className="cr-reputation cr-reputation--empty">
        <section className="ng-canon__panel ng-holo-panel cr-panel">
          <p className="ng-canon__empty">No coach reputation profile available.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="cr-reputation" data-screen="coach-reputation">
      <div className="cr-row cr-row--1">
        <SummaryPanel model={model} onOpenTab={onOpenTab} />
        <PerceptionPanel model={model} />
        <SignalsPanel model={model} />
      </div>
      <div className="cr-row cr-row--2">
        <DriversPanel model={model} />
        <ReachPanel model={model} onOpenTab={onOpenTab} />
        <NarrativePanel model={model} />
      </div>
      <div className="cr-row cr-row--3">
        <TimelinePanel model={model} onScaleChange={setScaleMonths} />
        <MilestonesPanel model={model} onOpenTab={onOpenTab} />
      </div>
    </div>
  )
}
