import type { InjuryId } from '@/domain/ids'

import type { MedicalHistoryRowModel } from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'

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
          <table className="pm-history__table">
            <colgroup>
              <col className="pm-history__col--date" />
              <col className="pm-history__col--event" />
              <col className="pm-history__col--status" />
              <col className="pm-history__col--duration" />
            </colgroup>
            <thead>
              <tr>
                <th className="pm-history__col--date" scope="col">
                  Date
                </th>
                <th className="pm-history__col--event" scope="col">
                  Event
                </th>
                <th className="pm-history__col--status" scope="col">
                  Status
                </th>
                <th className="pm-history__col--duration" scope="col">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = selectedEventId === row.id
                return (
                  <tr
                    aria-selected={selected}
                    className={`${row.statusTone === 'active' ? 'is-active' : ''}${selected ? ' is-selected' : ''}`.trim()}
                    key={row.id}
                    onClick={() => onSelectRow(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onSelectRow(row.id)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td>{row.injuredOnLabel}</td>
                    <td>
                      <span className="pm-history__event">{row.injuryLabel}</span>
                      <span className="pm-history__severity">{row.severityLabel}</span>
                    </td>
                    <td>
                      <span className={`pm-history__status pm-history__status--${row.statusTone}`}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="ng-type-numeric">{row.durationLabel}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
