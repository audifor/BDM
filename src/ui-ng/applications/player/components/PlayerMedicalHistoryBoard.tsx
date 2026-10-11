import type { InjuryId } from '@/domain/ids'
import type { PlayerMedicalModel } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import { findMedicalInspectorDetail } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'

interface Props {
  readonly medical: PlayerMedicalModel
  readonly selectedEventId: InjuryId | null
  readonly onSelectEvent: (id: InjuryId) => void
}

/**
 * Source-backed clinical dossier, not an approximation of a real medical report.
 * Duration denotes the scheduled absence, never confirmed days missed.
 */
export function PlayerMedicalHistoryBoard({ medical, selectedEventId, onSelectEvent }: Props) {
  const rows = medical.history
  const selectedRow = rows.find(row => row.id === selectedEventId) ?? rows[0]
  const detail = selectedRow === undefined ? undefined : findMedicalInspectorDetail(medical, selectedRow.id)
  const pattern = medical.injuryPattern
  const recordedKinds = pattern.rows
  const recurring = recordedKinds.some(row => row.occurrences > 1)
  const scheduledDays = recordedKinds.reduce((total, row) => total + row.daysLost, 0)
  const totalRecorded = recordedKinds.reduce((total, row) => total + row.occurrences, 0)

  return <div className="po-med-caseboard" data-ng-region="medical-history">
    <section className="po-med-caseboard__ledger" aria-label="Injury ledger">
      <header className="po-med-caseboard__heading">
        <div><span>INJURY LEDGER</span><small>Recorded medical events</small></div>
        <strong>{rows.length} {rows.length === 1 ? 'RECORD' : 'RECORDS'}</strong>
      </header>
      {rows.length === 0
        ? <div className="po-med-caseboard__empty" data-ng-region="medical-history-empty">
            <span aria-hidden="true">◇</span>
            <div><strong>NO INJURY EVENTS RECORDED</strong>
              <small>Recorded cases will appear here as the game progresses.</small></div>
          </div>
        : <div className="po-med-caseboard__ledger-list" role="list">
            <div className="po-med-caseboard__ledger-head" aria-hidden="true">
              <span>DATE</span><span>INJURY</span><span>SEVERITY</span>
              <span>SCHEDULED</span><span>STATUS</span>
            </div>
            {rows.map(row => <button key={row.id} type="button"
                className={'po-med-caseboard__ledger-row' + (selectedRow?.id === row.id ? ' is-selected' : '')}
                aria-pressed={selectedRow?.id === row.id}
                onClick={() => onSelectEvent(row.id)}>
                <time>{row.injuredOnLabel}</time>
                <strong>{row.injuryLabel}</strong>
                <span>{row.severityLabel}</span>
                <span className="po-med-caseboard__scheduled">{row.durationLabel}</span>
                <span className={'po-med-caseboard__status is-' + row.statusTone}>{row.statusLabel}</span>
              </button>)}
          </div>}
    </section>
    {detail !== undefined && selectedRow !== undefined && <section className="po-med-caseboard__case"
      data-ng-region="medical-selected-history-detail" aria-label="Selected injury case">
      <header className="po-med-caseboard__heading">
        <div><span>SELECTED INJURY CASE</span><small>Recorded event · no inferred clinical notes</small></div>
        <span className={'po-med-caseboard__case-state is-' + selectedRow.statusTone}>
          {detail.statusLabel}
        </span>
      </header>
      <div className="po-med-caseboard__case-title">
        <div><small>CASE RECORD</small><h3>{detail.injuryLabel}</h3></div>
        <strong className="po-med-caseboard__severity">{detail.severityLabel.toUpperCase()}</strong>
      </div>
      <div className="po-med-caseboard__case-facts">
        <div><small>RECORDED</small><strong>{detail.injuredOnLabel}</strong></div>
        <div><small>EXPECTED RETURN</small><strong>{detail.expectedReturnLabel}</strong></div>
        <div><small>SCHEDULED ABSENCE</small><strong>{detail.durationLabel}</strong></div>
        <div><small>MATCH AVAILABILITY</small><strong>{detail.availabilityImpact}</strong></div>
      </div>
      <footer className="po-med-caseboard__case-foot">
        <span>BODY SIDE</span>
        <strong>NOT RECORDED</strong>
        {detail.daysRemainingLabel !== null && <span>{detail.daysRemainingLabel} until expected return</span>}
      </footer>
    </section>}
    <section className="po-med-caseboard__pattern" data-ng-region="medical-injury-pattern">
      <header className="po-med-caseboard__heading">
        <div><span>PATTERN INSIGHT</span><small>{pattern.windowLabel}</small></div>
        <strong className={recurring ? 'is-attention' : ''}>{recurring ? 'RECURRENCE RECORDED' : 'NO RECURRENCE RECORDED'}</strong>
      </header>
      <div className="po-med-caseboard__pattern-stats">
        <div><strong>{totalRecorded}</strong><span>RECORDED INJURIES</span></div>
        <div><strong>{scheduledDays}</strong><span>SCHEDULED DAYS OUT</span></div>
        <div><strong>{recordedKinds.length}</strong><span>INJURY TYPES</span></div>
      </div>
      {recordedKinds.length > 0 && <div className="po-med-caseboard__pattern-kinds">
        {recordedKinds.map(row => <span key={row.id}>
          {row.kindLabel} <b>×{row.occurrences}</b>
        </span>)}
      </div>}
      <small className="po-med-caseboard__footnote">
        Based on recorded injury dates and expected returns, not confirmed days absent or clinical diagnoses.
      </small>
    </section>
  </div>
}
