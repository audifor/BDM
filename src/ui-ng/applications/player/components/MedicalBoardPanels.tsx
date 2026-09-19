import { useState } from 'react'

import type { OverviewGapModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'
import type { PlayerWorkspaceViewId } from '@/ui-ng/applications/player/playerStructuralData'
import type {
  MedicalAvailabilityBandModel,
  MedicalDetailModel,
  MedicalInjuryPatternModel,
  MedicalLoadWindowModel,
  MedicalReadinessMeterModel,
  MedicalRecoveryMilestoneModel,
} from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import type { OverviewAlertModel } from '@/ui-ng/applications/player/data/playerWorkspaceModel'

/**
 * Alert buckets of the reference's filter strip. Alerts carry an owning department, so each bucket
 * maps to the departments that belong to it; a bucket with nothing in it states that honestly.
 */
const ALERT_FILTERS: readonly {
  readonly id: string
  readonly label: string
  readonly tags: readonly string[]
}[] = [
  { id: 'all', label: 'ALL', tags: [] },
  { id: 'training', label: 'TRAINING', tags: ['Workload', 'Development'] },
  { id: 'contract', label: 'CONTRACT', tags: ['Contract'] },
  { id: 'medical', label: 'MEDICAL', tags: ['Availability', 'Medical'] },
  { id: 'role', label: 'ROLE', tags: ['Morale', 'Role'] },
  { id: 'scouting', label: 'SCOUTING', tags: ['Scouting'] },
]

/* ── Left column ── */

/** PHYSICAL READINESS — one row per instrument, with the bar only when the share is real. */
export function PhysicalReadinessPanel({
  meters,
}: {
  readonly meters: readonly MedicalReadinessMeterModel[]
}) {
  return (
    <section className="po-med-panel po-med-readiness" data-ng-region="medical-readiness">
      <header className="po-med-panel__head">
        <span className="po-med-panel__title">Physical readiness</span>
        <span className="po-med-panel__meta ng-type-numeric">{meters.length} instruments</span>
      </header>
      <ul className="po-med-readiness__list">
        {meters.map((meter) => (
          <li className={`po-med-readiness__row is-${meter.tone}`} key={meter.id}>
            <span aria-hidden className="po-med-readiness__glyph">
              ●
            </span>
            <span className="po-med-readiness__text">
              <span className="po-med-readiness__label">{meter.label}</span>
              <span className="po-med-readiness__band">{meter.bandLabel}</span>
            </span>
            {meter.fill === null ? (
              <span aria-hidden className="po-med-readiness__track is-empty" />
            ) : (
              <span aria-hidden className="po-med-readiness__track">
                <span className="po-med-readiness__fill" style={{ width: `${meter.fill}%` }} />
              </span>
            )}
            <span className="po-med-readiness__value ng-type-numeric">{meter.valueLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** CURRENT INJURY — the active record, or the honest all-clear. */
export function CurrentInjuryPanel({
  band,
}: {
  readonly band: MedicalAvailabilityBandModel
}) {
  const clear = band.statusTone === 'available'

  return (
    <section className="po-med-panel po-med-injury" data-ng-region="medical-current-injury">
      <header className="po-med-panel__head">
        <span className="po-med-panel__title">Current injury</span>
        <span className="po-med-panel__meta ng-type-numeric">{band.currentDateLabel}</span>
      </header>
      <div className={`po-med-injury__body${clear ? ' is-clear' : ' is-active'}`}>
        <span aria-hidden className="po-med-injury__glyph">
          {clear ? '✓' : '!'}
        </span>
        <span className="po-med-injury__text">
          <span className="po-med-injury__title">
            {clear ? 'No active injury' : band.limitationLabel ?? 'Injury on record'}
          </span>
          <span className="po-med-injury__detail">
            {clear
              ? 'Player is fully fit and available for selection.'
              : `${band.summary ?? 'Return date not recorded.'} The player is not available for selection.`}
          </span>
        </span>
      </div>
    </section>
  )
}

/**
 * LOAD MANAGEMENT — two real series per window. Match minutes and programme load are different
 * units, so each bar is normalised to its own busiest window and the trend reads the two together
 * as an index, exactly as the note under the panel says.
 */
export function LoadManagementPanel({
  note,
  windows,
}: {
  readonly note: string
  readonly windows: readonly MedicalLoadWindowModel[]
}) {
  if (windows.length === 0) return null

  const peakMatch = Math.max(1, ...windows.map((window) => window.matchMinutes))
  const peakProgramme = Math.max(1, ...windows.map((window) => window.programmeLoad))
  const share = (value: number, peak: number) => Math.round((value / peak) * 100)
  const trend = windows.map((window) =>
    Math.round((share(window.matchMinutes, peakMatch) + share(window.programmeLoad, peakProgramme)) / 2),
  )

  return (
    <section className="po-med-panel po-med-load" data-ng-region="medical-load">
      <header className="po-med-panel__head">
        <span className="po-med-panel__title">Load management</span>
        <span className="po-med-panel__meta">Last {windows[windows.length - 1]?.label ?? '30 days'}</span>
      </header>

      <ul className="po-med-load__legend">
        <li className="is-programme">
          <span aria-hidden className="po-med-load__key" />
          Training load
        </li>
        <li className="is-match">
          <span aria-hidden className="po-med-load__key" />
          Match load
        </li>
        <li className="is-trend">
          <span aria-hidden className="po-med-load__key" />
          Load trend
        </li>
      </ul>

      <div className="po-med-load__chart">
        <ul className="po-med-load__groups">
          {windows.map((window, index) => (
            <li className="po-med-load__group" key={window.id}>
              <span aria-hidden className="po-med-load__bars">
                <span
                  className="po-med-load__bar is-programme"
                  style={{ height: `${Math.max(2, share(window.programmeLoad, peakProgramme))}%` }}
                  title={`${window.programmeLoad} programme load · ${window.sessionCount} sessions`}
                />
                <span
                  className="po-med-load__bar is-match"
                  style={{ height: `${Math.max(2, share(window.matchMinutes, peakMatch))}%` }}
                  title={`${window.matchMinutes} match minutes · ${window.matches} games`}
                />
              </span>
              <span className="po-med-load__group-label">{window.label}</span>
              <span className="po-med-load__group-values ng-type-numeric">
                <span>{window.matchMinutes} min</span>
                <span>{window.programmeLoad} load</span>
              </span>
              <span
                aria-hidden
                className="po-med-load__trend-point"
                style={{ bottom: `${trend[index] ?? 0}%` }}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="po-med-load__change">
        <span className="po-med-load__change-title">Change</span>
        <ul>
          {windows.map((window) => (
            <li key={window.id}>
              <span>{window.label}</span>
              <span
                className={`ng-type-numeric${
                  window.changeLabel === null
                    ? ''
                    : window.changeLabel.startsWith('-')
                      ? ' is-down'
                      : ' is-up'
                }`}
              >
                {window.changeLabel ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="po-med-note">{note}</p>
    </section>
  )
}

/* ── Centre column ── */

/** RECOVERY TIMELINE — the four readiness milestones of the reference. */
export function RecoveryTimelinePanel({
  milestones,
}: {
  readonly milestones: readonly MedicalRecoveryMilestoneModel[]
}) {
  const clear = milestones.every((milestone) => milestone.tone === 'positive')

  return (
    <section className="po-med-panel po-med-timeline" data-ng-region="medical-recovery-timeline">
      <header className="po-med-panel__head">
        <span className="po-med-panel__title">Recovery timeline</span>
        <span className="po-med-panel__meta ng-type-numeric">
          {milestones.length} milestones
        </span>
      </header>
      <ol className="po-med-timeline__track">
        {milestones.map((milestone) => (
          <li className={`po-med-timeline__node is-${milestone.tone}`} key={milestone.id}>
            <span aria-hidden className="po-med-timeline__glyph">
              {milestone.tone === 'positive' ? '✓' : '!'}
            </span>
            <span className="po-med-timeline__label">{milestone.label}</span>
            <span className="po-med-timeline__state">{milestone.stateLabel}</span>
            {milestone.note !== null && (
              <span className="po-med-timeline__note">{milestone.note}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="po-med-note">
        {clear
          ? 'Currently fit — no recovery timeline required.'
          : 'Milestones follow the active injury record until the medical staff clear the player.'}
      </p>
    </section>
  )
}

/* ── Right column ── */

/** MEDICAL DETAIL — overall status plus the readings under it, for the selected region. */
export function MedicalDetailPanel({
  detail,
  regionDetail,
  regionLabel,
}: {
  readonly detail: MedicalDetailModel
  readonly regionDetail: string | null
  readonly regionLabel: string | null
}) {
  return (
    <section className="po-med-panel po-med-detail" data-ng-region="medical-detail">
      <header className="po-med-panel__head">
        <span className="po-med-panel__title">Medical detail</span>
        <span className="po-med-panel__meta">
          {regionLabel === null ? 'Select a body region' : regionLabel}
        </span>
      </header>

      <div className={`po-med-detail__card is-${detail.statusTone}`}>
        <span aria-hidden className="po-med-detail__glyph">
          {detail.statusTone === 'positive' ? '✓' : '!'}
        </span>
        <span className="po-med-detail__text">
          <span className="po-med-detail__kicker">Overall status</span>
          <span className="po-med-detail__status">{detail.statusLabel}</span>
          <span className="po-med-detail__detail">{regionDetail ?? detail.statusDetail}</span>
        </span>
      </div>

      <dl className="po-med-detail__rows">
        {detail.rows.map((row) => (
          <div className={`is-${row.tone}`} key={row.label}>
            <dt>{row.label}</dt>
            <dd className="ng-type-numeric">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** MEDICAL HISTORY — the recorded injuries, as the reference's table. */
export function MedicalHistoryPanel({
  emptyMessage,
  onSelectRow,
  rows,
  selectedEventId,
}: {
  readonly emptyMessage: string | null
  readonly onSelectRow: (id: string) => void
  readonly rows: readonly {
    readonly id: string
    readonly injuredOnLabel: string
    readonly injuryLabel: string
    readonly severityLabel: string
    readonly durationLabel: string
    readonly statusLabel: string
  }[]
  readonly selectedEventId: string | null
}) {
  return (
    <section className="po-med-panel po-med-history" data-ng-region="medical-history">
      <header className="po-med-panel__head">
        <span className="po-med-panel__title">Medical history</span>
        <span className="po-med-panel__meta">
          {rows.length === 0
            ? 'No significant injuries'
            : `${rows.length} ${rows.length === 1 ? 'record' : 'records'}`}
        </span>
      </header>

      <div className="po-med-history__table" role="list">
        <div aria-hidden className="po-med-history__head">
          <span>Date</span>
          <span>Injury / illness</span>
          <span>Severity</span>
          <span>Days out</span>
          <span>Status</span>
        </div>
        {rows.length === 0 ? (
          <div aria-hidden className="po-med-history__row is-empty">
            <span>No record</span>
            <span>No record</span>
            <span>—</span>
            <span>—</span>
            <span>—</span>
          </div>
        ) : (
          rows.map((row) => (
            <button
              className={`po-med-history__row${row.id === selectedEventId ? ' is-selected' : ''}`}
              key={row.id}
              onClick={() => onSelectRow(row.id)}
              type="button"
            >
              <span className="ng-type-numeric">{row.injuredOnLabel}</span>
              <span>{row.injuryLabel}</span>
              <span>{row.severityLabel}</span>
              <span className="ng-type-numeric">{row.durationLabel}</span>
              <span className={`is-${row.statusLabel.toLowerCase()}`}>{row.statusLabel}</span>
            </button>
          ))
        )}
      </div>

      {rows.length === 0 && emptyMessage !== null && (
        <p className="po-med-note">{emptyMessage}</p>
      )}
    </section>
  )
}

/** INJURY PATTERN — the recorded recurrence over the pattern window. */
export function InjuryPatternPanel({
  pattern,
}: {
  readonly pattern: MedicalInjuryPatternModel
}) {
  const clean = pattern.rows.length === 0

  return (
    <section className="po-med-panel po-med-pattern" data-ng-region="medical-injury-pattern">
      <header className="po-med-panel__head">
        <span className="po-med-panel__title">Injury pattern ({pattern.windowLabel})</span>
      </header>
      <div className={`po-med-pattern__body${clean ? ' is-clean' : ' is-watch'}`}>
        <span aria-hidden className="po-med-pattern__glyph">
          {clean ? '✓' : '!'}
        </span>
        <span className="po-med-pattern__text">
          <span className="po-med-pattern__title">
            {clean ? 'No recurring injury issues' : pattern.summary}
          </span>
          <span className="po-med-pattern__detail">
            {clean
              ? `Clean injury record over the ${pattern.windowLabel.toLowerCase()}.`
              : pattern.rows
                  .map((row) => `${row.kindLabel} ×${row.occurrences} (${row.daysLost} days out)`)
                  .join(' · ')}
          </span>
        </span>
      </div>
    </section>
  )
}

/** MEDICAL STAFF NOTES — declared, because no department writes free text into the save. */
export function StaffNotesPanel({ gaps }: { readonly gaps: readonly OverviewGapModel[] }) {
  const gap = gaps[0]
  if (gap === undefined) return null

  return (
    <section className="po-med-panel po-med-staff" data-ng-region="medical-staff-notes">
      <header className="po-med-panel__head">
        <span className="po-med-panel__title">Medical staff notes</span>
      </header>
      <div className="po-med-staff__body">
        <span aria-hidden className="po-med-staff__glyph">
          ▤
        </span>
        <span className="po-med-staff__text">
          <span className="po-med-staff__title">{gap.label}</span>
          <span className="po-med-staff__detail">{gap.reason}</span>
        </span>
      </div>
    </section>
  )
}

/* ── Bottom strip ── */

/** The reference's filter strip: the same departments the overview board groups decisions by. */
export function MedicalFilterStrip({
  alerts,
  onOpenPage,
}: {
  readonly alerts: readonly OverviewAlertModel[]
  readonly onOpenPage: (view: PlayerWorkspaceViewId) => void
}) {
  const [filter, setFilter] = useState('medical')
  const active = ALERT_FILTERS.find((candidate) => candidate.id === filter) ?? ALERT_FILTERS[0]!
  const visible =
    active.tags.length === 0
      ? alerts
      : alerts.filter((alert) => active.tags.includes(alert.tag))

  return (
    <section className="po-med-panel po-med-filters" data-ng-region="medical-filters">
      <div className="po-med-filters__bar">
        <span className="po-med-filters__title">Alerts &amp; decisions</span>
        <span className="po-med-filters__pills">
          {ALERT_FILTERS.map((candidate) => (
            <button
              aria-pressed={candidate.id === filter}
              className={`po-med-pill${candidate.id === filter ? ' is-active' : ''}`}
              key={candidate.id}
              onClick={() => setFilter(candidate.id)}
              type="button"
            >
              {candidate.label}
            </button>
          ))}
        </span>
        <span className="po-med-filters__count ng-type-numeric">
          {visible.length} {visible.length === 1 ? 'item' : 'items'}
        </span>
        <button
          className="po-med-filters__link"
          onClick={() => onOpenPage('history')}
          type="button"
        >
          View full medical history →
        </button>
      </div>
      <ul className="po-med-filters__list">
        {visible.length === 0 ? (
          <li className="po-med-filters__empty">No decision in this category.</li>
        ) : (
          visible.map((alert) => (
            <li className={`po-med-filters__item is-${alert.severity}`} key={alert.id}>
              <span aria-hidden className="po-med-filters__glyph">
                {alert.severity === 'info' ? 'i' : alert.severity === 'critical' ? '!' : '−'}
              </span>
              <span className="po-med-filters__label">{alert.label}</span>
              <span className="po-med-filters__detail">{alert.detail}</span>
              <span className="po-med-filters__date ng-type-numeric">{alert.dateLabel}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
