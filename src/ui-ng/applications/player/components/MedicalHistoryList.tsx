import type { InjuryId } from '@/domain/ids'

import type { MedicalHistoryRowModel } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

export function MedicalHistoryList({
  rows,
  emptyMessage,
  selectedEventId,
  onSelectRow,
}: {
  readonly rows: readonly MedicalHistoryRowModel[]
  readonly emptyMessage: string | null
  readonly selectedEventId: InjuryId | null
  readonly onSelectRow: (eventId: InjuryId) => void
}) {
  return (
    <section className="pm-history" data-ng-region="medical-history">
      <header className="pm-panel-head">
        <span className="pm-panel-head__title">Medical history</span>
        <span className="pm-panel-head__meta">{rows.length} events</span>
      </header>
      {rows.length === 0 ? (
        <p className="pm-panel-empty">{emptyMessage ?? 'No medical history available.'}</p>
      ) : (
        <div className="pm-history__scroll">
          <NgPrecisionTable
            className="pm-history__table"
            columns={ngTableColumns(rows, [
              ngCol<MedicalHistoryRowModel>('date', 'Date', (row) => row.injuredOnLabel, {
                value: (row) => row.injuredOnLabel,
              }),
              ngCol<MedicalHistoryRowModel>(
                'event',
                'Event',
                (row) => (
                  <>
                    <span className="pm-history__event">{row.injuryLabel}</span>
                    <span className="pm-history__severity">{row.severityLabel}</span>
                  </>
                ),
                { value: (row) => `${row.injuryLabel} ${row.severityLabel}` },
              ),
              ngCol<MedicalHistoryRowModel>(
                'status',
                'Status',
                (row) => (
                  <span className={`pm-history__status pm-history__status--${row.statusTone}`}>{row.statusLabel}</span>
                ),
                { value: (row) => row.statusLabel },
              ),
              ngCol<MedicalHistoryRowModel>('duration', 'Duration', (row) => row.durationLabel, {
                numeric: true,
                value: (row) => row.durationLabel,
              }),
            ])}
            gridId="ng-player-medical-history"
            onRowClick={(row) => onSelectRow(row.id)}
            onSelectionChange={(ids) => {
              if (ids[0]) onSelectRow(ids[0] as InjuryId)
            }}
            rows={rows}
            selectedId={selectedEventId ?? undefined}
          />
        </div>
      )}
    </section>
  )
}
